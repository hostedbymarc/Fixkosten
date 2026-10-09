import type { Page } from '@playwright/test';
import { animationsDone, eur, expect, goTo, test } from './fixtures';
import { expectClean } from './measure';

/** Like the live data: „Meine Immos“ switched to Vermögensaufbau in the category form, net salary € 4.788. */
async function liveSetup(app: Page) {
  await goTo(app, 'positionen');
  await app.getByRole('button', { name: 'Kategorien' }).click();
  await app.getByRole('button', { name: 'Meine Immos bearbeiten' }).click();
  const form = app.getByTestId('category-form');
  await expect(form.getByRole('radio', { name: 'Sparen' })).toHaveCount(0);
  await form.getByRole('radio', { name: 'Vermögensaufbau' }).click();
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(app.getByTestId('categories-list')).toContainText('Vermögensaufbau');
  await app.keyboard.press('Escape');
  await goTo(app, 'monat');
  await app.getByTestId('salary-tile').click();
  await animationsDone(app, 'bottom-sheet');
  await app.getByLabel('Netto-Gehalt').fill('4788');
  await app.getByRole('button', { name: 'Speichern' }).click();
  await expect(app.getByTestId('bottom-sheet')).toHaveCount(0);
}

/** Geometry of the three tiles under the hero. */
async function tileGeometry(app: Page) {
  return app.getByTestId('salary-tile').locator('..').evaluate((row) => {
    const tiles = Array.from(row.children) as HTMLElement[];
    return tiles.map((tile) => {
      const [label, value, ...subs] = Array.from(tile.children) as HTMLElement[];
      const t = tile.getBoundingClientRect();
      const l = label!.getBoundingClientRect();
      const v = value!.getBoundingClientRect();
      return {
        top: Math.round(t.top),
        height: Math.round(t.height),
        labelToValue: Math.round(v.top - l.bottom),
        valueTop: Math.round(v.top - t.top),
        valueBottom: Math.round(v.bottom),
        valueClipped: value!.scrollWidth > value!.clientWidth + 1,
        // an amount wraps when its text needs more than one line box
        wrappedAmounts: Array.from(tile.querySelectorAll('.num'))
          .filter((n) => n.getClientRects().length > 1 || n.getBoundingClientRect().height > parseFloat(getComputedStyle(n).lineHeight) * 1.5)
          .map((n) => n.textContent),
        subLines: subs.map((s) => Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight))),
        bottomOverflow: Array.from(tile.querySelectorAll('*')).some((n) => n.getBoundingClientRect().bottom > t.bottom + 0.5),
      };
    });
  });
}

test.describe('Frei verfügbar & Vermögensaufbau', () => {
  test('Regression −€ 490: Netto − Fixkosten, Vermögensaufbau als eigene Zeile (Kontrollwerte)', async ({ app }, info) => {
    await liveSetup(app);
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 2.412'));
    await expect(app.getByTestId('free-value')).toHaveText(eur('€ 2.376'));
    await expect(app.getByTestId('free-sub')).toHaveText('rechnerisch · tatsächlich eintragen');
    await expect(app.getByTestId('free-average')).toHaveText(eur('Ø mit Jahreskosten € 2.870,50'));
    await expect(app.getByTestId('free-wealth')).toHaveText(eur('Vermögensaufbau € 1.791 · bleibt € 585 · Quote 37,4 %'));
    await expect(app.getByTestId('kpi-value')).toHaveText(eur('€ 1.917,50'));
    await expect(app.getByTestId('kpi-hint')).toHaveText(eur('inkl. € 244,50 Jahreskosten'));
    await expect(app.getByRole('region', { name: 'Meine Immos' })).toContainText('Vermögensaufbau');
    await app.waitForTimeout(300); // glass blur settles
    await app
      .getByTestId('salary-tile')
      .locator('..')
      .screenshot({ path: `docs/screenshots/frei-verfuegbar/${info.project.name}-nachher.png` });
  });

  test('tatsächlich eingetragen: Zeile 1 „tatsächlich · rechnerisch · Diff“, negatives mit echtem Minus', async ({ app }) => {
    await liveSetup(app);
    await app.getByTestId('free-tile').click();
    await animationsDone(app, 'bottom-sheet');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('2000');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('free-value')).toHaveText(eur('€ 2.000'));
    await expect(app.getByTestId('free-sub')).toHaveText(eur('tatsächlich · rechnerisch € 2.376 · Diff −€ 376'));
    await expect(app.getByTestId('free-sub')).toContainText('−€ 376');

    // salary below the fixed costs: real minus sign, never '-€'
    await app.getByTestId('salary-tile').click();
    await animationsDone(app, 'bottom-sheet');
    await app.getByLabel('Netto-Gehalt').fill('1922');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(app.getByTestId('free-value')).toHaveText('−€ 490');
    await expect(app.getByTestId('free-tile')).not.toContainText('-€');
    await expect(app.getByTestId('free-wealth')).toContainText('bleibt −€ 2.281');
  });

  test('Kacheln: gleicher Aufbau, gleiche Höhe pro Reihe, gleiche Baseline, nichts abgeschnitten oder umgebrochen', async ({ app }, info) => {
    await liveSetup(app);
    await expect(app.getByTestId('free-wealth')).toBeVisible();
    const tiles = await tileGeometry(app);
    expect(tiles).toHaveLength(3);
    for (const t of tiles) {
      expect(t.labelToValue, 'gap label → number').toBeLessThanOrEqual(6);
      expect(t.valueTop, 'number sits right under the label').toBe(tiles[0]!.valueTop);
      expect(t.valueClipped).toBe(false);
      expect(t.wrappedAmounts).toEqual([]);
      expect(t.bottomOverflow).toBe(false);
    }
    // tiles sharing a row: same height and the numbers on one baseline
    const rows = new Map<number, typeof tiles>();
    for (const t of tiles) rows.set(t.top, [...(rows.get(t.top) ?? []), t]);
    for (const row of rows.values()) {
      expect(new Set(row.map((t) => t.height)).size, 'same height in a row').toBe(1);
      expect(new Set(row.map((t) => t.valueBottom)).size, 'same baseline in a row').toBe(1);
    }
    // phone: Netto + Ø side by side, Frei verfügbar full width below; tablet/desktop: one row of three
    expect(rows.size).toBe(info.project.name === 'iphone-15' ? 2 : 1);
    // Frei verfügbar has at most three lines below the number
    expect(tiles[2]!.subLines.length).toBeLessThanOrEqual(3);
    // every subline fits on one line, in every viewport
    for (const t of tiles) expect(t.subLines.every((n) => n === 1), 'sublines on one line').toBe(true);
    await expectClean(app, 'main');
  });
});
