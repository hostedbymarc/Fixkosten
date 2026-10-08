import { eur, expect, row, test } from './fixtures';

test.describe('Monat-Screen (Seed Oktober 2026)', () => {
  test('hero shows € 3.368 von € 3.403 and 1 open position', async ({ app }) => {
    await expect(app.getByRole('heading', { level: 1, name: 'Oktober 2026' })).toBeVisible();
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.368'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
    await expect(app.getByTestId('hero-open')).toHaveText(eur('1 offen · € 35'));
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'false');
    await expect(row(app, 'pos-amex-gebuehr')).toContainText('Jährlich · 3.10.');
    await expect(row(app, 'pos-depotentgelt')).toContainText('Quartal');
  });

  test('KPI tiles', async ({ app }) => {
    await expect(app.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
    await expect(app.getByText('Fällig diesen Monat')).toHaveCount(0); // replaced by Netto-Gehalt; the hero shows „von € 3.403“
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(
      eur('Jahreskosten verteilt · davon € 288,17 für Quartals- & Jahreszahlungen'),
    );
    await expect(app.getByTestId('free-tile')).not.toContainText('Gehalt eintragen');
  });

  test('one tap on circle marks paid, tap again removes with undo', async ({ app }) => {
    const depot = row(app, 'pos-depotentgelt');
    await depot.getByTestId('toggle-paid').click();
    await expect(depot).toHaveAttribute('data-paid', 'true');
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.403'));
    await expect(app.getByText('Alles abgebucht')).toBeVisible();

    await depot.getByTestId('toggle-paid').click();
    await expect(depot).toHaveAttribute('data-paid', 'false');
    await app.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(depot).toHaveAttribute('data-paid', 'true');
  });

  test('bottom sheet: change actual amount shows delta chip', async ({ app }) => {
    await row(app, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
    const sheet = app.getByRole('dialog', { name: 'Strom' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Tatsächlich abgebucht').fill('76');
    await expect(sheet).toContainText(eur('+€ 12 gegenüber Plan'));
    await sheet.getByLabel('Notiz').fill('Teilbetrag erhöht');
    await sheet.getByRole('button', { name: 'Speichern' }).click();
    await expect(sheet).toBeHidden();
    await expect(row(app, 'pos-strom')).toContainText(eur('+€ 12'));
    await expect(row(app, 'pos-strom')).toContainText('Teilbetrag erhöht');
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.380'));

    // cheaper → green
    await row(app, 'pos-lebensmittel').getByRole('button', { name: /Details/ }).click();
    await app.getByLabel('Tatsächlich abgebucht').fill('475');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(row(app, 'pos-lebensmittel')).toContainText(eur('−€ 5'));
  });

  test('bottom sheet: pay open position with different amount, then remove tick', async ({ app }) => {
    await row(app, 'pos-depotentgelt').getByRole('button', { name: /Details/ }).click();
    await app.getByLabel('Tatsächlich abgebucht').fill('36,90');
    await app.getByRole('button', { name: 'Als bezahlt speichern' }).click();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true');
    await expect(row(app, 'pos-depotentgelt')).toContainText(eur('+€ 1,90'));

    await row(app, 'pos-depotentgelt').getByRole('button', { name: /Details/ }).click();
    await app.getByRole('button', { name: 'Haken entfernen' }).click();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'false');
    await expect(app.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
  });

  test('sheet closes with Esc and locks background scroll', async ({ app }) => {
    await row(app, 'pos-miete').getByRole('button', { name: /Details/ }).click();
    await expect(app.getByRole('dialog')).toBeVisible();
    expect(await app.evaluate(() => document.body.style.position)).toBe('fixed');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toBeHidden();
    expect(await app.evaluate(() => document.body.style.position)).toBe('');
  });

  test('invalid amount disables saving', async ({ app }) => {
    await row(app, 'pos-miete').getByRole('button', { name: /Details/ }).click();
    await app.getByLabel('Tatsächlich abgebucht').fill('abc');
    await expect(app.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await expect(app.getByText('Bitte einen Betrag eingeben')).toBeVisible();
  });

  test('data persists after reload', async ({ app }) => {
    await row(app, 'pos-depotentgelt').getByTestId('toggle-paid').click();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true');
    await app.reload();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true');
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.403'));
  });

  test('month navigation: November reminder, new month starts empty, Feb 2027 = € 4.610', async ({ app }) => {
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByRole('heading', { level: 1, name: 'November 2026' })).toBeVisible();
    await expect(app.getByText('Jahresabrechnung Strom/Gas/Wiener Netze')).toBeVisible();
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 0'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.664'));

    for (let i = 0; i < 3; i++) await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByRole('heading', { level: 1, name: 'Februar 2027' })).toBeVisible();
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 4.610'));
  });

  test('Meine Immos: first group; Baurechtszins only in Kommt bald for October, due in December', async ({ app }) => {
    const groups = app.getByTestId('category-group');
    await expect(groups.first()).toHaveAttribute('aria-label', 'Meine Immos');
    const immos = app.getByRole('region', { name: 'Meine Immos' });
    await expect(immos.getByTestId('position-row')).toHaveCount(3);
    await expect(immos).toContainText(eur('€ 991'));
    // Baurechtszins belongs to the category even when not due: visible in the spread amount
    await expect(immos.getByTestId('group-spread')).toHaveText(eur('Ø € 1.034,67 / Monat'));
    await expect(app.getByRole('region', { name: 'Wohnen & Leben' }).getByTestId('group-spread')).toHaveCount(0);
    await expect(row(app, 'pos-baurechtszins')).toHaveCount(0);
    await expect(app.getByRole('region', { name: 'Kommt bald' })).toContainText('Baurechtszins');

    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByRole('heading', { level: 1, name: 'Dezember 2026' })).toBeVisible();
    await expect(immos.getByTestId('position-row')).toHaveCount(4);
    await expect(immos).toContainText(eur('€ 1.253,02'));
    await expect(row(app, 'pos-baurechtszins')).toBeVisible();
  });

  test('no "variabel" badge anywhere', async ({ app }) => {
    await expect(app.getByText('variabel', { exact: true })).toHaveCount(0);
  });

  test('upcoming shows December payments', async ({ app }) => {
    const upcoming = app.getByRole('region', { name: 'Kommt bald' });
    await expect(upcoming).toContainText('Baurechtszins');
    await expect(upcoming).toContainText(eur('€ 262,02'));
    await expect(upcoming).toContainText('Parqet');
  });
});
