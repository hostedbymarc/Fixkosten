import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bootThemes } from '../src/lib/bootSplash';
import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

// Start screen (fix-white-start, splash-subtil): the first paint of the app is never white and shows
// exactly ONE logo at any time. index.html carries the start screen inline – base colour, mesh and the
// small flat logo (48 pt phone, 56 pt iPad/desktop) whose peas come in left to right and then pulse,
// all CSS (src/lib/bootSplash.ts). The app never restarts it, it only fades the screen out (200 ms).
// The iOS start images are only the background: a logo in them would show twice during iOS's cross-fade.
// Checked with the CPU 6× slower (and a slow network, every request after the HTML held back where
// the first paint is the subject). iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 ×
// light/dark (own contexts, desktop project).

const DIR = 'docs/screenshots/splash-subtil';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

/** CPU 6× slower; optionally a slow mobile network (≈ 1.6 Mbit/s, 150 ms). */
async function throttle(page: Page, network = true): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  return cdp;
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pixel statistics of a screenshot: share of white pixels, whether the top edge is the base colour, and
 * where the sharp edges are. The background (base colour and mesh) is smooth everywhere; only peas
 * have sharp edges. Edges inside the logo's box = the logo, edges OUTSIDE it = a second row of peas.
 */
async function pixels(page: Page, png: Buffer, base: string, logo: Box, viewportWidth: number) {
  return page.evaluate(
    async ([b64, baseCss, box, vw]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.fillStyle = baseCss;
      const v = String(g.fillStyle);
      const B = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const s = img.width / vw;
      const [x0, y0, x1, y1] = [(box.x - 3) * s, (box.y - 3) * s, (box.x + box.width + 3) * s, (box.y + box.height + 3) * s];
      const step = Math.max(1, Math.round(2 * s));
      const diff = (i: number, j: number) => Math.max(Math.abs(d[i]! - d[j]!), Math.abs(d[i + 1]! - d[j + 1]!), Math.abs(d[i + 2]! - d[j + 2]!));
      let white = 0;
      let total = 0;
      let inside = 0;
      let outside = 0;
      for (let y = 0; y < img.height - step; y++) {
        for (let x = 0; x < img.width - step; x++) {
          const i = (y * img.width + x) * 4;
          total++;
          if (d[i]! >= 250 && d[i + 1]! >= 250 && d[i + 2]! >= 250) white++;
          // a sharp edge: more than 12 levels to the pixel 2 pt to the right or below
          if (diff(i, i + step * 4) > 12 || diff(i, i + step * img.width * 4) > 12) {
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inside++;
            else outside++;
          }
        }
      }
      const top = (Math.round(img.width / 2) + img.width) * 4;
      const topIsBase = [0, 1, 2].every((k) => Math.abs(d[top + k]! - B[k]!) <= 3);
      return { whiteShare: white / total, topIsBase, inside, outside };
    },
    [png.toString('base64'), base, logo, viewportWidth] as const,
  );
}

/** A screenshot of what is on screen right now, without waiting for anything (no web fonts, no frame). */
async function paintNow(page: Page, path?: string): Promise<Buffer> {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await cdp.detach();
  const png = Buffer.from(data, 'base64');
  if (path) writeFileSync(path, png);
  return png;
}

const bootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/**
 * From the first frame on, every animation frame: how many logo elements can be seen (the start
 * screen's logo, the sidebar mark, any other logo): in the viewport, not hidden, effective opacity
 * (all ancestors) above 1 %. window.__logoFrames: [count, splash present, splash fading][].
 */
function countLogosEveryFrame() {
  const w = window as unknown as { __logoFrames: [number, boolean, boolean][] };
  w.__logoFrames = [];
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      o *= Number(cs.opacity);
    }
    return o > 0.01;
  };
  const tick = () => {
    const splash = document.getElementById('splash');
    const logos = [...document.querySelectorAll('.splash-mark, [data-logo]')].filter(seen);
    if (document.body) w.__logoFrames.push([logos.length, !!splash, !!splash?.classList.contains('splash-out')]);
    if (splash || w.__logoFrames.length < 3) requestAnimationFrame(tick);
    else for (let k = 0; k < 20; k++) requestAnimationFrame(() => w.__logoFrames.push([[...document.querySelectorAll('.splash-mark, [data-logo]')].filter(seen).length, false, false]));
  };
  requestAnimationFrame(tick);
}

/** Opacity of the three peas at given times of their entrance, read through CDP (works without page JavaScript). */
async function peaOpacities(cdp: CDPSession, times: number[]): Promise<number[][]> {
  const started: { id: string; name: string }[] = [];
  cdp.on('Animation.animationStarted', (e) => started.push(e.animation));
  await cdp.send('Animation.enable');
  return (async () => {
    await expect.poll(() => started.filter((a) => a.name === 'splash-in').length).toBe(3);
    const ids = started.filter((a) => a.name === 'splash-in' || a.name === 'splash-pulse').map((a) => a.id);
    await cdp.send('Animation.setPaused', { animations: ids, paused: true });
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#splash .splash-pea' });
    const out: number[][] = [];
    for (const t of times) {
      await cdp.send('Animation.seekAnimations', { animations: ids, currentTime: t });
      const row: number[] = [];
      for (const id of nodeIds) {
        const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId: id });
        row.push(Number(computedStyle.find((p) => p.name === 'opacity')!.value));
      }
      out.push(row);
    }
    return out;
  })();
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  const wide = use.viewport.width >= 768;
  const logoWidth = wide ? 56 : 48;
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Start-Bildschirm · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(90_000);

      test(`erster Paint (CPU 6×, langsames Netz): kein Weiß, ein Logo ${logoWidth} pt mittig, keine zweite Erbsenreihe; Position bleibt beim App-Start`, async ({ page }) => {
        await throttle(page);
        // the logo's box at the very moment the app takes over (main.tsx: .splash-live)
        await page.addInitScript(() => {
          new MutationObserver((_, obs) => {
            const mark = document.querySelector('#splash.splash-live .splash-mark');
            if (!mark) return;
            const r = mark.getBoundingClientRect();
            (window as unknown as { liveRect: Box }).liveRect = { x: r.x, y: r.y, width: r.width, height: r.height };
            obs.disconnect();
          }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
        });
        const release = await holdSubresources(page);
        await page.goto('/', { waitUntil: 'commit' });
        const mark = page.locator('#splash .splash-mark');
        await mark.waitFor({ state: 'attached' });
        // only the inline start screen: no app stylesheet, no app script yet
        expect(await page.evaluate(() => [...document.styleSheets].filter((s) => s.href).length), 'external stylesheets applied').toBe(0);
        await expect(page.locator('#splash')).not.toHaveClass(/splash-live/);
        await expect(page.locator('.splash-mark, [data-logo]')).toHaveCount(1);
        const box = (await mark.boundingBox())!;
        expect(box.width, 'logo width').toBeCloseTo(logoWidth, 0);
        expect(box.height, 'logo height (the icon grid 16.8 : 6.8)').toBeCloseTo((logoWidth * 6.8) / 16.8, 0);
        expect(Math.abs(box.x + box.width / 2 - use.viewport.width / 2), 'centred horizontally').toBeLessThanOrEqual(1);
        expect(Math.abs(box.y + box.height / 2 - use.viewport.height / 2), 'centred vertically').toBeLessThanOrEqual(1);

        const base = await bootVar(page, '--boot-base');
        // the peas are in and the mesh has faded in (80 + 600 ms)
        await page.waitForTimeout(800);
        const first = await paintNow(page, `${DIR}/${tag}-erster-paint.png`);
        const p = await pixels(page, first, base, box, use.viewport.width);
        expect(p.whiteShare, `white pixels ${JSON.stringify(p)}`).toBeLessThan(0.001);
        expect(p.topIsBase, `top edge = base colour ${JSON.stringify(p)}`).toBe(true);
        expect(p.inside, `logo visible ${JSON.stringify(p)}`).toBeGreaterThan(10);
        expect(p.outside, `no second row of peas ${JSON.stringify(p)}`).toBe(0);

        // the app starts: it takes over the same element – same box, nothing restarted
        const before = await page.evaluate(() => document.querySelector('#splash .splash-pea')!.getAnimations().map((a) => a.startTime));
        release();
        await expect(page.locator('#splash')).toHaveClass(/splash-live/, { timeout: 60_000 });
        const after = await page.evaluate(() => (window as unknown as { liveRect: Box }).liveRect);
        for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - box[k]), `logo ${k}: ${box[k]} → ${after[k]}`).toBeLessThanOrEqual(1);
        const still = await page.evaluate(() => document.querySelector('#splash .splash-pea')?.getAnimations().map((a) => a.startTime) ?? null);
        if (still) expect(still, 'the CSS animation is not restarted').toEqual(before);
        const pulse = await paintNow(page, `${DIR}/${tag}-app-start.png`);
        const q = await pixels(page, pulse, base, box, use.viewport.width);
        expect(q.whiteShare).toBeLessThan(0.001);
        expect(q.outside, `no second row of peas after the app started ${JSON.stringify(q)}`).toBe(0);
      });

      test('jedes Bild der Startphase (CPU 6×, mit Daten): genau ein Logo, auch beim Ausblenden', async ({ page }) => {
        await importLive(page, OKT_TODAY);
        await throttle(page, false);
        await page.addInitScript(countLogosEveryFrame);
        await page.reload({ waitUntil: 'commit' });
        await expect(page.locator('#splash')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.getByTestId('hero')).toBeVisible();
        await expect.poll(() => page.evaluate(() => (window as unknown as { __logoFrames: unknown[] }).__logoFrames.length)).toBeGreaterThan(10);
        const frames = await page.evaluate(() => (window as unknown as { __logoFrames: [number, boolean, boolean][] }).__logoFrames);
        const withSplash = frames.filter(([, splash]) => splash);
        expect(withSplash.length, 'frames sampled under the start screen').toBeGreaterThan(5);
        expect(Math.max(...frames.map(([n]) => n)), `at most one logo in every frame ${JSON.stringify(frames.slice(0, 40))}`).toBeLessThanOrEqual(1);
        // while the start screen is there (before it fades), its logo is the one
        expect(withSplash.filter(([n, , fading]) => !fading && n !== 1), 'exactly one logo while the start screen shows').toEqual([]);
      });

      for (const js of [true, false]) {
        test(`Einblenden links → Mitte → rechts (${js ? 'mit' : 'ohne'} JavaScript)`, async ({ browser }) => {
          const context = await browser.newContext({ ...use, colorScheme: scheme, javaScriptEnabled: js, serviceWorkers: 'block', baseURL: test.info().project.use.baseURL });
          const page = await context.newPage();
          // with JavaScript: the app must not take the start screen away while it is measured
          if (js) await holdSubresources(page);
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
          const measuring = peaOpacities(cdp, [60, 180, 300, 470]);
          await page.goto('/', { waitUntil: 'commit' });
          const [t60, t180, t300, t470] = await measuring;
          // 60 ms: only the left pea is coming in
          expect(t60![0]!, `60 ms ${t60}`).toBeGreaterThan(0.2);
          expect(t60!.slice(1), `60 ms ${t60}`).toEqual([0, 0]);
          // 180 ms: left almost there, the middle one coming, right not yet
          expect(t180![0]!).toBeGreaterThan(t180![1]!);
          expect(t180![1]!, `180 ms ${t180}`).toBeGreaterThan(0.2);
          expect(t180![2]!, `180 ms ${t180}`).toBe(0);
          // 300 ms: all three, the right one still coming
          expect(t300![2]!, `300 ms ${t300}`).toBeGreaterThan(0.2);
          expect(t300![2]!).toBeLessThan(0.7);
          // in (just before the wave): their own opacity, 100 / 85 / 70 %
          for (const [k, o] of [1, 0.85, 0.7].entries()) expect(Math.abs(t470![k]! - o), `470 ms ${t470}`).toBeLessThanOrEqual(0.02);
          await context.close();
        });
      }

      test('Puls danach: Welle links → rechts zwischen Grund-Deckkraft und 40 %; Ende: alles blendet in 200 ms aus', async ({ page }) => {
        await holdSubresources(page);
        await page.goto('/', { waitUntil: 'commit' });
        await page.locator('#splash .splash-pea').first().waitFor({ state: 'attached' });
        const anims = await page.evaluate(() =>
          [...document.querySelectorAll('#splash .splash-pea')].map((el) =>
            (el.getAnimations() as CSSAnimation[]).map((a) => ({
              name: a.animationName,
              delay: Number(a.effect!.getTiming().delay),
              duration: Number(a.effect!.getTiming().duration),
              iterations: a.effect!.getTiming().iterations,
              props: [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
            })),
          ),
        );
        expect(anims.map((a) => a.map((x) => x.name))).toEqual(Array(3).fill(['splash-in', 'splash-pulse']));
        expect(anims.map((a) => a[0]!.delay)).toEqual([0, 120, 240]);
        expect(anims.map((a) => a[1]!.delay)).toEqual([480, 630, 780]);
        expect(anims.every((a) => a[0]!.duration === 240 && a[1]!.duration === 1400 && a[1]!.iterations === Infinity)).toBe(true);
        for (const a of anims.flat()) expect(a.props.every((k) => k === 'opacity' || k === 'transform'), `${a.name}: ${a.props}`).toBe(true);
        // low point of the wave: 40 % of each pea's opacity
        const low = await page.evaluate(() =>
          [...document.querySelectorAll('#splash .splash-pea')].map((el) => {
            const a = (el.getAnimations() as CSSAnimation[]).find((x) => x.animationName === 'splash-pulse')!;
            a.pause();
            a.currentTime = Number(a.effect!.getTiming().delay) + 700;
            return Number(getComputedStyle(el).opacity);
          }),
        );
        for (const [k, o] of [1, 0.85, 0.7].entries()) expect(low[k]!).toBeCloseTo(o * 0.4, 2);
        // the exit is a fade of the whole screen, 200 ms, no flight, no scaling
        const exit = await page.evaluate(async () => {
          const s = document.getElementById('splash')!;
          // the peas are in, then the exit
          await Promise.all((s.getAnimations({ subtree: true }) as CSSAnimation[]).filter((a) => a.animationName === 'splash-in').map((a) => a.finished));
          s.classList.add('splash-out');
          const cs = getComputedStyle(s);
          const transition = { property: cs.transitionProperty, duration: cs.transitionDuration };
          await new Promise((r) => setTimeout(r, 400));
          return { ...transition, opacity: getComputedStyle(s).opacity, peas: [...s.querySelectorAll('.splash-pea')].map((p) => getComputedStyle(p).transform.replace('matrix(1, 0, 0, 1, 0, 0)', 'none')) };
        });
        // logo and background together, 200 ms, nothing moves or scales
        expect(exit).toEqual({ property: 'opacity', duration: '0.2s', opacity: '0', peas: ['none', 'none', 'none'] });
      });
    });
  }
}

test.describe('Bewegung reduzieren', () => {
  test.use({ ...VIEWPORTS['iphone-15'], contextOptions: { reducedMotion: 'reduce' } });
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'einmal, im Projekt desktop'));
  test('Erbsen stehen sofort da, kein Gleiten, kein Pulsieren, nur Ausblenden', async ({ page }) => {
    await holdSubresources(page);
    await page.goto('/', { waitUntil: 'commit' });
    await page.locator('#splash .splash-pea').first().waitFor({ state: 'attached' });
    const peas = await page.evaluate(() =>
      [...document.querySelectorAll('#splash .splash-pea')].map((el) => ({ anims: el.getAnimations().length, opacity: Number(getComputedStyle(el).opacity), transform: getComputedStyle(el).transform })),
    );
    expect(peas).toEqual([
      { anims: 0, opacity: 1, transform: 'none' },
      { anims: 0, opacity: 0.85, transform: 'none' },
      { anims: 0, opacity: 0.7, transform: 'none' },
    ]);
    const exit = await page.evaluate(() => {
      const s = document.getElementById('splash')!;
      s.classList.add('splash-out');
      return getComputedStyle(s).transitionDuration;
    });
    expect(exit, 'the fade stays').toBe('0.2s');
  });
});

test.describe('Startbilder, Manifest, Service Worker', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'einmal, im Projekt desktop'));

  test('Manifest gültig, Meta-Tags, alle Startbilder vorhanden, richtig groß und OHNE Logo (nur Hintergrund)', async ({ page }) => {
    await page.goto('/');
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'Erbse', short_name: 'Erbse', start_url: '/', scope: '/', display: 'standalone' });
    const meta = (name: string) => page.locator(`meta[name="${name}"]`);
    await expect(meta('apple-mobile-web-app-capable')).toHaveAttribute('content', 'yes');
    await expect(meta('apple-mobile-web-app-status-bar-style')).toHaveAttribute('content', 'default');
    // the base colours from the tokens (the theme-color metas follow the chosen appearance at run time)
    const themes = bootThemes(readFileSync('src/styles/tokens.css', 'utf8'));
    const base = { light: themes.light.base, dark: themes.dark.base };

    const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href')!, media: e.getAttribute('media')! })));
    expect(links.length, '12 iPhones (portrait) + 9 iPads (portrait and landscape), light and dark').toBe(2 * (12 + 9 * 2));
    for (const { href, media } of links) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
      const png = await res.body();
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      const n = (k: string) => Number(new RegExp(`${k}: ([\\d.]+)`).exec(media)![1]);
      const [dw, dh, dpr] = [n('device-width'), n('device-height'), n('-webkit-device-pixel-ratio')];
      expect([w, h], `${href} (${media})`).toEqual(media.includes('(orientation: portrait)') ? [dw * dpr, dh * dpr] : [dh * dpr, dw * dpr]);
      // only the background: every pixel the base colour of its theme (no logo anywhere)
      const expected = href.endsWith('-dark.png') ? base.dark : base.light;
      const spread = await page.evaluate(
        async ([b64, css]) => {
          const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext('2d', { willReadFrequently: true })!;
          g.fillStyle = css;
          const v = String(g.fillStyle);
          const want = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          let max = 0;
          for (let i = 0; i < d.length; i += 4 * 7) max = Math.max(max, Math.abs(d[i]! - want[0]!), Math.abs(d[i + 1]! - want[1]!), Math.abs(d[i + 2]! - want[2]!));
          return max;
        },
        [png.toString('base64'), expected] as const,
      );
      expect(spread, `${href}: only the base colour ${expected}`).toBeLessThanOrEqual(1);
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
    test('Start ohne Netz: derselbe Start-Bildschirm mit einem Logo, dann die App', async ({ page, context }) => {
      await page.goto('/');
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await context.setOffline(true);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await page.reload({ waitUntil: 'commit' });
      const mark = page.locator('#splash .splash-mark');
      await mark.waitFor({ state: 'attached' });
      const box = (await mark.boundingBox())!;
      // at once: from the cache the app is there soon
      const png = await paintNow(page, `${DIR}/offline-erster-paint.png`);
      const vw = page.viewportSize()!.width;
      const p = await pixels(page, png, await bootVar(page, '--boot-base'), box, vw);
      expect(p.whiteShare, JSON.stringify(p)).toBeLessThan(0.001);
      expect(p.topIsBase, JSON.stringify(p)).toBe(true);
      expect(p.outside, JSON.stringify(p)).toBe(0);
      await expect(page.getByTestId('setup-dialog')).toBeVisible({ timeout: 15_000 });
      await context.setOffline(false);
    });
  });
});
