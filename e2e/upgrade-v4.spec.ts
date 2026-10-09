import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { openAnalyse } from './analyse-helpers';
import { eur, expect, FIXTURE, goTo, row, test, TODAY } from './fixtures';

// The live app runs aad3d27 (phase 3, schema v3) with real data. This test uses
// that build in one browser profile, enters data there, then serves the current
// build on the same origin – the IndexedDB upgrades v3 → v4 in place.

const LIVE = resolve('.legacy/aad3d27/dist');
const CURRENT = resolve('dist');

async function serveFrom(page: Page, dir: { current: string }) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    let file = join(dir.current, decodeURIComponent(url.pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir.current, 'index.html');
    await route.fulfill({ path: file });
  });
}

function idbVersion(page: Page) {
  return page.evaluate(
    () => new Promise<number>((r) => { const q = indexedDB.open('fixkosten'); q.onsuccess = () => { r(q.result.version); q.result.close(); }; }),
  );
}

function rawTable(page: Page, table: string) {
  return page.evaluate(
    (t) =>
      new Promise<unknown[]>((r) => {
        const q = indexedDB.open('fixkosten');
        q.onsuccess = () => {
          const g = q.result.transaction(t, 'readonly').objectStore(t).getAll();
          g.onsuccess = () => {
            r(g.result);
            q.result.close();
          };
        };
      }),
    table,
  );
}

test('live upgrade aad3d27 (v3) → current (v4) in the same browser profile', async ({ page }) => {
  expect(existsSync(join(LIVE, 'index.html')), 'legacy build missing – run node scripts/build-legacy.mjs aad3d27').toBe(true);
  await page.clock.setFixedTime(TODAY);
  const dir = { current: LIVE };
  await serveFrom(page, dir);

  // --- live today: import, tick, edit actual + note, month close, amount change
  await page.goto('/');
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await row(page, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
  await page.getByLabel('Tatsächlich abgebucht').fill('71,40');
  await page.getByLabel('Notiz').fill('Abschlag erhöht');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByTestId('free-tile').click();
  await page.getByLabel('Netto-Gehalt').fill('5000');
  await page.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await goTo(page, 'positionen');
  await page.getByRole('button', { name: 'Handy – Details' }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByTestId('position-form').getByLabel('Betrag').fill('8');
  await page.getByTestId('change-mode').getByLabel('Gilt ab').selectOption({ label: 'November 2026' });
  await page.getByTestId('position-form').getByRole('button', { name: 'Speichern' }).click();
  await page.keyboard.press('Escape');
  expect(await idbVersion(page)).toBe(30);
  const before = Object.fromEntries(
    await Promise.all(['payments', 'oneOffs', 'monthClose', 'changeLog', 'categories', 'reminders'].map(async (t) => [t, await rawTable(page, t)])),
  );
  const positionsBefore = (await rawTable(page, 'positions')) as { id: string; history: Record<string, unknown>[] }[];

  // --- publish: same origin serves the current build
  dir.current = CURRENT;
  await goTo(page, 'monat');
  await page.reload();
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('setup-dialog')).toHaveCount(0);
  expect(await idbVersion(page)).toBe(40);

  // nothing lost: every other table record by record, positions only gained changedOn
  for (const [t, rows] of Object.entries(before)) expect(await rawTable(page, t), t).toEqual(rows);
  const positionsAfter = (await rawTable(page, 'positions')) as typeof positionsBefore;
  expect(positionsAfter.map((p) => ({ ...p, history: p.history.map(({ changedOn: _c, ...e }) => e) }))).toEqual(positionsBefore);
  expect(positionsAfter.find((p) => p.id === 'pos-handy')!.history.map((e) => e.changedOn)).toEqual([undefined, '2026-11-01']);

  // control values
  await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
  await expect(page.getByTestId('hero-paid')).toHaveText(eur('€ 3.375,40'));
  await expect(row(page, 'pos-strom')).toContainText('Abschlag erhöht');
  await expect(page.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));
  await expect(row(page, 'pos-handy').getByTestId('next-change')).toHaveText(eur('Ab 01.11.2026: € 8'));

  // the migrated change appears in the new timeline and as a planned optimisation
  await goTo(page, 'positionen');
  await page.getByRole('button', { name: 'Handy – Details' }).click();
  await expect(page.getByTestId('history-entry').first()).toContainText('ab 01.11.2026');
  await expect(page.getByTestId('history-entry').first()).toContainText(eur('−€ 2 / Monat · −€ 24 / Jahr'));
  await page.keyboard.press('Escape');
  await openAnalyse(page);
  await expect(page.getByTestId('optimizations-headline')).toHaveText(eur('Geplant: −€ 24 / Jahr'));
  await expect(page.getByTestId('monthclose-headline')).toHaveText(eur('Oktober 2026: € 939,60 weniger frei als rechnerisch · Sparquote 16,0 %'));
});
