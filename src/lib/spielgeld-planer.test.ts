// spielgeld-planer: „Nicht einplanen“ at every sum, and „Dein Spielgeld“ with data like yours (rebuilt, no
// real data): Netto € 8.302, Zur Seite € 3.235,81 bis Februar and € 2.909 after, Direkt € 480,
// Vermögensaufbau € 800 → possible until February € 3.786,19, from March € 4.113,00.
import { describe, expect, it } from 'vitest';
import { toKontoSettings, type KontoSettings } from '../db/settings';
import { burdenTrend, categoryDistribution, optimizationTimeline, planVsActual, savingsCard, yearForecast } from './analytics';
import {
  actualForPeriod,
  costSources,
  dueItems,
  equivalentByCategory,
  fixedCostsAvg,
  groupByCategory,
  isPlanned,
  monthFigures,
  monthItems,
  monthStatus,
  openFromPrevious,
  plannedForPeriod,
  reserveNeeded,
  sumMonthlyEquivalent,
  upcomingDue,
  wealthBuildingAvg,
} from './calc';
import { standingOrder } from './fixkostenkonto';
import { kontoState } from './kontoBalance';
import { nextSalarySplit, salarySplit } from './salarySplit';
import type { Account, Category, Dataset, Position } from './types';
import { directCount } from './walkthrough';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NOV = '2026-11';
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Vermögensaufbau', kind: 'savings', color: '#5B5BD6', sortOrder: 1 },
];
const pos = (id: string, amount: number, opts: { months?: number[]; account?: Account; cat?: string; once?: string } = {}): Position => ({
  id,
  name: id,
  categoryId: opts.cat ?? 'fix',
  history: [
    opts.once
      ? { validFrom: opts.once.slice(0, 7), amount, frequency: 'once', dueMonths: [Number(opts.once.slice(5, 7))], dueDate: opts.once }
      : { validFrom: '2026-01', amount, frequency: (opts.months ?? ALL).length === 12 ? 'monthly' : 'annual', dueMonths: opts.months ?? ALL },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  ...(opts.account ? { account: opts.account } : {}),
});
const PLANNED = [pos('Miete', 2500), pos('Versicherung', 4908, { months: [2] }), pos('Lebensmittel', 480, { account: 'girokonto' }), pos('ETF', 800, { cat: 'va' })];
// two one-time purchases from the Spielgeld: „Nicht einplanen“
const UNPLANNED = [pos('Urlaub', 1800, { account: 'spielgeld', once: '2026-11-20' }), pos('Konzert', 1228.45, { account: 'spielgeld', once: '2026-11-25' })];
const data = (positions: Position[]): Dataset => ({
  categories: CATS,
  positions,
  payments: [],
  oneOffs: [],
  monthClose: [{ period: NOV, netSalary: 8302, updatedAt: '2026-11-01T00:00:00.000Z' }],
  reminders: [],
  changeLog: [],
});
const DATA = data([...PLANNED, ...UNPLANNED]);
const settings = (balance: number, patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance,
    rounding: 5,
    roundingOn: false,
    setupDone: true,
    hasAccount: true,
    receivedFor: null,
    gapMode: 'spread',
    anchor: { amount: balance, at: '2026-11-01T08:00:00.000Z' },
    spielgeld: 1200,
    ...patch,
  });
// the balance today that leaves a gap of € 1.307,24: spread over 4 deposits (Nov–Feb) € 326,81 extra each
const BALANCE = Math.round((kontoState(DATA, NOV, settings(0)).gap - 1307.24) * 100) / 100;
const S = settings(BALANCE);
const STATE = kontoState(DATA, NOV, S);

describe('Daten wie deine: Zur Seite € 3.235,81 bis Februar, danach € 2.909', () => {
  it('Grundbetrag, Extra und Monate', () => {
    expect(STATE.order).toBe(2909);
    expect(STATE.mode).toBe('spread');
    expect(STATE.gapFrom).toBe('2027-02');
    expect(STATE.months.slice(0, 4).map((m) => m.amount)).toEqual([3235.81, 3235.81, 3235.81, 3235.81]);
    expect(STATE.months[4]).toMatchObject({ period: '2027-03', amount: 2909, extra: 0 });
  });
});

describe('„Nicht einplanen“: an keiner Summenstelle', () => {
  const ds = DATA;
  const without = data(PLANNED);
  it('gespeichert als account „spielgeld“; sichtbar und abhakbar, aber nicht gezählt', () => {
    expect(UNPLANNED.every((p) => !isPlanned(p))).toBe(true);
    const items = dueItems(ds, NOV).filter((i) => i.unplanned);
    expect(items.map((i) => i.position.name).sort()).toEqual(['Konzert', 'Urlaub']);
  });
  it('Fixkosten-Summe, Hero, Abzüge, Fortschritt, „Alle n Rechnungen“', () => {
    const f = monthFigures(ds, NOV);
    expect(f).toEqual(monthFigures(without, NOV));
    expect(f.total).toBe(2980);
    expect(f.count).toBe(2);
    expect(f.deductions).toBe(3780);
  });
  it('Fortschritt: die Käufe bezahlt oder offen – gleich', () => {
    const paid = { ...ds, payments: UNPLANNED.map((p, i) => ({ id: `p${i}`, positionId: p.id, period: NOV, status: 'paid' as const, plannedAmount: 1, actualAmount: 1, paidAt: '2026-11-21T00:00:00.000Z' })) };
    expect(monthFigures(paid, NOV)).toEqual(monthFigures(without, NOV));
    expect(actualForPeriod(paid, NOV)).toBe(0);
  });
  it('Quellen „Woraus du bezahlst“', () => expect(costSources(ds, NOV)).toEqual({ reserve: 2500, salary: 480 }));
  it('Kategorie-Köpfe und Plan', () => {
    expect(groupByCategory(dueItems(ds, NOV)).map((g) => [g.planned, g.openCount])).toEqual(groupByCategory(dueItems(without, NOV)).map((g) => [g.planned, g.openCount]));
    expect(plannedForPeriod(ds, NOV)).toBe(plannedForPeriod(without, NOV));
  });
  it('Ø pro Monat, nicht monatlich, Vermögensaufbau Ø, je Kategorie', () => {
    expect(fixedCostsAvg(ds, NOV)).toBe(fixedCostsAvg(without, NOV));
    expect(reserveNeeded(ds, NOV)).toBe(reserveNeeded(without, NOV));
    expect(wealthBuildingAvg(ds, NOV)).toBe(wealthBuildingAvg(without, NOV));
    expect(sumMonthlyEquivalent(ds, NOV, { categoryId: 'fix' })).toBe(sumMonthlyEquivalent(without, NOV, { categoryId: 'fix' }));
    expect(equivalentByCategory(ds, NOV)).toEqual(equivalentByCategory(without, NOV));
  });
  it('Rücklage-Rechnung (Grundbetrag und Lage)', () => {
    expect(standingOrder(ds, NOV)).toEqual(standingOrder(without, NOV));
    expect(kontoState(ds, NOV, S)).toEqual(kontoState(without, NOV, S));
  });
  it('Gehalts-Aufteilung, aktuell und nächstes Gehalt', () => {
    expect(salarySplit(ds, NOV, STATE, S)).toEqual(salarySplit(without, NOV, STATE, S));
    expect(nextSalarySplit(ds, NOV, STATE, S)).toEqual(nextSalarySplit(without, NOV, STATE, S));
    expect(monthItems(ds, NOV).some((i) => i.name === 'Urlaub')).toBe(false);
  });
  it('Jahresvorschau und Analyse', () => {
    expect(yearForecast(ds, NOV)).toEqual(yearForecast(without, NOV));
    expect(categoryDistribution(ds, NOV)).toEqual(categoryDistribution(without, NOV));
    expect(planVsActual(ds, [NOV, '2026-12'], '2027-01')).toEqual(planVsActual(without, [NOV, '2026-12'], '2027-01'));
    expect(burdenTrend(ds, [NOV, '2026-12'])).toEqual(burdenTrend(without, [NOV, '2026-12']));
    expect(optimizationTimeline(ds, NOV)).toEqual(optimizationTimeline(without, NOV));
    expect(savingsCard(ds, NOV)).toEqual(savingsCard(without, NOV));
  });
  it('„Offen aus …“, Monatsraster, „Kommt bald“', () => {
    expect(openFromPrevious(ds, '2026-12', '2026-12').map((g) => [g.count, g.planned, g.items.map((i) => i.position.id)])).toEqual(
      openFromPrevious(without, '2026-12', '2026-12').map((g) => [g.count, g.planned, g.items.map((i) => i.position.id)]),
    );
    expect(monthStatus(ds, NOV, NOV)).toEqual(monthStatus(without, NOV, NOV));
    expect(upcomingDue(ds, '2026-10').map((i) => i.position.id)).toEqual(upcomingDue(without, '2026-10').map((i) => i.position.id));
  });
  it('Walkthrough: „{n} Posten zahlst du direkt“ zählt sie nicht', () => {
    expect(directCount(ds, NOV)).toBe(1);
  });
});
