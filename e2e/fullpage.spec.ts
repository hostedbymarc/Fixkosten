import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, goTo, test } from './fixtures';
import { diffShare, FIXED_FIRST_SCREEN, HIDE_CONTENT, NO_FILTER, pixelStats } from './background';
import { importLive, NOV_TODAY, OKT_TODAY } from './live';

// Full-page capture (iPad Safari „Ganze Seite“ showed black below the first screen and a hard green
// disc on top). Chromium always paints the canvas, so black itself does not reproduce here; the tests
// check what a renderer without canvas or fixed layers would show: body paints the base colour over
// the whole page, the Nebel ends inside the first screen without an edge, and the PDF keeps it.

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
        const viewport = await page.screenshot();
        const firstScreen = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: vp.height } });
        expect(await diffShare(page, viewport, firstScreen, 10), 'first screen vs viewport').toBeLessThanOrEqual(0.02);

        // 2) background only (content hidden): Chromium full page, then without filter, then the iOS layer model
        await page.addStyleTag({ content: HIDE_CONTENT });
        await page.waitForTimeout(100);
        const base = BASE[scheme] as unknown as [number, number, number];
        for (const variant of ['normal', 'ohne filter', 'iOS: fixierte Ebenen nur im ersten Bildschirm'] as const) {
          if (variant === 'ohne filter') await page.addStyleTag({ content: NO_FILTER });
          if (variant.startsWith('iOS')) await page.addStyleTag({ content: FIXED_FIRST_SCREEN(vp.height) });
          await page.waitForTimeout(100);
          const png = await page.screenshot({ fullPage: true, scale: 'css', omitBackground: variant.startsWith('iOS') });
          const s = await pixelStats(page, png, { base, from: vp.height, edge: variant.startsWith('iOS') ? vp.height : undefined, scale });
          const tag = `${p.name} · ${variant}`;
          if (scheme === 'light') expect(s.nearBlack, `${tag}: no pixel ≤ #101010`).toBe(0);
          expect(s.transparent, `${tag}: nothing transparent`).toBe(0);
          expect(s.maxDevBelow, `${tag}: below the first screen = base ± 3`).toBeLessThanOrEqual(3);
          expect(s.kink, `${tag}: Kanten-Kennzahl`).toBeLessThan(threshold);
          // a page no taller than one screen has no edge to look at
          if (variant.startsWith('iOS') && s.height > vp.height + 1) expect(s.edgeStep, `${tag}: no step where the fixed layer ends`).toBeLessThanOrEqual(3);
        }
      });
    }

    test('PDF (Chromium, Druck): Hintergrund wird mitgedruckt, Seite 2 ist die Basisfarbe, hell nie Schwarz', async ({ page }, info) => {
      test.skip(info.project.name !== 'ipad-portrait' && info.project.name !== 'desktop' && info.project.name !== 'iphone-15', 'three sizes are enough');
      await importLive(page, OKT_TODAY);
      await settle(page);
      const vp = page.viewportSize()!;
      await page.addStyleTag({ content: HIDE_CONTENT });
      await page.emulateMedia({ media: 'print', colorScheme: scheme });
      const dir = mkdtempSync(join(tmpdir(), 'erbse-pdf-'));
      const pdf = join(dir, 'page.pdf');
      await page.pdf({ path: pdf, width: `${vp.width}px`, height: `${vp.height}px` });
      execFileSync('pdftoppm', ['-png', '-r', '48', '-f', '1', '-l', '2', '-x', '0', '-y', '0', '-W', String(Math.floor(vp.width / 2) - 1), '-H', String(Math.floor(vp.height / 2) - 1), pdf, join(dir, 'p')]);
      const base = BASE[scheme] as unknown as [number, number, number];
      const p1 = await pixelStats(page, readFileSync(join(dir, 'p-1.png')), { base, from: 1e9, scale: 0.5 });
      const p2 = await pixelStats(page, readFileSync(join(dir, 'p-2.png')), { base, from: 0, scale: 0.5 });
      if (scheme === 'light') expect(p1.nearBlack + p2.nearBlack).toBe(0);
      expect(p2.maxDevBelow, 'page 2: printed base colour, no white paper').toBeLessThanOrEqual(3);
      expect(p1.kink).toBeLessThan(vp.width < 500 ? 10 : 5);
    });
  });
}
