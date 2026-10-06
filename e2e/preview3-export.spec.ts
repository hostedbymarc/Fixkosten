import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import {
  plannedForPeriod,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
} from '../src/lib/calc';
import type { Dataset } from '../src/lib/types';
import { eur, expect, FIXTURE, goTo, row, test, TODAY } from './fixtures';

// Export from the Deploy Preview of PR #3 (build 0d997aa, schema v3, no export
// button) with the bookmarklet, import into the current main build.

const PREVIEW3 = resolve('.legacy/0d997aa/dist');
const MAIN = resolve('dist');
const BOOKMARKLET = readFileSync('docs/export-preview3-bookmarklet.txt', 'utf8').trim();
const SHORTCUT = readFileSync('docs/export-preview3-shortcut.js', 'utf8');
const TABLES = ['categories', 'positions', 'payments', 'oneOffs', 'monthClose', 'changeLog', 'reminders'] as const;
const OCT = '2026-10';

type Raw = Record<(typeof TABLES)[number] | 'meta', Record<string, unknown>[]>;

/** Serves one build directory for the whole origin (same origin → same IndexedDB). */
async function serve(page: Page, dir: string) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    let file = join(dir, decodeURIComponent(url.pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    await route.fulfill({ path: file });
  });
}

/** All tables straight from IndexedDB, sorted by primary key, for exact comparisons. */
async function readIdb(page: Page): Promise<Raw> {
  return page.evaluate(
    (tables) =>
      new Promise<Raw>((resolve, reject) => {
        const req = indexedDB.open('fixkosten');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const names = [...tables, 'meta'];
          const tx = db.transaction(names, 'readonly');
          const out: Record<string, unknown[]> = {};
          names.forEach((n) => (tx.objectStore(n).getAll().onsuccess = (e) => (out[n] = (e.target as IDBRequest).result)));
          tx.oncomplete = () => {
            db.close();
            resolve(out as Raw);
          };
        };
      }),
    TABLES as unknown as string[],
  );
}

const content = (raw: Raw) => Object.fromEntries(TABLES.map((t) => [t, raw[t]]));

async function newDevice(browser: Browser, page: Page, dir: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: 'http://localhost:4173',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    viewport: page.viewportSize(),
  });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(TODAY);
  await serve(p, dir);
  return p;
}

async function setupWithFixture(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
}

test.describe('Preview 3 → Bookmarklet → main', () => {
  test.beforeAll(() => {
    expect(existsSync(join(PREVIEW3, 'index.html')), 'run node scripts/build-legacy.mjs 0d997aa').toBe(true);
  });

  test('export from the PR #3 build, import into empty and non-empty main', async ({ page, browser }) => {
    // ---------- Preview 3: fixture + realistic entries ----------
    await page.clock.setFixedTime(TODAY);
    await serve(page, PREVIEW3);
    await setupWithFixture(page);
    await expect(page.getByRole('button', { name: 'Sicherung exportieren' })).toHaveCount(0); // no export in PR #3

    // changed actual + note
    await row(page, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
    await page.getByLabel('Tatsächlich abgebucht').fill('71,40');
    await page.getByLabel('Notiz').fill('Abschlag erhöht');
    await page.getByRole('button', { name: 'Speichern' }).click();
    // one-off in November
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await row(page, 'pos-strom').getByRole('button', { name: 'Strom – Details' }).click();
    await page.getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
    await page.getByTestId('oneoff-form').getByLabel('Betrag').fill('120');
    await page.getByTestId('oneoff-form').getByLabel('Bezeichnung').fill('Jahresabrechnung');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    // month close October
    await page.getByTestId('free-tile').click();
    await page.getByLabel('Netto-Gehalt').fill('4700');
    await page.getByLabel('Frei verfügbar (tatsächlich)').fill('830');
    await page.getByRole('button', { name: 'Speichern' }).click();
    // amount change with ChangeLog: Handy € 8 from November
    await goTo(page, 'positionen');
    await page.getByRole('button', { name: 'Handy – Details' }).click();
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByTestId('position-form').getByLabel('Betrag').fill('8');
    await page.getByTestId('change-mode').getByLabel('Gilt ab').selectOption({ label: 'November 2026' });
    await page.getByTestId('position-form').getByRole('button', { name: 'Speichern' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, 'monat');

    const preview = await readIdb(page);
    expect(preview.oneOffs).toHaveLength(1);
    expect(preview.monthClose).toHaveLength(1);
    expect(preview.changeLog.map((c) => c.type)).toEqual(['amount']);
    expect(preview.meta.length).toBeGreaterThan(0); // exists, but must not be exported

    // ---------- run the bookmarklet ----------
    const alertText = new Promise<string>((r) => page.once('dialog', async (d) => (r(d.message()), await d.accept())));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate((code) => new Function(code)(), BOOKMARKLET.replace(/^javascript:/, '')),
    ]);
    expect(download.suggestedFilename()).toBe('fixkosten-preview3-2026-10-05.json');
    expect(await alertText).toBe(
      'Export: 6 Kategorien, 23 Positionen, 17 Zahlungen, 1 Einmalbeträge, 1 Monatsabschlüsse, 1 Änderungen, 2 Erinnerungen',
    );
    const filePath = (await download.path())!;
    const file = JSON.parse(readFileSync(filePath, 'utf8'));

    // exactly the structure of exportBackup() on main
    expect(Object.keys(file)).toEqual(['format', 'schemaVersion', 'exportedAt', 'data']);
    expect(file).toMatchObject({ format: 'fixkosten-backup', schemaVersion: 3 });
    expect(Object.keys(file.data)).toEqual([...TABLES]);
    expect(file.data).toEqual(content(preview)); // identical content, no meta
    expect(file.data).not.toHaveProperty('meta');

    // iOS Shortcuts "Run JavaScript on Web Page" variant: hands the JSON to completion()
    const viaShortcut = JSON.parse(
      await page.evaluate(
        (code) => new Promise<string>((done) => new Function('completion', code)(done)),
        SHORTCUT,
      ),
    );
    expect(Object.keys(viaShortcut)).toEqual(Object.keys(file));
    expect(viaShortcut).toMatchObject({ format: 'fixkosten-backup', schemaVersion: 3 });
    expect(viaShortcut.data).toEqual(file.data);

    // control values on the exported data
    const ds = file.data as Dataset;
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
    expect(Math.round(trueMonthlyBurden(ds, OCT) * 100)).toBe(295217);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos', frequency: 'monthly' })).toBe(991);
    expect(Math.round(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos' }) * 100)).toBe(103467);
    expect(sumMonthlyEquivalent(ds, '2026-11', { kind: 'expense', frequency: 'monthly' })).toBe(2662);

    // ---------- fresh profile with main: first-start import ----------
    const fresh = await newDevice(browser, page, MAIN);
    await fresh.goto('/');
    await expect(fresh.getByTestId('setup-dialog')).toBeVisible();
    await fresh.getByTestId('import-file').setInputFiles(filePath);
    await expect(fresh.getByTestId('hero')).toBeVisible();
    expect(content(await readIdb(fresh))).toEqual(content(preview)); // identical data

    await expect(fresh.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
    await expect(fresh.getByTestId('hero-paid')).toHaveText(eur('€ 3.375,40'));
    await expect(fresh.getByText('Ø pro Monat').locator('..')).toContainText(eur('€ 2.952,17'));
    const immos = fresh.getByRole('region', { name: 'Meine Immos' });
    await expect(immos).toContainText(eur('€ 991'));
    await expect(immos.getByTestId('group-spread')).toHaveText(eur('Ø € 1.034,67 / Monat'));
    await expect(row(fresh, 'pos-strom')).toContainText('Abschlag erhöht');
    await expect(fresh.getByTestId('free-value')).toHaveText(eur('€ 830'));
    await fresh.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(row(fresh, 'pos-strom').getByTestId('oneoff-row')).toContainText('Jahresabrechnung');
    await expect(row(fresh, 'pos-handy')).toContainText(eur('€ 8'));
    await fresh.context().close();

    // ---------- main with own data: import via settings ----------
    const live = await newDevice(browser, page, MAIN);
    await setupWithFixture(live);
    await row(live, 'pos-depotentgelt').getByTestId('toggle-paid').click(); // only on this device
    await expect(row(live, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true');
    const liveBefore = content(await readIdb(live));

    await goTo(live, 'einstellungen');
    await live.getByTestId('backup-file').setInputFiles(filePath);
    const sheet = live.getByTestId('import-sheet');
    await expect(sheet).toContainText('Wie übernehmen?');
    await expect(sheet.getByRole('radio', { name: /Zusammenführen/ })).toBeChecked(); // default
    await sheet.getByRole('button', { name: 'Zusammenführen', exact: true }).click();
    await goTo(live, 'monat');
    await expect(row(live, 'pos-depotentgelt')).toHaveAttribute('data-paid', 'true'); // kept
    await expect(row(live, 'pos-strom')).toContainText('Abschlag erhöht'); // from the file
    await expect(live.getByTestId('free-value')).toHaveText(eur('€ 830'));
    await expect(live.getByTestId('hero-paid')).toHaveText(eur('€ 3.410,40'));

    // undo restores the state from before the import exactly
    await goTo(live, 'einstellungen');
    await live.getByRole('button', { name: 'Import rückgängig machen' }).click();
    await expect.poll(async () => content(await readIdb(live))).toEqual(liveBefore);
    await live.context().close();
  });

  test('empty tab (about:blank, IndexedDB blocked): explains and opens the preview', async ({ page }) => {
    const target = 'https://deploy-preview-3--fixkosten.netlify.app/';
    await page.route(target, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>preview</title>' }));
    expect(page.url()).toBe('about:blank');
    const message = new Promise<string>((r) => page.once('dialog', async (d) => (r(d.message()), await d.accept())));
    await Promise.all([
      page.waitForURL(target),
      page.evaluate((code) => new Function(code)(), BOOKMARKLET.replace(/^javascript:/, '')),
    ]);
    expect(await message).toBe(
      'Das war ein leerer Tab. Ich öffne jetzt die Preview-3-Seite – sobald deine Monatsansicht da ist, das Lesezeichen dort nochmal antippen.',
    );
  });

  test('clear message when there is no database (e.g. Home-Bildschirm-App / wrong page)', async ({ page }) => {
    await page.route('**/__empty__', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
    await page.goto('/__empty__');
    const message = new Promise<string>((r) => page.once('dialog', async (d) => (r(d.message()), await d.accept())));
    await page.evaluate((code) => new Function(code)(), BOOKMARKLET.replace(/^javascript:/, ''));
    expect(await message).toBe(
      'Keine Fixkosten-Datenbank gefunden – bist du auf der Preview-3-Seite in Safari, nicht in der Home-Bildschirm-App?',
    );
    // and it did not create an empty database
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(names).not.toContain('fixkosten');
  });
});
