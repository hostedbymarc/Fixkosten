import { animationsDone, eur, expect, test } from './fixtures';

test.describe('Monatsabschluss', () => {
  test('enter salary and free money → reload → values and difference', async ({ app }) => {
    await expect(app.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
    const tile = app.getByTestId('free-tile');
    await tile.click();
    const sheet = app.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
    await expect(sheet).toBeVisible();

    await sheet.getByLabel('Netto-Gehalt').fill('5.000');
    await expect(sheet.getByTestId('close-preview')).toHaveText(eur('Rechnerisch € 797'));
    await sheet.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
    await expect(sheet.getByTestId('close-preview')).toHaveText(eur('Rechnerisch € 797 · Differenz −€ 147'));
    await sheet.getByLabel('Notiz').fill('Urlaub');
    await sheet.getByRole('button', { name: 'Speichern' }).click();
    await expect(sheet).toBeHidden();

    const check = async () => {
      await expect(app.getByTestId('free-value')).toHaveText(eur('€ 650'));
      await expect(app.getByTestId('free-sub')).toHaveText(eur('rechnerisch € 797 · Differenz −€ 147'));
      await expect(app.getByTestId('free-sub').locator('.text-over')).toHaveText(eur('−€ 147'));
      await expect(app.getByTestId('savings-rate')).toHaveText(eur('Sparquote 16,0 %'));
      await expect(app.getByTestId('salary-value')).toHaveText(eur('€ 5.000'));
    };
    await check();
    await app.reload();
    await check();

    await app.getByTestId('free-tile').click();
    await expect(app.getByLabel('Netto-Gehalt')).toHaveValue('5000');
    await expect(app.getByLabel('Frei verfügbar (tatsächlich)')).toHaveValue('650');
    await expect(app.getByLabel('Notiz')).toHaveValue('Urlaub');
  });

  test('comma decimals, decimal keyboard, invalid input blocks saving', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    const salary = app.getByLabel('Netto-Gehalt');
    await expect(salary).toHaveAttribute('inputmode', 'decimal');
    await salary.fill('4.850,50');
    await expect(app.getByTestId('close-preview')).toHaveText(eur('Rechnerisch € 647,50'));
    await salary.fill('viel');
    await expect(app.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  test('"Wie Vormonat" copies previous values; nothing is saved automatically', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    await animationsDone(app, 'bottom-sheet');
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
    await app.getByRole('button', { name: 'Speichern' }).click();

    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
    await app.getByTestId('free-tile').click();
    await animationsDone(app, 'bottom-sheet');
    await expect(app.getByLabel('Netto-Gehalt')).toHaveValue('');
    await expect(app.getByLabel('Netto-Gehalt')).toHaveAttribute('placeholder', '5000');
    await app.getByRole('button', { name: 'Wie Vormonat' }).click();
    await expect(app.getByLabel('Netto-Gehalt')).toHaveValue('5000');
    await expect(app.getByLabel('Frei verfügbar (tatsächlich)')).toHaveValue('650');
    await app.keyboard.press('Escape');

    await expect(app.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
    await app.reload();
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
  });

  test('keyboard: Enter opens, Esc closes, focus returns to the tile', async ({ app }) => {
    const tile = app.getByTestId('free-tile');
    await tile.focus();
    await app.keyboard.press('Enter');
    await expect(app.getByRole('dialog')).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toBeHidden();
    await expect(tile).toBeFocused();
  });

  test('tile with sub line and savings rate is never clipped', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('12.345,67');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('7.654,32');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('savings-rate')).toBeVisible();

    const tile = app.getByTestId('free-tile');
    const clipped = await tile.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [el, ...Array.from(el.querySelectorAll('*'))]
        .filter((n) => {
          const r = n.getBoundingClientRect();
          return n.scrollWidth > n.clientWidth + 1 || r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5;
        })
        .map((n) => n.textContent);
    });
    expect(clipped).toEqual([]);
    await expect(tile).toBeInViewport();
  });
});
