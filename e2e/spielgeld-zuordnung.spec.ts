import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, isTouchProject, setUpKonto, test, TODAY } from './fixtures';

// Absicherung (ruecklage-spielgeld, Ergänzung 2): `account: spielgeld` bleibt erhalten – beim Speichern im
// Bearbeiten-Dialog (wiederkehrend: Miete; einmalig: Konzert), beim Monatswechsel, beim Neuladen, im
// Abgleich Position ↔ Monats-Instanz (Positionen-Chip, Hero „Spielgeld“, Spielgeld-Karte, Dialog) und bei
// Export → Import in eine leere App. Seed-Daten, heute 5. Oktober 2026. Läuft auf Desktop und iPhone 15.

const tap = (l: Locator) => (isTouchProject() ? l.tap() : l.click());

async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

/** the edit dialog of a position shows „Spielgeld“ chosen, then closes without saving */
async function dialogSaysSpielgeld(page: Page, details: Locator) {
  await tap(details);
  await sheetIn(page);
  await tap(page.getByRole('button', { name: 'Bearbeiten' }));
  await sheetIn(page);
  await expect(page.getByTestId('account-field').getByRole('radio', { name: 'Spielgeld' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('position-form')).toHaveCount(0);
  if (await page.getByRole('dialog').count()) {
    await sheetIn(page);
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** everything that shows the assignment: chip, dialogs, hero row, the Spielgeld card (October and November) */
async function stillSpielgeld(page: Page) {
  await goTo(page, 'positionen');
  await expect(page.locator('[data-testid=position-list-row]', { hasText: 'Miete' }).first().getByTestId('account-chip')).toHaveText('Spielgeld');
  await dialogSaysSpielgeld(page, page.getByRole('button', { name: 'Miete – Details' }));
  await goTo(page, 'monat');
  const title = page.getByRole('heading', { level: 1 });
  if ((await title.textContent()) !== 'Oktober 2026') await tap(page.getByRole('button', { name: /Zum aktiven Monat/ }));
  await expect(title).toHaveText('Oktober 2026');
  await expect(page.getByTestId('hero-source-spielgeld-value')).toHaveText(/^€\s1\.008,00$/);
  await expect(page.getByTestId('spielgeld-items')).toContainText('Miete');
  // November: the monthly instance and the one-time payment, both on the Spielgeld
  await tap(page.getByRole('button', { name: 'Nächster Monat' }));
  await expect(title).toHaveText('November 2026');
  await expect(page.getByTestId('spielgeld-items')).toContainText('Miete');
  await expect(page.getByTestId('spielgeld-items')).toContainText('Konzert');
  await expect(page.getByTestId('hero-source-spielgeld-value')).toHaveText(/^€\s1\.097,90$/);
  await dialogSaysSpielgeld(page, page.getByRole('button', { name: 'Konzert – Details' }));
  await tap(page.getByRole('button', { name: 'Vorheriger Monat' }));
}

test.describe('Spielgeld-Zuordnung bleibt erhalten', () => {
  test.beforeEach(() => test.skip(!['desktop', 'iphone-15'].includes(test.info().project.name), 'Desktop und iPhone 15'));
  test.setTimeout(180_000);

  test('Speichern, Monatswechsel, Neuladen, Abgleich, Export → Import', async ({ page, browser }) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await page.getByTestId('import-file').setInputFiles(FIXTURE);
    await expect(page.getByTestId('hero')).toBeVisible();
    await appSettled(page);
    await page.getByTestId('konto-invite-enable').click();
    await setUpKonto(page);
    await goTo(page, 'einstellungen');
    await page.getByTestId('konto-spielgeld').fill('2.000,00');

    // recurring: Miete → Spielgeld, saved in the edit dialog
    await goTo(page, 'positionen');
    await tap(page.getByRole('button', { name: 'Miete – Details' }));
    await sheetIn(page);
    await tap(page.getByRole('button', { name: 'Bearbeiten' }));
    await sheetIn(page);
    await tap(page.getByTestId('account-field').getByRole('radio', { name: 'Spielgeld' }));
    await tap(page.getByRole('button', { name: 'Speichern' }));
    await expect(page.getByTestId('position-form')).toHaveCount(0);
    await sheetIn(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // one-time: „Konzert“ in November on the Spielgeld
    await goTo(page, 'monat');
    await tap(page.getByRole('button', { name: 'Nächster Monat' }));
    await tap(page.getByTestId('add-once'));
    await sheetIn(page);
    const form = page.getByTestId('position-form');
    await form.getByLabel('Name').fill('Konzert');
    await form.getByLabel('Kategorie').selectOption({ label: 'Wohnen & Leben' });
    await form.getByLabel('Betrag').fill('89,90');
    await form.getByLabel('Fällig am').fill('2026-11-20');
    await tap(page.getByTestId('account-field').getByRole('radio', { name: 'Spielgeld' }));
    await tap(form.getByRole('button', { name: 'Zahlung anlegen' }));
    await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
    // saved again without a change of the account (name only): stays
    await tap(page.getByRole('button', { name: 'Konzert – Details' }));
    await sheetIn(page);
    await tap(page.getByRole('button', { name: 'Bearbeiten' }));
    await sheetIn(page);
    await page.getByTestId('position-form').getByLabel('Name').fill('Konzert');
    await page.getByTestId('position-form').getByLabel('Notiz').fill('mit Freunden');
    await tap(page.getByRole('button', { name: 'Speichern' }));
    await expect(page.getByTestId('position-form')).toHaveCount(0);
    if (await page.getByRole('dialog').count()) {
      await sheetIn(page);
      await page.keyboard.press('Escape');
    }
    await tap(page.getByRole('button', { name: 'Vorheriger Monat' }));

    // month changes back and forth
    for (const name of ['Nächster Monat', 'Nächster Monat', 'Vorheriger Monat', 'Vorheriger Monat']) await tap(page.getByRole('button', { name }));
    await stillSpielgeld(page);

    // reload
    await page.reload();
    await expect(page.getByTestId('hero')).toBeVisible();
    await appSettled(page);
    await stillSpielgeld(page);

    // export → import into an empty app
    await goTo(page, 'einstellungen');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren' }).click()]);
    const file = await download.path();
    const json = JSON.parse(readFileSync(file!, 'utf8'));
    const positions = (json.data?.positions ?? json.positions) as { name: string; account?: string }[];
    expect(positions.find((p) => p.name === 'Miete')?.account).toBe('spielgeld');
    expect(positions.find((p) => p.name === 'Konzert')?.account).toBe('spielgeld');
    const fresh = await browser.newContext({ viewport: page.viewportSize()!, hasTouch: isTouchProject() });
    const other = await fresh.newPage();
    await other.clock.setFixedTime(TODAY);
    await other.goto('/');
    await other.getByTestId('import-file').setInputFiles(file!);
    await expect(other.getByTestId('hero')).toBeVisible();
    await appSettled(other);
    await stillSpielgeld(other);
    await fresh.close();
  });
});
