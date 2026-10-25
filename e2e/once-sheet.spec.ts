import type { Page } from '@playwright/test';
import { liveDataset, OKT } from '../tests/fixtures/live';
import { monthFigures } from '../src/lib/calc';
import { formatEUR } from '../src/lib/format';
import { animationsDone, eur, expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

// Sheet „Einmalige Zahlung“: the subtitle says what calc does with the payment, the fields sit on one
// spacing scale without an empty gap under „Betrag“.

const SUB_SAVINGS = 'für Oktober 2026 · zählt zum Vermögensaufbau';
const SUB_EXPENSE = 'für Oktober 2026 · zählt zu den Fixkosten dieses Monats';

async function openSheet(page: Page) {
  await page.getByTestId('add-once').click();
  await animationsDone(page, 'bottom-sheet');
  return page.getByRole('dialog');
}

async function addOnce(page: Page, category: string, name: string, amount: string) {
  const sheet = await openSheet(page);
  await sheet.getByLabel('Kategorie').selectOption({ label: category });
  await sheet.getByLabel('Name').fill(name);
  await sheet.getByLabel('Betrag').fill(amount);
  await sheet.getByLabel('Fällig am').fill('2026-10-28');
  await sheet.getByRole('button', { name: 'Zahlung anlegen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('Sheet „Einmalige Zahlung“', () => {
  test('Untertitel je Kategorie, Monat folgt dem Fälligkeitsdatum', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const sheet = await openSheet(page);
    await sheet.getByLabel('Kategorie').selectOption({ label: 'Sonstiges' });
    await expect(sheet.getByText(SUB_EXPENSE, { exact: true })).toBeVisible();
    await sheet.getByLabel('Kategorie').selectOption({ label: 'Investieren (Vermögensaufbau)' });
    await expect(sheet.getByText(SUB_SAVINGS, { exact: true })).toBeVisible();
    await sheet.getByLabel('Fällig am').fill('2026-11-03');
    await expect(sheet.getByText('für November 2026 · zählt zum Vermögensaufbau', { exact: true })).toBeVisible();
  });

  test('Untertitel stimmt mit calc: Investieren → Vermögensaufbau, Sonstiges → Fixkosten des Monats', async ({ page }) => {
    const f = monthFigures(liveDataset(), OKT);
    await importLive(page, OKT_TODAY);
    await expect(page.getByTestId('hero-planned')).toHaveText(eur(formatEUR(f.total)));
    await expect(page.getByTestId('wealth-value')).toHaveText(eur(formatEUR(f.wealth)));

    await addOnce(page, 'Investieren (Vermögensaufbau)', 'Test Sparen', '100');
    await expect(page.getByTestId('wealth-value')).toHaveText(eur(formatEUR(f.wealth + 100)));
    await expect(page.getByTestId('hero-planned')).toHaveText(eur(formatEUR(f.total)));

    await addOnce(page, 'Sonstiges', 'Test Reparatur', '50');
    await expect(page.getByTestId('hero-planned')).toHaveText(eur(formatEUR(f.total + 50)));
    await expect(page.getByTestId('wealth-value')).toHaveText(eur(formatEUR(f.wealth + 100)));
  });

  for (const category of ['Sonstiges', 'Investieren (Vermögensaufbau)']) {
    test(`Abstände ${category}: keine Lücke unter „Betrag“, Felder auf einer Skala`, async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const sheet = await openSheet(page);
      await sheet.getByLabel('Kategorie').selectOption({ label: category });
      await sheet.getByLabel('Name').fill('Test');
      await sheet.getByLabel('Betrag').fill('100');
      // no empty hint row under „Betrag“
      const amountField = sheet.getByLabel('Betrag').locator('xpath=ancestor::div[label][1]');
      await expect(amountField.locator('p')).toHaveCount(0);
      const m = await page.getByTestId('position-form').evaluate((form) => {
        const rows = [...form.children].filter((c) => c.getBoundingClientRect().height > 0 && !c.matches('div:last-child:has(button[type=submit])'));
        return rows.map((c) => {
          const label = c.querySelector(':scope > label, :scope > [id]:not(p)');
          const box = label?.nextElementSibling;
          const parts = [...c.children].filter((e) => e.getBoundingClientRect().height > 0);
          return {
            top: c.getBoundingClientRect().top,
            // last thing you see in the field: hint, box or the row itself
            bottom: parts.length ? Math.max(...parts.map((e) => e.getBoundingClientRect().bottom)) : c.getBoundingClientRect().bottom,
            labelGap: label && box ? box.getBoundingClientRect().top - label.getBoundingClientRect().bottom : null,
            name: label?.textContent ?? c.textContent!.slice(0, 20),
          };
        });
      });
      expect(m.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < m.length; i++) {
        expect(Math.round(m[i]!.top - m[i - 1]!.bottom), `${m[i - 1]!.name} → ${m[i]!.name}`).toBe(16);
      }
      for (const r of m) if (r.labelGap !== null) expect(Math.round(r.labelGap), `${r.name}: label → field`).toBe(8);
    });
  }
});
