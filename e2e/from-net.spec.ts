import { animationsDone, eur, expect, isTouchProject, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';
import { expectClean } from './measure';

const SWITCH_LABEL = "Von ‚Frei verfügbar' abziehen";
const HINT =
  "Aus, wenn das Geld nicht aus deinem Gehalt kommt, z. B. eine Mieteinnahme. Es zählt dann zum Vermögensaufbau, aber nicht gegen ‚Frei verfügbar'.";

test.describe('Schalter „Von ‚Frei verfügbar‘ abziehen“ (Einmalige im Vermögensaufbau)', () => {
  test('Neue einmalige Zahlung: Schalter nur in Vermögensaufbau-Kategorien, Default an', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await page.getByTestId('add-once').click();
    await animationsDone(page, 'bottom-sheet');
    const sheet = page.getByRole('dialog');
    // a fixed-cost category: no switch
    await sheet.getByLabel('Kategorie').selectOption({ label: 'Sonstiges' });
    await expect(sheet.getByTestId('from-net')).toHaveCount(0);
    // Vermögensaufbau: switch, on by default, with the hint
    await sheet.getByLabel('Kategorie').selectOption({ label: 'Investieren (Vermögensaufbau)' });
    const sw = sheet.getByRole('switch', { name: SWITCH_LABEL });
    await expect(sw).toBeVisible();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByTestId('from-net')).toContainText(HINT);
    const box = (await sw.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(32);
    await expectClean(page, '[role="dialog"]');
  });

  test('Oktober: „Miete 1220“ bearbeiten → aus → Frei € 499,50, Abzüge € 4.288,50, Sparquote 16,7 %, Chip; wieder an → wie vorher', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await expect(page.getByTestId('free-value')).toHaveText(eur('−€ 560,50'));
    const row = page.locator('[data-testid="position-row"][data-position="f7e55a12-2e3d-4824-9a25-db8f182270ec"]');
    await expect(row.getByTestId('not-from-net')).toHaveCount(0);

    const toggleTo = async (on: boolean) => {
      await row.getByRole('button', { name: 'Miete 1220 – Details' }).click();
      await animationsDone(page, 'bottom-sheet');
      await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
      await animationsDone(page, 'bottom-sheet');
      const sw = page.getByRole('dialog').getByRole('switch', { name: SWITCH_LABEL });
      await expect(sw).toHaveAttribute('aria-checked', String(!on));
      await (isTouchProject() ? sw.tap() : sw.click());
      await expect(sw).toHaveAttribute('aria-checked', String(on));
      await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    };

    await toggleTo(false);
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 499,50'));
    await expect(page.getByTestId('hero-deductions-value')).toHaveText(eur('€ 4.288,50'));
    await expect(page.getByTestId('hero-deductions-breakdown')).toHaveText(eur('€ 3.488,50 Fixkosten + € 800 Vermögensaufbau'));
    await expect(page.getByTestId('wealth-value')).toHaveText(eur('€ 1.860'));
    await expect(page.getByTestId('wealth-sub')).toHaveText(eur('Sparquote 16,7 % · € 1.060 nicht vom Netto'));
    await expect(row.getByTestId('not-from-net')).toHaveText('nicht vom Netto');
    // unchanged: Fixkosten, im Ø-Monat, Investieren header
    await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 3.488,50'));
    await expect(page.getByTestId('free-average')).toHaveText(eur('im Ø-Monat € 1.035,83'));
    await expect(page.getByRole('region', { name: 'Investieren' }).getByTestId('group-sum')).toHaveText(eur('€ 1.860'));
    // ⓘ names the part that is not deducted
    const icon = page.getByRole('button', { name: 'Erklärung: Abzüge vom Netto' });
    await (isTouchProject() ? icon.tap() : icon.hover());
    await expect(page.getByTestId('hero-deductions-not-from-net')).toHaveText(eur('€ 1.060 Vermögensaufbau nicht vom Netto, nicht abgezogen'));
    await page.keyboard.press('Escape');

    await toggleTo(true);
    await expect(page.getByTestId('free-value')).toHaveText(eur('−€ 560,50'));
    await expect(page.getByTestId('wealth-sub')).toHaveText(eur('Sparquote 38,8 %'));
    await expect(row.getByTestId('not-from-net')).toHaveCount(0);
  });
});
