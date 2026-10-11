import type { Page } from '@playwright/test';
import { animationsDone, eur, expect, importFixture, isTouchProject, test, TODAY } from './fixtures';
import { expectClean } from './measure';

const DIR = 'docs/screenshots/tooltip-oe-monat';
const FORMULA = 'Netto € 4.788 − Ø Fixkosten € 2.952,17 = € 1.835,83';

async function enterSalary(page: Page, amount = '4.788') {
  await page.getByTestId('free-tile').click();
  await animationsDone(page, 'bottom-sheet');
  await page.getByLabel('Netto-Gehalt').fill(amount);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('free-average')).toHaveText(eur('im Ø-Monat € 1.835,83'));
}

/** Fully inside the viewport and nothing (tab bar included) on top of it. */
async function expectUncovered(page: Page) {
  const r = await page.getByTestId('free-average-info-popover').evaluate((el) => {
    const b = el.getBoundingClientRect();
    const points = [
      // 14 px in: hit testing follows the rounded corners (12 px)
      [b.left + 14, b.top + 14],
      [b.right - 14, b.top + 14],
      [b.left + 14, b.bottom - 14],
      [b.right - 14, b.bottom - 14],
      [b.left + b.width / 2, b.top + b.height / 2],
    ];
    return {
      inside: b.left >= 0 && b.top >= 0 && b.right <= document.documentElement.clientWidth && b.bottom <= window.innerHeight,
      covered: points.filter(([x, y]) => !el.contains(document.elementFromPoint(x!, y!))).length,
      opaque: getComputedStyle(el).backgroundColor,
    };
  });
  expect(r.inside, 'inside the viewport').toBe(true);
  expect(r.covered, 'nothing on top').toBe(0);
  expect(r.opaque).toMatch(/^rgb\(/); // no alpha: opaque, no glass
}

test.describe('Tooltip „im Ø-Monat“', () => {
  test('ohne Netto kein ⓘ', async ({ app }) => {
    await expect(app.getByTestId('free-average')).toHaveCount(0);
    await expect(app.getByTestId('free-average-info')).toHaveCount(0);
  });

  test('Icon hinter dem Betrag, 44 px Tap-Fläche, Zeile unverändert, Werte live', async ({ app }) => {
    await enterSalary(app);
    const icon = app.getByRole('button', { name: 'Erklärung: im Ø-Monat' });
    await expect(icon).toBeVisible();
    const [box, amount, line] = await Promise.all([
      icon.boundingBox(),
      app.getByTestId('free-average').locator('.num').boundingBox(),
      app.getByTestId('free-average').boundingBox(),
    ]);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // centred just behind the amount, on the same line
    const cx = box!.x + box!.width / 2;
    expect(cx).toBeGreaterThan(amount!.x + amount!.width);
    expect(cx - (amount!.x + amount!.width)).toBeLessThan(20);
    expect(Math.abs(box!.y + box!.height / 2 - (line!.y + line!.height / 2))).toBeLessThan(4);
    // one text line, nothing clipped, no overflow
    expect(Math.round(line!.height / parseFloat(await app.getByTestId('free-average').evaluate((e) => getComputedStyle(e).lineHeight)))).toBe(1);
    await expectClean(app, 'main');

    // another salary → other numbers (live from calc.ts)
    await app.getByTestId('free-tile').click();
    await animationsDone(app, 'bottom-sheet');
    await app.getByLabel('Netto-Gehalt').fill('5.000');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await (isTouchProject() ? icon.tap() : icon.hover());
    await expect(app.getByTestId('free-average-formula')).toHaveText(eur('Netto € 5.000 − Ø Fixkosten € 2.952,17 = € 2.047,83'));
  });

  test('Touch: Tap öffnet, Tap erneut schließt, Tap daneben schließt; die Kachel öffnet sich nicht', async ({ app }) => {
    test.skip(!isTouchProject(), 'touch devices');
    await enterSalary(app);
    const icon = app.getByRole('button', { name: 'Erklärung: im Ø-Monat' });
    const pop = app.getByRole('tooltip');
    await icon.tap();
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Im Ø-Monat');
    await expect(app.getByTestId('free-average-formula')).toHaveText(eur(FORMULA));
    await expect(pop).toContainText('So viel bleibt dir im Schnitt pro Monat, wenn du Jahres- und Quartalszahlungen anteilig zurücklegst.');
    await expect(icon).toHaveAttribute('aria-describedby', (await pop.getAttribute('id'))!);
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await app.waitForTimeout(400); // stays open
    await expect(pop).toBeVisible();
    await expectUncovered(app);

    await icon.tap();
    await expect(pop).toHaveCount(0);
    await icon.tap();
    await expect(pop).toBeVisible();
    await app.getByRole('heading', { level: 1 }).first().tap();
    await expect(pop).toHaveCount(0);
    await expect(app.getByRole('dialog')).toHaveCount(0);
  });

  test('Desktop: Hover und Tastaturfokus öffnen, Esc schließt', async ({ app }) => {
    test.skip(isTouchProject(), 'mouse and keyboard');
    await enterSalary(app);
    const icon = app.getByRole('button', { name: 'Erklärung: im Ø-Monat' });
    const pop = app.getByRole('tooltip');
    await icon.hover();
    await expect(pop).toBeVisible();
    await expect(app.getByTestId('free-average-formula')).toHaveText(eur(FORMULA));
    await expectUncovered(app);
    await app.getByTestId('free-value').hover();
    await expect(pop).toHaveCount(0);

    await app.getByTestId('free-tile').focus();
    await app.keyboard.press('Tab');
    await expect(icon).toBeFocused();
    await expect(pop).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(icon).toBeFocused();
    await expect(app.getByRole('dialog')).toHaveCount(0);
  });

  for (const dark of [false, true]) {
    test(`Popover offen im Viewport, Screenshot ${dark ? 'dunkel' : 'hell'}`, async ({ page }) => {
      if (dark) await page.emulateMedia({ colorScheme: 'dark' });
      await page.clock.setFixedTime(TODAY);
      await page.goto('/');
      await importFixture(page);
      await enterSalary(page);
      const icon = page.getByRole('button', { name: 'Erklärung: im Ø-Monat' });
      await (isTouchProject() ? icon.tap() : icon.hover());
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expectUncovered(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${test.info().project.name}-${dark ? 'dunkel' : 'hell'}.png` });
    });
  }
});
