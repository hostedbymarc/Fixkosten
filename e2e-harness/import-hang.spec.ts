import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, FIXTURE, TODAY, test } from '../e2e/fixtures';
import { capture, instrumentIndexedDB, TRACE_CATEGORIES, WATCHDOG_MS, within } from '../e2e/import-watchdog';
import { sprintBackup } from '../e2e/sprint-data';

/**
 * Import-hang harness: only import → hero, HARNESS_REPS times per import way. Generated tests rather
 * than --repeat-each: each repetition there gets a new worker and browser, while the full suite keeps
 * one browser per worker for hundreds of tests (a new context per test, as here).
 * A watchdog waits 10 s for the hero; then it records what the page is doing (see `capture`).
 * Every iteration appends one line to harness-results/results.jsonl.
 */

const OUT = 'harness-results';
/** after the dumps: does the page still get there (slow) or not (stuck)? */
const RECOVERY_MS = 20_000;

type Way = 'fixture' | 'sprint' | 'ui';

// the suite's watchdog would capture a second time; here every iteration records itself
test.use({ importWatchdogEnabled: false });

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
      const report = await capture(page, context, dir, consoleLog, { mapsDir: 'dist-harness' });
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
