import { eur, expect, goTo, isSidebarLayout, isTouchProject, row, test, touchSwipe } from './fixtures';
import type { Page } from '@playwright/test';

const listRow = (page: Page, name: string) =>
  page.getByTestId('position-list-row').filter({ has: page.getByRole('button', { name: `${name} – Details`, exact: true }) });

async function openDetail(page: Page, name: string) {
  await goTo(page, 'positionen');
  await page.getByRole('button', { name: `${name} – Details`, exact: true }).click();
  await expect(page.getByTestId('position-detail')).toBeVisible();
}

async function nextMonth(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'Nächster Monat' }).click();
}

test.describe('Positionen verwalten', () => {
  test('create quarterly position starting in February → due Feb/May/Aug/Nov', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Position hinzufügen' }).click();
    const form = app.getByTestId('position-form');
    const save = form.getByRole('button', { name: 'Position anlegen' });
    await expect(save).toBeDisabled();

    await form.getByLabel('Name').fill('KFZ-Versicherung');
    await form.getByLabel('Kategorie').selectOption({ label: 'Mobilität' });
    await form.getByLabel('Betrag').fill('0');
    await expect(form.getByText('Der Betrag muss größer als 0 sein.')).toBeVisible();
    await expect(save).toBeDisabled();
    await form.getByLabel('Betrag').fill('120,50');
    await form.getByRole('radio', { name: 'Quartal' }).click();
    await form.getByLabel('Startmonat').selectOption({ label: 'Feb' });
    for (const m of ['Feb', 'Mai', 'Aug', 'Nov']) await expect(form.getByRole('button', { name: m, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(form.getByRole('button', { name: 'Okt', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(form).toContainText(eur('Ø € 40,17 pro Monat'));
    await expect(form.getByLabel('Betrag')).toHaveAttribute('inputmode', 'decimal');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(form).toBeHidden();
    await expect(listRow(app, 'KFZ-Versicherung')).toContainText('Quartal · Feb, Mai, Aug, Nov');

    await goTo(app, 'monat');
    const kfz = app.getByRole('button', { name: 'KFZ-Versicherung – Details' });
    await expect(kfz).toHaveCount(0); // October
    await nextMonth(app);
    await expect(kfz).toBeVisible(); // November
    await nextMonth(app);
    await expect(kfz).toHaveCount(0); // December
    await nextMonth(app, 2);
    await expect(app.getByRole('heading', { level: 1, name: 'Februar 2027' })).toBeVisible();
    await expect(kfz).toBeVisible();
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 4.730,50'));
  });

  test('change amount from next month: October unchanged, November new', async ({ app }) => {
    await openDetail(app, 'Handy');
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    const form = app.getByTestId('position-form');
    await form.getByLabel('Betrag').fill('8');
    const mode = form.getByTestId('change-mode');
    await expect(mode).toBeVisible();
    await expect(mode.getByRole('radio', { name: /Ab wann gilt das/ })).toBeChecked();
    await mode.getByLabel('Gilt ab').selectOption({ label: 'November 2026' });
    await form.getByRole('button', { name: 'Speichern' }).click();
    // the history shows the change with its date (first of the month for „Ab wann gilt das?“)
    await expect(app.getByTestId('detail-timeline')).toContainText('ab 01.11.2026');
    await expect(app.getByTestId('detail-timeline')).toContainText(eur('€ 10 → € 8'));
    await app.keyboard.press('Escape');

    await goTo(app, 'monat');
    await expect(row(app, 'pos-handy')).toContainText(eur('€ 10'));
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));
    await nextMonth(app);
    await expect(row(app, 'pos-handy')).toContainText(eur('€ 8'));
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.950,17'));
  });

  test('typo correction: plan overwritten, ticked October keeps € 10', async ({ app }) => {
    await openDetail(app, 'Handy');
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    const form = app.getByTestId('position-form');
    await form.getByLabel('Betrag').fill('8');
    await form.getByRole('radio', { name: /Tippfehler korrigieren/ }).check();
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('detail-amount')).toHaveText(eur('€ 8'));
    // a typo correction is no change: no history entry
    await expect(app.getByTestId('history-entry')).toHaveCount(1);
    await expect(app.getByTestId('detail-timeline')).toContainText(eur('€ 8'));
    await app.keyboard.press('Escape');
    await expect(listRow(app, 'Handy')).toContainText(eur('€ 8'));

    await goTo(app, 'monat');
    await expect(row(app, 'pos-handy')).toContainText(eur('€ 10')); // ticked: snapshot
    await expect(app.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.950,17'));
  });

  test('name and note change without asking', async ({ app }) => {
    await openDetail(app, 'Gym');
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    const form = app.getByTestId('position-form');
    await form.getByLabel('Name').fill('Fitnessstudio');
    await expect(form.getByTestId('change-mode')).toHaveCount(0);
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByRole('dialog', { name: 'Fitnessstudio' })).toBeVisible();
  });

  test('archive → undo → back; archive → Archiv → restore', async ({ app }) => {
    await goTo(app, 'positionen');
    const gym = listRow(app, 'Gym');
    if (isTouchProject()) {
      await touchSwipe(app, gym, -(await gym.boundingBox())!.width * 0.75);
    } else {
      await gym.getByRole('button', { name: 'Aktionen für Gym' }).click();
      await app.getByRole('menuitem', { name: 'Archivieren' }).click();
    }
    await expect(gym).toHaveCount(0);
    await app.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(gym).toBeVisible();

    if (isTouchProject()) {
      // short swipe reveals the button, tap archives
      await touchSwipe(app, gym, -70);
      await app.getByRole('button', { name: 'Archivieren', exact: true }).first().click();
    } else {
      await gym.getByRole('button', { name: 'Gym – Details' }).focus();
      await app.keyboard.press('Delete');
    }
    await expect(gym).toHaveCount(0);

    await goTo(app, 'einstellungen');
    const archived = app.getByTestId('archive-list').locator('[data-position="pos-gym"]');
    await expect(archived).toContainText('archiviert seit Oktober 2026');
    await archived.getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect(app.getByTestId('archive-list')).toHaveCount(0);
    await goTo(app, 'positionen');
    await expect(listRow(app, 'Gym')).toBeVisible();
  });

  test('vertical scroll gesture never archives', async ({ app }) => {
    test.skip(!isTouchProject(), 'touch only');
    await goTo(app, 'positionen');
    const gym = listRow(app, 'Gym');
    await touchSwipe(app, gym, -30, 120);
    await expect(gym).toBeVisible();
    await expect(app.getByRole('button', { name: 'Rückgängig' })).toHaveCount(0);
  });

  test('delete permanently from the archive with payment count', async ({ app }) => {
    await openDetail(app, 'Gym');
    await app.getByTestId('position-detail').getByRole('button', { name: 'Archivieren' }).click();
    await goTo(app, 'einstellungen');
    await app.getByTestId('archive-list').getByRole('button', { name: 'Löschen' }).click();
    const confirm = app.getByTestId('confirm-sheet');
    await expect(confirm).toContainText('Dabei werden auch 1 Zahlung gelöscht.');
    await confirm.getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(app.getByText('Keine archivierten Positionen.', { exact: false })).toBeVisible();
    await goTo(app, 'monat');
    await expect(row(app, 'pos-gym')).toHaveCount(0);
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.333'));
  });
});

test.describe('Kategorien', () => {
  test('create a category, delete a non-empty one via the move dialog', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Kategorien' }).click();
    await app.getByRole('button', { name: 'Neue Kategorie' }).click();
    const form = app.getByTestId('category-form');
    await form.getByLabel('Name').fill('Kinder');
    await form.getByRole('radio', { name: 'Petrol' }).click();
    await form.getByRole('button', { name: 'Kategorie anlegen' }).click();
    await expect(app.getByTestId('categories-list')).toContainText('Kinder');

    await app.getByRole('button', { name: 'Mobilität bearbeiten' }).click();
    await app.getByRole('button', { name: 'Kategorie löschen' }).click();
    const move = app.getByTestId('move-dialog');
    await expect(move).toContainText('enthält 1 Position');
    await move.getByLabel('1 Position verschieben nach …').selectOption({ label: 'Wohnen & Leben' });
    await move.getByRole('button', { name: 'Verschieben und löschen' }).click();
    await expect(app.getByTestId('categories-list')).not.toContainText('Mobilität');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('region', { name: 'Wohnen & Leben' })).toContainText('Offi (Jahreskarte)');
  });

  test('empty category is deleted directly with undo', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Kategorien' }).click();
    await app.getByRole('button', { name: 'Neue Kategorie' }).click();
    await app.getByTestId('category-form').getByLabel('Name').fill('Testkategorie');
    await app.getByRole('button', { name: 'Kategorie anlegen' }).click();
    await app.getByRole('button', { name: 'Testkategorie bearbeiten' }).click();
    await app.getByRole('button', { name: 'Kategorie löschen' }).click();
    await expect(app.getByTestId('categories-list')).not.toContainText('Testkategorie');
    await app.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(app.getByTestId('categories-list')).toContainText('Testkategorie');
  });
});

test.describe('Sortieren', () => {
  test('keyboard: Space picks up, arrow moves, Space drops – survives reload, same order in Monat', async ({ app }) => {
    test.skip(!isSidebarLayout(app), 'desktop keyboard flow');
    await goTo(app, 'positionen');
    const immos = app.getByRole('region', { name: 'Meine Immos' });
    const names = () =>
      immos.getByTestId('position-list-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-position')));
    expect((await names()).slice(0, 2)).toEqual(['pos-kredit-1220', 'pos-bk-1220']);
    await app.getByRole('button', { name: 'Position „Kredit 1220“ verschieben' }).focus();
    // wait for each step's screen-reader announcement: keys pressed before the
    // drag has started (or moved) are lost, which made this test flaky
    const live = app.getByText(/„Kredit 1220“ (aufgenommen|ist jetzt an Position)/);
    await app.keyboard.press('Space');
    await expect(live).toBeAttached(); // „aufgenommen“, immediately followed by „ist jetzt an Position 1“
    await app.keyboard.press('ArrowDown');
    await expect(live).toContainText('ist jetzt an Position 2');
    await app.keyboard.press('Space');
    const sorted = ['pos-bk-1220', 'pos-kredit-1220', 'pos-bk-1160', 'pos-baurechtszins'];
    await expect.poll(names).toEqual(sorted);
    // the list reorders optimistically; reload only once IndexedDB has the new order
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const req = indexedDB.open('fixkosten');
              req.onsuccess = () => {
                const all = req.result.transaction('positions').objectStore('positions').getAll();
                all.onsuccess = () => {
                  req.result.close();
                  const rows = all.result as { id: string; categoryId: string; sortOrder: number }[];
                  resolve(rows.filter((r) => r.categoryId === 'cat-immos').sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id));
                };
              };
            }),
        ),
      )
      .toEqual(sorted);
    await app.reload();
    await expect.poll(names).toEqual(sorted);
    await goTo(app, 'monat');
    const monthImmos = app.getByRole('region', { name: 'Meine Immos' }).getByTestId('position-row');
    await expect(monthImmos.first()).toHaveAttribute('data-position', 'pos-bk-1220');
  });

  test('drag handle sorts by pointer drag', async ({ app }) => {
    await goTo(app, 'positionen');
    const immos = app.getByRole('region', { name: 'Meine Immos' });
    const handle = app.getByRole('button', { name: 'Position „BK 1160“ verschieben' });
    const target = immos.getByTestId('position-list-row').first();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await app.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await app.mouse.down();
    await app.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await app.mouse.move(from.x + from.width / 2, to.y + 5, { steps: 10 });
    await app.mouse.up();
    await expect(immos.getByTestId('position-list-row').first()).toHaveAttribute('data-position', 'pos-bk-1160');
  });
});

test.describe('Offen aus Vormonat & Einmalbeträge', () => {
  test('November shows "Offen aus Oktober" collapsed; Entfallen removes it', async ({ app }) => {
    await nextMonth(app);
    const section = app.getByTestId('open-previous');
    await expect(section).toContainText('Offen aus Oktober');
    await expect(section).toContainText(eur('1 · € 35'));
    await expect(section.getByTestId('open-item')).toHaveCount(0);
    await section.getByRole('button', { name: /Offen aus Oktober/ }).click();
    await section.getByTestId('open-item').getByRole('button', { name: 'Entfallen' }).click();
    await expect(section).toHaveCount(0);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.664'));
    await app.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-status', 'skipped');
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.368'));
    await expect(app.getByText('Alles abgebucht')).toBeVisible();
  });

  test('"Bezahlt" books it in October: € 3.403 abgebucht, November unchanged', async ({ app }) => {
    await nextMonth(app);
    const section = app.getByTestId('open-previous');
    await section.getByRole('button', { name: /Offen aus Oktober/ }).click();
    await section.getByRole('button', { name: 'Bezahlt' }).click();
    const sheet = app.getByRole('dialog', { name: 'Depotentgelt' });
    await expect(sheet).toContainText('Oktober 2026');
    await sheet.getByRole('button', { name: 'Als bezahlt speichern' }).click();
    await expect(section).toHaveCount(0);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.664'));
    await app.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.403'));
  });

  test('Nachzahlung in November as tickable sub-row; plan unchanged', async ({ app }) => {
    await nextMonth(app);
    await row(app, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
    await app.getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
    const form = app.getByTestId('oneoff-form');
    await form.getByLabel('Betrag').fill('120');
    await form.getByLabel('Bezeichnung').fill('Jahresabrechnung');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    const sub = row(app, 'pos-strom').getByTestId('oneoff-row');
    await expect(sub).toContainText('Jahresabrechnung');
    await expect(sub).toContainText(eur('+€ 120'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.664'));
    await sub.getByRole('button', { name: 'Jahresabrechnung als bezahlt markieren' }).click();
    await expect(sub).toHaveAttribute('data-paid', 'true');

    // Gutschrift edits the same entry
    await sub.getByRole('button', { name: 'Jahresabrechnung – bearbeiten' }).click();
    await app.getByRole('radio', { name: 'Gutschrift' }).click();
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(sub).toContainText(eur('−€ 120'));
  });
});
