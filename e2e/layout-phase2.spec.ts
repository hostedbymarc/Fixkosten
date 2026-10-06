import type { Page } from '@playwright/test';
import { animationsDone, expect, goTo, test } from './fixtures';
import { expectClean } from './measure';

async function sheet(page: Page) {
  await expect(page.getByTestId('bottom-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
  const box = (await page.getByTestId('bottom-sheet').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await expectClean(page, '[data-testid="bottom-sheet"]');
}

test.describe('Layout Phase 2 (gemessen)', () => {
  test('Positionen screen', async ({ app }) => {
    await goTo(app, 'positionen');
    await expect(app.getByTestId('positions-group').first()).toBeVisible();
    await expectClean(app, 'main');
    // FAB stays above the tab bar / home indicator
    const fab = (await app.getByTestId('fab').boundingBox())!;
    const tabbar = await app.getByTestId('tabbar').boundingBox();
    if (tabbar && (await app.getByTestId('tabbar').isVisible())) expect(fab.y + fab.height).toBeLessThanOrEqual(tabbar.y);
  });

  test('Einstellungen with archive', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Gym – Details' }).click();
    await app.getByTestId('position-detail').getByRole('button', { name: 'Archivieren' }).click();
    await goTo(app, 'einstellungen');
    await expect(app.getByTestId('archive-list')).toBeVisible();
    await expectClean(app, 'main');
  });

  test('sheets: new position, edit with "Ab wann", detail, one-off, categories', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Position hinzufügen' }).click();
    await app.getByRole('radio', { name: 'Quartal' }).click();
    await sheet(app);
    // the save button is reachable inside the sheet (scroll container)
    await app.getByRole('button', { name: 'Position anlegen' }).scrollIntoViewIfNeeded();
    await expect(app.getByRole('button', { name: 'Position anlegen' })).toBeInViewport();
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Depotentgelt – Details' }).click();
    await sheet(app);
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    await app.getByLabel('Betrag').fill('39');
    await expect(app.getByTestId('change-mode')).toBeVisible();
    await sheet(app);
    await app.getByRole('button', { name: 'Speichern' }).scrollIntoViewIfNeeded();
    await expect(app.getByRole('button', { name: 'Speichern' })).toBeInViewport();
    await app.keyboard.press('Escape');
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Depotentgelt – Details' }).click();
    await app.getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
    await sheet(app);
    await app.keyboard.press('Escape'); // back to the detail sheet
    await expect(app.getByTestId('position-detail')).toBeVisible();
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Kategorien' }).click();
    await sheet(app);
  });

  test('Sicherung: settings section and import sheet', async ({ app }) => {
    await goTo(app, 'einstellungen');
    await expectClean(app, 'main');
    await app.getByTestId('backup-file').setInputFiles('tests/fixtures/seed.json');
    await sheet(app);
    await app.getByRole('button', { name: 'Zusammenführen', exact: true }).scrollIntoViewIfNeeded();
    await expect(app.getByRole('button', { name: 'Zusammenführen', exact: true })).toBeInViewport();
  });

  test('Monat with open items and one-off row', async ({ app }) => {
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByRole('button', { name: /Offen aus Oktober/ }).click();
    await expectClean(app, 'main');
  });

  test('Esc closes sheets and focus returns to the trigger', async ({ app }) => {
    await goTo(app, 'positionen');
    const fab = app.getByRole('button', { name: 'Position hinzufügen' });
    await fab.focus();
    await app.keyboard.press('Enter');
    await expect(app.getByTestId('position-form')).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.getByTestId('position-form')).toBeHidden();
    await expect(fab).toBeFocused();
  });
});
