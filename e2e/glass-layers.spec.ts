import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { appSettled, expect, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// iOS Safari „Ganze Seite“ renders the SCREEN CSS (a dark-mode capture shows the dark colours) and
// captured every gradient into transparency inside the glass as black: in every surface the specular
// ellipse was light, the rest black – as a ::after layer and also as a background layer of the surface
// (Diagnose-Seite on PR #36). The material is now a flat fill + rim (border + inset highlight), without
// ::before/::after, mask or gradient. Playwright does not reproduce the iOS capture; what decides is
// that no such layer or gradient exists any more (scripts/check-glass-layers.mjs, part of the build).
// These tests check that the screen looks as before (apart from the specular) and that full-page
// captures show clean surfaces.

const MATERIAL = '.glass, .glass-strong, .glass-clear, .glass-tile, .glass-pill';
const PAGES = [
  { name: 'Monat November', route: 'monat' },
  { name: 'Analyse', route: 'analyse' },
] as const;
/** main before this fix (built by global-setup) */
const MAIN = resolve('.legacy/9eb9938/dist');
/** before/after images for the PR description (not committed by the suite: docs/screenshots rule) */
const SHOTS = process.env.GLASS_SHOTS;

/** Everything but the glass surfaces hidden (text, icons, bars, headings): only the material is left. */
const MATERIAL_ONLY = `
  body * { visibility: hidden !important; }
  :is(${MATERIAL}) { visibility: visible !important; color: transparent !important; -webkit-text-fill-color: transparent !important; }
  [data-tab-hidden] :is(${MATERIAL}) { visibility: hidden !important; }
`;

async function settle(page: Page) {
  await appSettled(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
  await page.waitForTimeout(150);
}

async function open(page: Page, route: string) {
  await importLive(page, NOV_TODAY);
  if (route !== 'monat') await page.goto(`/#/${route}`);
  await settle(page);
  await page.mouse.move(0, 0);
}

/** Boxes (document CSS px) of the visible material surfaces. */
const surfaces = (page: Page) =>
  page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => !el.closest('[data-tab-hidden]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => c.startsWith('glass')).join('.')}${el.dataset.testid ? `#${el.dataset.testid}` : ''}`, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
      })
      .filter((b) => b.w > 8 && b.h > 8);
  }, MATERIAL);

/**
 * Inside every surface (inset by its radius and past the rim, so neither a corner nor the 1 px rim
 * and highlight are read; smaller surfaces lying on it are left out, they are measured themselves):
 *   dark  pixels with every channel ≤ #303030
 *   edges neighbouring pixels (2 device px apart) differing by more than 16 in a channel – a hard
 *         edge between light and dark; the specular and the blurred background are smooth
 */
async function inspect(page: Page, png: Buffer, boxes: Awaited<ReturnType<typeof surfaces>>, scale: number) {
  return page.evaluate(
    async ([b64, bs, s]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const at = (x: number, y: number) => (y * img.width + x) * 4;
      return bs.map((b) => {
        const inset = Math.max(4, b.radius * 0.3 + 3);
        const x0 = Math.max(0, Math.round((b.x + inset) * s));
        const y0 = Math.max(0, Math.round((b.y + inset) * s));
        const x1 = Math.min(img.width - 2, Math.round((b.x + b.w - inset) * s));
        const y1 = Math.min(img.height - 2, Math.round((b.y + b.h - inset) * s));
        const others = bs.filter((o) => o !== b && o.w * o.h < b.w * b.h && o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y);
        const covered = (x: number, y: number) => others.some((o) => x >= (o.x - 4) * s && x <= (o.x + o.w + 4) * s && y >= (o.y - 4) * s && y <= (o.y + o.h + 4) * s);
        let n = 0;
        let dark = 0;
        let edges = 0;
        let worst = 0;
        let where = '';
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            if (covered(x, y) || covered(x + 2, y + 2)) continue;
            const i = at(x, y);
            n++;
            if (d[i]! <= 0x30 && d[i + 1]! <= 0x30 && d[i + 2]! <= 0x30) dark++;
            for (const j of [at(x + 2, y), at(x, y + 2)]) {
              const step = Math.max(Math.abs(d[i]! - d[j]!), Math.abs(d[i + 1]! - d[j + 1]!), Math.abs(d[i + 2]! - d[j + 2]!));
              if (step > 16) edges++;
              if (step > worst) [worst, where] = [step, `${Math.round(x / s)},${Math.round(y / s)}`];
            }
          }
        return { tag: b.tag, n, dark, edges, worst, where };
      });
    },
    [png.toString('base64'), boxes, scale] as const,
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Glas ohne Effektebenen ${scheme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ colorScheme: scheme });
    // the WebKit profiles carry their scheme in the name: each runs its own one
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name.startsWith('webkit-') && !testInfo.project.name.endsWith(`-${scheme}`), 'the other WebKit profile');
    });

    for (const p of PAGES) {
      test(`${p.name}, Full-Page: Glasflächen ohne dunkle Fläche und ohne harte Kante`, async ({ page }, testInfo) => {
        test.skip(!/^(iphone-15|ipad-portrait|ipad-landscape|desktop|webkit-(iphone-15|ipad-portrait|ipad-landscape)-(light|dark))$/.test(testInfo.project.name), 'iPhone 15, iPad, Desktop');
        await open(page, p.route);
        // the material: no effect layer, no mask on any surface
        const layers = await page.evaluate((sel) => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            for (const pseudo of ['::before', '::after']) if (getComputedStyle(el, pseudo).content !== 'none') bad.push(`${el.className}${pseudo}`);
            const cs = getComputedStyle(el);
            const mask = cs.getPropertyValue('mask-image') || cs.getPropertyValue('-webkit-mask-image');
            if (mask && mask !== 'none') bad.push(`${el.className} mask`);
            if (cs.mixBlendMode !== 'normal') bad.push(`${el.className} mix-blend-mode`);
          }
          return bad;
        }, MATERIAL);
        expect(layers, 'effect layers on the material').toEqual([]);

        await page.addStyleTag({ content: MATERIAL_ONLY });
        // the viewport as tall as the page first: a full-page capture then needs no resize (no layout shift)
        const vp = page.viewportSize()!;
        for (let i = 0; i < 3; i++) {
          const h = await page.evaluate(() => document.documentElement.scrollHeight);
          if (h === page.viewportSize()!.height) break;
          await page.setViewportSize({ width: vp.width, height: h });
          await page.waitForTimeout(150);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        const boxes = await surfaces(page);
        expect(boxes.length, 'glass surfaces on the page').toBeGreaterThan(2);
        const png = await page.screenshot({ fullPage: true, scale: 'css' });
        const result = await inspect(page, png, boxes, 1);
        await testInfo.attach('surfaces.json', { body: JSON.stringify(result, null, 1), contentType: 'application/json' });
        for (const r of result) {
          if (scheme === 'light') expect(r.dark, `${r.tag}: no pixel ≤ #303030`).toBe(0);
          expect(r.edges, `${r.tag}: no hard edge (worst step ${r.worst} at ${r.where})`).toBe(0);
        }
      });

      test(`${p.name}, Bildschirm: wie main (höchstens 3 % Pixel sichtbar anders)`, async ({ browser, page }, testInfo) => {
        test.skip(!/^(iphone-15|ipad-portrait|ipad-landscape|desktop|webkit-(iphone-15|ipad-portrait|ipad-landscape)-(light|dark))$/.test(testInfo.project.name), 'iPhone 15, iPad hoch und quer, Desktop 1440');
        test.setTimeout(120_000);
        expect(existsSync(join(MAIN, 'index.html')), 'build of main missing – run node scripts/build-legacy.mjs 9eb9938').toBe(true);
        const shot = async (dir: string | null) => {
          const context = await contextFor(browser, testInfo, scheme, dir);
          const pg = await context.newPage();
          await open(pg, p.route);
          const png = await pg.screenshot({ fullPage: true });
          await context.close();
          return png;
        };
        const before = await shot(MAIN);
        const after = await shot(null);
        await page.goto('about:blank');
        await testInfo.attach('main.png', { body: before, contentType: 'image/png' });
        await testInfo.attach('neu.png', { body: after, contentType: 'image/png' });
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true });
          const name = `${testInfo.project.name.replace(/-(light|dark)$/, '')}-${scheme}-${p.route}`;
          const { writeFileSync } = await import('node:fs');
          writeFileSync(join(SHOTS, `${name}-main.png`), before);
          writeFileSync(join(SHOTS, `${name}-neu.png`), after);
        }
        const { ratio, any } = await diffRatio(page, before, after);
        await testInfo.attach('diff.txt', { body: `> 8 Stufen: ${(ratio * 100).toFixed(3)} %, überhaupt anders: ${(any * 100).toFixed(3)} %` });
        console.log(`[glass-diff] ${testInfo.project.name} ${scheme} ${p.route}: ${(ratio * 100).toFixed(2)} % (any ${(any * 100).toFixed(2)} %)`);
        expect(ratio, 'share of visibly differing pixels on screen').toBeLessThanOrEqual(0.03);
      });
    }
  });
}

/** A context like the test's own (device, scheme, locale), serving `dir` when given (a legacy build). */
async function contextFor(browser: Browser, testInfo: TestInfo, scheme: 'light' | 'dark', dir: string | null): Promise<BrowserContext> {
  const u = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    colorScheme: scheme,
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

/**
 * Share of pixels that differ by more than 8 levels in a channel (visible), and of pixels that differ
 * at all (renderers round blended surfaces a level or two differently). Decoded in the browser.
 */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<{ ratio: number; any: number }> {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (s: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, any: 1 };
      const px = (img: ImageBitmap) => {
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let diff = 0;
      let any = 0;
      for (let i = 0; i < da.length; i += 4) {
        const step = Math.max(Math.abs(da[i]! - db[i]!), Math.abs(da[i + 1]! - db[i + 1]!), Math.abs(da[i + 2]! - db[i + 2]!));
        if (step > 0) any++;
        if (step > 8) diff++;
      }
      return { ratio: diff / (da.length / 4), any: any / (da.length / 4) };
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}
