import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// fix-white-start: the first paint of the app is never white. index.html carries the start screen
// inline (base colour, mesh, flat logo – src/lib/bootSplash.ts); the app's script and stylesheet only
// add motion. Checked with the CPU 6× slower and a slow network, every request after the HTML held
// back: what shows then is exactly what a cold start shows until the bundle has loaded.
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark (own contexts, desktop project).

const DIR = 'docs/screenshots/fix-white-start';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

/** CPU 6× slower, a slow mobile network (≈ 1.6 Mbit/s, 150 ms). */
async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
}

/** Every request after the document waits until release(): the page shows only what index.html itself paints. */
async function holdSubresources(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname !== '/' && url.pathname !== '/index.html',
    async (route) => {
      await held;
      await route.continue().catch(() => {});
    },
  );
  return release;
}

/** Pixel statistics of a screenshot: share of white pixels, the corner colour, how much of the logo colour is in the middle. */
async function pixels(page: Page, png: Buffer, base: string, mark: string) {
  return page.evaluate(
    async ([b64, baseCss, markCss]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      const rgb = (css: string) => {
        g.fillStyle = css;
        const v = String(g.fillStyle);
        return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      };
      const [B, M] = [rgb(baseCss), rgb(markCss)];
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let white = 0;
      let total = 0;
      for (let i = 0; i < d.length; i += 16) {
        total++;
        if (d[i]! >= 250 && d[i + 1]! >= 250 && d[i + 2]! >= 250) white++;
      }
      const at = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
      // the top row: the mesh fades to the base colour under the status bar (aurora.ts, bootSplash.ts)
      const near = (p: number[], q: number[], tol: number) => p.every((v, k) => Math.abs(v - q[k]!) <= tol);
      // the logo: the left (fully opaque) pea in the middle third of the screen has the mark colour
      const mid = g.getImageData(Math.round(img.width / 3), Math.round(img.height / 4), Math.round(img.width / 3), Math.round(img.height / 2)).data;
      let logo = 0;
      for (let i = 0; i < mid.length; i += 4) if (near([mid[i]!, mid[i + 1]!, mid[i + 2]!], M, 6)) logo++;
      return {
        whiteShare: white / total,
        corner: at(Math.round(img.width / 2), 1),
        cornerIsBase: near(at(Math.round(img.width / 2), 1), B, 3),
        logoPixels: logo,
        base: B,
        mark: M,
      };
    },
    [png.toString('base64'), base, mark] as const,
  );
}

/**
 * A screenshot of what is on screen right now, without waiting for anything (Playwright's own
 * screenshot waits for web fonts – here they are held back on purpose).
 */
async function paintNow(page: Page, path?: string): Promise<Buffer> {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await cdp.detach();
  const png = Buffer.from(data, 'base64');
  if (path) writeFileSync(path, png);
  return png;
}

const bootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Start ohne Weiß · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(90_000);

      test('erster Paint (CPU 6×, langsames Netz, Bundle noch nicht da): Hintergrund und Logo, kein Weiß; Logo bleibt beim App-Start stehen', async ({ page }) => {
        await throttle(page);
        // the logo's box at the very moment the app takes over (before any exit can move it)
        await page.addInitScript(() => {
          new MutationObserver((_, obs) => {
            const mark = document.querySelector('#splash.splash-live .splash-mark');
            if (!mark) return;
            const r = mark.getBoundingClientRect();
            (window as unknown as { liveRect: { x: number; y: number; width: number; height: number } }).liveRect = { x: r.x, y: r.y, width: r.width, height: r.height };
            obs.disconnect();
          }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
        });
        const release = await holdSubresources(page);
        await page.goto('/', { waitUntil: 'commit' });
        await page.locator('#splash .splash-mark').waitFor({ state: 'attached' });
        // only the inline start screen: no app stylesheet, no app script yet
        expect(await page.evaluate(() => [...document.styleSheets].filter((s) => s.href).length), 'external stylesheets applied').toBe(0);
        await expect(page.locator('#splash')).not.toHaveClass(/splash-live/);
        const base = await bootVar(page, '--boot-base');
        const mark = await bootVar(page, '--boot-mark');
        expect(base).not.toBe('');
        expect(await page.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor])).toEqual(
          Array(2).fill(await page.evaluate((c) => {
            const el = document.createElement('i');
            el.style.color = c;
            document.body.appendChild(el);
            const v = getComputedStyle(el).color;
            el.remove();
            return v;
          }, base)),
        );
        const first = await paintNow(page, `${DIR}/${tag}-erster-paint.png`);
        const p = await pixels(page, first, base, mark);
        expect(p.whiteShare, `white pixels in the first paint ${JSON.stringify(p)}`).toBeLessThan(0.001);
        expect(p.cornerIsBase, `top edge = base colour ${JSON.stringify(p)}`).toBe(true);
        expect(p.logoPixels, `logo visible ${JSON.stringify(p)}`).toBeGreaterThan(200);
        const before = (await page.locator('#splash .splash-mark').boundingBox())!;

        // the app starts: the loading animation takes over the same element – no jump
        release();
        await expect(page.locator('#splash')).toHaveClass(/splash-live/, { timeout: 60_000 });
        await expect.poll(() => page.evaluate(() => [...document.styleSheets].filter((s) => s.href).length)).toBeGreaterThan(0);
        const after = await page.evaluate(() => (window as unknown as { liveRect: { x: number; y: number; width: number; height: number } }).liveRect);
        for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - before[k]), `logo ${k}: ${before[k]} → ${after[k]}`).toBeLessThanOrEqual(1);
        await paintNow(page, `${DIR}/${tag}-app-start.png`);
      });
    });
  }
}

test.describe('Startbilder, Manifest, Service Worker', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'einmal, im Projekt desktop'));

  test('Manifest gültig, Meta-Tags für die installierte App, alle Startbilder vorhanden und richtig groß', async ({ page }) => {
    await page.goto('/');
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'Erbse', short_name: 'Erbse', start_url: '/', scope: '/', display: 'standalone' });
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);
    const meta = (name: string) => page.locator(`meta[name="${name}"]`);
    await expect(meta('apple-mobile-web-app-capable')).toHaveAttribute('content', 'yes');
    await expect(meta('mobile-web-app-capable')).toHaveAttribute('content', 'yes');
    // „default“: dark glyphs on a light bar and vice versa (black-translucent would be unreadable in light, contrast.test.ts)
    await expect(meta('apple-mobile-web-app-status-bar-style')).toHaveAttribute('content', 'default');
    // theme-color per theme = the base colour of the start screen
    const themes = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => [e.getAttribute('media'), e.getAttribute('content')]));
    expect(themes.map(([m]) => m)).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']);
    for (const [, c] of themes) expect(c).toMatch(/^#[0-9a-f]{6}$/);

    const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href')!, media: e.getAttribute('media')! })));
    expect(links.length, '12 iPhones (portrait) + 9 iPads (portrait and landscape), light and dark').toBe(2 * (12 + 9 * 2));
    // dark first with its condition, light after it without one (fallback if iOS ignores the condition)
    const firstLight = links.findIndex((l) => l.href.endsWith('-light.png'));
    expect(links.slice(0, firstLight).every((l) => l.media.includes('(prefers-color-scheme: dark)'))).toBe(true);
    expect(links.slice(firstLight).every((l) => !l.media.includes('prefers-color-scheme'))).toBe(true);
    for (const { href, media } of links) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
      expect(res.headers()['content-type'], href).toContain('image/png');
      const png = await res.body();
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      const n = (k: string) => Number(new RegExp(`${k}: ([\\d.]+)`).exec(media)![1]);
      const [dw, dh, dpr] = [n('device-width'), n('device-height'), n('-webkit-device-pixel-ratio')];
      const portrait = media.includes('(orientation: portrait)');
      expect([w, h], `${href} (${media})`).toEqual(portrait ? [dw * dpr, dh * dpr] : [dh * dpr, dw * dpr]);
    }
  });

  test('Service Worker: index.html und alle Startbilder im Precache', async ({ page }) => {
    await page.goto('/');
    const sw = await (await page.request.get('/sw.js')).text();
    expect(sw).toContain('"index.html"');
    const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
    for (const href of links) expect(sw, href).toContain(`"${href.replace(/^\//, '')}"`);
  });

  test.describe('offline', () => {
    test.use({ serviceWorkers: 'allow' });
    test('Start ohne Netz: derselbe Start-Bildschirm, dann die App', async ({ page, context }) => {
      await page.goto('/');
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      // the first visit installs the worker; from the next start on it answers
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await context.setOffline(true);
      // the CPU slowed down 6×: the start screen stays long enough to be seen while the app starts from the cache
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await page.reload({ waitUntil: 'commit' });
      await page.locator('#splash .splash-mark').waitFor({ state: 'attached' });
      const png = await paintNow(page, `${DIR}/offline-erster-paint.png`);
      const p = await pixels(page, png, await bootVar(page, '--boot-base'), await bootVar(page, '--boot-mark'));
      expect(p.whiteShare, JSON.stringify(p)).toBeLessThan(0.001);
      expect(p.logoPixels).toBeGreaterThan(200);
      // the app comes up from the cache (empty database: the setup dialog)
      await expect(page.getByTestId('setup-dialog')).toBeVisible({ timeout: 15_000 });
      await context.setOffline(false);
    });
  });
});
