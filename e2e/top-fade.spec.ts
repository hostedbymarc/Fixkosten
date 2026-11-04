import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { pixelStats } from './background';
import { importLive, OKT_TODAY } from './live';

// Oberer Rand: iOS paints the status bar itself as a flat colour sampled from the page (body
// background, or a fixed element with a colour at the top edge). Playwright has no iOS status bar, so
// the bar is modelled from that rule: a band of the sampled colour above the page (home-screen app,
// safe area 0) or over the safe area (Safari, safe area 59 px). Measured: vertical brightness
// profiles in 5 columns over the top 400 px, the step from the bar into the page, the Kanten-Kennzahl
// of PR #27 and the flat layer behind the bar (safe area high, covers only what scrolls under it).

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
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.id !== 'ambient').map((a) => a.finished.catch(() => undefined))));
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
      // repaint with the new safe area (in reality it changes together with the width on rotation)
      await page.evaluate((s) => document.documentElement.setAttribute('data-theme', s), scheme);
      await page.waitForTimeout(300);
      const shot = await page.screenshot({ scale: 'css' });
      const bar = luminance(await barColour(page));
      for (const [i, p] of (await profiles(page, shot, 400)).entries()) {
        // the bar covers rows 0…58; what shows is the bar, then the page from row 59
        const seen = [...Array(59).fill(bar), ...p.slice(59)];
        expect(maxStep(seen), `Safari, column ${COLUMNS[i]! * 100} % (row ${stepRow(seen)})`).toBeLessThanOrEqual(MAX_STEP);
      }
    });

    test('gescrollt: eine Karte unter der Statusleiste ist nur in der Safe Area verdeckt, darunter unverändert', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await settle(page);
      // a card scrolled under the bar: an opaque card surface over the top 120 px (below the layer)
      await page.addStyleTag({
        content: `:root { --safe-top: 59px !important; } ${NO_GLYPHS} body::after { display: none !important; } #root::after { content: ''; position: fixed; inset: 0 0 auto 0; height: 120px; z-index: 10; background: var(--glass-opaque); }`,
      });
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(150);
      const withLayer = await profiles(page, await page.screenshot({ scale: 'css' }), 120);
      await page.addStyleTag({ content: NO_SCRIM });
      await page.waitForTimeout(100);
      const without = await profiles(page, await page.screenshot({ scale: 'css' }), 120);
      for (const [i, p] of withLayer.entries()) {
        const effect = p.map((v, y) => v - without[i]![y]!);
        // below the safe area the layer adds nothing: no band, no fade over the content
        expect(Math.max(...effect.slice(60).map(Math.abs)), `column ${COLUMNS[i]! * 100} %: below the safe area`).toBeLessThanOrEqual(0.5);
        // inside it the card is covered by the flat base colour
        expect(Math.abs(effect[30]!), `column ${COLUMNS[i]! * 100} %: covered inside the safe area`).toBeGreaterThan(0.5);
        expect(maxStep(p.slice(0, 58)), `column ${COLUMNS[i]! * 100} %: flat inside the safe area`).toBeLessThanOrEqual(MAX_STEP);
      }
    });

    test('eine Ebene hinter der Statusleiste: flach, genau Safe Area hoch, über Inhalt und unter Menüs/Tab-Leiste/Sheets', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const read = () =>
        page.evaluate(() => {
          const cs = getComputedStyle(document.getElementById('root')!, '::before');
          const base = getComputedStyle(document.documentElement).getPropertyValue('--nebel-base-rgb').trim().split(/\s+/).join(', ');
          return { position: cs.position, top: cs.top, height: parseFloat(cs.height) || 0, z: cs.zIndex, pe: cs.pointerEvents, image: cs.backgroundImage, colour: cs.backgroundColor, base: `rgb(${base})` };
        });
      for (const safe of [0, 59]) {
        if (safe) await page.addStyleTag({ content: `:root { --safe-top: ${safe}px !important; }` });
        const r = await read();
        expect(r.position).toBe('fixed');
        expect(r.top).toBe('0px');
        expect(r.height, 'exactly the safe area').toBe(safe);
        expect(r.pe).toBe('none');
        expect(Number(r.z)).toBeGreaterThan(0);
        expect(Number(r.z)).toBeLessThan(20);
        expect(r.image, 'no gradient').toBe('none');
        expect(r.colour, 'the flat base colour').toBe(r.base);
      }
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
      test(`Ruhezustand${reduced ? ' (Transparenz reduzieren)' : ''}: kein Text unter der Ebene der Statusleiste (alle Screens, Safe Area 0 und 59 px)`, async ({ page }) => {
        if (reduced) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-color-scheme', value: scheme }] });
        }
        await importLive(page, OKT_TODAY);
        for (const safe of [0, 59]) {
          if (safe) await page.addStyleTag({ content: `:root { --safe-top: ${safe}px !important; }` });
          for (const route of ['monat', 'positionen', 'analyse', 'einstellungen']) {
            await page.evaluate((r) => (location.hash = `#/${r}`), route);
            await page.waitForTimeout(500);
            await page.evaluate(() => window.scrollTo(0, 0));
            const covered = await page.evaluate(() => {
              const height = parseFloat(getComputedStyle(document.getElementById('root')!, '::before').height) || 0;
              const hits: string[] = [];
              const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                // inactive tabs stay mounted, hidden (visibility: hidden): nobody sees their text
                if (!n.textContent!.trim() || !n.parentElement!.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                const r = range.getBoundingClientRect();
                if (r.height && r.top < height) hits.push(`${n.textContent!.trim().slice(0, 24)} @ ${r.top.toFixed(0)} px`);
              }
              return hits;
            });
            expect(covered, `${route}, safe area ${safe} px`).toEqual([]);
          }
        }
      });
    }

    test('Transparenz reduzieren: dieselbe deckende Ebene in der Basisfarbe, ohne Verlauf', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-color-scheme', value: scheme }] });
      await importLive(page, OKT_TODAY);
      await settle(page);
      await page.addStyleTag({ content: ':root { --safe-top: 59px !important; }' });
      const r = await page.evaluate(() => {
        const cs = getComputedStyle(document.getElementById('root')!, '::before');
        return { image: cs.backgroundImage, height: parseFloat(cs.height) };
      });
      expect(r.image).toBe('none');
      expect(r.height).toBe(59);
      await page.addStyleTag({ content: BACKGROUND_ONLY });
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(150);
      for (const [i, p] of (await profiles(page, await page.screenshot({ scale: 'css' }), 400)).entries()) {
        expect(maxStep(p), `reduced transparency, column ${COLUMNS[i]! * 100} % (row ${stepRow(p)})`).toBeLessThanOrEqual(MAX_STEP);
      }
    });
  });
}
