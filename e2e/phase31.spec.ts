import type { Page } from '@playwright/test';
import { openAnalyse } from './analyse-helpers';
import { animationsDone, eur, expect, goTo, isTouchProject, row, test } from './fixtures';
import { expectClean } from './measure';

async function tap(_page: Page, locator: ReturnType<Page['locator']>) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

async function sheetReady(page: Page) {
  await expect(page.getByTestId('bottom-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

/** Forecast table cell „Fällig“ of a month (table alternative of the chart). */
async function forecastDue(page: Page, month: string): Promise<string> {
  const cells = page.getByTestId('forecast').locator('tbody tr', { hasText: month }).locator('td');
  return ((await cells.first().textContent()) ?? '').replace(/ /g, ' ');
}

async function createRepair(page: Page) {
  await goTo(page, 'positionen');
  await tap(page, page.getByRole('button', { name: 'Position hinzufügen' }));
  await sheetReady(page);
  const form = page.getByTestId('position-form');
  await form.getByLabel('Name').fill('Reparatur');
  await form.getByLabel('Kategorie').selectOption({ label: 'Wohnen & Leben' });
  await form.getByLabel('Betrag').fill('500');
  await form.getByRole('radio', { name: 'Einmalig' }).click();
  await expect(page.getByTestId('once-hint')).toContainText('Strom-Nachzahlung');
  await expect(form.getByLabel('Startmonat')).toHaveCount(0);
  const date = form.getByLabel('Fällig am');
  await expect(date).toHaveAttribute('type', 'date');
  await date.fill('2026-11-15');
  await expect(page.getByTestId('due-date-hint')).toContainText('Sonntag, 15.11.2026');
  await expectClean(page, '[data-testid="bottom-sheet"]');
  await form.getByRole('button', { name: 'Position anlegen' }).click();
  await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
}

async function openMiete(page: Page) {
  await goTo(page, 'positionen');
  await tap(page, page.getByRole('button', { name: 'Miete – Details' }));
  await sheetReady(page);
}

async function changeMiete(page: Page, amount: string, date: string, reason?: string) {
  await openMiete(page);
  await page.getByTestId('position-detail').getByRole('button', { name: 'Betrag ändern' }).click();
  await sheetReady(page);
  const form = page.getByTestId('amount-change-form');
  await form.getByLabel('Neuer Betrag').fill(amount);
  await form.getByLabel('Gültig ab').fill(date);
  if (reason) await form.getByLabel('Grund').fill(reason);
}

test.describe('Einmalig', () => {
  test('anlegen 15.11.2026 → nur im November → abhaken → „Einmalige Zahlungen / erledigt“', async ({ app }) => {
    await createRepair(app);
    // upcoming: still in the active list of its category, and in the collapsed section
    const wohnen = app.getByRole('region', { name: 'Wohnen & Leben' });
    await expect(wohnen.getByTestId('position-list-row').filter({ hasText: 'Reparatur' })).toContainText('Einmalig · fällig 15.11.2026');
    await app.getByTestId('once-section').getByRole('button', { name: /Einmalige Zahlungen/ }).click();
    await expect(app.getByTestId('once-upcoming')).toContainText('Reparatur');

    // month screen: not in October, only in November
    await goTo(app, 'monat');
    await expect(app.getByTestId('position-row').filter({ hasText: 'Reparatur' })).toHaveCount(0);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    const repair = app.getByTestId('position-row').filter({ hasText: 'Reparatur' });
    await expect(repair).toBeVisible();
    await expect(repair).toContainText('Einmalig · 15.11.');
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.164'));
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByTestId('position-row').filter({ hasText: 'Reparatur' })).toHaveCount(0);
    await app.getByRole('button', { name: 'Vorheriger Monat' }).click();

    // tick it like everything else
    await tap(app, app.getByTestId('position-row').filter({ hasText: 'Reparatur' }).getByTestId('toggle-paid'));
    await expect(app.getByTestId('position-row').filter({ hasText: 'Reparatur' })).toHaveAttribute('data-paid', 'true');

    await goTo(app, 'positionen');
    await expect(wohnen.getByTestId('position-list-row').filter({ hasText: 'Reparatur' })).toHaveCount(0);
    await app.getByTestId('once-section').getByRole('button', { name: /Einmalige Zahlungen/ }).click();
    const done = app.getByTestId('once-done');
    await expect(done).toContainText('Reparatur');
    await expect(done).toContainText('15.11.2026');
    await expect(done).toContainText('bezahlt');
    await expect(app.getByTestId('once-upcoming')).toHaveCount(0);
    await expectClean(app, 'main');

    // analysis: own part in the forecast, never part of Ø pro Monat
    await openAnalyse(app);
    expect(await forecastDue(app, 'November 2026')).toBe('€ 3.164');
    await expect(app.getByTestId('forecast').locator('tbody tr', { hasText: 'November 2026' })).toContainText(eur('Reparatur (einmalig) € 500'));
    await expect(app.getByTestId('forecast').locator('.bar-once').first()).toBeAttached();
    await expect(app.getByTestId('distribution')).toContainText(eur('Summe € 2.952,17'));
    await expect(app.getByTestId('optimizations-empty')).toBeVisible();
  });

  test('unbezahlt im vergangenen Monat → „Offen aus …“', async ({ app }) => {
    await createRepair(app);
    await goTo(app, 'monat');
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    // October (Depotentgelt) and November are open → „Offen aus Vormonaten“
    await app.getByRole('button', { name: /Offen aus/ }).click();
    const open = app.getByTestId('open-item').filter({ hasText: 'Reparatur' });
    await expect(open).toContainText(eur('€ 500 · November 2026'));
    await expect(open.getByRole('button', { name: 'Bezahlt' })).toBeVisible();
  });
});

test.describe('Betrag ändern', () => {
  test('Zukunft: Badge sichtbar, Jahresvorschau korrekt, aktueller Monat unverändert', async ({ app }) => {
    await changeMiete(app, '1050', '2027-04-01', 'Indexanpassung');
    await expect(app.getByTestId('changed-on-hint')).toContainText('Donnerstag, 01.04.2027 · gilt ab April 2027');
    await expect(app.getByTestId('change-preview')).toHaveText(eur('bisher € 1.008 · +€ 42 / Monat · +€ 504 / Jahr'));
    await expectClean(app, '[data-testid="bottom-sheet"]');
    await app.getByTestId('amount-change-form').getByRole('button', { name: 'Betrag ändern' }).click();

    // detail: timeline with date, old → new, per month / per year, reason
    const entries = app.getByTestId('history-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText('ab 01.04.2027');
    await expect(entries.first()).toContainText('geplant');
    await expect(entries.first()).toContainText(eur('€ 1.008 → € 1.050'));
    await expect(entries.first()).toContainText(eur('+€ 42 / Monat · +€ 504 / Jahr'));
    await expect(entries.first()).toContainText('Indexanpassung');
    await expect(entries.last()).toContainText('Beginn · Oktober 2026');
    await expect(entries.last().getByRole('button', { name: /löschen/ })).toHaveCount(0); // first entry stays
    await expect(app.getByTestId('detail-next-change')).toHaveText(eur('Ab 01.04.2027: € 1.050'));
    await sheetReady(app);
    await expectClean(app, '[data-testid="bottom-sheet"]');
    await app.keyboard.press('Escape');

    await expect(row(app, 'pos-miete').getByTestId('next-change')).toHaveText(eur('Ab 01.04.2027: € 1.050'));
    await goTo(app, 'monat');
    await expect(row(app, 'pos-miete').getByTestId('next-change')).toHaveText(eur('Ab 01.04.2027: € 1.050'));
    await expect(row(app, 'pos-miete')).toContainText(eur('€ 1.008'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));

    await openAnalyse(app);
    expect(await forecastDue(app, 'März 2027')).toBe('€ 2.664');
    expect(await forecastDue(app, 'April 2027')).toBe('€ 2.755');
    await expect(app.getByTestId('optimizations-headline')).toHaveText(eur('Geplant: +€ 504 / Jahr'));
    await expect(app.getByTestId('optimizations-planned')).toContainText('geplant');
  });

  test('Verlaufseintrag bearbeiten und löschen → Werte rechnen zurück, Undo funktioniert', async ({ app }) => {
    await changeMiete(app, '1050', '2027-04-01');
    await app.getByTestId('amount-change-form').getByRole('button', { name: 'Betrag ändern' }).click();
    await app.getByRole('button', { name: 'Änderung ab 01.04.2027 auf € 1.050 ändern' }).click();
    await sheetReady(app);
    const form = app.getByTestId('amount-change-form');
    await expect(form.getByLabel('Neuer Betrag')).toHaveValue('1050');
    await form.getByLabel('Neuer Betrag').fill('1100');
    await form.getByLabel('Gültig ab').fill('2027-01-15');
    await expect(app.getByTestId('changed-on-hint')).toContainText('gilt ab Jänner 2027');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('history-entry').first()).toContainText('ab 15.01.2027');
    await expect(app.getByTestId('history-entry').first()).toContainText(eur('+€ 92 / Monat · +€ 1.104 / Jahr'));
    await app.keyboard.press('Escape');

    await openAnalyse(app);
    expect(await forecastDue(app, 'Jänner 2027')).toBe('€ 2.805');
    await expect(app.getByTestId('optimizations-headline')).toHaveText(eur('Geplant: +€ 1.104 / Jahr'));

    await openMiete(app);
    await app.getByRole('button', { name: 'Änderung ab 15.01.2027 auf € 1.100 löschen' }).click();
    await expect(app.getByTestId('history-entry')).toHaveCount(1);
    const undo = app.getByRole('button', { name: 'Rückgängig' });
    await expect(undo).toBeVisible();
    await app.keyboard.press('Escape');
    await openAnalyse(app);
    expect(await forecastDue(app, 'Jänner 2027')).toBe('€ 2.713');
    await expect(app.getByTestId('optimizations-empty')).toBeVisible();

    await undo.click();
    await expect(app.getByTestId('optimizations-headline')).toHaveText(eur('Geplant: +€ 1.104 / Jahr'));
    expect(await forecastDue(app, 'Jänner 2027')).toBe('€ 2.805');
  });

  test('Vergangenheit: Oktober schon mit € 1.008 abgehakt → Haken bleibt, Plan € 1.050, −€ 42', async ({ app }) => {
    await changeMiete(app, '1050', '2026-10-01');
    await expect(app.getByTestId('ticked-note')).toHaveText(eur('Oktober bereits mit € 1.008 abgehakt – der Haken bleibt unverändert.'));
    await app.getByTestId('amount-change-form').getByRole('button', { name: 'Betrag ändern' }).click();
    await expect(app.getByTestId('history-entry').first()).toContainText('ab 01.10.2026');
    await expect(app.getByTestId('history-entry').first()).not.toContainText('geplant');
    await app.keyboard.press('Escape');
    await goTo(app, 'monat');
    const miete = row(app, 'pos-miete');
    await expect(miete).toHaveAttribute('data-paid', 'true');
    await expect(miete).toContainText(eur('€ 1.008'));
    await expect(miete).toContainText(eur('−€ 42'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.445'));
    await openAnalyse(app);
    await expect(app.getByTestId('optimizations-headline')).toHaveText(eur('Umgesetzt: +€ 504 / Jahr'));
  });

  test('Tippfehler korrigieren bleibt eigene Option ohne Verlaufseintrag', async ({ app }) => {
    await openMiete(app);
    await app.getByTestId('position-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await sheetReady(app);
    await app.getByTestId('position-form').getByLabel('Betrag').fill('1010');
    await app.getByTestId('change-mode').getByLabel(/Tippfehler korrigieren/).check();
    await app.getByTestId('position-form').getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('history-entry')).toHaveCount(1);
    await expect(app.getByTestId('detail-amount')).toHaveText(eur('€ 1.010'));
    await app.keyboard.press('Escape');
    await openAnalyse(app);
    await expect(app.getByTestId('optimizations-empty')).toBeVisible();
  });
});

test.describe('Datumsfelder', () => {
  test('nativer Date-Picker (type=date), Anzeige TT.MM.JJJJ, Monatsnamen de-AT', async ({ app }) => {
    await changeMiete(app, '1050', '2027-01-15');
    const input = app.getByTestId('changed-on');
    await expect(input).toHaveAttribute('type', 'date');
    await expect(input).toHaveValue('2027-01-15');
    await expect(app.getByTestId('changed-on-hint')).toHaveText('Freitag, 15.01.2027 · gilt ab Jänner 2027');
    // the field opens the platform picker on tap (iOS: wheel picker); here: it takes focus and a value
    await tap(app, input);
    await expect(input).toBeFocused();
    expect(await input.evaluate((el) => typeof (el as HTMLInputElement).showPicker)).toBe('function');
    await input.fill('');
    await expect(app.getByTestId('amount-change-form').getByRole('button', { name: 'Betrag ändern' })).toBeDisabled();
  });

  test('Tastatur (Desktop): Esc schließt, Fokus kehrt zurück', async ({ app }) => {
    test.skip(isTouchProject(), 'desktop only');
    await goTo(app, 'positionen');
    const trigger = app.getByRole('button', { name: 'Miete – Details' });
    await trigger.focus();
    await app.keyboard.press('Enter');
    await sheetReady(app);
    await app.getByTestId('position-detail').getByRole('button', { name: 'Betrag ändern' }).focus();
    await app.keyboard.press('Enter');
    await sheetReady(app);
    const input = app.getByTestId('changed-on');
    await expect(input).toHaveValue('2026-10-05');
    await input.focus();
    // arrow keys step the focused part of the date (order of the parts follows the browser language)
    await app.keyboard.press('ArrowUp');
    await expect(input).not.toHaveValue('2026-10-05');
    await expect(input).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await app.keyboard.press('Escape');
    await expect(app.getByTestId('position-detail')).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.getByTestId('bottom-sheet')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
