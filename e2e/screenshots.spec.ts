import { animationsDone, expect, test } from './fixtures';

const DIR = 'docs/screenshots/phase-1';

test.describe('Screenshots', () => {
  test('all screens', async ({ app }, info) => {
    const name = info.project.name;
    await app.evaluate(() => document.fonts.ready);
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
