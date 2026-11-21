// monat-feinschliff-2: ONE salary = ONE entry. With „Neuer Monat beginnt am“ 25 the salary of 25 November is the
// „November-Gehalt“: the card „Dein Monat“ in the November screen (its next salary) and the tile of the December
// screen read and write the same month close (period 2026-12). Not entered yet: the same fallback in both.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { liveBackup } from '../../tests/fixtures/live';
import { monthPlan } from '../lib/monthPlan';
import { salaryName, salaryView } from '../lib/salaryMonth';
import { importIntoEmpty } from './backup';
import { FixkostenDB } from './db';
import { loadDataset, saveMonthClose } from './repo';
import { toKontoSettings } from './settings';

const opened: FixkostenDB[] = [];
async function seeded(): Promise<FixkostenDB> {
  const db = new FixkostenDB(`one-salary-${crypto.randomUUID()}`);
  opened.push(db);
  await importIntoEmpty(db, liveBackup());
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

const NOV = '2026-11';
const DEC = '2026-12';
const TODAY = new Date(2026, 10, 10);
// set up, November's transfer is in: the card shows the next salary (25 November)
const settings = toKontoSettings({ enabled: true, balance: 500, rounding: 5, roundingOn: false, setupDone: true, hasAccount: true, receivedFor: NOV, anchor: { amount: 500, at: '2026-11-01T08:00:00.000Z' } });

describe('Ein Gehalt = eine Zahl', () => {
  it('die Karte im November zeigt das November-Gehalt – dasselbe wie die Kachel im Dezember', async () => {
    const db = await seeded();
    const ds = await loadDataset(db);
    const plan = monthPlan(ds, NOV, settings, 25);
    expect(plan.first.period).toBe(DEC);
    expect(salaryName(plan.first.period, 25)).toBe('November-Gehalt');
    const tile = salaryView(ds, DEC, 25, TODAY);
    expect(tile.title).toBe('November-Gehalt');
    expect(tile.period).toBe(plan.first.period);
  });

  it('noch nicht eingetragen: dieselbe Fallback-Zahl in Karte und Kachel, die Kachel gedämpft', async () => {
    const db = await seeded();
    const ds = await loadDataset(db);
    const plan = monthPlan(ds, NOV, settings, 25);
    const tile = salaryView(ds, DEC, 25, TODAY);
    expect(tile.fallback).toBe(true);
    expect(tile.value).toBe(plan.first.salary);
    // the last one entered: November's month close (the October salary)
    expect(tile.value).toBe(ds.monthClose.find((m) => m.period === NOV)!.netSalary);
  });

  it('aus der Karte geschrieben (Zeitraum der Karte) = aus der Kachel geschrieben: ein Eintrag, beide zeigen ihn', async () => {
    const db = await seeded();
    let ds = await loadDataset(db);
    // the card writes its period (plan.first.period), as SalaryEdit does
    await saveMonthClose(db, monthPlan(ds, NOV, settings, 25).first.period, { netSalary: 8302.5 });
    ds = await loadDataset(db);
    expect(salaryView(ds, DEC, 25, TODAY)).toMatchObject({ value: 8302.5, fallback: false });
    expect(monthPlan(ds, NOV, settings, 25).first.salary).toBe(8302.5);
    // the tile (month close of December) writes the same entry: the card follows
    await saveMonthClose(db, DEC, { netSalary: 8100 });
    ds = await loadDataset(db);
    expect(monthPlan(ds, NOV, settings, 25).first.salary).toBe(8100);
    expect(ds.monthClose.filter((m) => m.period === DEC)).toHaveLength(1);
  });

  it('Monatsbeginn 1: Karte und Kachel desselben Monats', async () => {
    const db = await seeded();
    const ds = await loadDataset(db);
    const plan = monthPlan(ds, NOV, { ...settings, receivedFor: null }, 1);
    expect(plan.first.period).toBe(NOV);
    expect(salaryView(ds, NOV, 1, TODAY).value).toBe(plan.first.salary);
  });
});
