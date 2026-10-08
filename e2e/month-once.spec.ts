import type { Page } from '@playwright/test';
import { animationsDone, eur, expect, goTo, test } from './fixtures';
import { expectClean } from './measure';

async function addOnce(page: Page, name: string, amount: string, category: string, date?: string) {
  await page.getByTestId('add-once').click();
  await expect(page.getByTestId('bottom-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
  const form = page.getByTestId('position-form');
  await expect(page.getByTestId('bottom-sheet')).toContainText('Einmalige Zahlung');
  await expect(form.getByRole('radiogroup', { name: 'Häufigkeit' })).toHaveCount(0); // fixed: one-time
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Betrag').fill(amount);
  await form.getByLabel('Kategorie').selectOption({ label: category });
  if (date) await form.getByLabel('Fällig am').fill(date);
  await expectClean(page, '[data-testid="bottom-sheet"]');
  await form.getByRole('button', { name: 'Zahlung anlegen' }).click();
  await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
}

test.describe('Einmalige Zahlung im Monat', () => {
  test('im November anlegen und einer Kategorie zuordnen → nur dort fällig', async ({ app }) => {
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByTestId('add-once').click();
    await expect(app.getByTestId('position-form').getByLabel('Fällig am')).toHaveValue('2026-11-01'); // 1st of the month shown
    await app.keyboard.press('Escape');

    await addOnce(app, 'Hotel Copenhagen', '620', 'Abos & Freizeit');
    const abos = app.getByRole('region', { name: 'Abos & Freizeit' });
    const hotel = abos.getByTestId('position-row').filter({ hasText: 'Hotel Copenhagen' });
    await expect(hotel).toContainText('Einmalig · 1.11.');
    await expect(hotel).toContainText(eur('€ 620'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.284'));
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17')); // not a fixed cost
    await expectClean(app, 'main');

    await app.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(app.getByTestId('position-row').filter({ hasText: 'Hotel Copenhagen' })).toHaveCount(0);

    // not in the Positionen tab: that tab is for fixed costs only
    await goTo(app, 'positionen');
    await expect(app.getByText('Hotel Copenhagen')).toHaveCount(0);
    await app.getByRole('button', { name: 'Position hinzufügen' }).click();
    await expect(app.getByTestId('position-form').getByRole('radio', { name: 'Einmalig' })).toHaveCount(0);
  });

  test('im Monat bearbeiten und löschen (mit Rückgängig)', async ({ app }) => {
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await addOnce(app, 'Hotel Copenhagen', '620', 'Abos & Freizeit');
    const row = () => app.getByTestId('position-row').filter({ hasText: 'Hotel' });

    // edit: name, amount, category, date
    await row().getByRole('button', { name: /Details/ }).click();
    await expect(app.getByTestId('bottom-sheet')).toBeVisible();
    await app.getByRole('button', { name: 'Zahlung bearbeiten' }).click();
    await animationsDone(app, 'bottom-sheet');
    await expect(app.getByTestId('bottom-sheet')).toContainText('Einmalige Zahlung bearbeiten');
    const form = app.getByTestId('position-form');
    await expect(form.getByLabel('Betrag')).toHaveValue('620');
    await form.getByLabel('Name').fill('Hotel MUC');
    await form.getByLabel('Betrag').fill('200');
    await form.getByLabel('Kategorie').selectOption({ label: 'Wohnen & Leben' });
    await form.getByLabel('Fällig am').fill('2026-11-20');
    await expectClean(app, '[data-testid="bottom-sheet"]');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('bottom-sheet')).toHaveCount(0);
    const wohnen = app.getByRole('region', { name: 'Wohnen & Leben' });
    await expect(wohnen.getByTestId('position-row').filter({ hasText: 'Hotel MUC' })).toContainText('Einmalig · 20.11.');
    await expect(wohnen.getByTestId('position-row').filter({ hasText: 'Hotel MUC' })).toContainText(eur('€ 200'));
    await expect(app.getByRole('region', { name: 'Abos & Freizeit' }).getByText('Hotel')).toHaveCount(0);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.864'));

    // delete with undo
    await row().getByRole('button', { name: /Details/ }).click();
    await expect(app.getByTestId('bottom-sheet')).toBeVisible();
    await app.getByRole('button', { name: 'Zahlung löschen' }).click();
    await expect(row()).toHaveCount(0);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.664'));
    await app.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(row()).toContainText('Hotel MUC');
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.864'));
  });

  test('im laufenden Monat: Datum = heute', async ({ app }) => {
    await app.getByTestId('add-once').click();
    await expect(app.getByTestId('position-form').getByLabel('Fällig am')).toHaveValue('2026-10-05');
    await expect(app.getByTestId('due-date-hint')).toContainText('05.10.2026');
  });
});

test.describe('Frei verfügbar: dieser Monat und Ø-Monat', () => {
  test('Netto-Gehalt eigene Kachel; Einmalige senken nur „diesen Monat“, Ø-Monat und Sparquote bleiben', async ({ app }) => {
    await expect(app.getByTestId('salary-value')).toHaveText('–');
    await app.getByTestId('salary-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await expect(app.getByTestId('close-average')).toHaveText(
      eur('Rechnerisch frei diesen Monat € 797 · im Ø-Monat (alle Kosten umgelegt) € 1.247,83'),
    );
    await app.getByRole('button', { name: 'Speichern' }).click();

    const tile = app.getByTestId('free-tile');
    await expect(app.getByTestId('salary-value')).toHaveText(eur('€ 5.000'));
    await expect(tile).not.toContainText('5.000');
    await expect(app.getByTestId('free-value')).toHaveText(eur('€ 797'));
    await expect(app.getByTestId('free-average')).toHaveText(eur('Ø-Monat € 1.247,83 · alle Kosten umgelegt'));
    await expect(app.getByTestId('savings-rate')).toHaveText(eur('Sparquote 16,0 %'));

    await addOnce(app, 'Hotel Copenhagen', '620', 'Abos & Freizeit', '2026-10-20');
    await expect(app.getByTestId('free-value')).toHaveText(eur('€ 177'));
    await expect(app.getByTestId('free-average')).toHaveText(eur('Ø-Monat € 1.247,83 · alle Kosten umgelegt'));
    await expect(app.getByTestId('savings-rate')).toHaveText(eur('Sparquote 16,0 %'));
    await expect(tile).toBeVisible();
    await expectClean(app, 'main');
  });
});
