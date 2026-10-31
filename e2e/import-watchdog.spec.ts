import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { expect, FIXTURE, test } from './fixtures';
import type { Hang } from './import-watchdog';

/**
 * The import watchdog of the suite (e2e/import-watchdog.ts): an artificially stuck import must
 * trigger it, leave every dump and make the test red. Two hangs: the import waits on IndexedDB
 * (main thread answers) and the main thread is frozen (the signature seen in the full suite).
 * Each forced hang is an expected failure (`test.fail`); the last test checks the artefacts.
 */

// keep the Playwright trace of the expected failures too (retain-on-failure would drop them)
test.use({ trace: 'on' });
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'one device is enough'));

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

async function waitForHang(next: Promise<Hang>): Promise<Hang | null> {
  return Promise.race([next, new Promise<null>((r) => setTimeout(() => r(null), 60_000))]);
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
  test.setTimeout(120_000);
  // right after the file is validated the main thread stops for 20 s (no fake clock: real time)
  // as plain source: a function would be transpiled and lose its name in the stack
  await page.addInitScript({
    content: `(() => {
      const debug = console.debug;
      console.debug = function (...args) {
        debug.apply(this, args);
        if (String(args[0]).startsWith('[import-trace] validated')) freezeForWatchdogTest();
      };
      function freezeForWatchdogTest() {
        const until = performance.now() + 20000;
        while (performance.now() < until) {}
      }
    })();`,
  });
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  writeMarker(testInfo, 'frozen', await waitForHang(importWatchdog.nextHang()));
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
});
