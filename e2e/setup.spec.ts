import { readFileSync } from 'node:fs';
import { FIXTURE, TODAY, eur, expect, importFixture, row, test } from './fixtures';

test.describe('Erststart: Import oder leer', () => {
  test('empty database shows the import dialog; import → same state; reload → no dialog', async ({ fresh }) => {
    await expect(fresh.getByRole('dialog', { name: 'Daten importieren' })).toBeVisible();
    await importFixture(fresh);
    await expect(fresh.getByTestId('hero-paid')).toHaveText(eur('€ 3.368'));
    await fresh.reload();
    await expect(fresh.getByTestId('hero')).toBeVisible();
    await expect(fresh.getByTestId('setup-dialog')).toHaveCount(0);
  });

  test('"Leer starten" → empty app, dialog does not come back', async ({ fresh }) => {
    await fresh.getByRole('button', { name: 'Leer starten' }).click();
    await expect(fresh.getByText(/ist nichts fällig/)).toBeVisible();
    await fresh.reload();
    await expect(fresh.getByText(/ist nichts fällig/)).toBeVisible();
    await expect(fresh.getByTestId('setup-dialog')).toHaveCount(0);
  });

  test('invalid file shows an error and keeps the dialog', async ({ fresh }) => {
    await fresh.getByTestId('import-file').setInputFiles({
      name: 'kaputt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(fresh.getByRole('alert')).toHaveText('Das ist keine Fixkosten-Sicherung.');
    await expect(fresh.getByTestId('setup-dialog')).toBeVisible();
  });
});

/** Writes the phase-1 (schema v1) database directly with IndexedDB, like the deployed app did. */
function v1Data() {
  const seed = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const variable = ['Strom', 'Lebensmittel & Co', 'Steuerberater'];
  return {
    categories: seed.data.categories
      .filter((c: { id: string }) => c.id !== 'cat-immos')
      .map((c: { sortOrder: number }) => ({ ...c, sortOrder: c.sortOrder - 1 })),
    positions: seed.data.positions.map((p: { categoryId: string; name: string }) => ({
      ...p,
      categoryId: p.categoryId === 'cat-immos' ? 'cat-wohnen' : p.categoryId,
      isVariable: variable.includes(p.name),
    })),
    payments: seed.data.payments.map((p: { positionId: string }) =>
      p.positionId === 'pos-strom' ? { ...p, actualAmount: 71.4, note: 'Nachzahlung' } : p,
    ),
    reminders: seed.data.reminders,
    meta: [
      { key: 'schemaVersion', value: 1 },
      { key: 'seededAt', value: '2026-10-05T08:00:00.000Z' },
    ],
  };
}

test('existing v1 database: no dialog, upgraded to v3, ticks and notes kept', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.route('**/__v1__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>v1</title>' }));
  await page.goto('/__v1__');
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('fixkosten', 10); // Dexie stores version × 10
      req.onupgradeneeded = () => {
        const idb = req.result;
        idb.createObjectStore('categories', { keyPath: 'id' }).createIndex('sortOrder', 'sortOrder');
        const positions = idb.createObjectStore('positions', { keyPath: 'id' });
        for (const i of ['categoryId', 'sortOrder', 'archivedAt']) positions.createIndex(i, i);
        const payments = idb.createObjectStore('payments', { keyPath: 'id' });
        payments.createIndex('[positionId+period]', ['positionId', 'period'], { unique: true });
        payments.createIndex('period', 'period');
        payments.createIndex('positionId', 'positionId');
        const oneOffs = idb.createObjectStore('oneOffs', { keyPath: 'id' });
        oneOffs.createIndex('period', 'period');
        oneOffs.createIndex('positionId', 'positionId');
        idb.createObjectStore('income', { keyPath: 'validFrom' });
        const changeLog = idb.createObjectStore('changeLog', { keyPath: 'id' });
        changeLog.createIndex('at', 'at');
        changeLog.createIndex('positionId', 'positionId');
        idb.createObjectStore('reminders', { keyPath: 'id' }).createIndex('month', 'month');
        idb.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const idb = req.result;
        const tx = idb.transaction(['categories', 'positions', 'payments', 'reminders', 'meta'], 'readwrite');
        for (const [store, rows] of Object.entries(data)) for (const r of rows as object[]) tx.objectStore(store).put(r);
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, v1Data());

  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('setup-dialog')).toHaveCount(0);
  await expect(page.getByTestId('category-group').first()).toHaveAttribute('aria-label', 'Meine Immos');
  const immos = page.getByRole('region', { name: 'Meine Immos' });
  for (const id of ['pos-kredit-1220', 'pos-bk-1220', 'pos-bk-1160']) {
    await expect(immos.locator(`[data-position="${id}"]`)).toHaveAttribute('data-paid', 'true');
  }
  await expect(row(page, 'pos-strom')).toContainText('Nachzahlung');
  await expect(row(page, 'pos-strom')).toContainText(eur('+€ 7,40'));
  await expect(page.getByText('variabel', { exact: true })).toHaveCount(0);

  const version = await page.evaluate(
    () => new Promise<number>((resolve) => {
      const req = indexedDB.open('fixkosten');
      req.onsuccess = () => {
        resolve(req.result.version);
        req.result.close();
      };
    }),
  );
  expect(version).toBe(30); // Dexie stores schema v3 × 10
});
