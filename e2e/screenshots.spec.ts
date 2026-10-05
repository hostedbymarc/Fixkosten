import { animationsDone, expect, test } from './fixtures';

const DIR = 'docs/screenshots/phase-1.1';

test.describe('Screenshots', () => {
  test('setup dialog', async ({ fresh }, info) => {
    await expect(fresh.getByTestId('setup-dialog')).toBeVisible();
    await fresh.evaluate(() => document.fonts.ready);
    await fresh.screenshot({ path: `${DIR}/${info.project.name}-setup.png` });
  });

  test('all screens', async ({ app }, info) => {
    const name = info.project.name;
    await app.evaluate(() => document.fonts.ready);

    // month close with values so the tile shows its full state
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
    await animationsDone(app, 'bottom-sheet');
    await app.screenshot({ path: `${DIR}/${name}-monatsabschluss.png` });
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByRole('dialog')).toBeHidden();

    await app.screenshot({ path: `${DIR}/${name}-monat.png` });
    // full page: pin fixed navigation to the page edges so it is not painted mid-page
    const style = await app.addStyleTag({
      content: '[data-testid=tabbar],[data-testid=sidebar]{position:absolute!important}',
    });
    await app.screenshot({ path: `${DIR}/${name}-monat-full.png`, fullPage: true });
    await style.evaluate((el) => (el as Element).remove());

    await app.locator('[data-position="pos-strom"]').getByRole('button', { name: /Details/ }).click();
    await expect(app.getByRole('dialog')).toBeVisible();
    await animationsDone(app, 'bottom-sheet');
    await app.screenshot({ path: `${DIR}/${name}-sheet.png` });
    await app.keyboard.press('Escape');

    for (const route of ['positionen', 'analyse', 'einstellungen']) {
      await app.goto(`/#/${route}`);
      await expect(app.getByText(/Kommt in Phase/)).toBeVisible();
      await app.screenshot({ path: `${DIR}/${name}-${route}.png` });
    }
  });
});
