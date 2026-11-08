// Performance, iPhone profile (Playwright project „perf“: iPhone 15 viewport, touch, DPR 3; runs after
// all other projects so no other test competes for the CPU).
//   Ø Frame-Zeit  = mean of the browser's „AnimationFrame“ spans (main thread, per frame) in the Chrome
//                   trace, while scrolling Monat and Analyse and while switching tabs
//   Long Tasks    = PerformanceObserver „longtask“ from the tap until the fade out, the
//                   entrance and the bar growth are over
//   CLS           = sum of all layout shifts (also those right after an input)
// The numbers are written to docs/perf/liquid-glass.json for the PR.
//
// Independent of the container's speed: right before each measurement a fixed calibration workload
// (style, layout and script, the kind of work a frame does) runs in the page. Its time against the
// reference (REF_CALIBRATION_MS, measured on an idle container) gives the speed factor of this moment;
// frame times and the long-task limit are compared after dividing by it (factor never below 1: a fast
// machine is not given more room). Raw and normalised values are both written to the JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

test.describe.configure({ mode: 'serial' });

const OUT = 'docs/perf';
/** another reference for another machine: PERF_REF_MS=<ms> (see docs/fixkostenkonto/FEINSCHLIFF-PUFFER.md) */
const REF_CALIBRATION_MS = Number(process.env.PERF_REF_MS ?? 0) || 0;
/** reference: median calibration time on an idle container (9 measurements 27–34 ms, 08.11.2026) */
const CALIBRATION_REF = 30;

/** A fixed workload of style, layout and script work; median of 5 runs in ms. */
async function calibrate(page: Page): Promise<number> {
  return page.evaluate(() => {
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:360px';
      for (let i = 0; i < 600; i++) {
        const d = document.createElement('div');
        d.textContent = `Zeile ${i} · € ${(i * 13.37).toFixed(2)}`;
        d.style.cssText = `padding:${i % 7}px;border-radius:${i % 11}px;font-size:${12 + (i % 5)}px`;
        host.appendChild(d);
      }
      document.body.appendChild(host);
      let h = 0;
      for (let k = 0; k < 8; k++) {
        host.style.width = `${300 + k * 10}px`;
        h += host.offsetHeight;
      }
      let x = 0;
      for (let i = 0; i < 300_000; i++) x += Math.sqrt(i) * Math.sin(i);
      host.remove();
      runs.push(performance.now() - t0 + (h + x > -1 ? 0 : 1));
    }
    runs.sort((a, b) => a - b);
    return runs[2]!;
  });
}

const normalised = (m: { avgFrameMs: number; maxFrameMs: number }, speed: { calibrationMs: number; factor: number }) => ({
  calibrationMs: speed.calibrationMs,
  factor: speed.factor,
  avgFrameMsNormalised: Math.round((m.avgFrameMs / speed.factor) * 10) / 10,
});

/** speed factor of this moment against the reference (≥ 1) */
async function speedFactor(page: Page): Promise<{ calibrationMs: number; factor: number }> {
  const calibrationMs = Math.round((await calibrate(page)) * 10) / 10;
  const ref = REF_CALIBRATION_MS || CALIBRATION_REF;
  return { calibrationMs, factor: Math.max(1, Math.round((calibrationMs / ref) * 100) / 100) };
}
const results: Record<string, unknown> = {};

async function observe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { perf: { longtasks: { start: number; duration: number }[]; shifts: number[] }; observers?: PerformanceObserver[] };
    // one pair of observers at a time (each task / shift counted once)
    w.observers?.forEach((o) => o.disconnect());
    w.perf = { longtasks: [], shifts: [] };
    const tasks = new PerformanceObserver((l) => l.getEntries().forEach((e) => w.perf.longtasks.push({ start: e.startTime, duration: e.duration })));
    const shifts = new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => w.perf.shifts.push((e as PerformanceEntry & { value: number }).value)),
    );
    tasks.observe({ type: 'longtask' });
    shifts.observe({ type: 'layout-shift' });
    w.observers = [tasks, shifts];
  });
}
const collected = (page: Page) =>
  page.evaluate(() => (window as unknown as { perf: { longtasks: { start: number; duration: number }[]; shifts: number[] } }).perf);

/**
 * Runs `action` under a Chrome trace; returns the frames and their Ø / maximum frame time: the
 * browser's own „AnimationFrame“ span per frame on the renderer main thread (first task of the frame
 * until its rendering is done – the work a frame costs, idle gaps between its tasks included).
 */
async function frameWork(browser: Browser, page: Page, name: string, action: () => Promise<void>) {
  const path = `test-results/perf-${name}.json`;
  await browser.startTracing(page, { path, categories: ['devtools.timeline'] });
  await action();
  await browser.stopTracing();
  const ev = (JSON.parse(readFileSync(path, 'utf8')) as { traceEvents: { name: string; ph: string; ts: number; id?: number | string; id2?: { local?: string } }[] }).traceEvents;
  const open = new Map<string, number>();
  const frames: number[] = [];
  for (const e of ev.filter((x) => x.name === 'AnimationFrame')) {
    const id = String(e.id2?.local ?? e.id);
    if (e.ph === 'b') open.set(id, e.ts);
    else if (e.ph === 'e' && open.has(id)) {
      frames.push((e.ts - open.get(id)!) / 1000);
      open.delete(id);
    }
  }
  const avg = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
  return { frames: frames.length, avgFrameMs: Math.round(avg * 10) / 10, maxFrameMs: Math.round(Math.max(0, ...frames) * 10) / 10 };
}

async function scrollGesture(page: Page, distance: number) {
  const cdp = await page.context().newCDPSession(page);
  for (const dy of [-distance, distance]) {
    await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 500, yDistance: dy, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  }
  await cdp.detach();
}

test.beforeEach(async ({ page }) => {
  await importLive(page, OKT_TODAY);
  // the analysis code is fetched and compiled when the app is idle after its start
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-analyse-ready'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await observe(page);
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/liquid-glass.json`, `${JSON.stringify(results, null, 2)}\n`);
});

test('Scrollen Monat: Ø Frame-Zeit < 16 ms, kein Long Task, CLS 0', async ({ page, browser }) => {
  const speed = await speedFactor(page);
  await observe(page);
  const m = await frameWork(browser, page, 'scroll-monat', () => scrollGesture(page, 1400));
  const p = await collected(page);
  results['Scrollen Monat'] = { ...m, ...normalised(m, speed), longtasks: p.longtasks.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) };
  expect(m.frames).toBeGreaterThan(30);
  expect(m.avgFrameMs / speed.factor).toBeLessThan(16);
  expect(p.longtasks.filter((t) => t.duration > 50 * speed.factor)).toEqual([]);
  expect(p.shifts.reduce((a, b) => a + b, 0)).toBe(0);
});

test('Scrollen Analyse: Ø Frame-Zeit < 16 ms, kein Long Task, CLS 0', async ({ page, browser }) => {
  await page.getByTestId('tabbar').getByRole('link', { name: 'Analyse' }).tap();
  await expect(page.locator('main[data-screen="analyse"]')).toHaveCount(1);
  await page.waitForTimeout(1600); // entrance and bars over
  const speed = await speedFactor(page);
  await observe(page);
  const m = await frameWork(browser, page, 'scroll-analyse', () => scrollGesture(page, 1800));
  const p = await collected(page);
  results['Scrollen Analyse'] = { ...m, ...normalised(m, speed), longtasks: p.longtasks.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) };
  expect(m.frames).toBeGreaterThan(30);
  expect(m.avgFrameMs / speed.factor).toBeLessThan(16);
  expect(p.longtasks.filter((t) => t.duration > 50 * speed.factor)).toEqual([]);
  expect(p.shifts.reduce((a, b) => a + b, 0)).toBe(0);
});

test('Tabwechsel (inkl. erster Besuch Analyse): Ø Frame-Zeit < 16 ms, kein Long Task > 50 ms während der Animation, CLS 0', async ({ page, browser }) => {
  const bar = page.getByTestId('tabbar');
  const switches: Record<string, unknown>[] = [];
  const speed = await speedFactor(page);
  const m = await frameWork(browser, page, 'tabwechsel', async () => {
    for (const tab of ['Analyse', 'Positionen', 'Einstellungen', 'Monat', 'Analyse', 'Monat']) {
      await observe(page);
      const t0 = await page.evaluate(() => performance.now());
      await bar.getByRole('link', { name: tab }).tap();
      // fade out (120 ms) + entrance (≤ 865 ms) + bars (Analyse) are over after 1.6 s
      await page.waitForTimeout(1600);
      const p = await collected(page);
      const during = p.longtasks.filter((t) => t.start >= t0 - 5);
      switches.push({ tab, longtasks: during.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) });
    }
  });
  results.Tabwechsel = { ...m, ...normalised(m, speed), switches };
  expect(m.avgFrameMs / speed.factor).toBeLessThan(16);
  for (const s of switches as { tab: string; longtasks: number[]; cls: number }[]) {
    expect(s.longtasks.filter((d) => d > 50 * speed.factor), `${s.tab}: long tasks`).toEqual([]);
    expect(s.cls, `${s.tab}: CLS`).toBe(0);
  }
});
