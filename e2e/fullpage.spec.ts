import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, goTo, test } from './fixtures';
import { diffShare, FIXED_FIRST_SCREEN, FIXED_STRETCHED, HIDE_CONTENT, NO_FILTER, pixelStats } from './background';
import { importLive, NOV_TODAY, OKT_TODAY } from './live';

// Full-page capture (iPad Safari „Ganze Seite“ showed black below the first screen and a hard green
// disc on top). Chromium always paints the canvas, so black itself does not reproduce here; the tests
// check what a renderer without canvas or fixed layers would show: body paints the base colour over
// the whole page and the Nebel ends inside the first screen without an edge. The print path (PDF)
// drops the Nebel entirely and prints the plain base colour.

const BASE = { light: [244, 245, 241], dark: [14, 18, 15] } as const;
const PAGES = [
  { name: 'Monat Oktober', today: OKT_TODAY, route: 'monat' },
  { name: 'Monat November', today: NOV_TODAY, route: 'monat' },
  { name: 'Positionen', today: OKT_TODAY, route: 'positionen' },
  { name: 'Analyse', today: OKT_TODAY, route: 'analyse' },
  { name: 'Einstellungen', today: OKT_TODAY, route: 'einstellungen' },
] as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(250);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Full-Page-Hintergrund ${scheme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ colorScheme: scheme });

    test('body malt die Basisfarbe über die ganze Seite; html und body je Theme mit color-scheme', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const r = await page.evaluate(() => ({
        html: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        bodyH: document.body.getBoundingClientRect().height,
        docH: document.documentElement.scrollHeight,
        isolation: getComputedStyle(document.body).isolation,
      }));
      const rgb = `rgb(${BASE[scheme].join(', ')})`;
      expect(r.html).toBe(rgb);
      expect(r.body).toBe(rgb);
      expect(r.scheme).toBe(scheme);
      expect(r.bodyH).toBeGreaterThanOrEqual(r.docH - 1);
      expect(r.isolation).toBe('isolate');
    });

    test('kein CSS-Verlauf mit Transparenz (iOS „Ganze Seite“ malt ihn schwarz); Nebel ist ein deckendes Bild', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await page.getByTestId('add-once').click(); // the sheet has a fade too
      await page.getByRole('dialog').waitFor();
      const r = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of [document.documentElement, ...document.querySelectorAll('*')])
          for (const pseudo of [null, '::before', '::after']) {
            const bg = getComputedStyle(el, pseudo).backgroundImage;
            if (bg.includes('gradient(') && /transparent|rgba\(0, 0, 0, 0\)/.test(bg)) bad.push(`${el.tagName.toLowerCase()}${pseudo ?? ''}`);
          }
        const before = getComputedStyle(document.body, '::before');
        return { bad, image: before.backgroundImage.slice(0, 27), size: before.backgroundSize, color: before.backgroundColor };
      });
      expect(r.bad).toEqual([]);
      expect(r.image).toBe('url("data:image/png;base64,');
      expect(r.size).toBe('100% 660px');
      expect(r.color).toBe(`rgb(${BASE[scheme].join(', ')})`);
    });

    for (const p of PAGES) {
      test(`${p.name}: Full-Page = Viewport im ersten Bildschirm, darunter ruhig die Basisfarbe, keine Kante`, async ({ page }) => {
        await importLive(page, p.today);
        if (p.route !== 'monat') await goTo(page, p.route);
        await settle(page);
        const vp = page.viewportSize()!;
        // measured at 1 pixel per CSS px like the Kanten-Kennzahl of PR #27 (no 8-bit banding noise of dpr 2/3)
        const scale = 1;
        const threshold = vp.width < 500 ? 10 : 5; // Kanten-Kennzahl of PR #27

        // 1) first screen of the full-page image = the viewport screenshot (≤ 2 % pixels, tolerance 10 levels)
        // the forecast chart re-measures while Playwright resizes the viewport for the full-page capture
        // (Recharts ResponsiveContainer; also on main, ~1 in 24): masked in both, it is not the subject here
        const mask = [page.locator('[data-testid="forecast"] .recharts-responsive-container')];
        if (p.route === 'analyse') expect(await mask[0]!.count(), 'chart to mask').toBe(1);
        const viewport = await page.screenshot({ mask });
        const firstScreen = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: vp.height }, mask });
        expect(await diffShare(page, viewport, firstScreen, 10), 'first screen vs viewport').toBeLessThanOrEqual(0.02);

        // 2) background only (content hidden): Chromium full page, then without filter, then the iOS layer model
        await page.addStyleTag({ content: HIDE_CONTENT });
        await page.waitForTimeout(100);
        const base = BASE[scheme] as unknown as [number, number, number];
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        for (const variant of ['normal', 'ohne filter', 'iOS: fixierte Ebenen über die ganze Seite gestreckt', 'iOS: fixierte Ebenen nur im ersten Bildschirm'] as const) {
          if (variant === 'ohne filter') await page.addStyleTag({ content: NO_FILTER });
          if (variant.includes('gestreckt')) await page.addStyleTag({ content: FIXED_STRETCHED(pageHeight) });
          if (variant.includes('ersten Bildschirm')) await page.addStyleTag({ content: FIXED_FIRST_SCREEN(vp.height) });
          await page.waitForTimeout(100);
          const png = await page.screenshot({ fullPage: true, scale: 'css', omitBackground: variant.startsWith('iOS') });
          const s = await pixelStats(page, png, { base, from: vp.height, edge: variant.includes('ersten Bildschirm') ? vp.height : undefined, scale });
          const tag = `${p.name} · ${variant}`;
          if (scheme === 'light') expect(s.nearBlack, `${tag}: no pixel ≤ #101010`).toBe(0);
          expect(s.transparent, `${tag}: nothing transparent`).toBe(0);
          expect(s.maxDevBelow, `${tag}: below the first screen = base ± 3`).toBeLessThanOrEqual(3);
          expect(s.kink, `${tag}: Kanten-Kennzahl`).toBeLessThan(threshold);
          // a page no taller than one screen has no edge to look at
          if (variant.includes('ersten Bildschirm') && s.height > vp.height + 1) expect(s.edgeStep, `${tag}: no step where the fixed layer ends`).toBeLessThanOrEqual(3);
        }
      });
    }

    // Druckpfad (iOS „Ganze Seite“ is assumed to take it): the page is the plain base colour, no Nebel,
    // glass opaque, the navigation once and over nothing. printBackground true and false: Chromium honours
    // print-color-adjust: exact either way, so both must look the same.
    for (const printBackground of [true, false]) {
      test(`PDF printBackground ${printBackground}: Basisfarbe auf jeder Seite, kein Nebel, Karten deckend, Navigation einmal`, async ({ page }, info) => {
        test.skip(info.project.name !== 'iphone-15' && info.project.name !== 'ipad-portrait', 'iPhone 15 and iPad');
        await importLive(page, OKT_TODAY);
        await settle(page);
        const vp = page.viewportSize()!;
        const base = BASE[scheme] as unknown as [number, number, number];
        const pdfPages = async (tag: string) => {
          const dir = mkdtempSync(join(tmpdir(), 'erbse-pdf-'));
          const pdf = join(dir, 'page.pdf');
          await page.pdf({ path: pdf, width: `${vp.width}px`, height: `${vp.height}px`, printBackground });
          // 72 dpi = 0.75 px per CSS px; the last partial pixel row/column of a page is paper, not page
          execFileSync('pdftoppm', ['-png', '-r', '72', '-x', '0', '-y', '0', '-W', String(Math.floor(vp.width * 0.75)), '-H', String(Math.floor(vp.height * 0.75)), pdf, join(dir, tag)]);
          const text = execFileSync('pdftotext', [pdf, '-']).toString();
          const files = readdirSync(dir).filter((f) => f.startsWith(tag) && f.endsWith('.png')).sort();
          return { text, pngs: files.map((f) => readFileSync(join(dir, f))) };
        };

        // with content: never black in light, the tab bar printed once
        const full = await pdfPages('voll');
        expect(full.pngs.length).toBeGreaterThan(1);
        for (const [i, png] of full.pngs.entries()) {
          const st = await pixelStats(page, png, { base, from: 1e9, scale: 0.75 });
          if (scheme === 'light') expect(st.nearBlack, `page ${i + 1}: no pixel ≤ #101010`).toBe(0);
          expect(st.transparent).toBe(0);
        }
        expect(full.text.match(/Einstellungen/g)?.length, 'navigation printed once').toBe(1);

        // cards opaque: the padding above the first tile is glass-fallback over the base colour
        await page.emulateMedia({ media: 'print', colorScheme: scheme });
        const card = (await page.getByTestId('salary-value').locator('xpath=ancestor::*[contains(@class,"glass")][1]').boundingBox())!;
        const glass = scheme === 'light' ? [254, 254, 254] : [27, 34, 30];
        const px = await page.evaluate(
          async ([b64, x, y]) => {
            const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const c = new OffscreenCanvas(img.width, img.height);
            const g = c.getContext('2d')!;
            g.drawImage(img, 0, 0);
            return [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
          },
          [full.pngs[0]!.toString('base64'), Math.round((card.x + card.width / 2) * 0.75), Math.round((card.y + 4) * 0.75)] as const,
        );
        for (const k of [0, 1, 2]) expect(Math.abs(px[k]! - glass[k]!), `card pixel ${px.join(',')}`).toBeLessThanOrEqual(3);
        // back to no emulated media type: with 'screen' page.pdf() would print the screen CSS
        await page.emulateMedia({ media: null, colorScheme: scheme });

        // background only: every page is the base colour ± 3 – no Nebel, no green area, no edge, no white paper
        await page.addStyleTag({ content: HIDE_CONTENT });
        const bare = await pdfPages('leer');
        for (const [i, png] of bare.pngs.entries()) {
          const st = await pixelStats(page, png, { base, from: 0, scale: 0.75 });
          expect(st.maxDevBelow, `page ${i + 1}: base colour ± 3`).toBeLessThanOrEqual(3);
        }
      });
    }

    test('Druckansicht (emulateMedia print): kein Nebel, Glas deckend ohne Blur, Navigation am Ende ohne Überdeckung', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await settle(page);
      await page.emulateMedia({ media: 'print', colorScheme: scheme });
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => {
        const cs = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo);
        const glass = [...document.querySelectorAll('.glass, .glass-strong')].filter((e) => e.getBoundingClientRect().height > 0);
        const nav = document.querySelector<HTMLElement>('[data-testid="tabbar"]');
        const side = document.querySelector<HTMLElement>('[data-testid="sidebar"]');
        const shown = (e: HTMLElement | null) => !!e && cs(e).display !== 'none';
        const main = document.querySelector('main')!.getBoundingClientRect();
        return {
          html: cs(document.documentElement).backgroundColor,
          body: cs(document.body).backgroundColor,
          scheme: cs(document.documentElement).colorScheme,
          before: cs(document.body, '::before').display,
          after: cs(document.body, '::after').display,
          scrim: cs(document.getElementById('root')!, '::before').display,
          adjust: cs(document.body).getPropertyValue('print-color-adjust'),
          glass: [...new Set(glass.map((e) => `${cs(e).backgroundColor}|${cs(e).backdropFilter}`))],
          tabbar: shown(nav) ? { position: cs(nav!).position, top: nav!.getBoundingClientRect().top + scrollY, mainBottom: main.bottom + scrollY } : null,
          sidebar: shown(side) ? { position: cs(side!).position, right: side!.getBoundingClientRect().right, mainLeft: main.left } : null,
        };
      });
      const rgb = `rgb(${BASE[scheme].join(', ')})`;
      expect(r.html).toBe(rgb);
      expect(r.body).toBe(rgb);
      expect(r.scheme, 'colour scheme = active theme').toBe(scheme);
      expect([r.before, r.after, r.scrim], 'Nebel, grain and the top scrim off in print').toEqual(['none', 'none', 'none']);
      expect(r.adjust).toBe('exact');
      expect(r.glass, 'every glass surface opaque, no blur').toEqual([scheme === 'light' ? 'rgba(255, 255, 255, 0.92)|none' : 'rgba(28, 35, 31, 0.94)|none']);
      expect(!!r.tabbar !== !!r.sidebar, 'exactly one navigation').toBe(true);
      if (r.tabbar) {
        expect(r.tabbar.position).toBe('static');
        expect(r.tabbar.top, 'tab bar below the content').toBeGreaterThanOrEqual(r.tabbar.mainBottom - 1);
      }
      if (r.sidebar) {
        expect(r.sidebar.position).toBe('absolute');
        expect(r.sidebar.right, 'sidebar left of the content').toBeLessThanOrEqual(r.sidebar.mainLeft + 1);
      }
      // background only, full page: base colour ± 3 everywhere
      await page.addStyleTag({ content: HIDE_CONTENT });
      const png = await page.screenshot({ fullPage: true, scale: 'css' });
      const st = await pixelStats(page, png, { base: BASE[scheme] as unknown as [number, number, number], from: 0, scale: 1 });
      expect(st.maxDevBelow).toBeLessThanOrEqual(3);
      expect(st.transparent).toBe(0);
    });
  });
}
