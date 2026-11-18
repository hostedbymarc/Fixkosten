import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { appSettled, closeWalkthrough, expect, FIXTURE, test, TODAY } from './fixtures';

// „{Monat} erledigt“ and the hero layout (ruecklage-spielgeld, Ergänzung). Seed data, today 5 October 2026:
// one position open (Depotentgelt € 35). Ticking it is the last one → the celebration, live, with confetti.
// - the big amount keeps the iPhone hierarchy on every device; no text wraps inside a pill
// - „Woraus du bezahlst“ under „Abzüge vom Netto“
// - live: check, „Oktober erledigt“, „Alle 16 Rechnungen bezahlt“, the amount, a confetti layer; the check pops
// - opened again (reload): the calm state, no confetti (celebratedMonths); a tap on the check plays it again
// - prefers-reduced-motion: no confetti, no pop
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to docs/screenshots/feier/.

const DIR = 'docs/screenshots/feier';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const fontSize = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

async function shot(page: Page, name: string) {
  await page.getByTestId('hero').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('hero').screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 82 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Feier · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(150_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Hero-Hierarchie, Woraus du bezahlst, letzte Position → Feier, erneut öffnen ruhig, Haken spielt sie ab, reduced motion', async ({ page }) => {
        await page.clock.setFixedTime(TODAY);
        await page.goto('/');
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        // „Fixkosten einplanen“ on (no account, € 184,21, spread): „Woraus du bezahlst“ shows
        await page.getByTestId('konto-invite-enable').click();
        await tap(page.getByTestId('konto-tile-start'));
        await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'gap');
        await tap(page.getByTestId('konto-setup-gap-spread'));
        await tap(page.getByTestId('konto-setup-finish'));
        await closeWalkthrough(page);
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);

        // the big amount: as on the iPhone (≥ 48 px, at least twice „Abzüge vom Netto“); pills on one line
        const paid = page.getByTestId('hero-paid');
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(48);
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(2 * (await fontSize(page.getByTestId('hero-deductions-value'))));
        // from the iPad on as big as on the iPhone at least
        if (use.viewport.width >= 800) expect(await fontSize(paid)).toBeGreaterThanOrEqual(56);
        expect((await page.getByTestId('hero-open').boundingBox())!.height).toBeLessThanOrEqual(33);
        await expect(page.getByTestId('hero-sources-title')).toHaveText('Woraus du bezahlst');
        await expect(page.getByTestId('hero-done')).toHaveCount(0);
        await page.waitForTimeout(300);
        await shot(page, `${tag}-01-hero-normal`);

        // the last position ticked: the celebration, live
        await tap(page.getByTestId('hero-open-filter'));
        await tap(page.locator('[data-position="pos-depotentgelt"]').getByTestId('toggle-paid').first());
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
        await expect(page.getByTestId('hero-done-sub')).toHaveText('Alle 16 Rechnungen bezahlt');
        await expect(page.getByText('Alles abgebucht')).toHaveCount(0);
        await expect(page.getByTestId('hero-sources-title')).toHaveText('Woraus du bezahlt hast');
        await expect(page.getByTestId('hero-confetti')).toHaveCount(1);
        await expect(page.getByTestId('hero-confetti')).toHaveAttribute('data-count', vp === 'iphone-se' ? '60' : '90');
        await expect(page.getByTestId('hero-check')).toHaveAttribute('data-pop', '');
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(48);
        // the peas stay where they landed (≤ 0.9 s delay + 3.2 s fall)
        await page.waitForTimeout(4300);
        await expect(page.getByTestId('hero-confetti').locator('.confetti-pea').first()).toBeVisible();
        await shot(page, `${tag}-02-hero-erledigt`);

        // opened again: the calm state, no confetti
        await page.waitForTimeout(300);
        await page.reload();
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await appSettled(page);
        await page.waitForTimeout(500);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(0);
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');
        await shot(page, `${tag}-03-hero-erledigt-ruhig`);

        // a tap on the check plays it again
        await tap(page.getByTestId('hero-check'));
        await expect(page.getByTestId('hero-confetti')).toHaveCount(1);
        await expect(page.getByTestId('hero-check')).toHaveAttribute('data-pop', '');

        // prefers-reduced-motion: no confetti, no pop
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.reload();
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await appSettled(page);
        await tap(page.getByTestId('hero-check'));
        await page.waitForTimeout(300);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(0);
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
      });
    });
  }
}
