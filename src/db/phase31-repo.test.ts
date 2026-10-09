import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { optimizationTimeline, yearForecast } from '../lib/analytics';
import { dueItems, entryKey, isOnceDone, plannedForPeriod, planHistory, fixedCostsAvg } from '../lib/calc';
import { importIntoEmpty } from './backup';
import { FixkostenDB } from './db';
import {
  changeAmount,
  changePlan,
  createPosition,
  deletePlanEntry,
  loadDataset,
  markPaid,
  RepoError,
  restorePlanEntry,
  updatePlanEntry,
} from './repo';

const OCT = '2026-10';
const opened: FixkostenDB[] = [];
const cents = (v: number) => Math.round(v * 100);

async function seededDb(): Promise<FixkostenDB> {
  const db = new FixkostenDB(`p31-${crypto.randomUUID()}`);
  opened.push(db);
  await importIntoEmpty(db, fixtureBackup());
  return db;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) await db.delete();
});

describe('Einmalig', () => {
  it('create: starts in the month of the due date, due only there, never spread', async () => {
    const db = await seededDb();
    const id = await createPosition(
      db,
      { name: 'Reparatur', categoryId: 'cat-wohnen', plan: { amount: 500, frequency: 'once', dueMonths: [], dueDate: '2026-11-15' } },
      OCT,
    );
    const ds = await loadDataset(db);
    const p = ds.positions.find((x) => x.id === id)!;
    expect(p.history).toEqual([{ validFrom: '2026-11', amount: 500, frequency: 'once', dueMonths: [11], dueDay: 15, dueDate: '2026-11-15' }]);
    expect(plannedForPeriod(ds, '2026-11')).toBe(3164);
    expect(cents(fixedCostsAvg(ds, '2026-11'))).toBe(295217);
    expect(yearForecast(ds, OCT).total).toBe(35926.04);
  });

  it('tick → done; editing amount and date overwrites the single entry', async () => {
    const db = await seededDb();
    const id = await createPosition(
      db,
      { name: 'Reparatur', categoryId: 'cat-wohnen', plan: { amount: 500, frequency: 'once', dueMonths: [], dueDate: '2026-11-15' } },
      OCT,
    );
    await changePlan(db, id, { amount: 450, frequency: 'once', dueMonths: [], dueDate: '2026-12-02' }, { type: 'once' }, OCT);
    let ds = await loadDataset(db);
    expect(planHistory(ds.positions.find((x) => x.id === id)!)).toEqual([
      { validFrom: '2026-12', amount: 450, frequency: 'once', dueMonths: [12], dueDay: 2, dueDate: '2026-12-02' },
    ]);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(plannedForPeriod(ds, '2026-12')).toBe(3013.02 + 450);
    await markPaid(db, id, '2026-12', 450);
    ds = await loadDataset(db);
    expect(isOnceDone(ds, ds.positions.find((x) => x.id === id)!, OCT)).toBe(true);
  });

  it('rejects a missing or invalid due date', async () => {
    const db = await seededDb();
    await expect(
      createPosition(db, { name: 'X', categoryId: 'cat-wohnen', plan: { amount: 5, frequency: 'once', dueMonths: [], dueDate: '2026-02-30' } }, OCT),
    ).rejects.toThrow(RepoError);
  });
});

describe('Betrag ändern', () => {
  it('future change: badge-relevant entry with date, reason and recordedAt; planned +€ 504 / Jahr', async () => {
    const db = await seededDb();
    await changeAmount(db, 'pos-miete', { amount: 1050, changedOn: '2027-04-01', reason: ' Indexanpassung ' });
    const ds = await loadDataset(db);
    const history = planHistory(ds.positions.find((p) => p.id === 'pos-miete')!);
    expect(history.map((e) => [e.validFrom, e.amount, e.changedOn, e.reason])).toEqual([
      ['2026-10', 1008, undefined, undefined],
      ['2027-04', 1050, '2027-04-01', 'Indexanpassung'],
    ]);
    expect(history[1]!.frequency).toBe('monthly');
    expect(history[1]!.recordedAt).toBe(new Date('2026-10-05T10:00:00').toISOString());
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(optimizationTimeline(ds, OCT).plannedAnnual).toBe(504);
    const log = ds.changeLog.filter((c) => c.positionId === 'pos-miete' && c.type === 'amount');
    expect(log).toHaveLength(1);
  });

  it('past change on a ticked month: payment untouched, plan € 1.050, Ist € 1.008', async () => {
    const db = await seededDb();
    const before = await db.payments.where({ positionId: 'pos-miete', period: OCT }).first();
    await changeAmount(db, 'pos-miete', { amount: 1050, changedOn: '2026-10-01' });
    const ds = await loadDataset(db);
    expect(ds.payments.find((p) => p.id === before!.id)).toEqual(before);
    const item = dueItems(ds, OCT).find((i) => i.position.id === 'pos-miete')!;
    expect([item.planned, item.delta]).toEqual([1050, -42]);
  });

  it('edit an entry → values recalculate; delete → back to before; undo restores it', async () => {
    const db = await seededDb();
    const entry = await changeAmount(db, 'pos-miete', { amount: 1050, changedOn: '2027-04-01' });
    await updatePlanEntry(db, 'pos-miete', entryKey(entry), { amount: 1100, changedOn: '2027-01-15', reason: 'Neuer Vertrag' });
    let ds = await loadDataset(db);
    expect(yearForecast(ds, OCT).months.find((m) => m.period === '2027-01')!.due).toBe(2713 + 92);
    expect(optimizationTimeline(ds, OCT).entries.map((e) => [e.changedOn, e.reason, e.annualDelta])).toEqual([
      ['2027-01-15', 'Neuer Vertrag', 1104],
    ]);

    const edited = planHistory(ds.positions.find((p) => p.id === 'pos-miete')!)[1]!;
    const removed = await deletePlanEntry(db, 'pos-miete', entryKey(edited));
    ds = await loadDataset(db);
    expect(yearForecast(ds, OCT).total).toBe(35426.04);
    expect(optimizationTimeline(ds, OCT).entries).toEqual([]);

    await restorePlanEntry(db, 'pos-miete', removed);
    ds = await loadDataset(db);
    expect(planHistory(ds.positions.find((p) => p.id === 'pos-miete')!)[1]).toEqual(edited);
    expect(optimizationTimeline(ds, OCT).plannedAnnual).toBe(1104);
  });

  it('the first entry cannot be deleted; editing it changes only the amount', async () => {
    const db = await seededDb();
    const first = planHistory((await db.positions.get('pos-handy'))!)[0]!;
    await expect(deletePlanEntry(db, 'pos-handy', entryKey(first))).rejects.toThrow('Der erste Eintrag');
    await updatePlanEntry(db, 'pos-handy', entryKey(first), { amount: 9, changedOn: '2027-05-01' });
    const after = planHistory((await db.positions.get('pos-handy'))!);
    expect(after).toEqual([{ ...first, amount: 9 }]);
    // ticked October keeps its snapshot (no dated change)
    const ds = await loadDataset(db);
    expect(dueItems(ds, OCT).find((i) => i.position.id === 'pos-handy')!.planned).toBe(10);
  });

  it('validation: before the start, duplicate date, one-time payments', async () => {
    const db = await seededDb();
    await expect(changeAmount(db, 'pos-miete', { amount: 900, changedOn: '2026-09-30' })).rejects.toThrow('vor dem Beginn');
    await changeAmount(db, 'pos-miete', { amount: 1050, changedOn: '2027-04-01' });
    await expect(changeAmount(db, 'pos-miete', { amount: 1060, changedOn: '2027-04-01' })).rejects.toThrow('schon eine Änderung');
    const once = await createPosition(
      db,
      { name: 'Kaution', categoryId: 'cat-wohnen', plan: { amount: 2000, frequency: 'once', dueMonths: [], dueDate: '2026-12-01' } },
      OCT,
    );
    await expect(changeAmount(db, once, { amount: 1, changedOn: '2026-12-01' })).rejects.toThrow('einmaligen');
  });

  it('typo correction keeps date and reason of the entry and adds no change', async () => {
    const db = await seededDb();
    await changeAmount(db, 'pos-miete', { amount: 1050, changedOn: '2026-10-01', reason: 'Index' });
    await changePlan(db, 'pos-miete', { amount: 1040, frequency: 'monthly', dueMonths: [] }, { type: 'correct' }, OCT);
    const history = planHistory((await db.positions.get('pos-miete'))!);
    expect(history.map((e) => [e.amount, e.changedOn, e.reason])).toEqual([
      [1008, undefined, undefined],
      [1040, '2026-10-01', 'Index'],
    ]);
  });
});

describe('Einmalige Zahlung löschen (Monat) mit Rückgängig', () => {
  it('removes position, tick and log; undo restores everything', async () => {
    const { deletePositionForUndo, restoreDeletedPosition } = await import('./repo');
    const db = await seededDb();
    const id = await createPosition(
      db,
      { name: 'Hotel', categoryId: 'cat-abos', plan: { amount: 620, frequency: 'once', dueMonths: [], dueDate: '2026-11-01' } },
      OCT,
    );
    await markPaid(db, id, '2026-11', 620);
    const before = await loadDataset(db);
    const removed = await deletePositionForUndo(db, id);
    let ds = await loadDataset(db);
    expect(ds.positions.some((p) => p.id === id)).toBe(false);
    expect(ds.payments.some((p) => p.positionId === id)).toBe(false);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    await restoreDeletedPosition(db, removed);
    ds = await loadDataset(db);
    expect(ds.positions.find((p) => p.id === id)).toEqual(before.positions.find((p) => p.id === id));
    expect(ds.payments.filter((p) => p.positionId === id)).toEqual(before.payments.filter((p) => p.positionId === id));
    expect(ds.changeLog.filter((c) => c.positionId === id)).toEqual(before.changeLog.filter((c) => c.positionId === id));
    expect(plannedForPeriod(ds, '2026-11')).toBe(3284);
  });
});
