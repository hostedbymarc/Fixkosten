import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { HISTORY, importHistory, openAnalyse } from './analyse-helpers';
import { animationsDone, expect, goTo, test } from './fixtures';

const DIR = 'docs/screenshots/phase-2';

async function shot(page: Page, name: string, fullPage = false) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  const file = `${DIR}/${test.info().project.name}-${name}.png`;
  if (!fullPage) return void (await page.screenshot({ path: file }));
  // pin fixed navigation to the page edges so it is not painted mid-page
  const style = await page.addStyleTag({ content: '[data-testid=tabbar],[data-testid=sidebar],[data-testid=fab]{position:absolute!important}' });
  await page.screenshot({ path: file, fullPage: true });
  await style.evaluate((el) => (el as Element).remove());
}

test.describe('Screenshots Phase 2', () => {
  test('month screens', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await shot(app, 'monat');
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await app.getByRole('button', { name: /Offen aus Oktober/ }).click();
    // one-off as sub-row under Strom
    await app.getByRole('button', { name: 'Strom – Details' }).click();
    await shot(app, 'zahlung-sheet');
    await app.getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
    await app.getByTestId('oneoff-form').getByLabel('Betrag').fill('120');
    await app.getByTestId('oneoff-form').getByLabel('Bezeichnung').fill('Jahresabrechnung');
    await shot(app, 'einmalbetrag');
    await app.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(app.getByTestId('oneoff-row')).toBeVisible();
    await shot(app, 'monat-november', true);
  });

  test('positions screens and sheets', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await goTo(app, 'positionen');
    await expect(app.getByTestId('positions-group').first()).toBeVisible();
    await shot(app, 'positionen');
    await shot(app, 'positionen-full', true);

    await app.getByRole('button', { name: 'Position hinzufügen' }).click();
    await app.getByLabel('Name').fill('KFZ-Versicherung');
    await app.getByLabel('Betrag').fill('120,50');
    await app.getByRole('radio', { name: 'Quartal' }).click();
    await app.getByLabel('Startmonat').selectOption({ label: 'Feb' });
    await shot(app, 'position-neu');
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Handy – Details' }).click();
    await shot(app, 'position-detail');
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    await app.getByLabel('Betrag').fill('8');
    await app.getByTestId('change-mode').scrollIntoViewIfNeeded();
    await shot(app, 'position-ab-wann');
    await app.keyboard.press('Escape');
    await app.keyboard.press('Escape');

    await app.getByRole('button', { name: 'Kategorien' }).click();
    await shot(app, 'kategorien');
    await app.getByRole('button', { name: 'Mobilität bearbeiten' }).click();
    await shot(app, 'kategorie-bearbeiten');
    await app.getByRole('button', { name: 'Kategorie löschen' }).click();
    await shot(app, 'kategorie-verschieben');
  });

  test('settings archive', async ({ app }) => {
    await app.evaluate(() => document.fonts.ready);
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Gym – Details' }).click();
    await app.getByTestId('position-detail').getByRole('button', { name: 'Archivieren' }).click();
    await goTo(app, 'einstellungen');
    await expect(app.getByTestId('archive-list')).toBeVisible();
    await shot(app, 'einstellungen-archiv');
    await app.getByTestId('archive-list').getByRole('button', { name: 'Löschen' }).click();
    await shot(app, 'endgueltig-loeschen');
  });
});

test('Screenshots Sicherung', async ({ app }) => {
  await app.evaluate(() => document.fonts.ready);
  await goTo(app, 'einstellungen');
  await app.screenshot({ path: `docs/screenshots/backup/${test.info().project.name}-einstellungen.png` });
  await app.getByTestId('backup-file').setInputFiles('tests/fixtures/seed.json');
  await animationsDone(app, 'bottom-sheet');
  await app.screenshot({ path: `docs/screenshots/backup/${test.info().project.name}-import.png` });
});

test.describe('Screenshots Phase 3 – Analyse', () => {
  const SECTIONS = ['forecast', 'distribution', 'monthclose', 'trend', 'planactual', 'optimizations'];

  async function shoot(page: Page, state: string) {
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '[data-testid=tabbar]{display:none!important}' });
    for (const id of SECTIONS) {
      const section = page.getByTestId(id);
      await section.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await section.screenshot({ path: `docs/screenshots/phase-3/${test.info().project.name}-${state}-${id}.png` });
    }
  }

  test.beforeEach(() => {
    test.skip(!['iphone-15', 'desktop'].includes(test.info().project.name), 'iPhone and desktop only');
  });

  test('1 Monat Daten (Seed + Monatsabschluss Oktober)', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await openAnalyse(app);
    await shoot(app, '1m');
  });

  test('6 Monate Daten', async ({ page }) => {
    const file = JSON.parse(readFileSync(HISTORY, 'utf8'));
    const keep = (p: string) => p >= '2026-05';
    file.data.payments = file.data.payments.filter((p: { period: string }) => keep(p.period));
    file.data.monthClose = file.data.monthClose.filter((p: { period: string }) => keep(p.period));
    file.data.oneOffs = file.data.oneOffs.filter((p: { period: string }) => keep(p.period));
    file.data.changeLog = file.data.changeLog.filter((c: { validFrom?: string }) => c.validFrom && keep(c.validFrom));
    await importHistory(page, { name: 'history-6m.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await openAnalyse(page);
    await shoot(page, '6m');
  });

  test('24 Monate Daten', async ({ page }) => {
    await importHistory(page);
    await openAnalyse(page);
    await page.getByTestId('range').getByRole('radio', { name: 'Gesamter Zeitraum' }).click();
    await page.getByTestId('distribution').locator('li[data-category="cat-banking"] > button').click();
    await shoot(page, '24m');
  });
});
