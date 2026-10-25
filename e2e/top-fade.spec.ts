import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { pixelStats } from './background';
import { importLive, OKT_TODAY } from './live';

// Oberer Rand: iOS paints the status bar itself as a flat colour sampled from the page (body
// background, or a fixed element with a colour at the top edge). Playwright has no iOS status bar, so
// the bar is modelled from that rule: a band of the sampled colour above the page (home-screen app,
// safe area 0) or over the safe area (Safari, safe area 59 px). Measured: vertical brightness
// profiles in 5 columns over the top 400 px, the step from the bar into the page, the Kanten-Kennzahl
// of PR #27 and the scrim's own contribution while content scrolls under it.

const COLUMNS = [0.1, 0.3, 0.5, 0.7, 0.9];
const MAX_STEP = 1.5;
/** background only: content hidden, grain off (its noise is not an edge), the scrim stays */
const BACKGROUND_ONLY =
  '#root, #root *, body > div:not(#root), body > div:not(#root) * { visibility: hidden !important; } #root::before { visibility: visible !important; } body::after { display: none !important; }';
/** content surfaces only: no glyphs or icons, whose own edges are not the question here */
const NO_GLYPHS = '#root * { color: transparent !important; text-shadow: none !important; } #root svg { visibility: hidden !important; }';
const NO_SCRIM = '#root::before { display: none !important; }';

/** Luminance per row (0…rows) for each column, averaged over ±4 px; image at 1 px per CSS px.
 *  Columns are spread over the content area: the sidebar (desktop) lies above the scrim. */
async function profiles(page: Page, png: Buffer, rows: number): Promise<number[][]> {
  const left = await page.evaluate(() => {
    const side = document.querySelector('[data-testid="sidebar"]');
    return side && getComputedStyle(side).display !== 'none' ? Math.ceil(side.getBoundingClientRect().right) : 0;
  });
  return page.evaluate(
    async ([b64, cols, n, from]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      return cols.map((share) => {
        const cx = Math.round(from + share * (img.width - 1 - from));
        const out: number[] = [];
        for (let y = 0; y < Math.min(n, img.height); y++) {
          let t = 0;
          let k = 0;
          for (let x = Math.max(0, cx - 4); x <= Math.min(img.width - 1, cx + 4); x++) {
            const i = (y * img.width + x) * 4;
            t += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
            k++;
          }
          out.push(t / k);
        }
        return out;
      });
    },
    [png.toString('base64'), COLUMNS, rows, left] as const,
  );
}

/** Alpha per row of the scrim bitmap (0…1). */
async function scrimRows(page: Page, variable: string): Promise<number[]> {
  return page.evaluate(async (name) => {
    const url = getComputedStyle(document.documentElement).getPropertyValue(name).trim().slice(5, -2);
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 1, img.height).data;
    return Array.from({ length: img.height }, (_, y) => d[y * 4 + 3]! / 255);
  }, variable);
}

const maxStep = (p: number[]) => p.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - p[i]!)), 0);
/** row of the largest step, for the failure message */
const stepRow = (p: number[]) => p.slice(1).reduce((best, v, i) => (Math.abs(v - p[i]!) > Math.abs(p[best + 1]! - p[best]!) ? i : best), 0) + 1;
const luminance = (rgb: number[]) => 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;

/** The status bar colour by the documented WebKit rule: a fixed/sticky element 4 px inside the top
 *  centre that spans ≥ 90 % of the width and is > 10 px deep gives its background colour (alpha < 0.75
 *  blended over the page background), otherwise the page background (body, then html). */
async function barColour(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number);
    const bg = (el: Element) => parse(getComputedStyle(el).backgroundColor);
    let page = bg(document.body);
    if ((page[3] ?? 1) === 0) page = bg(document.documentElement);
    for (const el of document.elementsFromPoint(innerWidth / 2, 4)) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.9 || r.height <= 10) continue;
      const c = bg(el);
      const a = c[3] ?? 1;
      if (a === 0) continue;
      return a >= 0.75 ? c.slice(0, 3) : c.slice(0, 3).map((v, i) => v * a + page[i]! * (1 - a));
    }
    return page.slice(0, 3);
  });
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(150);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Oberer Rand ${scheme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ colorScheme: scheme });

    for (const scrollY of [0, 400]) {
      test(`scrollY ${scrollY}: Helligkeitsprofil 5 Spalten ≤ ${MAX_STEP}, Kanten-Kennzahl, Statusleiste ohne Stufe`, async ({ page }) => {
        await importLive(page, OKT_TODAY);
        await settle(page);
        const vp = page.viewportSize()!;
        await page.addStyleTag({ content: BACKGROUND_ONLY });
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.waitForTimeout(150);
        expect(await page.evaluate(() => scrollY)).toBe(scrollY);
        const shot = await page.screenshot({ scale: 'css' });

        // 1) profiles over the top 400 px
        for (const [i, p] of (await profiles(page, shot, 400)).entries()) {
          expect(maxStep(p), `column ${COLUMNS[i]! * 100} %: largest step between rows (row ${stepRow(p)})`).toBeLessThanOrEqual(MAX_STEP);
        }
        // 2) Kanten-Kennzahl of PR #27
        const base = scheme === 'light' ? [244, 245, 241] : [14, 18, 15];
        const st = await pixelStats(page, shot, { base: base as [number, number, number], from: 1e9, scale: 1 });
        expect(st.kink, 'Kanten-Kennzahl').toBeLessThan(vp.width < 500 ? 10 : 5);

        // 3) iOS status bar model: home-screen app (bar above the page, safe area 0)
        const bar = luminance(await barColour(page));
        for (const [i, p] of (await profiles(page, shot, 1)).entries()) {
          expect(Math.abs(bar - p[0]!), `bar → page, column ${COLUMNS[i]! * 100} %`).toBeLessThanOrEqual(MAX_STEP);
        }
      });
    }

    test('Safari-Modell: Safe Area 59 px, Statusleiste darüber, Übergang ohne Stufe', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await settle(page);
      await page.addStyleTag({ content: `:root { --safe-top: 59px !important; } ${BACKGROUND_ONLY}` });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(700); // the Nebel repaints 150 ms after a resize has settled
      const shot = await page.screenshot({ scale: 'css' });
      const bar = luminance(await barColour(page));
      for (const [i, p] of (await profiles(page, shot, 400)).entries()) {
        // the bar covers rows 0…58; what shows is the bar, then the page from row 59
        const seen = [...Array(59).fill(bar), ...p.slice(59)];
        expect(maxStep(seen), `Safari, column ${COLUMNS[i]! * 100} % (row ${stepRow(seen)})`).toBeLessThanOrEqual(MAX_STEP);
      }
    });

    test('gescrollt: eine Karte gleitet unter der Statusleiste weich aus (Beitrag der Scrim-Ebene ohne Stufe)', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await settle(page);
      // a card scrolled under the bar: an opaque card surface over the top 120 px (below the scrim)
      await page.addStyleTag({
        content: `${NO_GLYPHS} body::after { display: none !important; } #root::after { content: ''; position: fixed; inset: 0 0 auto 0; height: 120px; z-index: 10; background: var(--glass-opaque); }`,
      });
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(150);
      const withScrim = await profiles(page, await page.screenshot({ scale: 'css' }), 120);
      await page.addStyleTag({ content: NO_SCRIM });
      await page.waitForTimeout(100);
      const without = await profiles(page, await page.screenshot({ scale: 'css' }), 120);
      let strongest = 0;
      for (const [i, p] of withScrim.entries()) {
        const effect = p.map((v, y) => v - without[i]![y]!);
        strongest = Math.max(strongest, ...effect.map(Math.abs));
        expect(maxStep(effect), `column ${COLUMNS[i]! * 100} %: scrim contribution (row ${stepRow(effect)})`).toBeLessThanOrEqual(MAX_STEP);
        expect(Math.abs(effect.at(-1)!), 'scrim ends at 0 below safe area + 48 px').toBeLessThanOrEqual(0.5);
      }
      // the scrim is really there over scrolled content
      expect(strongest).toBeGreaterThan(0.5);
    });

    test('eine Scrim-Ebene: ease-out, max. 0,6, ≥ 8 Stopps im Rückfall-Verlauf, über Inhalt und unter Menüs/Tab-Leiste/Sheets', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const r = await page.evaluate(() => {
        const cs = getComputedStyle(document.getElementById('root')!, '::before');
        // the declared fallback gradient (before src/lib/nebel.ts has drawn the bitmap)
        let declared = '';
        for (const sheet of document.styleSheets)
          for (const rule of sheet.cssRules)
            if (rule instanceof CSSStyleRule && rule.selectorText === '#root::before' && rule.style.backgroundImage) declared ||= rule.style.backgroundImage;
        return { position: cs.position, top: cs.top, height: parseFloat(cs.height), z: cs.zIndex, pe: cs.pointerEvents, image: cs.backgroundImage, declared };
      });
      expect(r.position).toBe('fixed');
      expect(r.top).toBe('0px');
      expect(r.height).toBe(48); // safe area 0 here
      expect(r.pe).toBe('none');
      expect(Number(r.z)).toBeGreaterThan(0);
      expect(Number(r.z)).toBeLessThan(20);
      expect(r.image.startsWith('url("data:image/png')).toBe(true);
      expect(r.declared).not.toMatch(/transparent/);
      expect(r.declared.match(/rgb\(/g)?.length, 'stops in the fallback gradient').toBeGreaterThanOrEqual(8);
      // the bitmap: monotonic, ≤ 0.6, ends at 0, ease-out (the first half loses more than the second)
      const a = await scrimRows(page, '--scrim-image');
      expect(a[0]!).toBeLessThanOrEqual(0.6 + 1 / 255);
      expect(a[0]!).toBeGreaterThan(0.55);
      expect(a.at(-1)).toBe(0);
      for (let i = 1; i < a.length; i++) expect(a[i]!).toBeLessThanOrEqual(a[i - 1]!);
      const mid = a[Math.floor(a.length / 2)]!;
      expect(a[0]! - mid).toBeGreaterThan(3 * mid);
      // no other element paints the top edge (one place, no per-screen copies)
      const top = await page.evaluate(() =>
        [...document.querySelectorAll('#root *')].filter((el) => {
          const cs = getComputedStyle(el);
          return (cs.position === 'fixed' || cs.position === 'sticky') && el.getBoundingClientRect().top <= 0 && el.getBoundingClientRect().width > innerWidth * 0.5;
        }).length,
      );
      expect(top).toBe(0);
    });

    for (const reduced of [false, true]) {
      test(`Ruhezustand${reduced ? ' (Transparenz reduzieren)' : ''}: Text unter der Scrim bleibt ≥ 4,5:1 (alle Screens)`, async ({ page }) => {
        if (reduced) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-color-scheme', value: scheme }] });
        }
        await importLive(page, OKT_TODAY);
        for (const route of ['monat', 'positionen', 'analyse', 'einstellungen']) {
          await page.evaluate((r) => (location.hash = `#/${r}`), route);
          await page.waitForTimeout(500);
          const worst = await page.evaluate((solid) => {
            const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
            const base = parse(getComputedStyle(document.documentElement).getPropertyValue('--nebel-base-rgb').trim().replace(/ /g, ','));
            const mix = (a: number[], b: number[], t: number) => a.slice(0, 3).map((v, i) => v * (1 - t) + b[i]! * t);
            const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
            const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
            const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
            const height = parseFloat(getComputedStyle(document.getElementById('root')!, '::before').height);
            const alpha = (y: number) => {
              const t = Math.min(1, Math.max(0, y / height));
              return solid ? (1 - t) ** 3 : 0.6 * (1 - t) ** 3;
            };
            let min = Infinity;
            let at = '';
            const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent!.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              const r = range.getBoundingClientRect();
              if (!r.height || r.top >= height) continue;
              const el = n.parentElement!;
              const fgc = parse(getComputedStyle(el).color);
              const fg = (fgc[3] ?? 1) < 1 ? mix(base, fgc, fgc[3]!) : fgc;
              // background under the text: the nearest painted ancestor over the base colour
              let bg = base;
              for (let e: Element | null = el; e; e = e.parentElement) {
                const c = parse(getComputedStyle(e).backgroundColor);
                if ((c[3] ?? 1) > 0) {
                  bg = mix(base, c, c[3] ?? 1);
                  break;
                }
              }
              const a = alpha(r.top); // the line box top: stricter than the glyphs
              const value = ratio(mix(fg, base, a), mix(bg, base, a));
              if (value < min) [min, at] = [value, `${n.textContent!.trim().slice(0, 24)} @ ${r.top.toFixed(0)} px`];
            }
            return { min, at };
          }, reduced);
          if (worst.at) expect(worst.min, `${route}: ${worst.at}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    test('Transparenz reduzieren: Scrim deckend in der Basisfarbe hinter der Statusleiste, unten weicher Verlauf', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-color-scheme', value: scheme }] });
      await importLive(page, OKT_TODAY);
      await settle(page);
      const r = await page.evaluate(() => [
        getComputedStyle(document.getElementById('root')!, '::before').backgroundImage,
        getComputedStyle(document.documentElement).getPropertyValue('--scrim-image-solid').trim(),
      ]);
      expect(r[0]).toBe(r[1]);
      const a = await scrimRows(page, '--scrim-image-solid');
      expect(a[0]).toBe(1); // covering at the top (safe area 0 here: just the first row)
      expect(a.at(-1)).toBe(0);
      for (let i = 1; i < a.length; i++) expect(a[i]!).toBeLessThanOrEqual(a[i - 1]!);
      await page.addStyleTag({ content: BACKGROUND_ONLY });
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(150);
      for (const [i, p] of (await profiles(page, await page.screenshot({ scale: 'css' }), 400)).entries()) {
        expect(maxStep(p), `reduced transparency, column ${COLUMNS[i]! * 100} % (row ${stepRow(p)})`).toBeLessThanOrEqual(MAX_STEP);
      }
    });
  });
}
