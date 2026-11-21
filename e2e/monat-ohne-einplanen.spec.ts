import type { Page } from '@playwright/test';
import { appSettled, expandAll, expect, FIXTURE, test, TODAY } from './fixtures';

// monat-verdichtet, regression: without „Fixkosten einplanen“ the month screen is unchanged. The reference
// pictures (e2e/monat-ohne-einplanen.spec.ts-snapshots/) were taken from main before this sprint (build of
// e112e57, `--update-snapshots` against it); every run compares the screen pixel for pixel. Hero, the four
// tiles, categories and „Kommt bald“; no „Dein Monat“, no bills row. iPhone 15 and desktop, light and dark.

const VIEWPORTS = {
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

async function start(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  // the invitation card stays out of the picture: „Später“ (the mode stays off)
  await page.getByTestId('konto-invite-later').click();
  await expect(page.getByTestId('konto-invite')).toHaveCount(0);
  await expandAll(page);
  await page.evaluate(() => document.fonts.ready);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`Monat ohne „Fixkosten einplanen“ · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));

      test('unverändert gegenüber main (Pixelvergleich)', async ({ page }) => {
        await start(page);
        await expect(page.getByTestId('dein-monat')).toHaveCount(0);
        await expect(page.getByTestId('bills-row')).toHaveCount(0);
        await expect(page.getByTestId('hero')).toBeVisible();
        await expect(page.getByTestId('free-tile')).toBeVisible();
        // monat-feinschliff-2: the tiles changed on purpose („Oktober-Gehalt“, „ausgezahlt am …“, „rechnet mit dem
        // Gehalt“ in one line, so the tile row can be lower) – the hero and the categories stay pixel for pixel as main
        const options = { animations: 'disabled' as const, caret: 'hide' as const, maxDiffPixels: 0 };
        const parts = async (name: string) => {
          await expect(page.getByTestId('hero')).toHaveScreenshot(`${name}-hero-${vp}-${scheme}.png`, options);
          await expect(page.locator('main > :not([data-tab-hidden]) section[aria-label="Fällige Positionen"]')).toHaveScreenshot(`${name}-kategorien-${vp}-${scheme}.png`, options);
        };
        await parts('monat');
        // the next month too
        await page.getByRole('button', { name: 'Nächster Monat' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
        await appSettled(page);
        await expandAll(page);
        await parts('november');
      });
    });
  }
}
