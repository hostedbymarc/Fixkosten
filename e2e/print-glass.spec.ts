import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { appSettled, expect, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// Full-page capture after Liquid Glass (iPhone Safari „Ganze Seite“: a black area with a curved edge in
// every glass surface, the edge following the specular). In print every effect layer of the material is
// gone (rim ring with mask-composite, specular, group blur, the sliding indicator's rim): surfaces are
// opaque, without blur or mask, with a plain 1 px line. The screen is untouched (compared with main).

const MATERIAL = '.glass, .glass-strong, .glass-clear, .glass-tile, .glass-pill';
const PAGES = [
  { name: 'Monat November', route: 'monat' },
  { name: 'Analyse', route: 'analyse' },
] as const;
const PROJECTS = /^(iphone-15|ipad-portrait|webkit-iphone-15-(light|dark)|webkit-ipad-portrait-(light|dark))$/;
/** main before this fix (built by global-setup) */
const MAIN = resolve('.legacy/9e7bdf4/dist');

/** Content of the glass surfaces hidden (text, icons, bars), the surfaces themselves stay: only the material is left. */
/** Everything but the glass surfaces hidden (text, icons, bars, headings): only the material is left. */
const MATERIAL_ONLY = `
  body * { visibility: hidden !important; }
  :is(${MATERIAL}) { visibility: visible !important; color: transparent !important; -webkit-text-fill-color: transparent !important; }
  [data-tab-hidden] :is(${MATERIAL}) { visibility: hidden !important; }
`;

const isWebKit = (page: Page) => page.context().browser()?.browserType().name() === 'webkit';

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
}

/** Boxes (document CSS px) of the visible material surfaces. */
const surfaces = (page: Page) =>
  page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      // tabs kept for the next visit are not on the page
      .filter((el) => !el.closest('[data-tab-hidden]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => c.startsWith('glass')).join('.')}${el.dataset.testid ? `#${el.dataset.testid}` : ''}`, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
      })
      .filter((b) => b.w > 8 && b.h > 8);
  }, MATERIAL);

/**
 * Inside every surface (inset by its radius, so no corner reads the page behind): pixels with every
 * channel ≤ #303030, and pixels further than 24 per channel from the surface's own median colour
 * (a dark area with an edge; the 1 px line of a nested surface differs by less).
 */
async function inspect(page: Page, png: Buffer, boxes: Awaited<ReturnType<typeof surfaces>>, scale: number) {
  return page.evaluate(
    async ([b64, bs, s]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      return bs.map((b) => {
        const inset = Math.max(3, b.radius * 0.3 + 2);
        const x0 = Math.max(0, Math.round((b.x + inset) * s));
        const y0 = Math.max(0, Math.round((b.y + inset) * s));
        const x1 = Math.min(img.width, Math.round((b.x + b.w - inset) * s));
        const y1 = Math.min(img.height, Math.round((b.y + b.h - inset) * s));
        const px: number[][] = [];
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * img.width + x) * 4;
          px.push([d[i]!, d[i + 1]!, d[i + 2]!]);
        }
        const med = [0, 1, 2].map((k) => px.map((p) => p[k]!).sort((a, z) => a - z)[px.length >> 1] ?? 0);
        let dark = 0;
        let off = 0;
        for (const p of px) {
          if (p[0]! <= 0x30 && p[1]! <= 0x30 && p[2]! <= 0x30) dark++;
          if (Math.max(...[0, 1, 2].map((k) => Math.abs(p[k]! - med[k]!))) > 24) off++;
        }
        return { tag: b.tag, n: px.length, med, dark, off };
      });
    },
    [png.toString('base64'), boxes, scale] as const,
  );
}

/** WCAG contrast of every text element inside a surface against the surface's printed colour. */
const textContrast = (page: Page) =>
  page.evaluate((sel) => {
    const rgb = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3] ?? 1;
      return [0, 1, 2].map((k) => top[k]! * a + under[k]! * (1 - a));
    };
    const base = rgb(getComputedStyle(document.body).backgroundColor);
    const worst: { text: string; ratio: number }[] = [];
    for (const surface of document.querySelectorAll<HTMLElement>(sel)) {
      if (surface.closest('[data-tab-hidden]')) continue;
      const fill = over(rgb(getComputedStyle(surface).backgroundColor), base);
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        const text = n.textContent!.trim();
        if (!text || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        // the nearest surface or opaque background behind this text
        let bg = fill;
        for (let p: HTMLElement | null = el; p && p !== surface; p = p.parentElement) {
          const c = rgb(getComputedStyle(p).backgroundColor);
          if ((c[3] ?? 1) > 0.5) {
            bg = over(c, fill);
            break;
          }
        }
        const fg = over(rgb(getComputedStyle(el).color), bg);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        worst.push({ text: text.slice(0, 30), ratio: (a! + 0.05) / (b! + 0.05) });
      }
    }
    return worst.sort((a, b) => a.ratio - b.ratio).slice(0, 3);
  }, MATERIAL);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Druck nach Liquid Glass ${scheme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(({}, info) => test.skip(!PROJECTS.test(info.project.name), 'iPhone 15 and iPad (portrait), Chromium and WebKit'));

    for (const p of PAGES) {
      test(`${p.name}, Druckansicht: keine Effektebenen, jede Glasfläche deckend und einfarbig, Text lesbar`, async ({ page }) => {
        await open(page, p.route);
        await page.emulateMedia({ media: 'print', colorScheme: scheme });
        // WebKit switches to the light appearance for print: colour transitions run to their end first
        // (a printed page has no transitions)
        await page.waitForTimeout(50);
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        // WebKit prints with the light appearance
        const printed = isWebKit(page) ? 'light' : scheme;

        const layers = await page.evaluate((sel) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            const cs = getComputedStyle(el);
            const tag = `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => c.startsWith('glass')).join('.')}`;
            for (const pseudo of ['::before', '::after']) {
              const ps = getComputedStyle(el, pseudo);
              if (ps.display !== 'none' && ps.content !== 'none') out.push(`${tag}${pseudo}: ${ps.display} ${ps.content}`);
            }
            if (cs.backdropFilter !== 'none' && cs.backdropFilter !== '') out.push(`${tag}: backdrop ${cs.backdropFilter}`);
            const mask = cs.maskImage || cs.getPropertyValue('-webkit-mask-image');
            if (mask && mask !== 'none') out.push(`${tag}: mask ${mask}`);
            if (cs.borderTopWidth !== '1px' || cs.borderTopStyle !== 'solid') out.push(`${tag}: border ${cs.borderTopWidth} ${cs.borderTopStyle}`);
          }
          for (const el of document.querySelectorAll<HTMLElement>('.glass-group-blur')) if (getComputedStyle(el).display !== 'none') out.push('glass-group-blur shown');
          return out;
        }, MATERIAL);
        expect(layers, 'no effect layer, blur or mask in print; a 1 px line').toEqual([]);

        const contrast = await textContrast(page);
        expect(contrast[0]?.ratio ?? 99, `text on the surfaces readable: ${JSON.stringify(contrast)}`).toBeGreaterThanOrEqual(3);

        await page.addStyleTag({ content: MATERIAL_ONLY });
        expect((await surfaces(page)).length).toBeGreaterThan(3);
        // the viewport as tall as the page: a full-page capture would resize it and move the layout
        const width = page.viewportSize()!.width;
        for (let i = 0; i < 3; i++) {
          const h = await page.evaluate(() => document.documentElement.scrollHeight);
          if (h === page.viewportSize()!.height) break;
          await page.setViewportSize({ width, height: h });
          await page.waitForTimeout(150);
        }
        const tall = await surfaces(page);
        const png = await page.screenshot({ scale: 'css' });
        const res = await inspect(page, png, tall, 1);
        if (printed === 'light') expect(res.filter((r) => r.dark > 0), 'no pixel ≤ #303030 inside a glass surface').toEqual([]);
        expect(res.filter((r) => r.off > 0), 'every glass surface one colour (no dark area with an edge)').toEqual([]);
      });

      test(`${p.name}, PDF printBackground true und false: nichts dunkler als die Seite, hell ohne Pixel ≤ #303030`, async ({ page }) => {
        test.skip(isWebKit(page), 'page.pdf() exists in Chromium only (WebKit: Druckansicht above)');
        await open(page, p.route);
        await page.addStyleTag({ content: MATERIAL_ONLY });
        // the two colours a page may show once the content is hidden: base, and glass over base
        await page.emulateMedia({ media: 'print', colorScheme: scheme });
        const allowed = await page.evaluate(() => {
          const rgb = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
          const base = rgb(getComputedStyle(document.body).backgroundColor);
          const g = rgb(getComputedStyle(document.querySelector('.glass')!).backgroundColor);
          const a = g[3] ?? 1;
          return [base.slice(0, 3), [0, 1, 2].map((k) => Math.round(g[k]! * a + base[k]! * (1 - a)))];
        });
        await page.emulateMedia({ media: null, colorScheme: scheme });
        const vp = page.viewportSize()!;
        for (const printBackground of [true, false]) {
          const dir = mkdtempSync(join(tmpdir(), 'erbse-print-glass-'));
          const pdf = join(dir, 'page.pdf');
          await page.pdf({ path: pdf, width: `${vp.width}px`, height: `${vp.height}px`, printBackground });
          // 72 dpi = 0.75 px per CSS px; the last partial pixel row/column of a page is paper, not page
          execFileSync('pdftoppm', ['-png', '-r', '72', '-x', '0', '-y', '0', '-W', String(Math.floor(vp.width * 0.75)), '-H', String(Math.floor(vp.height * 0.75)), pdf, join(dir, 'p')]);
          const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
          expect(files.length).toBeGreaterThan(0);
          for (const [i, f] of files.entries()) {
            const st = await page.evaluate(
              async ([b64, ok]) => {
                const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
                const c = new OffscreenCanvas(img.width, img.height);
                const g = c.getContext('2d')!;
                g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, img.width, img.height).data;
                let dark = 0;
                let off = 0;
                for (let j = 0; j < d.length; j += 8) {
                  const p = [d[j]!, d[j + 1]!, d[j + 2]!];
                  if (p.every((v) => v <= 0x30)) dark++;
                  // a soft shadow under a surface is lighter than this; a dark area is not
                  const lum = (q: number[]) => 0.2126 * q[0]! + 0.7152 * q[1]! + 0.0722 * q[2]!;
                  if (!ok.some((o) => p.every((v, k) => Math.abs(v - o[k]!) <= 24)) && lum(p) < lum(ok[0]!) - 48) off++;
                }
                return { dark, off, n: d.length / 8 };
              },
              [readFileSync(join(dir, f)).toString('base64'), allowed] as const,
            );
            const tag = `printBackground ${printBackground}, page ${i + 1}`;
            if (scheme === 'light') expect(st.dark, `${tag}: no pixel ≤ #303030`).toBe(0);
            expect(st.off, `${tag}: no area darker than the page (only base colour, opaque glass and their soft shadows)`).toBe(0);
          }
        }
      });

      test(`${p.name}, Bildschirm: wie main vor dem Fix (höchstens 0,5 % Pixel anders)`, async ({ browser, page }, testInfo) => {
        test.setTimeout(120_000);
        expect(existsSync(join(MAIN, 'index.html')), 'build of main missing – run node scripts/build-legacy.mjs 9e7bdf4').toBe(true);
        const shot = async (dir: string | null) => {
          const context = await contextFor(browser, testInfo, scheme, dir);
          const pg = await context.newPage();
          await open(pg, p.route);
          await pg.mouse.move(0, 0);
          const png = await pg.screenshot({ fullPage: true });
          await context.close();
          return png;
        };
        const before = await shot(MAIN);
        const after = await shot(null);
        await page.goto('about:blank');
        await testInfo.attach('main.png', { body: before, contentType: 'image/png' });
        await testInfo.attach('neu.png', { body: after, contentType: 'image/png' });
        const ratio = await diffRatio(page, before, after);
        await testInfo.attach('diff.txt', { body: `${(ratio * 100).toFixed(3)} %` });
        expect(ratio, 'share of differing pixels on screen').toBeLessThanOrEqual(0.005);
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

/** Share of pixels that differ at all (decoded in the browser). */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (s: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const px = (img: ImageBitmap) => {
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
      return diff / (da.length / 4);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}
