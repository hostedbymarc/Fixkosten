import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { appSettled, expect, FIXTURE, setUpKonto, test, TODAY } from './fixtures';
import { inkShare } from './pixels';

// Monatswechsel auf Desktop und iPad (ruecklage-spielgeld, Ergänzung 2): nach mehrfachem Vor und Zurück
// bis Dezember liegt nichts über dem Inhalt. Pixel-Check: der Hero-Betrag und die Kacheln sind sichtbar
// (eigene Pixel, nicht nur im DOM), die Zier-Ebenen des Hero bleiben in der Kachel, der Lichtschimmer
// ist nach seinem Lauf weg. Seed-Daten, heute 5. Oktober 2026, „Fixkosten einplanen“ an.

const DIR = 'docs/screenshots/monatswechsel';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true },
} as const;

async function visibleMonth(page: Page) {
  // nothing animates any more in the hero: the shimmer is gone, the number shows its final value
  await expect(page.getByTestId('hero-shimmer')).toHaveCount(0, { timeout: 3000 });
  const paid = page.getByTestId('hero-paid');
  await expect(paid).toHaveText(/€/);
  const hero = (await page.getByTestId('hero').boundingBox())!;
  // the decorative layers stay inside the tile
  for (const layer of ['.hero-lights', '.hero-confetti']) {
    for (const box of await page.locator(`[data-testid="hero"] ${layer}`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.x).toBeGreaterThanOrEqual(hero.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(hero.x + hero.width + 1);
    }
  }
  // what lies on top at the centre of the number is the number itself (no surface over it)
  const top = await paid.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  expect(top, 'nothing lies over the hero amount').toBe(true);
  // pixels: the amount and a tile's number are drawn
  expect(await inkShare(page, paid), 'hero amount visible').toBeGreaterThan(0.04);
  expect(await inkShare(page, page.getByTestId('wealth-value')), 'tile amount visible').toBeGreaterThan(0.04);
  expect(await inkShare(page, page.getByTestId('hero-deductions-value')), 'deductions visible').toBeGreaterThan(0.04);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Monatswechsel · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(120_000);

      test('mehrfach vor und zurück bis Dezember: Hero-Betrag und Kacheln sichtbar, nichts liegt darüber', async ({ page }) => {
        await page.clock.setFixedTime(TODAY);
        await page.goto('/');
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        await page.getByTestId('konto-invite-enable').click();
        await setUpKonto(page);
        const next = page.getByRole('button', { name: 'Nächster Monat' });
        const prev = page.getByRole('button', { name: 'Vorheriger Monat' });
        const title = page.getByRole('heading', { level: 1 });
        // quick changes (while the shimmer and the count still run), then settle in December
        for (const step of [next, next, prev, next, next, prev, prev, next]) await step.click();
        await expect(title).toHaveText('Dezember 2026');
        await visibleMonth(page);
        // slower: each change settles
        for (const step of [next, prev, prev, next]) {
          await step.click();
          await page.waitForTimeout(250);
        }
        await expect(title).toHaveText('Dezember 2026');
        await visibleMonth(page);
        // other months not active: no Zur-Seite-Kachel, no switch in the split
        await expect(page.getByTestId('konto-tile')).toHaveCount(0);
        await expect(page.getByTestId('salary-split-view')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${DIR}/${tag}-dezember-nach-monatswechsel.jpg`, type: 'jpeg', quality: 80 });
        // back to October and once more to December
        await page.getByRole('button', { name: /Zum aktiven Monat/ }).click();
        await expect(title).toHaveText('Oktober 2026');
        await visibleMonth(page);
        await next.click();
        await next.click();
        await expect(title).toHaveText('Dezember 2026');
        await visibleMonth(page);
      });
    });
  }
}
