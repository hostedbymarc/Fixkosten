import type { Page } from '@playwright/test';
import { animationsDone, expect, goTo, test } from './fixtures';

const DIR = 'docs/screenshots/phase-2';

async function shot(page: Page, name: string, fullPage = false) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  const file = `${DIR}/${test.info().project.name}-${name}.png`;
  if (!fullPage) return void (await page.screenshot({ path: file }));
  // pin fixed navigation to the page edges so it is not painted mid-page
  const style = await page.addStyleTag({ content: '[data-testid=tabbar],[data-testid=sidebar],[data-testid=fab]{position:absolute!important}' });
  await page.screenshot({ path: file, fullPage: true });
  await style.evaluate((el) => (el as Element).remove());
}

test.describe('Screenshots Phase 2', () => {
  test('month screens', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await shot(app, 'monat');
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByRole('button', { name: /Offen aus Oktober/ }).click();
    // one-off as sub-row under Strom
    await app.getByRole('button', { name: 'Strom – Details' }).click();
    await shot(app, 'zahlung-sheet');
    await app.getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
    await app.getByTestId('oneoff-form').getByLabel('Betrag').fill('120');
    await app.getByTestId('oneoff-form').getByLabel('Bezeichnung').fill('Jahresabrechnung');
    await shot(app, 'einmalbetrag');
    await app.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(app.getByTestId('oneoff-row')).toBeVisible();
    await shot(app, 'monat-november', true);
  });

  test('positions screens and sheets', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await goTo(app, 'positionen');
    await expect(app.getByTestId('positions-group').first()).toBeVisible();
    await shot(app, 'positionen');
    await shot(app, 'positionen-full', true);

    await app.getByRole('button', { name: 'Position hinzufügen' }).click();
    await app.getByLabel('Name').fill('KFZ-Versicherung');
    await app.getByLabel('Betrag').fill('120,50');
    await app.getByRole('radio', { name: 'Quartal' }).click();
    await app.getByLabel('Startmonat').selectOption({ label: 'Feb' });
    await shot(app, 'position-neu');
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Handy – Details' }).click();
    await shot(app, 'position-detail');
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    await app.getByLabel('Betrag').fill('8');
    await app.getByTestId('change-mode').scrollIntoViewIfNeeded();
    await shot(app, 'position-ab-wann');
    await app.keyboard.press('Escape');
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Kategorien' }).click();
    await shot(app, 'kategorien');
    await app.getByRole('button', { name: 'Mobilität bearbeiten' }).click();
    await shot(app, 'kategorie-bearbeiten');
    await app.getByRole('button', { name: 'Kategorie löschen' }).click();
    await shot(app, 'kategorie-verschieben');
  });

  test('settings archive', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Gym – Details' }).click();
    await app.getByTestId('position-detail').getByRole('button', { name: 'Archivieren' }).click();
    await goTo(app, 'einstellungen');
    await expect(app.getByTestId('archive-list')).toBeVisible();
    await shot(app, 'einstellungen-archiv');
    await app.getByTestId('archive-list').getByRole('button', { name: 'Löschen' }).click();
    await shot(app, 'endgueltig-loeschen');
  });
});
