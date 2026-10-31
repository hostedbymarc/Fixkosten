import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import { copyToDocs, nativeDump } from './native-dump';

/**
 * Import watchdog (PR #34): every import in every e2e test is watched through the app's step log
 * (src/lib/importTrace.ts, only in the e2e build with ERBSE_IMPORT_TRACE=1). If the import has not
 * reached the hero WATCHDOG_MS after it started, `capture` records what the page is doing: does the
 * main thread answer, where does `Debugger.pause` stop, the import step, Dexie/IndexedDB/service
 * worker state, the last console lines, a Chromium performance trace and a screenshot. The test then
 * fails normally; its Playwright trace is kept by `trace: 'retain-on-failure'`.
 *
 * Shared with the import-hang harness (e2e-harness/import-hang.spec.ts).
 */

export const WATCHDOG_MS = 10_000;
const CONSOLE_LINES = 50;
const CONSOLE_KEEP = 300;
/** how long the Chromium trace records the stuck page */
const CHROMIUM_TRACE_MS = 3_000;

export const TRACE_CATEGORIES = [
  'toplevel',
  'blink',
  'cc',
  'gpu',
  'viz',
  'v8',
  'ipc',
  'mojom',
  'renderer.scheduler',
  'IndexedDB',
  'disabled-by-default-devtools.timeline',
  'devtools.timeline',
];

/** Page side, before any app code: every IndexedDB transaction and connection event. */
export function instrumentIndexedDB() {
  const w = window as unknown as Record<string, unknown>;
  if (w.__idb) return;
  const open = new Map<number, { id: number; stores: string[]; mode: string; t: number }>();
  let created = 0;
  const events: { t: number; what: string }[] = [];
  const note = (what: string) => {
    events.push({ t: Math.round(performance.now()), what });
    if (events.length > 100) events.shift();
  };
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
    const tx = transaction.apply(this, args);
    const id = ++created;
    const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
    open.set(id, { id, stores, mode: args[1] ?? 'readonly', t: performance.now() });
    const end = (how: string) => () => {
      open.delete(id);
      if (how !== 'complete') note(`tx ${id} ${how}`);
    };
    tx.addEventListener('complete', end('complete'));
    tx.addEventListener('abort', end('abort'));
    tx.addEventListener('error', end('error'));
    return tx;
  };
  const openDb = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
    const req = openDb.apply(this, args);
    note(`open ${args[0]} v${String(args[1])}`);
    req.addEventListener('blocked', () => note('open blocked'));
    req.addEventListener('upgradeneeded', () => note('upgradeneeded'));
    req.addEventListener('error', () => note(`open error ${String(req.error)}`));
    req.addEventListener('success', () => {
      note('open success');
      req.result.addEventListener('versionchange', () => note('versionchange'));
      req.result.addEventListener('close', () => note('close (forced)'));
    });
    return req;
  };
  w.__idb = {
    open: () => [...open.values()].map((r) => ({ ...r, t: undefined, ageMs: Math.round(performance.now() - r.t) })),
    created: () => created,
    events: () => events,
  };
}

/** Page side: the state dump (only when the main thread answers). */
const DUMP = `(async () => {
  const db = window.__erbseDb;
  const out = {};
  out.trace = window.__importTrace ?? [];
  out.idbOpenTransactions = window.__idb?.open();
  out.idbTransactionsCreated = window.__idb?.created();
  out.idbEvents = window.__idb?.events();
  out.dexie = db ? { isOpen: db.isOpen(), hasFailed: db.hasFailed(), hasBeenClosed: db.hasBeenClosed(), verno: db.verno } : null;
  out.serviceWorker = 'serviceWorker' in navigator ? { controller: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null } : 'unsupported';
  const dialog = document.querySelector('[data-testid="setup-dialog"]');
  out.dom = {
    setupDialog: !!dialog,
    busyLabel: dialog ? dialog.querySelector('button')?.textContent : null,
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
    hero: !!document.querySelector('[data-testid="hero"]'),
    importSheet: !!document.querySelector('[data-testid="import-sheet"]'),
    splash: !!document.getElementById('splash'),
    hash: location.hash,
  };
  out.document = { visibility: document.visibilityState, focus: document.hasFocus(), readyState: document.readyState };
  out.animations = document.getAnimations().map((a) => ({ id: a.id, state: a.playState, t: a.currentTime }));
  const timeout = (ms) => new Promise((r) => setTimeout(() => r('timeout'), ms));
  out.probeIndexedDB = db ? await Promise.race([db.meta.count().then((n) => ({ ok: true, metaRows: n }), (e) => ({ ok: false, error: String(e) })), timeout(2000)]) : null;
  out.probeRaf = await Promise.race([new Promise((r) => requestAnimationFrame(() => r('raf ok'))), timeout(1000)]);
  return out;
})()`;

/** scriptId → URL, from `Debugger.scriptParsed` (call frames carry only the id) */
export function trackScripts(session: CDPSession): Map<string, string> {
  const urls = new Map<string, string>();
  session.on('Debugger.scriptParsed', (e: { scriptId: string; url: string }) => urls.set(e.scriptId, e.url));
  return urls;
}

const consumers = new Map<string, SourceMapConsumer | null>();

/** `assets/x.js:1:2345` of the e2e build → `src/…/file.ts:line` via the build's source map */
function original(mapsDir: string | undefined, url: string, line: number, column: number): string | null {
  const asset = /\/(assets\/[^/?#]+\.js)/.exec(url)?.[1];
  if (!mapsDir || !asset) return null;
  const mapFile = join(mapsDir, `${asset}.map`);
  if (!consumers.has(mapFile)) {
    consumers.set(mapFile, existsSync(mapFile) ? new SourceMapConsumer(JSON.parse(readFileSync(mapFile, 'utf8')) as RawSourceMap) : null);
  }
  const pos = consumers.get(mapFile)?.originalPositionFor({ line, column });
  if (!pos?.source) return null;
  return `${pos.source.replace(/^(\.\.\/)+/, '')}:${pos.line}:${(pos.column ?? 0) + 1}${pos.name ? ` (${pos.name})` : ''}`;
}

export function within<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

export interface CaptureOptions {
  /** off in the harness, which records its own trace over the whole iteration */
  chromiumTrace?: Browser | null;
  /**
   * A session whose debugger was enabled before the page loaded. A frozen main thread only takes
   * the few commands Chromium runs as an interrupt: `Debugger.pause` is one, `Debugger.enable` is
   * not – so a debugger enabled only now cannot stop it.
   */
  debugger?: CDPSession | null;
  /** its `trackScripts` map */
  scriptUrls?: Map<string, string>;
  /** build folder with the source maps (dist-e2e, dist-harness) */
  mapsDir?: string;
}

/** Everything about a stuck page; files (chromium-trace.json, screenshot.png) go to `dir`. */
export async function capture(page: Page, context: BrowserContext, dir: string, consoleLog: string[], options: CaptureOptions = {}) {
  mkdirSync(dir, { recursive: true });
  const report: Record<string, unknown> = { at: new Date().toISOString(), url: page.url() };
  let cdp: CDPSession | null = options.debugger ?? null;
  const ownSession = !cdp;
  if (ownSession) {
    try {
      cdp = await within(context.newCDPSession(page), 2000).then((s) => (s === 'timeout' ? null : s));
    } catch (e) {
      report.cdpError = String(e);
    }
  }
  report.cdpSession = !!cdp;
  const scriptUrls = options.scriptUrls ?? (cdp && ownSession ? trackScripts(cdp) : new Map<string, string>());
  if (cdp) {
    // (1) does the main thread answer?
    const t0 = Date.now();
    const evaluated = await within(cdp.send('Runtime.evaluate', { expression: '1', returnByValue: true }), 2000).catch((e) => ({ error: String(e) }));
    report.mainThread = {
      answered: evaluated !== 'timeout' && !('error' in evaluated) && (evaluated as { result: { value: unknown } }).result.value === 1,
      ms: Date.now() - t0,
      raw: evaluated === 'timeout' ? 'timeout' : undefined,
    };
    // (2) where is it? Debugger.pause stops at the next JS statement (none while the thread idles)
    const paused = new Promise<unknown>((resolve) => cdp!.once('Debugger.paused', resolve));
    const enabled = ownSession ? await within(cdp.send('Debugger.enable'), 2000).catch((e) => ({ error: String(e) })) : 'before the page loaded';
    const pauseAck = await within(cdp.send('Debugger.pause'), 2000).catch((e) => ({ error: String(e) }));
    const event = (await within(paused, 3000)) as
      | 'timeout'
      | {
          reason: string;
          callFrames: { functionName: string; url: string; location: { scriptId: string; lineNumber: number; columnNumber: number } }[];
          asyncStackTrace?: unknown;
        };
    report.debugger = {
      enable: enabled === 'timeout' ? 'timeout' : typeof enabled === 'string' ? enabled : 'ok',
      pauseCommand: pauseAck === 'timeout' ? 'timeout' : 'ok',
      paused:
        event === 'timeout'
          ? null
          : {
              reason: event.reason,
              callFrames: event.callFrames.map((f) => {
                const url = f.url || scriptUrls.get(f.location.scriptId) || `script ${f.location.scriptId}`;
                const src = original(options.mapsDir, url, f.location.lineNumber + 1, f.location.columnNumber);
                return `${f.functionName || '(anonymous)'} ${url}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}${src ? ` → ${src}` : ''}`;
              }),
              asyncStackTrace: event.asyncStackTrace,
            },
    };
    if (event !== 'timeout') await within(cdp.send('Debugger.resume'), 2000).catch(() => {});
    if (ownSession) await within(cdp.send('Debugger.disable'), 1000).catch(() => {});
    // (3) the state, if it answers
    if ((report.mainThread as { answered: boolean }).answered) {
      const dump = await within(cdp.send('Runtime.evaluate', { expression: DUMP, awaitPromise: true, returnByValue: true }), 6000).catch((e) => ({ error: String(e) }));
      report.state = dump === 'timeout' ? 'timeout' : 'error' in dump ? dump : (dump as { result: { value: unknown } }).result.value;
    }
    // heap and process view from the browser side
    report.metrics = await within(cdp.send('Performance.getMetrics'), 2000).catch(() => 'error');
    if (ownSession) await within(cdp.detach(), 1000).catch(() => {});
  }
  // (4) what the renderer does meanwhile, and how the page looks
  if (options.chromiumTrace) {
    const browser = options.chromiumTrace;
    try {
      await browser.startTracing(page, { categories: TRACE_CATEGORIES });
      await new Promise((r) => setTimeout(r, CHROMIUM_TRACE_MS));
      const buffer = await within(browser.stopTracing(), 15_000);
      if (buffer !== 'timeout') {
        writeFileSync(join(dir, 'chromium-trace.json'), buffer);
        report.chromiumTraceSummary = traceSummary(buffer);
      }
      report.chromiumTrace = buffer !== 'timeout' ? 'chromium-trace.json' : 'timeout';
    } catch (e) {
      report.chromiumTrace = `error: ${String(e)}`;
    }
  }
  const shot = await within(page.screenshot({ path: join(dir, 'screenshot.png'), timeout: 3000 }), 4000).catch((e) => `error: ${String(e)}`);
  report.screenshot = typeof shot === 'string' ? shot : 'screenshot.png';
  report.console = consoleLog.slice(-CONSOLE_LINES);
  report.importTrace = consoleLog.filter((l) => l.includes('[import-trace]'));
  return report;
}

/** Events in a Chromium trace, and how many of them come from a renderer process. */
export function traceSummary(buffer: Buffer | string): { events: number; rendererEvents: number; rendererPids: number[] } | 'unreadable' {
  try {
    const parsed = JSON.parse(buffer.toString()) as { traceEvents?: { pid: number; ph: string; name: string; args?: { name?: string } }[] };
    const events = parsed.traceEvents ?? [];
    const renderers = new Set(events.filter((e) => e.ph === 'M' && e.name === 'process_name' && e.args?.name === 'Renderer').map((e) => e.pid));
    return {
      events: events.length,
      rendererEvents: events.filter((e) => e.ph !== 'M' && renderers.has(e.pid)).length,
      rendererPids: [...renderers],
    };
  } catch {
    return 'unreadable';
  }
}

/**
 * The signature of the hang of 31.10.2026, checked by machine: the import committed, then
 * `Debugger.pause` timed out and the renderer wrote no trace event at all. Only a hang with exactly
 * this signature may be retried (playwright.config.ts, e2e/fixtures.ts); anything else stays red.
 */
export function environmentHangSignature(report: Record<string, unknown>): { committed: boolean; debuggerPauseTimeout: boolean; rendererTraceEvents: number | null; matches: boolean } {
  const steps = (report.steps as string[] | undefined) ?? [];
  const committed = steps.some((s) => s === 'committed' || s.startsWith('committed '));
  const dbg = report.debugger as { pauseCommand?: string; paused?: unknown } | undefined;
  const debuggerPauseTimeout = !!dbg && dbg.pauseCommand === 'timeout' && !dbg.paused;
  const summary = report.chromiumTraceSummary as { rendererEvents: number } | 'unreadable' | undefined;
  const rendererTraceEvents = summary && summary !== 'unreadable' ? summary.rendererEvents : null;
  return { committed, debuggerPauseTimeout, rendererTraceEvents, matches: committed && debuggerPauseTimeout && rendererTraceEvents === 0 };
}

export interface WatchdogOptions {
  /** build folder with the source maps (dist-e2e, dist-harness) */
  mapsDir?: string;
  /** each hang is copied to `<docsDir>/<date>-<project>/`; null: not copied */
  docsDir?: string | null;
  project?: string;
}

interface Watch {
  kind: 'setup' | 'settings';
  since: number;
  steps: string[];
  committed: boolean;
  dialogClosed: boolean;
}

export interface Hang {
  dir: string;
  report: Record<string, unknown>;
}

/**
 * Follows the step log of one page. An import starts with „file-chosen“ (setup dialog) or
 * „import-start“ (Einstellungen); it is over once it committed and, on first start, the setup dialog
 * closed – or it failed with a message („import-failed“: the app handled it). Anything else after
 * WATCHDOG_MS is a hang.
 */
export class ImportWatchdog {
  readonly consoleLog: string[] = [];
  readonly hangs: Hang[] = [];
  private watch: Watch | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private capturing: Promise<void> = Promise.resolve();
  /** debugger enabled before any app code runs (see CaptureOptions.debugger) */
  private session: CDPSession | null = null;
  private scriptUrls = new Map<string, string>();
  private hangListeners: ((hang: Hang) => void)[] = [];

  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
    private readonly browser: Browser,
    private readonly outDir: string,
    private readonly options: WatchdogOptions = {},
  ) {
    const t = () => new Date().toISOString().slice(11, 23);
    page.on('console', (m) => this.onLine(`${t()} ${m.type()} ${m.text()}`, m.text()));
    page.on('pageerror', (e) => this.onLine(`${t()} pageerror ${e.message}`, ''));
    page.on('crash', () => this.onLine(`${t()} page crashed`, ''));
  }

  /**
   * Before the first navigation: the debugger must already be on when the main thread freezes, an
   * import can freeze it within milliseconds. Without breakpoints it costs next to nothing.
   */
  async start() {
    try {
      this.session = await this.context.newCDPSession(this.page);
      this.scriptUrls = trackScripts(this.session);
      await this.session.send('Debugger.enable');
    } catch {
      this.session = null; // capture opens its own session then
    }
  }

  /** Resolves with the first hang (the watchdog test waits for it). */
  nextHang(): Promise<Hang> {
    return new Promise((resolve) => this.hangListeners.push(resolve));
  }

  private onLine(line: string, text: string) {
    this.consoleLog.push(line);
    if (this.consoleLog.length > CONSOLE_KEEP) this.consoleLog.shift();
    const m = /^\[import-trace\] (\S+)/.exec(text);
    if (!m) return;
    const step = m[1];
    if (step === 'file-chosen') this.arm('setup');
    else if (step === 'import-start' && !this.watch) this.arm('settings');
    const w = this.watch;
    if (!w) return;
    w.steps.push(text.slice('[import-trace] '.length));
    if (step === 'committed') w.committed = true;
    if (step === 'setup-dialog-closed') w.dialogClosed = true;
    if (step === 'import-failed' || (w.committed && (w.kind === 'settings' || w.dialogClosed))) this.disarm();
  }

  private arm(kind: Watch['kind']) {
    this.disarm();
    this.watch = { kind, since: Date.now(), steps: [], committed: false, dialogClosed: false };
    this.timer = setTimeout(() => this.fire(), WATCHDOG_MS);
  }

  private disarm() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.watch = null;
  }

  private fire() {
    const w = this.watch;
    if (!w) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.watch = null;
    this.capturing = this.capturing.then(() => this.record(w));
  }

  private async record(w: Watch) {
    // a lost console line must not count: on first start the hero itself decides
    if (w.kind === 'setup') {
      const hero = await within(this.page.getByTestId('hero').first().isVisible(), 1500).catch(() => false);
      const dialog = await within(this.page.getByTestId('setup-dialog').count(), 1500).catch(() => 'timeout' as const);
      if (hero === true && dialog === 0) return;
    }
    const dir = join(this.outDir, `hang-${Date.now()}`);
    // the operating-system view first: process state before gdb or CDP touch the processes
    const native = await nativeDump(dir).catch((e) => ({ error: String(e) }));
    const report = await capture(this.page, this.context, dir, this.consoleLog, {
      chromiumTrace: this.browser.browserType().name() === 'chromium' ? this.browser : null,
      debugger: this.session,
      scriptUrls: this.scriptUrls,
      mapsDir: this.options.mapsDir,
    });
    report.browser = `${this.browser.browserType().name()} ${this.browser.version()}`;
    report.native = Array.isArray(native)
      ? native.map(({ dir: d, ...r }) => ({ ...r, files: `native/${d.split('/native/')[1]}` }))
      : native;
    Object.assign(report, {
      kind: w.kind,
      msSinceImportStart: Date.now() - w.since,
      lastStep: w.steps.at(-1) ?? '(keiner nach dem Start)',
      steps: w.steps,
      playwrightTrace: 'trace.zip im Ordner des Tests (trace: retain-on-failure)',
    });
    report.signature = environmentHangSignature(report);
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    if (this.options.docsDir) {
      report.docsCopy = copyToDocs(dir, this.options.docsDir, this.options.project ?? 'unknown');
      writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
      writeFileSync(join(report.docsCopy as string, 'report.json'), JSON.stringify(report, null, 2));
    }
    const hang = { dir, report };
    this.hangs.push(hang);
    for (const listener of this.hangListeners.splice(0)) listener(hang);
  }

  /** End of the test: an import still running gets its full WATCHDOG_MS, then the dumps are done. */
  async finish(): Promise<Hang[]> {
    const w = this.watch;
    if (w) {
      const left = w.since + WATCHDOG_MS - Date.now();
      if (left > 0) {
        const deadline = Date.now() + left;
        while (this.watch === w && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      }
      if (this.watch === w) this.fire();
    }
    await this.capturing;
    return this.hangs;
  }
}
