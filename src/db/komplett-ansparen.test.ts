// komplett-ansparen: a big payment from ONE salary – all of it („Komplett vom {Monat}-Gehalt“) or a part
// („Teilbetrag vom {Monat}-Gehalt: € …“, the rest when it is due). saving: mode 'once', salaryMonth, amount in
// cents. ① of each month of the plan lists its lines; their sum is ①. Invented data only (tests/fixtures).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P2, P3 } from '../../tests/fixtures/golden-month';
import { monthCard } from '../lib/monthCard';
import { bigMonthFrom, monthPlan } from '../lib/monthPlan';
import type { Dataset, Position, SavingSetting } from '../lib/types';
import { exportBackup, importIntoEmpty, parseBackup, type BackupFile } from './backup';
import { FixkostenDB } from './db';
import { setPlanMode, setSaving } from './kontoActions';
import { loadDataset } from './repo';

const TODAY = new Date(2026, 11, 10);
const MAR = '2027-03';
const cents = (v: number) => Math.round(v * 100);

function steuer(saving?: SavingSetting): Position {
  return {
    id: 'k-steuer',
    name: 'Kfz-Steuer',
    categoryId: 'g-ruecklage',
    history: [{ validFrom: '2026-01', amount: 240, frequency: 'annual', dueMonths: [3], dueDay: 10 }],
    createdAt: '2026-01-01T08:00:00.000Z',
    sortOrder: 50,
    account: 'fixkostenkonto',
    ...(saving ? { saving } : {}),
  };
}
const withSteuer = (saving?: SavingSetting): Dataset => {
  const ds = goldenDataset();
  return { ...ds, positions: [...ds.positions, steuer(saving)] };
};
const custom = goldenSettings({ planMode: 'custom' });
const month = (ds: Dataset, p: string) => monthPlan(ds, P2, custom, 25).months.find((m) => m.period === p)!;

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`komplett-ansparen-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('mode once: komplett und Teilbetrag', () => {
  it('komplett vom Jänner-Gehalt (Zeitraum Jänner): ① Jänner + 240, März ohne Betrag', () => {
    const ds = withSteuer({ mode: 'once', salaryMonth: P3 });
    const pay = monthPlan(ds, P2, custom, 25).payments.find((p) => p.name === 'Kfz-Steuer')!;
    expect([pay.mode, pay.salaryMonth, pay.fromSalary, pay.atDue, pay.partial]).toEqual(['once', P3, 240, 0, false]);
    expect(month(ds, P3).transfer).toBe(600 + 240);
    expect(month(ds, MAR).transfer).toBe(0);
    expect(month(ds, MAR).fromReserve).toBe(240);
  });

  it('Teilbetrag € 100,50 vom Dezember-Zeitraum: der Rest im März bei Fälligkeit', () => {
    const ds = withSteuer({ mode: 'once', salaryMonth: P2, amount: 10050 });
    const pay = monthPlan(ds, P2, custom, 25).payments.find((p) => p.name === 'Kfz-Steuer')!;
    expect([pay.mode, pay.fromSalary, pay.atDue, pay.partial]).toEqual(['once', 100.5, 139.5, true]);
    expect(month(ds, P2).transfer).toBe(360 + 100.5);
    expect(month(ds, MAR).transfer).toBe(139.5);
    expect(month(ds, MAR).lines).toEqual([{ key: 'k-steuer@2027-03', name: 'Kfz-Steuer', kind: 'due', period: MAR, amount: 139.5, saved: 100.5 }]);
  });

  it('Teilbetrag größer als die Zahlung: höchstens die Zahlung', () => {
    const ds = withSteuer({ mode: 'once', salaryMonth: P2, amount: 99900 });
    expect(month(ds, P2).transfer).toBe(600);
    expect(month(ds, MAR).transfer).toBe(0);
  });

  it('Gehalt vor dem Plan: zählt ab dem ersten Gehalt des Plans', () => {
    const ds = withSteuer({ mode: 'once', salaryMonth: '2026-10' });
    expect(month(ds, P2).transfer).toBe(600);
  });

  it('nur das erste Vorkommen ab dem Gehalt; spätere zahlst du bei Fälligkeit', () => {
    const ds = goldenDataset();
    ds.positions = ds.positions.map((p) => (p.id === 'g-kfz' ? { ...p, saving: { mode: 'once' as const, salaryMonth: P3 } } : p));
    const pays = monthPlan(ds, P2, custom, 25).payments.filter((p) => p.positionId === 'g-kfz');
    // December is due before January: when due; June from the January salary
    expect(pays.map((p) => [p.period, p.mode])).toEqual([
      [P2, 'due'],
      ['2027-06', 'once'],
    ]);
  });

  it('Wechsel zurück zu „Bei Fälligkeit“: wie ohne Einstellung', () => {
    const plain = monthPlan(withSteuer(), P2, custom, 25);
    const back = monthPlan(withSteuer({ mode: 'due' }), P2, custom, 25);
    expect(back.months.map((m) => m.transfer)).toEqual(plain.months.map((m) => m.transfer));
    // the plan mode „Bei Fälligkeit“ ignores a stored once
    const due = monthPlan(withSteuer({ mode: 'once', salaryMonth: P2 }), P2, goldenSettings(), 25);
    expect(due.months.map((m) => m.transfer)).toEqual(monthPlan(withSteuer(), P2, goldenSettings(), 25).months.map((m) => m.transfer));
  });

  it('„Nächster großer Monat“: voll angespart → saved; ab dem angezeigten Monat, nicht für vergangene', () => {
    const plan = monthPlan(withSteuer({ mode: 'once', salaryMonth: P2 }), P2, custom, 25);
    expect(bigMonthFrom(plan, '2026-11')).toBeNull();
    expect(bigMonthFrom(plan, P2)).toEqual(plan.bigMonth);
    const june = bigMonthFrom(plan, '2027-02')!;
    expect(june.period >= '2027-02').toBe(true);
    const saved = goldenDataset();
    saved.positions = saved.positions.map((p) => (p.id === 'g-steuer' ? { ...p, saving: { mode: 'once' as const, salaryMonth: P2 } } : p));
    const jan = bigMonthFrom(monthPlan(saved, P2, custom, 25), P3);
    expect(jan?.period).toBe(P3);
    expect(jan?.saved).toBe(true);
    expect(bigMonthFrom(monthPlan(goldenDataset(), P2, custom, 25), P3)?.saved).toBe(false);
  });
});

describe('① = Summe der Liste', () => {
  const cases: [string, SavingSetting | undefined][] = [
    ['ohne Einstellung', undefined],
    ['komplett', { mode: 'once', salaryMonth: P2 }],
    ['Teilbetrag', { mode: 'once', salaryMonth: P3, amount: 3333 }],
    ['ansparen', { mode: 'spread', startMonth: P2 }],
  ];
  for (const [name, saving] of cases)
    it(name, () => {
      const ds = withSteuer(saving);
      for (const settings of [custom, goldenSettings({ planMode: 'custom', roundingOn: true, rounding: 10 })]) {
        const plan = monthPlan(ds, P2, settings, 25);
        for (const m of plan.months) {
          const card = monthCard(ds, m.period, plan, 25, TODAY);
          expect(card.reserve.items.reduce((a, i) => a + cents(i.amount), 0)).toBe(cents(card.reserve.total));
          expect(cents(card.reserve.total)).toBe(cents(m.transfer));
        }
      }
    });
});

describe('Export/Import mit und ohne neues Feld', () => {
  it('saving once samt Teilbetrag reist mit; ohne Feld zählt die Zahlung bei Fälligkeit', async () => {
    const source = newDb();
    const ds = withSteuer();
    await source.categories.bulkPut(ds.categories);
    await source.positions.bulkPut(ds.positions);
    await source.monthClose.bulkPut(ds.monthClose);
    await setPlanMode(source, 'due');
    await setSaving(source, { 'k-steuer': { mode: 'once', salaryMonth: P2, amount: 12000 } });
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    expect(file.data.positions.find((p) => p.id === 'k-steuer')!.saving).toEqual({ mode: 'once', salaryMonth: P2, amount: 12000 });

    const withField = newDb();
    await importIntoEmpty(withField, file);
    expect((await withField.positions.get('k-steuer'))!.saving).toEqual({ mode: 'once', salaryMonth: P2, amount: 12000 });
    expect(month(await loadDataset(withField), MAR).transfer).toBe(120);

    const without: BackupFile = { ...file, data: { ...file.data, positions: file.data.positions.map(({ saving: _s, ...p }) => p as Position) } };
    const withoutField = newDb();
    await importIntoEmpty(withoutField, parseBackup(JSON.parse(JSON.stringify(without))));
    expect((await withoutField.positions.get('k-steuer'))!.saving).toBeUndefined();
    expect(month(await loadDataset(withoutField), MAR).transfer).toBe(240);
  });
});
