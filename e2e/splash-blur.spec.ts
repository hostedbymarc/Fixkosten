import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { appSettled, expect, FIXTURE, test, TODAY } from './fixtures';

/**
 * Splash and blur apart (import hang of 31.10.2026): while the splash is there – also while it fades –
 * no visible element has a backdrop-filter, and the setup dialog only appears once the splash is
 * gone. The end image is the same as on main before the change (6e618fd, built by global-setup),
 * at most 1 % of the pixels differ.
 */

const MAIN = resolve('.legacy/6e618fd/dist');

/** Page side, before any app code: every frame while #splash exists, the visible elements with a backdrop-filter. */
function watchSplash() {
  const w = window as unknown as Record<string, unknown>;
  const log = { frames: 0, violations: [] as string[], splashRemovedAt: -1, dialogAt: -1, splashRemovedSeq: 0, dialogSeq: 0, dialogWithSplash: false };
  w.__splashWatch = log;
  const blurOf = (s: CSSStyleDeclaration) => {
    const v = s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter || 'none';
    return v && v !== 'none' ? v : null;
  };
  const visible = (el: Element, s: CSSStyleDeclaration) => {
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  // runs until the splash has been there and is gone (the first frames may come before it is parsed)
  let seen = false;
  const tick = () => {
    const splash = document.getElementById('splash');
    if (!splash && !seen && log.splashRemovedAt < 0) {
      requestAnimationFrame(tick);
      return;
    }
    if (splash) {
      seen = true;
      log.frames++;
      for (const el of document.body.querySelectorAll('*')) {
        if (el === splash || splash.contains(el)) continue;
        for (const pseudo of [null, '::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          const blur = blurOf(s);
          if (blur && visible(el, getComputedStyle(el))) {
            log.violations.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')}${pseudo ?? ''}: ${blur} (splash opacity ${getComputedStyle(splash).opacity})`);
          }
        }
      }
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  // the order as the DOM sees it (a running number, not the time: page.clock fakes performance.now
  // in these tests); the records of one callback come in DOM order
  let seq = 0;
  new MutationObserver((records) => {
    const now = performance.now();
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (log.splashRemovedAt < 0 && (n as Element).id === 'splash') {
          log.splashRemovedAt = now;
          log.splashRemovedSeq = ++seq;
        }
      }
      for (const n of r.addedNodes) {
        if (log.dialogAt < 0 && n instanceof Element && (n.matches('[data-testid="setup-dialog"]') || n.querySelector('[data-testid="setup-dialog"]'))) {
          log.dialogAt = now;
          log.dialogSeq = ++seq;
          if (document.getElementById('splash')) log.dialogWithSplash = true;
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

interface SplashWatch {
  frames: number;
  violations: string[];
  splashRemovedAt: number;
  dialogAt: number;
  splashRemovedSeq: number;
  dialogSeq: number;
  dialogWithSplash: boolean;
}

const readWatch = (page: Page) => page.evaluate(() => (window as unknown as { __splashWatch: SplashWatch }).__splashWatch);

test.describe('Splash und Blur entzerrt', () => {
  test('Erststart: kein Blur unter dem Splash, Setup-Dialog erst nach dem Splash', async ({ page }) => {
    await page.addInitScript(watchSplash);
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await expect(page.getByTestId('setup-dialog')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0);
    const w = await readWatch(page);
    expect(w.frames, 'frames sampled under the splash').toBeGreaterThan(5);
    expect(w.violations, 'visible elements with backdrop-filter while the splash is there').toEqual([]);
    expect(w.splashRemovedAt).toBeGreaterThan(0);
    expect(w.dialogWithSplash, 'setup dialog in the DOM while the splash is still there').toBe(false);
    expect(w.dialogSeq, 'setup dialog only after the splash is gone').toBeGreaterThan(w.splashRemovedSeq);
    // afterwards the dialog blurs as before
    expect(await page.getByTestId('setup-dialog').evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue('-webkit-backdrop-filter'))).toMatch(/blur\(24px\)/);
    await expect(page.locator('html')).not.toHaveAttribute('data-splash');
  });

  test('Start mit Daten: kein Blur unter dem Splash, danach blurt alles wie vorher', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await page.getByTestId('import-file').setInputFiles(FIXTURE);
    await expect(page.getByTestId('hero')).toBeVisible();
    await appSettled(page);
    await page.addInitScript(watchSplash);
    await page.reload();
    await appSettled(page);
    const w = await readWatch(page);
    expect(w.frames).toBeGreaterThan(5);
    expect(w.violations).toEqual([]);
    await expect(page.locator('html')).not.toHaveAttribute('data-splash');
    expect(await page.getByTestId('tabbar').locator('.glass-clear').first().evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue('-webkit-backdrop-filter'))).toMatch(/blur\(24px\)/);
  });

  test('Bewegung reduzieren: ebenso', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(watchSplash);
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await expect(page.getByTestId('setup-dialog')).toBeVisible();
    const w = await readWatch(page);
    expect(w.violations).toEqual([]);
    expect(w.dialogWithSplash).toBe(false);
    expect(w.dialogSeq).toBeGreaterThan(w.splashRemovedSeq);
    expect(w.splashRemovedSeq).toBeGreaterThan(0);
  });
});

/** A context like the test's own (device, scheme, locale), serving `dir` when given (the build of main). */
async function contextFor(browser: Browser, testInfo: TestInfo, dir: string | null): Promise<BrowserContext> {
  const u = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    colorScheme: u.colorScheme ?? 'light',
    locale: u.locale,
    timezoneId: u.timezoneId,
    serviceWorkers: 'block',
  });
  if (dir) {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
      let file = join(dir, decodeURIComponent(url.pathname));
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
      await route.fulfill({ path: file });
    });
  }
  return context;
}

async function still(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.mouse.move(0, 0);
}

/** The two end images: setup dialog on first start, Monat after the import. */
async function endImages(browser: Browser, testInfo: TestInfo, dir: string | null): Promise<[Buffer, Buffer]> {
  const context = await contextFor(browser, testInfo, dir);
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
  await still(page);
  const setup = await page.screenshot();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await still(page);
  const month = await page.screenshot();
  await context.close();
  return [setup, month];
}

/** Share of pixels that differ at all (decoded in the browser: no image library needed). */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (b: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${b}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const px = (img: ImageBitmap) => {
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
      }
      return diff / (da.length / 4);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

test('Endbild nach dem Übergang wie auf main (6e618fd): Setup-Dialog und Monat, höchstens 1 % Pixel anders', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  expect(existsSync(join(MAIN, 'index.html')), 'build of main missing – run node scripts/build-legacy.mjs 6e618fd').toBe(true);
  const before = await endImages(browser, testInfo, MAIN);
  const after = await endImages(browser, testInfo, null);
  await page.goto('about:blank');
  for (const [i, name] of ['setup', 'monat'].entries()) {
    await testInfo.attach(`${name}-main.png`, { body: before[i]!, contentType: 'image/png' });
    await testInfo.attach(`${name}-neu.png`, { body: after[i]!, contentType: 'image/png' });
    const ratio = await diffRatio(page, before[i]!, after[i]!);
    await testInfo.attach(`${name}-diff.txt`, { body: `${(ratio * 100).toFixed(3)} %` });
    expect(ratio, `${name}: share of differing pixels`).toBeLessThanOrEqual(0.01);
  }
});
