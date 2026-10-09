import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureBackup, fixtureRaw } from '../../tests/fixtures/dataset';
import {
  annualizedSavingsFromChanges,
  dueInPeriod,
  dueItems,
  openFromPrevious,
  periodProgress,
  plannedForPeriod,
  sumMonthlyEquivalent,
  fixedCostsAvg,
} from '../lib/calc';
import type { Dataset, Payment, Position } from '../lib/types';
import { importIntoEmpty, parseBackup } from './backup';
import { FixkostenDB } from './db';
import {
  archivePosition,
  changePlan,
  createCategory,
  createPosition,
  deleteCategory,
  deletePositionPermanently,
  loadDataset,
  markPaid,
  markSkipped,
  reorderCategories,
  reorderPositions,
  RepoError,
  restorePosition,
  saveOneOff,
  toggleOneOffPaid,
  undoArchive,
  updateCategory,
  updatePayment,
  updatePositionInfo,
} from './repo';

const OCT = '2026-10';
const NOV = '2026-11';
let name: string;
const opened: FixkostenDB[] = [];

function openDb(maxVersion?: number): FixkostenDB {
  const db = new FixkostenDB(name, { maxVersion });
  opened.push(db);
  return db;
}

beforeEach(() => {
  name = `v3-${crypto.randomUUID()}`;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
  await new FixkostenDB(name).delete();
});

const monthly = (ds: Dataset, period: string) =>
  sumMonthlyEquivalent(ds, period, { kind: 'expense', frequency: 'monthly' });
const cents = (v: number) => Math.round(v * 100);

describe('migration v2 → v3 (realistic data)', () => {
  it('keeps payments, actuals, notes and month closes; history replaces amountHistory', async () => {
    const raw = fixtureRaw();
    const v2 = openDb(2);
    await v2.transaction('rw', v2.tables, async () => {
      await v2.categories.bulkAdd(raw.data.categories as never[]);
      await v2.positions.bulkAdd(raw.data.positions as never[]);
      await v2.payments.bulkAdd(raw.data.payments as never[]);
      await v2.reminders.bulkAdd(raw.data.reminders as never[]);
      await v2.payments.update('pay-pos-strom-2026-10', { actualAmount: 71.4, note: 'Nachzahlung' });
      await v2.payments.add({
        id: 'pay-depot', positionId: 'pos-depotentgelt', period: OCT, plannedAmount: 35, actualAmount: 36.9,
        paidAt: '2026-10-04T08:00:00.000Z', note: 'Gebühr erhöht',
      } as never);
      await v2.monthClose.put({ period: OCT, netSalary: 4700, freeActual: 450, note: 'Urlaub', updatedAt: '2026-10-05T09:00:00.000Z' });
      await v2.meta.bulkPut([
        { key: 'schemaVersion', value: 2 },
        { key: 'setupCompletedAt', value: '2026-10-05T08:00:00.000Z' },
      ]);
    });
    const paymentsBefore = await v2.payments.toArray();
    const positionsBefore = (await v2.positions.toArray()) as unknown as Record<string, unknown>[];
    v2.close();

    const db = openDb();
    expect((await db.meta.get('schemaVersion'))?.value).toBe(4);
    expect(await db.payments.toArray()).toEqual(paymentsBefore.map((p) => ({ ...p, status: 'paid' })));
    expect(await db.monthClose.get(OCT)).toEqual({ period: OCT, netSalary: 4700, freeActual: 450, note: 'Urlaub', updatedAt: '2026-10-05T09:00:00.000Z' });

    const positions = await db.positions.toArray();
    expect(positions).toHaveLength(positionsBefore.length);
    for (const p of positions) {
      expect(p).not.toHaveProperty('amountHistory');
      expect(p).not.toHaveProperty('frequency');
      expect(p).not.toHaveProperty('dueMonths');
      expect(p.history.length).toBeGreaterThan(0);
    }
    const amex = positions.find((p) => p.id === 'pos-amex-gebuehr')!;
    expect(amex.history).toEqual([{ validFrom: OCT, amount: 690, frequency: 'annual', dueMonths: [10], dueDay: 3 }]);

    // all control values unchanged after the migration
    const ds = await loadDataset(db);
    expect(monthly(ds, OCT)).toBe(2664);
    expect(cents(fixedCostsAvg(ds, OCT))).toBe(295217);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(plannedForPeriod(ds, '2027-02')).toBe(4610);
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos', frequency: 'monthly' })).toBe(991);
    expect(cents(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos' }))).toBe(103467);
    expect(periodProgress(ds, OCT)).toMatchObject({ planned: 3403, paidActual: 3368 + 7.4 + 36.9, openCount: 0 });
  });

  it('importing the v2 seed file (seed.local.json) yields the same v3 data', async () => {
    const db = openDb();
    await importIntoEmpty(db, parseBackup(fixtureRaw()));
    const positions = await db.positions.toArray();
    expect(positions.every((p) => Array.isArray(p.history) && !('amountHistory' in p))).toBe(true);
    expect((await db.payments.toArray()).every((p) => p.status === 'paid')).toBe(true);
  });
});

async function imported(): Promise<FixkostenDB> {
  const db = openDb();
  await importIntoEmpty(db, fixtureBackup());
  return db;
}

const HANDY_8 = { amount: 8, frequency: 'monthly' as const, dueMonths: [] };

describe('plan changes (control values)', () => {
  it('Handy from Nov 2026 € 10 → € 8: Oct 2.664, Nov 2.662, Ø from Nov 2.950,17, one optimisation −€ 24/year', async () => {
    const db = await imported();
    await changePlan(db, 'pos-handy', HANDY_8, { type: 'from', validFrom: NOV }, OCT);
    const ds = await loadDataset(db);
    expect(monthly(ds, OCT)).toBe(2664);
    expect(monthly(ds, NOV)).toBe(2662);
    expect(cents(fixedCostsAvg(ds, OCT))).toBe(295217);
    expect(cents(fixedCostsAvg(ds, NOV))).toBe(295017);
    const { changes, total } = annualizedSavingsFromChanges(ds, { from: '2026-01', to: '2027-12' });
    expect(changes.map((c) => [c.position.name, c.annualDelta])).toEqual([['Handy', -24]]);
    expect(total).toBe(24);
    expect(ds.changeLog.filter((c) => c.type === 'amount')).toHaveLength(1);
  });

  it('same change as typo correction: Oct AND Nov € 2.662, no optimisation', async () => {
    const db = await imported();
    await changePlan(db, 'pos-handy', HANDY_8, { type: 'correct' }, OCT);
    const ds = await loadDataset(db);
    expect(monthly(ds, OCT)).toBe(2662);
    expect(monthly(ds, NOV)).toBe(2662);
    expect(annualizedSavingsFromChanges(ds, { from: '2000-01', to: '2099-12' })).toEqual({ changes: [], total: 0 });
    expect(ds.changeLog.map((c) => c.type)).toEqual(['corrected']);
    // ticked October keeps its snapshot
    const handy = dueItems(ds, OCT).find((i) => i.position.id === 'pos-handy')!;
    expect(handy).toMatchObject({ planned: 10, status: 'paid', delta: 0 });
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
  });

  it('correcting a typo in a new plan version keeps the optimisation right', async () => {
    const db = await imported();
    await changePlan(db, 'pos-handy', { ...HANDY_8, amount: 9 }, { type: 'from', validFrom: NOV }, OCT);
    vi.setSystemTime(new Date('2026-11-03T10:00:00'));
    await changePlan(db, 'pos-handy', HANDY_8, { type: 'correct' }, NOV);
    const ds = await loadDataset(db);
    expect(annualizedSavingsFromChanges(ds, { from: '2026-01', to: '2027-12' }).total).toBe(24);
    expect(monthly(ds, OCT)).toBe(2664);
  });

  it('new position: quarterly from Feb → due Feb/May/Aug/Nov', async () => {
    const db = await imported();
    const id = await createPosition(
      db,
      { name: 'Versicherung KFZ', categoryId: 'cat-mobilitaet', plan: { amount: 120, frequency: 'quarterly', dueMonths: [2, 5, 8, 11] } },
      OCT,
    );
    const ds = await loadDataset(db);
    const p = ds.positions.find((x) => x.id === id)!;
    const due = ['2026-11', '2027-02', '2027-05', '2027-08'].map((m) => dueInPeriod(p, m));
    expect(due).toEqual([true, true, true, true]);
    expect(dueInPeriod(p, '2026-12')).toBe(false);
    expect(ds.changeLog.find((c) => c.positionId === id)?.type).toBe('created');
  });

  it('name, category and note change without touching the plan', async () => {
    const db = await imported();
    await updatePositionInfo(db, 'pos-handy', { name: 'Handy (A1)', categoryId: 'cat-abos', note: 'Vertrag bis 2027' });
    const p = (await db.positions.get('pos-handy'))!;
    expect(p).toMatchObject({ name: 'Handy (A1)', categoryId: 'cat-abos', note: 'Vertrag bis 2027' });
    expect(p.history).toHaveLength(1);
  });
});

describe('archive, restore, delete', () => {
  it('archive → undo → back; archive → restore later leaves a gap', async () => {
    const db = await imported();
    const undo = await archivePosition(db, 'pos-gym');
    let ds = await loadDataset(db);
    expect(dueItems(ds, OCT).some((i) => i.position.id === 'pos-gym')).toBe(true); // paid in Oct
    expect(monthly(ds, NOV)).toBe(2664 - 35);
    await undoArchive(db, undo);
    ds = await loadDataset(db);
    expect(monthly(ds, NOV)).toBe(2664);
    expect(ds.changeLog).toEqual([]);

    await archivePosition(db, 'pos-gym');
    vi.setSystemTime(new Date('2027-01-10T10:00:00'));
    await restorePosition(db, 'pos-gym', '2027-01');
    ds = await loadDataset(db);
    const gym = ds.positions.find((p) => p.id === 'pos-gym') as Position;
    expect(gym.archivedAt).toBeUndefined();
    expect(gym.pauses).toEqual([{ from: OCT, to: '2026-12' }]);
    expect(dueInPeriod(gym, NOV)).toBe(false);
    expect(dueInPeriod(gym, '2027-01')).toBe(true);
    expect(ds.changeLog.map((c) => c.type).sort()).toEqual(['archived', 'restored']);
  });

  it('delete permanently removes the position with its payments and one-offs', async () => {
    const db = await imported();
    await saveOneOff(db, { positionId: 'pos-gym', period: NOV, amount: 20, credit: false, label: 'Aufnahme' });
    await deletePositionPermanently(db, 'pos-gym');
    expect(await db.positions.get('pos-gym')).toBeUndefined();
    expect(await db.payments.where('positionId').equals('pos-gym').count()).toBe(0);
    expect(await db.oneOffs.where('positionId').equals('pos-gym').count()).toBe(0);
  });
});

describe('categories', () => {
  it('delete needs a target when not empty; positions (incl. archived) move', async () => {
    const db = await imported();
    await archivePosition(db, 'pos-offi');
    await expect(deleteCategory(db, 'cat-mobilitaet')).rejects.toBeInstanceOf(RepoError);
    await deleteCategory(db, 'cat-mobilitaet', 'cat-wohnen');
    expect(await db.categories.get('cat-mobilitaet')).toBeUndefined();
    expect((await db.positions.get('pos-offi'))?.categoryId).toBe('cat-wohnen');
    const ds = await loadDataset(db);
    expect(plannedForPeriod(ds, '2027-02')).toBe(4610 - 686); // archived Offi stays archived
  });

  it('at least one expense category must remain', async () => {
    const db = openDb();
    await db.open();
    const only = await createCategory(db, { name: 'Alles', color: '#5B5BD6', kind: 'expense' });
    const savings = await createCategory(db, { name: 'Sparen', color: '#27272A', kind: 'savings' });
    await expect(deleteCategory(db, only)).rejects.toThrow('Mindestens eine Ausgaben-Kategorie');
    await expect(updateCategory(db, only, { name: 'Alles', color: '#5B5BD6', kind: 'savings' })).rejects.toThrow(RepoError);
    await deleteCategory(db, savings);
    expect(await db.categories.count()).toBe(1);
  });

  it('reorder categories and positions within a category', async () => {
    const db = await imported();
    await reorderCategories(db, ['cat-abos', 'cat-immos', 'cat-wohnen', 'cat-banking', 'cat-mobilitaet', 'cat-investing']);
    await reorderPositions(db, ['pos-bk-1160', 'pos-kredit-1220', 'pos-bk-1220', 'pos-baurechtszins']);
    const ds = await loadDataset(db);
    const order = dueItems(ds, '2026-12').map((i) => i.position.name);
    expect(order.slice(0, 4)).toEqual(['iCloud', 'Gym', 'Spotify', 'Claude']);
    expect(order.slice(5, 9)).toEqual(['BK 1160', 'Kredit 1220', 'BK 1220', 'Baurechtszins']);
    expect(order.indexOf('Miete')).toBe(9);
  });
});

describe('one-offs and skipped payments', () => {
  it('Gutschrift is stored negative and can be ticked', async () => {
    const db = await imported();
    const id = await saveOneOff(db, { positionId: 'pos-strom', period: NOV, amount: 45, credit: true, label: 'Gutschrift' });
    expect((await db.oneOffs.get(id))?.amount).toBe(-45);
    await toggleOneOffPaid(db, id);
    expect((await db.oneOffs.get(id))?.paidAt).toBeTruthy();
    await saveOneOff(db, { positionId: 'pos-strom', period: NOV, amount: 50, credit: true, label: 'Gutschrift' }, id);
    expect(await db.oneOffs.get(id)).toMatchObject({ amount: -50, paidAt: expect.any(String) });
  });

  it('open from Oct: pay later with another amount', async () => {
    const db = await imported();
    let ds = await loadDataset(db);
    expect(openFromPrevious(ds, NOV)[0]?.items.map((i) => i.position.id)).toEqual(['pos-depotentgelt']);
    const p = await markPaid(db, 'pos-depotentgelt', OCT, 35);
    await updatePayment(db, p.id, { actualAmount: 36.9 });
    ds = await loadDataset(db);
    expect(openFromPrevious(ds, NOV)).toEqual([]);
    expect(periodProgress(ds, OCT).paidActual).toBe(3404.9);
    expect(plannedForPeriod(ds, NOV)).toBe(2664);
  });

  it('open from Oct: "Entfallen" removes it everywhere; ticking later still works', async () => {
    const db = await imported();
    const skipped: Payment = await markSkipped(db, 'pos-depotentgelt', OCT, 35);
    expect(skipped.status).toBe('skipped');
    const ds = await loadDataset(db);
    expect(openFromPrevious(ds, NOV)).toEqual([]);
    expect(plannedForPeriod(ds, OCT)).toBe(3368);
    expect((await markPaid(db, 'pos-depotentgelt', OCT, 35)).status).toBe('paid');
  });
});
