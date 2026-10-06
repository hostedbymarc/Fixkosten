import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureBackup, fixtureRaw } from '../../tests/fixtures/dataset';
import { periodProgress } from '../lib/calc';
import { toPeriod } from '../lib/period';
import type { Category, Payment, Position } from '../lib/types';
import { BackupError, importIntoEmpty, needsSetup, parseBackup, startEmpty } from './backup';
import { FixkostenDB, IMMOS_NAME_HASHES, nameHash } from './db';
import type { PositionV2 } from './migrations';
import { loadDataset, markPaid, removePayment, restorePayment, saveMonthClose, updatePayment } from './repo';

const IMMOS = ['Kredit 1220', 'BK 1220', 'BK 1160', 'Baurechtszins'];
const VARIABLE = ['Strom', 'Lebensmittel & Co', 'Steuerberater'];

let name: string;
const open: FixkostenDB[] = [];

function openDb(maxVersion?: number): FixkostenDB {
  const db = new FixkostenDB(name, { maxVersion });
  open.push(db);
  return db;
}

beforeEach(() => {
  name = `test-${crypto.randomUUID()}`;
});

afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  await new FixkostenDB(name).delete();
});

/** The data exactly as the phase-1 auto seed wrote it into a v1 database. */
function v1Seed() {
  const { categories, positions, payments, reminders } = fixtureRaw().data;
  return {
    categories: categories
      .filter((c) => c.id !== 'cat-immos')
      .map((c) => ({ ...c, sortOrder: c.sortOrder - 1 }) as Category),
    positions: (positions as unknown as PositionV2[]).map((p) => ({
      ...p,
      categoryId: p.categoryId === 'cat-immos' ? 'cat-wohnen' : p.categoryId,
      isVariable: VARIABLE.includes(p.name),
    })),
    payments: payments as unknown as Payment[],
    reminders,
  };
}

async function createV1(mutate?: (seed: ReturnType<typeof v1Seed>) => void): Promise<void> {
  const seed = v1Seed();
  mutate?.(seed);
  const v1 = openDb(1);
  await v1.transaction('rw', v1.tables, async () => {
    await v1.categories.bulkAdd(seed.categories);
    await v1.positions.bulkAdd(seed.positions as unknown as Position[]);
    await v1.payments.bulkAdd(seed.payments);
    await v1.reminders.bulkAdd(seed.reminders);
    await v1.meta.bulkPut([
      { key: 'schemaVersion', value: 1 },
      { key: 'seededAt', value: '2026-10-05T08:00:00.000Z' },
      { key: 'trackingStart', value: '2026-10' },
    ]);
  });
  // user activity in v1: paid the open position with another amount, edited an actual + note
  await markPaid(v1, 'pos-depotentgelt', '2026-10', 35);
  const depot = await v1.payments.where({ positionId: 'pos-depotentgelt', period: '2026-10' }).first();
  await updatePayment(v1, depot!.id, { actualAmount: 36.9, note: 'Gebühr erhöht' });
  await updatePayment(v1, 'pay-pos-strom-2026-10', { actualAmount: 71.4, note: 'Nachzahlung' });
  v1.close();
}

describe('migration v1 → v2 → v3 → v4', () => {
  it('name hashes match the four property positions', () => {
    expect(new Set(IMMOS.map(nameHash))).toEqual(IMMOS_NAME_HASHES);
    expect(IMMOS_NAME_HASHES.has(nameHash('Miete'))).toBe(false);
  });

  it('keeps every payment, amount and note; moves 4 positions; drops isVariable', async () => {
    await createV1();
    const v1 = openDb(1);
    const paymentsBefore = await v1.payments.toArray();
    const positionsBefore = await v1.positions.toArray();
    v1.close();
    expect(paymentsBefore).toHaveLength(18);

    const db = openDb();
    const payments = await db.payments.toArray();
    expect(payments).toEqual(paymentsBefore.map((p) => ({ ...p, status: 'paid' })));
    expect(payments.find((p) => p.positionId === 'pos-strom')).toMatchObject({ actualAmount: 71.4, note: 'Nachzahlung' });
    expect(payments.find((p) => p.positionId === 'pos-depotentgelt')).toMatchObject({ actualAmount: 36.9, note: 'Gebühr erhöht' });

    const categories = (await db.categories.orderBy('sortOrder').toArray()).map((c) => c.name);
    expect(categories).toEqual(['Meine Immos', 'Wohnen & Leben', 'Abos & Freizeit', 'Banking & Finanzen', 'Mobilität', 'Investing']);

    const positions = await db.positions.toArray();
    expect(positions.filter((p) => p.categoryId === 'cat-immos').map((p) => p.name).sort()).toEqual([...IMMOS].sort());
    expect(positions.some((p) => 'isVariable' in p)).toBe(false);
    // everything else is carried over (v3: plan fields live in `history`)
    for (const raw of positionsBefore as unknown as PositionV2[]) {
      const after = positions.find((p) => p.id === raw.id)!;
      expect(after).toMatchObject({ name: raw.name, sortOrder: raw.sortOrder, createdAt: raw.createdAt });
      expect(after.history).toEqual(
        raw.amountHistory.map((a) => ({
          validFrom: a.validFrom,
          amount: a.amount,
          frequency: raw.frequency,
          dueMonths: raw.dueMonths,
          ...(raw.dueDay !== undefined ? { dueDay: raw.dueDay } : {}),
        })),
      );
    }

    expect((await db.meta.get('schemaVersion'))?.value).toBe(4);
    expect(await needsSetup(db)).toBe(false);
    const progress = periodProgress(await loadDataset(db), '2026-10');
    expect(progress.openCount).toBe(0);
    expect(progress.planned).toBe(3403);
  });

  it('renamed and archived positions: no crash, renamed one stays put', async () => {
    await createV1((seed) => {
      seed.positions.find((p) => p.name === 'BK 1160')!.name = 'BK Wohnung Süd';
      seed.positions.find((p) => p.name === 'Baurechtszins')!.archivedAt = '2026-10-04T10:00:00.000Z';
      seed.positions = seed.positions.filter((p) => p.name !== 'BK 1220'); // deleted entirely
      seed.payments = seed.payments.filter((p) => p.positionId !== 'pos-bk-1220');
    });
    const db = openDb();
    const positions = await db.positions.toArray();
    const byName = (n: string) => positions.find((p) => p.name === n);
    expect(byName('BK Wohnung Süd')?.categoryId).toBe('cat-wohnen');
    expect(byName('Baurechtszins')?.categoryId).toBe('cat-immos');
    expect(byName('Kredit 1220')?.categoryId).toBe('cat-immos');
    expect(positions.some((p) => 'isVariable' in p)).toBe(false);
  });

  it('carries a legacy income value into the current month close', async () => {
    await createV1();
    const v1 = openDb(1);
    await v1.table('income').bulkAdd([
      { validFrom: '2026-01', netMonthly: 4200 },
      { validFrom: '2026-09', netMonthly: 4800 },
    ]);
    v1.close();
    const db = openDb();
    expect(db.tables.map((t) => t.name)).not.toContain('income');
    expect(await db.monthClose.toArray()).toEqual([
      expect.objectContaining({ period: toPeriod(new Date()), netSalary: 4800 }),
    ]);
  });

  it('an empty v1 database upgrades to an empty v2 database', async () => {
    const v1 = openDb(1);
    await v1.open();
    v1.close();
    const db = openDb();
    expect(await db.categories.count()).toBe(0);
    expect(await needsSetup(db)).toBe(true);
  });
});

describe('first start: import or empty', () => {
  it('imports the fixture into an empty database', async () => {
    const db = openDb();
    expect(await needsSetup(db)).toBe(true);
    await importIntoEmpty(db, parseBackup(fixtureBackup()));
    expect(await needsSetup(db)).toBe(false);
    expect(await db.positions.count()).toBe(23);
    expect(await db.categories.count()).toBe(6);
    const progress = periodProgress(await loadDataset(db), '2026-10');
    expect(progress.paidActual).toBe(3368);
    expect(progress.planned).toBe(3403);
  });

  it('never overwrites an existing database', async () => {
    const db = openDb();
    await importIntoEmpty(db, parseBackup(fixtureBackup()));
    await updatePayment(db, 'pay-pos-strom-2026-10', { actualAmount: 99 });
    await expect(importIntoEmpty(db, parseBackup(fixtureBackup()))).rejects.toBeInstanceOf(BackupError);
    expect((await db.payments.get('pay-pos-strom-2026-10'))?.actualAmount).toBe(99);
  });

  it('"Leer starten" ends the setup without data', async () => {
    const db = openDb();
    await startEmpty(db);
    expect(await needsSetup(db)).toBe(false);
    expect(await db.positions.count()).toBe(0);
  });

  it('rejects files that are not a backup', () => {
    expect(() => parseBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => parseBackup({ ...fixtureRaw(), schemaVersion: 1 })).toThrow(/Version 1/);
    expect(() => parseBackup({ ...fixtureRaw(), schemaVersion: 5 })).toThrow(/Version 5/);
    const broken = fixtureRaw();
    broken.data.positions[0]!.categoryId = 'cat-unknown';
    expect(() => parseBackup(broken)).toThrow(BackupError);
  });
});

describe('ticking', () => {
  async function imported() {
    const db = openDb();
    await importIntoEmpty(db, parseBackup(fixtureBackup()));
    return db;
  }

  it('mark paid → edit actual → remove → undo', async () => {
    const db = await imported();
    const paid = await markPaid(db, 'pos-depotentgelt', '2026-10', 35);
    expect(periodProgress(await loadDataset(db), '2026-10').paidActual).toBe(3403);

    await updatePayment(db, paid.id, { actualAmount: 36.9, note: '  Erhöhung  ' });
    const updated = await db.payments.get(paid.id);
    expect(updated?.actualAmount).toBe(36.9);
    expect(updated?.note).toBe('Erhöhung');

    const removed = (await removePayment(db, paid.id)) as Payment;
    expect(periodProgress(await loadDataset(db), '2026-10').openCount).toBe(1);
    await restorePayment(db, removed);
    expect((await db.payments.get(paid.id))?.actualAmount).toBe(36.9);
  });

  it('double tap creates only one payment', async () => {
    const db = await imported();
    const [a, b] = await Promise.all([
      markPaid(db, 'pos-depotentgelt', '2026-10', 35),
      markPaid(db, 'pos-depotentgelt', '2026-10', 35),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.payments.where({ positionId: 'pos-depotentgelt', period: '2026-10' }).count()).toBe(1);
  });
});

describe('month close', () => {
  it('saves, updates and removes an empty close', async () => {
    const db = openDb();
    await saveMonthClose(db, '2026-10', { netSalary: 5000, freeActual: 650, note: ' ok ' });
    expect(await db.monthClose.get('2026-10')).toMatchObject({ netSalary: 5000, freeActual: 650, note: 'ok' });
    await saveMonthClose(db, '2026-10', { netSalary: 5100 });
    expect(await db.monthClose.get('2026-10')).toMatchObject({ netSalary: 5100, freeActual: undefined });
    await saveMonthClose(db, '2026-10', {});
    expect(await db.monthClose.get('2026-10')).toBeUndefined();
  });
});
