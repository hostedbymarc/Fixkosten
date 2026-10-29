// Performance, iPhone profile (Playwright project „perf“: iPhone 15 viewport, touch, DPR 3; runs after
// all other projects so no other test competes for the CPU).
//   Ø Frame-Zeit  = mean of the browser's „AnimationFrame“ spans (main thread, per frame) in the Chrome
//                   trace, while scrolling Monat and Analyse and while switching tabs
//   Long Tasks    = PerformanceObserver „longtask“ from the tap until the tab transition, the
//                   entrance and the bar growth are over
//   CLS           = sum of all layout shifts (also those right after an input)
// The numbers are written to docs/perf/liquid-glass.json for the PR.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

test.describe.configure({ mode: 'serial' });

const OUT = 'docs/perf';
const results: Record<string, unknown> = {};

async function observe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { perf: { longtasks: { start: number; duration: number }[]; shifts: number[] } };
    w.perf = { longtasks: [], shifts: [] };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.perf.longtasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask' });
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => w.perf.shifts.push((e as PerformanceEntry & { value: number }).value)),
    ).observe({ type: 'layout-shift' });
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
  const m = await frameWork(browser, page, 'scroll-monat', () => scrollGesture(page, 1400));
  const p = await collected(page);
  results['Scrollen Monat'] = { ...m, longtasks: p.longtasks.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) };
  expect(m.frames).toBeGreaterThan(30);
  expect(m.avgFrameMs).toBeLessThan(16);
  expect(p.longtasks.filter((t) => t.duration > 50)).toEqual([]);
  expect(p.shifts.reduce((a, b) => a + b, 0)).toBe(0);
});

test('Scrollen Analyse: Ø Frame-Zeit < 16 ms, kein Long Task, CLS 0', async ({ page, browser }) => {
  await page.getByTestId('tabbar').getByRole('link', { name: 'Analyse' }).tap();
  await expect(page.locator('main[data-screen="analyse"]')).toHaveCount(1);
  await page.waitForTimeout(1600); // entrance and bars over
  await observe(page);
  const m = await frameWork(browser, page, 'scroll-analyse', () => scrollGesture(page, 1800));
  const p = await collected(page);
  results['Scrollen Analyse'] = { ...m, longtasks: p.longtasks.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) };
  expect(m.frames).toBeGreaterThan(30);
  expect(m.avgFrameMs).toBeLessThan(16);
  expect(p.longtasks.filter((t) => t.duration > 50)).toEqual([]);
  expect(p.shifts.reduce((a, b) => a + b, 0)).toBe(0);
});

test('Tabwechsel (inkl. erster Besuch Analyse): Ø Frame-Zeit < 16 ms, kein Long Task > 50 ms während der Animation, CLS 0', async ({ page, browser }) => {
  const bar = page.getByTestId('tabbar');
  const switches: Record<string, unknown>[] = [];
  const m = await frameWork(browser, page, 'tabwechsel', async () => {
    for (const tab of ['Analyse', 'Positionen', 'Einstellungen', 'Monat', 'Analyse', 'Monat']) {
      await observe(page);
      const t0 = await page.evaluate(() => performance.now());
      await bar.getByRole('link', { name: tab }).tap();
      // tab transition (280 ms) + entrance (≤ 865 ms) + bars (Analyse) are over after 1.6 s
      await page.waitForTimeout(1600);
      const p = await collected(page);
      const during = p.longtasks.filter((t) => t.start >= t0 - 5);
      switches.push({ tab, longtasks: during.map((t) => Math.round(t.duration)), cls: p.shifts.reduce((a, b) => a + b, 0) });
    }
  });
  results.Tabwechsel = { ...m, switches };
  expect(m.avgFrameMs).toBeLessThan(16);
  for (const s of switches as { tab: string; longtasks: number[]; cls: number }[]) {
    expect(s.longtasks.filter((d) => d > 50), `${s.tab}: long tasks`).toEqual([]);
    expect(s.cls, `${s.tab}: CLS`).toBe(0);
  }
});
