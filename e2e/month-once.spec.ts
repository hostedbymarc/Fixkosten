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

    await goTo(app, 'positionen');
    await app.getByTestId('once-section').getByRole('button', { name: /Einmalige Zahlungen/ }).click();
    await expect(app.getByTestId('once-upcoming')).toContainText('Hotel Copenhagen');
  });

  test('im laufenden Monat: Datum = heute', async ({ app }) => {
    await app.getByTestId('add-once').click();
    await expect(app.getByTestId('position-form').getByLabel('Fällig am')).toHaveValue('2026-10-05');
    await expect(app.getByTestId('due-date-hint')).toContainText('05.10.2026');
  });
});

test.describe('Frei verfügbar: dieser Monat und Ø-Monat', () => {
  test('Einmalige senken nur „diesen Monat“, der Ø-Monat und die Sparquote bleiben', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await expect(app.getByTestId('close-average')).toHaveText(
      eur('Rechnerisch frei diesen Monat € 797 · im Ø-Monat (alle Kosten umgelegt) € 1.247,83'),
    );
    await app.getByRole('button', { name: 'Speichern' }).click();

    const tile = app.getByTestId('free-tile');
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
