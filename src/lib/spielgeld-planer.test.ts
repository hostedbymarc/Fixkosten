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
import { formatEUR } from './format';
import { standingOrder } from './fixkostenkonto';
import { kontoState } from './kontoBalance';
import { t } from './kontoTexts';
import { nextSalarySplit, salarySplit } from './salarySplit';
import { floor50, planFromMonths, spielgeldPlan, type SpielgeldMonth } from './spielgeldPlan';
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

describe('„Dein Spielgeld“: möglich je Monat, Status, Tipp', () => {
  const plan = spielgeldPlan(DATA, STATE, 1200)!;
  it('bis Februar möglich € 3.786,19, ab März € 4.113,00', () => {
    expect(plan.extra).toMatchObject({ from: NOV, to: '2027-02', possible: 3786.19, reserve: 3235.81 });
    expect(plan.after).toMatchObject({ from: '2027-03', possible: 4113 });
  });
  it('Spielgeld € 1.200 → „Passt“, übrig € 2.586,19', () => {
    expect(plan.status).toBe('ok');
    expect(plan.difference).toBe(2586.19);
  });
  it('Tipp: € 3.750 / € 4.100 (abgerundet auf € 50)', () => {
    expect(plan.tipExtra).toBe(3750);
    expect(plan.tipAfter).toBe(4100);
  });
  it('„Gerechnet mit“: der erste Monat', () => {
    expect(plan.months[0]).toMatchObject({ period: NOV, salary: 8302, estimated: false, reserve: 3235.81, direct: 480, wealth: 800, possible: 3786.19 });
  });
  it('fehlendes Netto: das zuletzt eingetragene, als „geschätzt“ markiert', () => {
    expect(plan.months.slice(1).every((m) => m.estimated && m.salary === 8302)).toBe(true);
  });
  it('die nicht eingeplanten Käufe ändern nichts an der Rechnung', () => {
    const without = data(PLANNED);
    expect(spielgeldPlan(without, kontoState(without, NOV, S), 1200)).toEqual(plan);
  });
  it('zu viel: Spielgeld € 4.000 > € 3.786,19 → fehlen € 213,81 jeden Monat bis Februar', () => {
    const over = spielgeldPlan(DATA, STATE, 4000)!;
    expect(over.status).toBe('over');
    expect(over.difference).toBe(213.81);
  });
  it('genau gleich: passt noch, übrig € 0', () => {
    const same = spielgeldPlan(DATA, STATE, 3786.19)!;
    expect(same.status).toBe('ok');
    expect(same.difference).toBe(0);
  });
  it('ohne Spielgeld: kein Status, der Tipp bleibt', () => {
    const none = spielgeldPlan(DATA, STATE, null)!;
    expect(none.status).toBeNull();
    expect(none.tipExtra).toBe(3750);
  });
  it('ohne Netto: keine Rechnung („Trag dein Netto-Gehalt ein …“)', () => {
    const ds = { ...DATA, monthClose: [] };
    expect(spielgeldPlan(ds, kontoState(ds, NOV, S), 1200)).toBeNull();
  });
  it('ohne Extra: eine Zeile „Möglich“, Status mit B', () => {
    const ds = data(PLANNED);
    const s = settings(10000);
    const st = kontoState(ds, NOV, s);
    expect(st.mode).toBeNull();
    const p = spielgeldPlan(ds, st, 4200)!;
    expect(p.extra).toBeNull();
    expect(p.after?.possible).toBe(4113);
    expect(p.status).toBe('over');
    expect(p.difference).toBe(87);
    expect(p.tipAfter).toBe(4100);
  });
  it('Texte: höchstens 12 Wörter je Satz, Du-Form', () => {
    const sentences = [
      t('plan.ok.until', { betrag: formatEUR(3235.81, { fixed: true }), monat: 'Februar' }),
      t('plan.ok.left', { betrag: formatEUR(2586.19, { fixed: true }) }),
      t('plan.over.until', { monat: 'Februar', betrag: formatEUR(213.81, { fixed: true }) }),
      t('plan.tip.until', { monat: 'Februar', betrag: formatEUR(3750) }),
      t('plan.tip.from', { monat: 'März', betrag: formatEUR(4100) }),
    ];
    expect(sentences[0]).toBe(`Du schaffst jeden Monat die ${formatEUR(3235.81, { fixed: true })} bis Februar.`);
    expect(sentences[3]).toBe(`Bis Februar kannst du dir bis zu ${formatEUR(3750)} Spielgeld erlauben.`);
    for (const s of sentences) expect(s.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

// „Auf einmal“ with data like yours: the open one-time amount € 980,43, to set aside by 24. Jänner
// („Neuer Monat beginnt am 25.“: February begins on 25 January, so it is due in the January period)
describe('„Auf einmal“: der Einmalbetrag im Monat, bis zu dem er fällig ist', () => {
  const LUMP = 980.43;
  const balance = Math.round((kontoState(DATA, NOV, settings(0), 25).gap - LUMP) * 100) / 100;
  const SL = settings(balance, { gapMode: 'lump' });
  const lumpState = kontoState(DATA, NOV, SL, 25);
  const plan = spielgeldPlan(DATA, lumpState, 1200)!;
  it('kontoState: auf einmal € 980,43 bis 24. Jänner, jeden Monat € 2.909', () => {
    expect(lumpState.mode).toBe('lump');
    expect(lumpState.lump).toBe(LUMP);
    expect(lumpState.gapFrom).toBe('2027-02');
    expect(lumpState.gapBy).toEqual(new Date(2027, 0, 24));
    expect(lumpState.months.slice(0, 4).every((m) => m.amount === 2909 && m.extra === 0)).toBe(true);
  });
  it('im Fälligkeitsmonat (Jänner) € 980,43 weniger möglich, die Monate davor nicht', () => {
    expect(plan.months.map((m) => [m.period, m.lump, m.possible]).slice(0, 4)).toEqual([
      [NOV, 0, 4113],
      ['2026-12', 0, 4113],
      ['2027-01', LUMP, 3132.57],
      ['2027-02', 0, 4113],
    ]);
  });
  it('„Bis Jänner möglich: € 3.132,57“ (mit Einmalbetrag), „Ab Februar möglich: € 4.113,00“', () => {
    expect(plan.extra).toMatchObject({ from: NOV, to: '2027-01', possible: 3132.57, reserve: 2909, lump: LUMP });
    expect(plan.after).toMatchObject({ from: '2027-02', possible: 4113, lump: 0 });
  });
  it('Status und Tipp gegen den Monat mit dem Einmalbetrag', () => {
    expect(plan.status).toBe('ok');
    expect(plan.difference).toBe(1932.57);
    expect(plan.tipExtra).toBe(3100);
    expect(plan.tipAfter).toBe(4100);
    const over = spielgeldPlan(DATA, lumpState, 3500)!;
    expect(over.status).toBe('over');
    expect(over.difference).toBe(367.43);
  });
  it('als zur Seite gelegt bestätigt: fällt weg, wieder wie ohne', () => {
    // confirmLump: the amount set aside grows by the one-time amount (a new anchor)
    const confirmed = kontoState(DATA, NOV, settings(balance + LUMP, { gapMode: 'lump' }), 25);
    expect(confirmed.mode).toBeNull();
    const after = spielgeldPlan(DATA, confirmed, 1200)!;
    expect(after.extra).toBeNull();
    expect(after.months.every((m) => m.lump === 0 && m.possible === 4113)).toBe(true);
    expect(after.after).toMatchObject({ from: NOV, possible: 4113 });
    // the same as without any gap
    const none = kontoState(DATA, NOV, settings(balance + LUMP), 25);
    expect(spielgeldPlan(DATA, none, 1200)).toEqual(after);
  });
  it('verteilt bleibt wie bisher (kein Einmalbetrag)', () => {
    expect(spielgeldPlan(DATA, STATE, 1200)!.months.every((m) => m.lump === 0)).toBe(true);
  });
  it('fällig vor dem ersten Monat des Plans: im ersten Monat', () => {
    // gapFrom = the active month: no month before it, the one-time amount is due now
    const now = { ...lumpState, gapFrom: NOV, months: lumpState.months };
    const p = spielgeldPlan(DATA, now, 1200)!;
    expect(p.months[0]).toMatchObject({ period: NOV, lump: LUMP, possible: 3132.57 });
    expect(p.extra).toMatchObject({ from: NOV, to: NOV });
  });
});

describe('Rechnung rein aus Monaten (planFromMonths)', () => {
  const m = (period: string, possible: number, extra = 0, reserve = 2909): SpielgeldMonth => ({ period, salary: 8302, estimated: false, reserve, extra, lump: 0, direct: 0, wealth: 0, possible });
  it('Minimum je Gruppe; Extra-Monate vorne', () => {
    const p = planFromMonths([m('2026-11', 3800, 1, 3200), m('2026-12', 3700, 1, 3300), m('2027-01', 4200), m('2027-02', 4000)], 1200);
    expect(p.extra).toMatchObject({ from: '2026-11', to: '2026-12', possible: 3700, reserve: 3300 });
    expect(p.after).toMatchObject({ from: '2027-01', to: '2027-02', possible: 4000 });
  });
  it('Tipp-Rundung: abgerundet auf € 50, nie unter 0', () => {
    expect(floor50(3786.19)).toBe(3750);
    expect(floor50(4113)).toBe(4100);
    expect(floor50(4100)).toBe(4100);
    expect(floor50(49.99)).toBe(0);
    expect(floor50(-120)).toBe(0);
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
