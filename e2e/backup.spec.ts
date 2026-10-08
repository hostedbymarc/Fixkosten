import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { eur, expect, goTo, importFixture, row, test } from './fixtures';

const BOOKMARKLET = readFileSync('docs/export-bookmarklet.txt', 'utf8').trim();

async function readDownload(download: Download): Promise<Record<string, unknown>> {
  return JSON.parse(readFileSync((await download.path())!, 'utf8'));
}

/** Runs the bookmarklet like a tap on the bookmark would. */
async function runBookmarklet(page: Page): Promise<{ file: string; json: Record<string, unknown>; alert: string }> {
  const alert = new Promise<string>((resolve) =>
    page.once('dialog', async (d) => {
      resolve(d.message());
      await d.accept();
    }),
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate((code) => new Function(code)(), BOOKMARKLET.replace(/^javascript:/, '')),
  ]);
  return { file: download.suggestedFilename(), json: await readDownload(download), alert: await alert };
}

/** Wipes the site's database and starts over with the import dialog ("another device"). */
async function freshDevice(page: Page) {
  // leave the app first so no open connection blocks the delete
  await page.route('**/__blank__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  await page.goto('/__blank__');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('fixkosten');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await page.goto('/');
  await importFixture(page);
}

async function importFile(page: Page, json: unknown, mode: 'Zusammenführen' | 'Ersetzen') {
  await goTo(page, 'einstellungen');
  await page.getByTestId('backup-file').setInputFiles({
    name: 'fixkosten-export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  const sheet = page.getByTestId('import-sheet');
  await expect(sheet).toBeVisible();
  if (mode === 'Ersetzen') await sheet.getByRole('radio', { name: /Ersetzen/ }).check();
  await sheet.getByRole('button', { name: mode, exact: true }).click();
  await expect(sheet).toBeHidden();
}

test.describe('Sicherung', () => {
  test('bookmarklet exports from a page without export button; merge keeps live-only data', async ({ app }) => {
    // "preview": entries made there
    await row(app, 'pos-depotentgelt').getByTestId('toggle-paid').click();
    await row(app, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
    await app.getByLabel('Tatsächlich abgebucht').fill('71,40');
    await app.getByRole('button', { name: 'Speichern' }).click();
    const exported = await runBookmarklet(app);
    expect(exported.file).toMatch(/^fixkosten-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(exported.alert).toContain('23 Positionen, 18 Zahlungen');
    expect(exported.json).toMatchObject({ format: 'fixkosten-backup', schemaVersion: 4 });

    // "live": other device with its own month close
    await freshDevice(app);
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('4700');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'false');

    await importFile(app, exported.json, 'Zusammenführen');
    await goTo(app, 'monat');
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true');
    await expect(row(app, 'pos-strom')).toContainText(eur('+€ 7,40'));
    await expect(app.getByTestId('free-tile')).toContainText(eur('rechnerisch'));
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.410,40'));
  });

  test('export button downloads a backup that imports on another device', async ({ app }) => {
    await row(app, 'pos-depotentgelt').getByTestId('toggle-paid').click();
    await goTo(app, 'einstellungen');
    await expect(app.getByTestId('last-backup')).toHaveText('Noch keine Sicherung exportiert.');
    const [download] = await Promise.all([
      app.waitForEvent('download'),
      app.getByRole('button', { name: 'Sicherung exportieren' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('erbse-backup-2026-10-05.json');
    await expect(app.getByTestId('last-backup')).toHaveText('Letzte Sicherung: 05.10.2026');
    const json = await readDownload(download);

    await freshDevice(app);
    await importFile(app, json, 'Ersetzen');
    await goTo(app, 'monat');
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.403'));
  });

  test('replace can be undone', async ({ app }) => {
    const file = JSON.parse(readFileSync('tests/fixtures/seed.json', 'utf8'));
    file.data.positions = file.data.positions.filter((p: { id: string }) => p.id === 'pos-miete');
    file.data.payments = [];
    await importFile(app, file, 'Ersetzen');
    await goTo(app, 'monat');
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 1.008'));
    await goTo(app, 'einstellungen');
    await app.getByRole('button', { name: 'Import rückgängig machen' }).click();
    await goTo(app, 'monat');
    await expect(app.getByTestId('hero-paid')).toHaveText(eur('€ 3.368'));
    await expect(app.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
  });

  test('invalid file shows an error', async ({ app }) => {
    await goTo(app, 'einstellungen');
    await app.getByTestId('backup-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
    await expect(app.getByRole('alert')).toHaveText('Die Datei ist kein gültiges JSON.');
  });
});

test('settings show the build version', async ({ app }) => {
  await goTo(app, 'einstellungen');
  await expect(app.getByTestId('app-version')).toHaveText(/^Version (dev|[0-9a-f]{7}) · \d{2}\.\d{2}\.\d{4}$/);
});
