import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { expect, FIXTURE, test } from './fixtures';
import type { Hang } from './import-watchdog';
import { browserProcesses } from './native-dump';

/**
 * The import watchdog of the suite (e2e/import-watchdog.ts): an artificially stuck import must
 * trigger it, leave every dump and make the test red. Two hangs: the import waits on IndexedDB
 * (main thread answers) and the main thread is frozen (the signature seen in the full suite).
 * Each forced hang is an expected failure (`test.fail`); the last test checks the artefacts.
 */

/** instead of docs/diagnose/import-hang: the forced hangs of this file are no findings */
const DOCS = resolve('test-results/import-watchdog-docs');

// keep the Playwright trace of the expected failures too (retain-on-failure would drop them)
test.use({ trace: 'on', importWatchdogDocsDir: DOCS });
test.describe.configure({ mode: 'serial' });
// one device per engine is enough: desktop (Chromium); WebKit only the SIGSTOP case (its processes differ)
const WEBKIT_PROJECT = 'webkit-iphone-15-light';
test.beforeEach(({}, testInfo) => {
  if (testInfo.project.name === WEBKIT_PROJECT) test.skip(!/SIGSTOP/.test(testInfo.title), 'WebKit: only the native dump');
  else test.skip(testInfo.project.name !== 'desktop', 'one device is enough');
});

interface Marker {
  hang: boolean;
  outputDir: string;
  dir?: string;
}

const markerPath = (testInfo: TestInfo, name: string) => join(testInfo.project.outputDir, 'import-watchdog', `${name}.json`);

function writeMarker(testInfo: TestInfo, name: string, hang: Hang | null) {
  mkdirSync(join(testInfo.project.outputDir, 'import-watchdog'), { recursive: true });
  const marker: Marker = { hang: !!hang, outputDir: testInfo.outputDir, dir: hang?.dir };
  writeFileSync(markerPath(testInfo, name), JSON.stringify(marker));
}

async function waitForHang(next: Promise<Hang>, ms = 60_000): Promise<Hang | null> {
  return Promise.race([next, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function state(pid: number): string | null {
  try {
    return /^State:\s*(.+)$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? null;
  } catch {
    return null; // gone
  }
}

test('blockierter Import (IndexedDB wartet) löst den Watchdog aus', async ({ page, importWatchdog }, testInfo) => {
  test.fail(true, 'the watchdog makes this test red on purpose');
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  // a second connection holds a readwrite transaction over every table: the import has to wait
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('fixkosten');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const conn = req.result;
          const tx = conn.transaction([...conn.objectStoreNames], 'readwrite');
          const store = tx.objectStore(conn.objectStoreNames[0]!);
          const until = performance.now() + 45_000;
          (function keepBlocking() {
            if (performance.now() < until) store.count().onsuccess = keepBlocking;
          })();
          resolve();
        };
      }),
  );
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  writeMarker(testInfo, 'blocked', await waitForHang(importWatchdog.nextHang()));
});

test('eingefrorener Haupt-Thread löst den Watchdog aus', async ({ page, importWatchdog }, testInfo) => {
  test.fail(true, 'the watchdog makes this test red on purpose');
  test.setTimeout(180_000);
  // right after the file is validated the main thread stops for 60 s (no fake clock: real time):
  // longer than the watchdog (10 s) plus the native dumps that come first (CPU sample, gdb)
  // as plain source: a function would be transpiled and lose its name in the stack
  await page.addInitScript({
    content: `(() => {
      const debug = console.debug;
      console.debug = function (...args) {
        debug.apply(this, args);
        if (String(args[0]).startsWith('[import-trace] validated')) freezeForWatchdogTest();
      };
      function freezeForWatchdogTest() {
        const until = performance.now() + 60000;
        while (performance.now() < until) {}
      }
    })();`,
  });
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  writeMarker(testInfo, 'frozen', await waitForHang(importWatchdog.nextHang()));
});

test('Renderer-Prozess per SIGSTOP eingefroren: Watchdog mit nativen Dumps, danach SIGCONT', async ({ page, importWatchdog }, testInfo) => {
  test.fail(true, 'the watchdog makes this test red on purpose');
  // watchdog 10 s, CPU sample 5 s, gdb up to 30 s per process (in parallel), CDP timeouts
  test.setTimeout(240_000);
  const engine = testInfo.project.name === WEBKIT_PROJECT ? 'webkit' : 'chromium';
  const content = engine === 'webkit' ? 'web-content' : 'renderer';
  let stopped: number[] = [];
  try {
    await page.goto('/');
    await expect(page.getByTestId('setup-dialog')).toBeVisible();
    // the signature of 31.10.: the import has committed, then the whole renderer process stands still
    page.on('console', (m) => {
      if (stopped.length || !m.text().startsWith('[import-trace] committed')) return;
      stopped = browserProcesses()
        .filter((p) => p.role === content)
        .map((p) => p.pid);
      for (const pid of stopped) process.kill(pid, 'SIGSTOP');
    });
    await page.getByTestId('import-file').setInputFiles(FIXTURE);
    const hang = await waitForHang(importWatchdog.nextHang(), 150_000);
    writeFileSync(join(testInfo.outputDir, 'stopped.json'), JSON.stringify(stopped));
    writeMarker(testInfo, `sigstop-${engine}`, hang);
  } finally {
    for (const pid of stopped) {
      try {
        process.kill(pid, 'SIGCONT');
      } catch {
        // already gone
      }
    }
  }
  // clean up: every stopped process runs again and the page answers
  expect(stopped.length, `${content} processes stopped`).toBeGreaterThan(0);
  for (const pid of stopped) await expect.poll(() => state(pid)?.startsWith('T') ?? false).toBe(false);
  await expect.poll(() => page.evaluate(() => 1), { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId('hero')).toBeVisible({ timeout: 20_000 });
});

test('Watchdog-Artefakte sind vollständig', async ({}, testInfo) => {
  const read = (name: string) => JSON.parse(readFileSync(markerPath(testInfo, name), 'utf8')) as Marker;
  const report = (m: Marker) => JSON.parse(readFileSync(join(m.dir!, 'report.json'), 'utf8'));

  // --- import waits on IndexedDB, main thread answers
  const blocked = read('blocked');
  expect(blocked.hang, 'watchdog fired for the blocked import').toBe(true);
  const b = report(blocked);
  expect(b.mainThread.answered).toBe(true);
  expect(b.debugger.paused?.callFrames.length, 'Debugger.pause stack').toBeGreaterThan(0);
  expect(b.lastStep).toBeTruthy();
  expect(b.importTrace.join('\n')).toContain('file-chosen');
  expect(b.state.dexie.isOpen).toBe(true);
  expect(b.state.idbOpenTransactions.some((t: { mode: string }) => t.mode === 'readwrite')).toBe(true);
  expect(b.state).toHaveProperty('serviceWorker');
  expect(b.console.length).toBeGreaterThan(0);
  expect(JSON.parse(readFileSync(join(blocked.dir!, 'chromium-trace.json'), 'utf8')).traceEvents.length).toBeGreaterThan(0);
  expect(existsSync(join(blocked.dir!, 'screenshot.png'))).toBe(true);
  expect(existsSync(join(blocked.outputDir, 'trace.zip')), 'Playwright trace').toBe(true);

  // --- frozen main thread: no state dump possible, but the stack shows where it is stuck
  const frozen = read('frozen');
  expect(frozen.hang, 'watchdog fired for the frozen page').toBe(true);
  const f = report(frozen);
  expect(f.mainThread.answered).toBe(false);
  const frames: string[] = f.debugger.paused.callFrames;
  expect(frames[0]).toMatch(/^freezeForWatchdogTest /);
  // the app frames are resolved through the e2e build's source map: who called the trace
  expect(frames.join('\n')).toMatch(/→ src\/db\/backup\.ts:\d+/);
  expect(f.lastStep).toMatch(/^validated/);
  expect(JSON.parse(readFileSync(join(frozen.dir!, 'chromium-trace.json'), 'utf8')).traceEvents.length).toBeGreaterThan(0);
  expect(existsSync(join(frozen.outputDir, 'trace.zip')), 'Playwright trace').toBe(true);

  // --- whole renderer process stopped (SIGSTOP): the operating-system view
  checkSigstop(read('sigstop-chromium'), 'renderer', 'gpu');
});

test('Watchdog-Artefakte WebKit (SIGSTOP)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== WEBKIT_PROJECT, 'WebKit project only');
  const read = (name: string) => JSON.parse(readFileSync(markerPath(testInfo, name), 'utf8')) as Marker;
  checkSigstop(read('sigstop-webkit'), 'web-content', 'network');
});

interface NativeEntry {
  role: string;
  pid: number;
  state: string | null;
  wchan: string | null;
  threads: number;
  cpuPercent: number | null;
  gdb: string;
  mainThreadTop: string[];
  files: string;
}

function checkSigstop(marker: Marker, content: string, other: string) {
  expect(marker.hang, 'watchdog fired for the stopped renderer').toBe(true);
  const r = JSON.parse(readFileSync(join(marker.dir!, 'report.json'), 'utf8'));
  expect(r.lastStep).toMatch(/^committed|^livequery/);
  expect(r.mainThread?.answered ?? false).toBe(false);
  const stopped = JSON.parse(readFileSync(join(marker.outputDir, 'stopped.json'), 'utf8')) as number[];
  const native = r.native as NativeEntry[];
  expect(Array.isArray(native), `native dump: ${JSON.stringify(r.native)}`).toBe(true);
  const renderer = native.filter((n) => n.role === content && stopped.includes(n.pid));
  expect(renderer.length, `${content} dumped`).toBeGreaterThan(0);
  expect(native.some((n) => n.role === other), `${other} process dumped`).toBe(true);
  for (const n of renderer) {
    expect(n.state).toBe('T (stopped)');
    expect(n.cpuPercent).toBe(0);
    expect(n.threads).toBeGreaterThan(1);
  }
  for (const n of native) {
    const dir = join(marker.dir!, n.files);
    for (const f of ['status.txt', 'wchan.txt', 'task-stat.txt', 'cpu.json', 'gdb-bt.txt', 'cmdline.txt']) {
      expect(existsSync(join(dir, f)), `${n.role}-${n.pid}/${f}`).toBe(true);
    }
    expect(n.gdb, `gdb ${n.role}`).toBe('ok');
    const bt = readFileSync(join(dir, 'gdb-bt.txt'), 'utf8');
    expect(bt).toMatch(/^Thread \d+ /m);
    expect(bt).toMatch(/^#0 /m);
    expect(n.cpuPercent).not.toBeNull();
  }
  expect(readFileSync(join(marker.dir!, renderer[0]!.files, 'status.txt'), 'utf8')).toMatch(/^State:\s+T \(stopped\)/m);
  expect(r.signature).toHaveProperty('committed', true);
  // copied next to the findings (here: the test's own docs folder)
  expect(r.docsCopy).toContain(DOCS);
  expect(existsSync(join(r.docsCopy, 'report.json'))).toBe(true);
  expect(readdirSync(join(r.docsCopy, 'native')).length).toBeGreaterThan(1);
}
