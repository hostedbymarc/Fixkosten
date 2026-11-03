import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// Vorher/Nachher screenshots of every tab and the sheets with explanatory texts, light and dark.
// PHASE=vorher|nachher (default nachher). iPhone 15 and desktop only; the shots are the result.

const PHASE = process.env.TOOLTIP_PHASE ?? 'nachher';
const DIR = 'docs/screenshots/tooltips';
mkdirSync(DIR, { recursive: true });

async function shot(page: Page, name: string, fullPage = true) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const scheme = await page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dunkel' : 'hell'));
  await page.screenshot({ path: `${DIR}/${PHASE}-${test.info().project.name}-${scheme}-${name}.jpg`, type: 'jpeg', quality: 70, fullPage });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Screens ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(() => test.skip(!['iphone-15', 'desktop'].includes(test.info().project.name), 'iPhone 15 und Desktop'));

    test('alle Tabs und Sheets', async ({ page }) => {
      test.setTimeout(180_000);
      await page.clock.setFixedTime(TODAY);
      await page.goto('/');
      await page.getByTestId('import-file').setInputFiles(FIXTURE);
      await expect(page.getByTestId('hero')).toBeVisible();
      await appSettled(page);
      await page.getByTestId('konto-invite-enable').click();
      await expect(page.getByTestId('konto-tile')).toBeVisible();
      await shot(page, '1-monat');

      await page.getByTestId('konto-tile').click();
      await expect(page.getByTestId('konto-sheet')).toBeVisible();
      await page.getByTestId('konto-settings-inline').locator('summary').click();
      await shot(page, '2-fixkostenkonto-sheet', false);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await goTo(page, 'positionen');
      await shot(page, '3-positionen');
      await page.getByRole('button', { name: 'Miete – Details' }).click();
      await page.getByRole('button', { name: 'Bearbeiten' }).click();
      await expect(page.getByTestId('position-form')).toBeVisible();
      await shot(page, '4-bearbeiten', false);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await goTo(page, 'analyse');
      await shot(page, '5-analyse');
      await goTo(page, 'einstellungen');
      await shot(page, '6-einstellungen');
    });

    test('Einrichtung', async ({ page }) => {
      await page.clock.setFixedTime(TODAY);
      await page.goto('/');
      await expect(page.getByTestId('setup-dialog')).toBeVisible();
      await shot(page, '7-einrichtung-start');
      await page.getByTestId('setup-new').click();
      await shot(page, '8-einrichtung-land');
      await page.getByTestId('setup-next').click();
      await page.getByTestId('setup-template-toggle').first().click();
      await shot(page, '9-einrichtung-vorlagen');
    });
  });
}
