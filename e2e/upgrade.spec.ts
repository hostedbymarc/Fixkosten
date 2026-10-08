import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { eur, expect, goTo, row, test, TODAY } from './fixtures';

// Simulates the real publish: the browser profile ran 2776e95 (live, schema v1),
// then the same origin serves the current build. Both are served through
// page.route so they share one origin and one IndexedDB.

const LEGACY = resolve('.legacy/2776e95/dist');
const CURRENT = resolve('dist');

async function serveFrom(page: Page, dir: { current: string }) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    let file = join(dir.current, decodeURIComponent(url.pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir.current, 'index.html'); // SPA fallback
    await route.fulfill({ path: file });
  });
}

test('live upgrade 2776e95 (v1) → main (v4) in the same browser profile', async ({ page }) => {
  expect(existsSync(join(LEGACY, 'index.html')), 'legacy build missing – run node scripts/build-legacy.mjs').toBe(true);
  await page.clock.setFixedTime(TODAY);
  const dir = { current: LEGACY };
  await serveFrom(page, dir);

  // --- phase 1 (what is live today): auto-seed, then use it
  await page.goto('/');
  await expect(page.getByTestId('hero-paid')).toHaveText(eur('€ 3.368'));
  await row(page, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
  await page.getByLabel('Tatsächlich abgebucht').fill('71,40');
  await page.getByLabel('Notiz').fill('Nachzahlung');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(row(page, 'pos-strom')).toContainText(eur('+€ 7,40'));
  await expect(row(page, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'false');
  const v1 = await page.evaluate(
    () => new Promise<number>((r) => { const q = indexedDB.open('fixkosten'); q.onsuccess = () => { r(q.result.version); q.result.close(); }; }),
  );
  expect(v1).toBe(10);

  // --- publish: same origin now serves the current build
  dir.current = CURRENT;
  await page.reload();

  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('setup-dialog')).toHaveCount(0);
  await expect(page.getByTestId('hero-paid')).toHaveText(eur('€ 3.375,40'));
  await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
  await expect(page.getByTestId('hero-open')).toHaveText(eur('1 offen · € 35'));
  await expect(row(page, 'pos-strom')).toContainText('Nachzahlung');
  await expect(row(page, 'pos-strom')).toContainText(eur('+€ 7,40'));
  await expect(row(page, 'pos-depotentgelt')).toHaveAttribute('data-status', 'open');

  const immos = page.getByRole('region', { name: 'Meine Immos' });
  await expect(page.getByTestId('category-group').first()).toHaveAttribute('aria-label', 'Meine Immos');
  await expect(immos).toContainText(eur('€ 991'));
  await expect(immos.getByTestId('group-spread')).toHaveText(eur('Ø € 1.034,67 / Monat'));
  await expect(page.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));
  await expect(page.getByText('variabel', { exact: true })).toHaveCount(0);

  const latest = await page.evaluate(
    () => new Promise<number>((r) => { const q = indexedDB.open('fixkosten'); q.onsuccess = () => { r(q.result.version); q.result.close(); }; }),
  );
  expect(latest).toBe(40);

  // positions screen and backup work on the migrated data
  await goTo(page, 'positionen');
  await expect(page.getByRole('region', { name: 'Meine Immos' }).getByTestId('position-list-row')).toHaveCount(4);
  await goTo(page, 'einstellungen');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sicherung exportieren' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^erbse-backup-2026-10-05\.json$/);
});
