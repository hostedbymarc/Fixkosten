import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { expect, FIXTURE, TODAY, test } from '../e2e/fixtures';
import { sprintBackup } from '../e2e/sprint-data';

/**
 * Import-hang harness: only import → hero, HARNESS_REPS times per import way. Generated tests rather
 * than --repeat-each: each repetition there gets a new worker and browser, while the full suite keeps
 * one browser per worker for hundreds of tests (a new context per test, as here).
 * A watchdog waits 10 s for the hero; then it records what the page is doing (see `capture`).
 * Every iteration appends one line to harness-results/results.jsonl.
 */

const OUT = 'harness-results';
const WATCHDOG_MS = 10_000;
/** after the dumps: does the page still get there (slow) or not (stuck)? */
const RECOVERY_MS = 20_000;
const CONSOLE_LINES = 50;

const TRACE_CATEGORIES = [
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

type Way = 'fixture' | 'sprint' | 'ui';

/** Page side, before any app code: every IndexedDB transaction and connection event. */
function instrumentIndexedDB() {
  const w = window as unknown as Record<string, unknown>;
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

function within<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

async function reached(page: Page, way: Way, ms: number): Promise<boolean> {
  const hero = page.getByTestId('hero');
  const target = way === 'ui' ? page.locator('[data-position="pos-depotentgelt"]') : hero;
  try {
    await hero.waitFor({ state: 'visible', timeout: ms });
    if (way === 'ui') await target.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

async function capture(page: Page, context: BrowserContext, dir: string, consoleLog: string[]) {
  const report: Record<string, unknown> = { at: new Date().toISOString(), url: page.url() };
  let cdp: CDPSession | null = null;
  try {
    cdp = await within(context.newCDPSession(page), 2000).then((s) => (s === 'timeout' ? null : s));
  } catch (e) {
    report.cdpError = String(e);
  }
  report.cdpSession = !!cdp;
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
    const enabled = await within(cdp.send('Debugger.enable'), 2000).catch((e) => ({ error: String(e) }));
    const pauseAck = await within(cdp.send('Debugger.pause'), 2000).catch((e) => ({ error: String(e) }));
    const event = (await within(paused, 3000)) as
      | 'timeout'
      | { reason: string; callFrames: { functionName: string; url: string; location: { lineNumber: number; columnNumber: number } }[]; asyncStackTrace?: unknown };
    report.debugger = {
      enable: enabled === 'timeout' ? 'timeout' : 'ok',
      pauseCommand: pauseAck === 'timeout' ? 'timeout' : 'ok',
      paused:
        event === 'timeout'
          ? null
          : {
              reason: event.reason,
              callFrames: event.callFrames.map((f) => `${f.functionName || '(anonymous)'} ${f.url}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`),
              asyncStackTrace: event.asyncStackTrace,
            },
    };
    if (event !== 'timeout') await within(cdp.send('Debugger.resume'), 2000).catch(() => {});
    else await within(cdp.send('Debugger.disable'), 1000).catch(() => {});
    // (3) the state, if it answers
    if ((report.mainThread as { answered: boolean }).answered) {
      const dump = await within(cdp.send('Runtime.evaluate', { expression: DUMP, awaitPromise: true, returnByValue: true }), 6000).catch((e) => ({ error: String(e) }));
      report.state = dump === 'timeout' ? 'timeout' : 'error' in dump ? dump : (dump as { result: { value: unknown } }).result.value;
    }
    // heap and process view from the browser side
    const metrics = await within(cdp.send('Performance.getMetrics'), 2000).catch(() => 'error');
    report.metrics = metrics;
  }
  report.console = consoleLog.slice(-CONSOLE_LINES);
  report.importTrace = consoleLog.filter((l) => l.includes('[import-trace]'));
  return report;
}

async function runWay(page: Page, way: Way) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  if (way === 'fixture') {
    await page.getByTestId('import-file').setInputFiles(FIXTURE);
  } else if (way === 'sprint') {
    await page.getByTestId('import-file').setInputFiles({
      name: 'sprint.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sprintBackup())),
    });
  } else {
    // Einstellungen → Sicherung importieren → Ersetzen, after „Leer starten“
    await page.getByRole('button', { name: 'Leer starten' }).click();
    await expect(page.getByTestId('setup-dialog')).toHaveCount(0);
    await page.goto('/#/einstellungen');
    await page.getByTestId('backup-file').setInputFiles(FIXTURE);
    const sheet = page.getByTestId('import-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: /Ersetzen/ }).check();
    await sheet.getByRole('button', { name: 'Ersetzen', exact: true }).click();
    await page.goto('/#/monat');
  }
}

async function stopChromiumTrace(browser: Browser, path: string | null) {
  const buffer = await within(browser.stopTracing(), 15_000).catch(() => 'timeout' as const);
  if (path && buffer !== 'timeout') writeFileSync(path, buffer);
  return buffer !== 'timeout';
}

const REPS = Number(process.env.HARNESS_REPS ?? 3);

for (let iteration = 0; iteration < REPS; iteration++)
for (const way of ['fixture', 'sprint', 'ui'] as const) {
  test(`Import ${way} → Hero #${iteration}`, async ({ page, context, browser }, testInfo) => {
    const project = testInfo.project.name;
    const consoleLog: string[] = [];
    const t = () => new Date().toISOString().slice(11, 23);
    page.on('console', (m) => consoleLog.push(`${t()} ${m.type()} ${m.text()}`));
    page.on('pageerror', (e) => consoleLog.push(`${t()} pageerror ${e.message}`));
    page.on('crash', () => consoleLog.push(`${t()} page crashed`));
    await context.addInitScript(instrumentIndexedDB);
    await context.tracing.start({ screenshots: true, snapshots: true });
    await browser.startTracing(page, { categories: TRACE_CATEGORIES });

    const started = Date.now();
    await runWay(page, way);
    const ok = await reached(page, way, WATCHDOG_MS);
    const msToHero = Date.now() - started;
    const line: Record<string, unknown> = { project, way, iteration, worker: testInfo.workerIndex, ok, msToHero, at: new Date().toISOString() };

    if (ok) {
      await stopChromiumTrace(browser, null);
      await context.tracing.stop();
    } else {
      const dir = join(OUT, 'hangs', `${project}-${way}-${iteration}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const report = await capture(page, context, dir, consoleLog);
      report.recovered = await reached(page, way, RECOVERY_MS);
      report.msSinceImport = Date.now() - started;
      report.chromiumTrace = await stopChromiumTrace(browser, join(dir, 'chromium-trace.json'));
      report.playwrightTrace = (await within(context.tracing.stop({ path: join(dir, 'trace.zip') }), 20_000).catch(() => 'error')) !== 'timeout';
      writeFileSync(join(dir, 'report.json'), JSON.stringify({ project, way, iteration, ...report }, null, 2));
      line.hang = { dir, recovered: report.recovered, mainThread: report.mainThread, paused: !!(report.debugger as { paused: unknown } | undefined)?.paused };
    }
    mkdirSync(OUT, { recursive: true });
    appendFileSync(join(OUT, 'results.jsonl'), `${JSON.stringify(line)}\n`);
    expect(ok, `hero not visible ${WATCHDOG_MS / 1000} s after the import (${way})`).toBe(true);
  });
}
