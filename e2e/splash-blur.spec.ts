import type { Browser, Page, TestInfo } from '@playwright/test';
import { appSettled, expect, FIXTURE, test, TODAY } from './fixtures';

/**
 * Splash and blur apart (import hang of 31.10.2026): while the splash is there – also while it fades –
 * no visible element has a backdrop-filter, and the setup dialog only appears once the splash is
 * gone. The end image after the splash is the same as the Monat screen of the same build loaded
 * without a splash (test flag noSplash, src/lib/importTrace.ts): same viewport, theme and data, at
 * most 1 % of the pixels visibly differ (more than 8 levels in a channel), and the same surfaces
 * blur with the same values (computed backdrop-filter of every visible element). The second part is
 * needed: Playwright's WebKit keeps backdrop-filter in the computed style but paints the backdrop
 * sharp, so pixels alone cannot see a missing blur there (in Chromium a missing blur changes only
 * about 1 % of the Monat screen). Counter-check: with the blur coming back late (test flag lateBlur)
 * the same comparison fails.
 */

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

/** A context like the test's own (device, scheme, locale), with the given test flags set before any app code. */
async function contextFor(browser: Browser, testInfo: TestInfo, flags: Record<string, boolean>) {
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
  await context.addInitScript((f) => ((window as unknown as { __erbseTestFlags: Record<string, boolean> }).__erbseTestFlags = f), flags);
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

/**
 * The Monat screen after a fresh start with data: import on first start, then reload. With noSplash
 * the reload comes up without the splash (reference); otherwise through the splash and its fade.
 */
interface EndImage {
  shot: Buffer;
  /** visible elements with a backdrop-filter, as `testid|class: filter`, sorted */
  blur: string[];
}

async function monatAfterStart(browser: Browser, testInfo: TestInfo, flags: Record<string, boolean>): Promise<EndImage> {
  const context = await contextFor(browser, testInfo, flags);
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await page.reload();
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
  await appSettled(page);
  await still(page);
  const shot = await page.screenshot();
  const blur = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .flatMap((el) => {
        const s = getComputedStyle(el);
        const f = s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter || 'none';
        const r = el.getBoundingClientRect();
        const visible = s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        return f !== 'none' && visible ? [`${el.getAttribute('data-testid') ?? String(el.className)}: ${f}`] : [];
      })
      .sort(),
  );
  await context.close();
  return { shot, blur };
}

/** Share of pixels that differ by more than 8 levels in a channel (decoded in the browser: no image library needed). */
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
        if (Math.max(Math.abs(da[i]! - db[i]!), Math.abs(da[i + 1]! - db[i + 1]!), Math.abs(da[i + 2]! - db[i + 2]!)) > 8) diff++;
      }
      return diff / (da.length / 4);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

/** Pixels (share visibly different) and blur (same surfaces, same values) of an end image against the reference. */
async function compare(page: Page, testInfo: TestInfo, name: string, reference: EndImage, image: EndImage) {
  await page.goto('about:blank');
  await testInfo.attach(`${name}-referenz.png`, { body: reference.shot, contentType: 'image/png' });
  await testInfo.attach(`${name}-endbild.png`, { body: image.shot, contentType: 'image/png' });
  const ratio = await diffRatio(page, reference.shot, image.shot);
  const sameBlur = JSON.stringify(reference.blur) === JSON.stringify(image.blur);
  await testInfo.attach(`${name}-diff.txt`, { body: `${(ratio * 100).toFixed(3)} %\nreference blur:\n${reference.blur.join('\n')}\nend image blur:\n${image.blur.join('\n')}` });
  console.log(`[splash-diff] ${testInfo.project.name} ${name}: ${(ratio * 100).toFixed(2)} %, blurred surfaces ${reference.blur.length} → ${image.blur.length}${sameBlur ? '' : ' (different)'}`);
  return { ratio, sameBlur, reference: reference.blur, image: image.blur };
}

test('Endbild nach dem Splash wie derselbe Build ohne Splash: Monat, höchstens 1 % Pixel sichtbar anders, gleicher Blur', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  const reference = await monatAfterStart(browser, testInfo, { noSplash: true });
  const image = await monatAfterStart(browser, testInfo, {});
  const c = await compare(page, testInfo, 'monat', reference, image);
  expect(c.reference.length, 'the reference blurs (tab bar, cards)').toBeGreaterThan(0);
  expect(c.ratio, 'monat: share of differing pixels').toBeLessThanOrEqual(0.01);
  expect(c.image, 'monat: same surfaces blur with the same values').toEqual(c.reference);
});

test('Gegenprobe: Blur nach dem Splash künstlich verzögert – derselbe Vergleich schlägt an', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  const reference = await monatAfterStart(browser, testInfo, { noSplash: true });
  const image = await monatAfterStart(browser, testInfo, { lateBlur: true });
  const c = await compare(page, testInfo, 'monat-blur-spaet', reference, image);
  // the end-image test above fails on this image: pixels over 1 % or (WebKit: always) other blur
  expect(c.ratio > 0.01 || !c.sameBlur, 'the comparison must see the missing blur').toBe(true);
  expect(c.image, 'no surface blurs while the blur is held back').toEqual([]);
});
