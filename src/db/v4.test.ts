import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import {
  annualizedSavingsFromChanges,
  expectedSpend,
  freeCalculated,
  freeGap,
  periodProgress,
  plannedForPeriod,
  savingsRate,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
} from '../lib/calc';
import type { PlanEntry, Position } from '../lib/types';
import { exportBackup, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { loadDataset } from './repo';

const OCT = '2026-10';
let name: string;
const opened: FixkostenDB[] = [];

function openDb(maxVersion?: number): FixkostenDB {
  const db = new FixkostenDB(name, { maxVersion });
  opened.push(db);
  return db;
}

beforeEach(() => {
  name = `v4-${crypto.randomUUID()}`;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
  await new FixkostenDB(name).delete();
});

const cents = (v: number) => Math.round(v * 100);

/** Strip the v4 field so the seed looks exactly like a v3 record. */
function asV3(position: Position): Position {
  return { ...position, history: position.history.map(({ changedOn: _c, ...e }) => e as PlanEntry) };
}

describe('migration v3 → v4 (realistic data)', () => {
  it('nothing is lost; later history entries get changedOn; all control values exact', async () => {
    const seed = fixtureBackup().data;
    const v3 = openDb(3);
    await v3.transaction('rw', v3.tables, async () => {
      await v3.categories.bulkAdd(seed.categories);
      await v3.positions.bulkAdd(seed.positions.map(asV3));
      await v3.payments.bulkAdd(seed.payments);
      await v3.reminders.bulkAdd(seed.reminders);
      // edited actual + note
      await v3.payments.update('pay-pos-strom-2026-10', { actualAmount: 71.4, note: 'Abschlag erhöht' });
      // one-off on a position
      await v3.oneOffs.add({ id: 'oo-1', positionId: 'pos-strom', period: '2026-11', amount: 120, label: 'Jahresabrechnung' });
      // month close
      await v3.monthClose.put({ period: OCT, netSalary: 5000, freeActual: 650, note: 'Urlaub', updatedAt: '2026-10-05T09:00:00.000Z' });
      // amount change (phase 2 "Ab wann gilt das?"): Handy € 10 → € 8 from November
      const handy = (await v3.positions.get('pos-handy'))!;
      const to: PlanEntry = { ...handy.history[0]!, validFrom: '2026-11', amount: 8 };
      await v3.positions.update('pos-handy', { history: [...handy.history, to] });
      await v3.changeLog.add({ id: 'log-handy', at: '2026-10-05T09:30:00.000Z', positionId: 'pos-handy', type: 'amount', validFrom: '2026-11', from: handy.history[0], to });
      await v3.meta.put({ key: 'setupDone', value: true });
    });
    const before = await loadDataset(v3);
    const metaBefore = await v3.meta.toArray();
    v3.close();

    const db = openDb();
    expect(db.verno).toBe(4);
    const after = await loadDataset(db);

    // untouched tables, record by record
    expect(after.payments).toEqual(before.payments);
    expect(after.oneOffs).toEqual(before.oneOffs);
    expect(after.monthClose).toEqual(before.monthClose);
    expect(after.changeLog).toEqual(before.changeLog);
    expect(after.categories).toEqual(before.categories);
    expect(after.reminders).toEqual(before.reminders);
    expect(await db.meta.get('setupDone')).toEqual(metaBefore.find((m) => m.key === 'setupDone'));
    expect((await db.meta.get('schemaVersion'))?.value).toBe(4);

    // positions: only changedOn added to later entries
    expect(after.positions).toHaveLength(before.positions.length);
    for (const p of after.positions) {
      const old = before.positions.find((x) => x.id === p.id)!;
      expect({ ...p, history: p.history.map(({ changedOn: _c, ...e }) => e) }).toEqual(old);
      expect(p.history[0]!.changedOn).toBeUndefined();
    }
    expect(after.positions.find((p) => p.id === 'pos-handy')!.history[1]!.changedOn).toBe('2026-11-01');

    // control values exact
    expect(plannedForPeriod(after, OCT)).toBe(3403);
    expect(cents(trueMonthlyBurden(after, OCT))).toBe(295217);
    expect(sumMonthlyEquivalent(after, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
    expect(sumMonthlyEquivalent(after, '2026-11', { kind: 'expense', frequency: 'monthly' })).toBe(2662);
    expect(cents(trueMonthlyBurden(after, '2026-11'))).toBe(295017);
    expect(sumMonthlyEquivalent(after, OCT, { categoryId: 'cat-immos', frequency: 'monthly' })).toBe(991);
    expect(periodProgress(after, OCT)).toMatchObject({ planned: 3403, paidActual: 3375.4, openCount: 1 });
    expect(expectedSpend(after, '2026-11')).toBe(2662 + 120);
    expect(freeCalculated(after, OCT)).toBe(789.6);
    expect(freeGap(after, OCT)).toBe(-139.6);
    expect(savingsRate(after, OCT)).toBeCloseTo(0.16, 9);
    expect(annualizedSavingsFromChanges(after, { from: '2026-01', to: '2027-12' })).toMatchObject({ total: 24 });
  });

  it('backup: a v3 file imports as v4, the export is v4', async () => {
    const v3file = { ...fixtureBackup(), schemaVersion: 3 };
    v3file.data.positions = v3file.data.positions.map(asV3);
    const handy = v3file.data.positions.find((p) => p.id === 'pos-handy')!;
    handy.history.push({ ...handy.history[0]!, validFrom: '2026-11', amount: 8 });
    const parsed = parseBackup(structuredClone(v3file));
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.data.positions.find((p) => p.id === 'pos-handy')!.history.map((e) => e.changedOn)).toEqual([undefined, '2026-11-01']);
    // the input object of the caller is not mutated beyond the parse
    expect(handy.history[1]!.changedOn).toBeUndefined();
    const db = openDb();
    expect((await exportBackup(db)).schemaVersion).toBe(4);
  });
});
