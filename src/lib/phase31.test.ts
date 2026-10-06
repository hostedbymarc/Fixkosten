import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import {
  burdenTrend,
  categoryDistribution,
  optimizationHeadline,
  optimizationTimeline,
  planVsActual,
  yearForecast,
} from './analytics';
import {
  dueItems,
  expectedSpend,
  freeCalculatedWith,
  isOnceDone,
  nextPlannedChange,
  openFromPrevious,
  plannedForPeriod,
  reserveNeeded,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
  upcomingDue,
} from './calc';
import type { Dataset, Position } from './types';

const OCT = '2026-10';
const cents = (v: number) => Math.round(v * 100);
const strip = (s: string) => s.replace(/ /g, ' ');

function position(ds: Dataset, id: string): Position {
  return ds.positions.find((p) => p.id === id)!;
}

/** One-time payment „Reparatur“ € 500 on 15.11.2026. */
function withRepair(ds = fixtureDataset()): Dataset {
  ds.positions.push({
    id: 'pos-reparatur',
    name: 'Reparatur',
    categoryId: 'cat-wohnen',
    history: [{ validFrom: '2026-11', amount: 500, frequency: 'once', dueMonths: [11], dueDay: 15, dueDate: '2026-11-15' }],
    createdAt: '2026-10-05T10:00:00.000Z',
    sortOrder: 30,
  });
  return ds;
}

/** Miete € 1.008 → € 1.050, dated change entered on 05.10.2026. */
function withRent(changedOn: string, ds = fixtureDataset()): Dataset {
  const miete = position(ds, 'pos-miete');
  miete.history.push({
    ...miete.history[0]!,
    validFrom: changedOn.slice(0, 7),
    amount: 1050,
    changedOn,
    reason: 'Indexanpassung',
    recordedAt: '2026-10-05T10:00:00.000Z',
  });
  return ds;
}

describe('control values without one-time payments or changes stay exact', () => {
  const ds = fixtureDataset();
  it('fällig Okt € 3.403, Ø € 2.952,17, monatlich € 2.664, Rücklage € 288,17', () => {
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(cents(trueMonthlyBurden(ds, OCT))).toBe(295217);
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
    expect(cents(reserveNeeded(ds, OCT))).toBe(28817);
    expect(yearForecast(ds, OCT).onceTotal).toBe(0);
  });
});

describe('Einmalig: Reparatur € 500, fällig 15.11.2026', () => {
  const ds = withRepair();

  it('due only in November: € 3.164', () => {
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(plannedForPeriod(ds, '2026-11')).toBe(3164);
    expect(plannedForPeriod(ds, '2026-12')).toBe(3013.02);
    expect(plannedForPeriod(ds, '2027-11')).toBe(2664); // not again next year
    const item = dueItems(ds, '2026-11').find((i) => i.position.id === 'pos-reparatur')!;
    expect(item.planned).toBe(500);
  });

  it('never spread: Ø pro Monat € 2.952,17, distribution and trend unchanged, no optimisation', () => {
    for (const p of [OCT, '2026-11', '2026-12']) expect(cents(trueMonthlyBurden(ds, p))).toBe(295217);
    expect(cents(reserveNeeded(ds, '2026-11'))).toBe(28817);
    expect(categoryDistribution(ds, '2026-11')).toEqual(categoryDistribution(fixtureDataset(), '2026-11'));
    expect(burdenTrend(ds, [OCT, '2026-11']).points).toEqual(burdenTrend(fixtureDataset(), [OCT, '2026-11']).points);
    expect(optimizationTimeline(ds, OCT).entries).toEqual([]);
  });

  it('forecast: Nov € 3.164 with a € 500 one-time part; sum € 35.926,04 = 12 × Ø + one-time payments', () => {
    const f = yearForecast(ds, OCT);
    const nov = f.months[0]!;
    expect([nov.period, nov.due, nov.once]).toEqual(['2026-11', 3164, 500]);
    expect(nov.items).toEqual([{ name: 'Reparatur', amount: 500, once: true }]);
    expect(f.total).toBe(35926.04);
    expect(f.onceTotal).toBe(500);
    expect(cents(f.average)).toBe(295217);
    expect(cents(f.total)).toBe(cents(f.average * 12) + cents(f.onceTotal));
  });

  it('counts into expected spend, free money and „Demnächst“', () => {
    expect(expectedSpend(ds, '2026-11')).toBe(3164);
    expect(freeCalculatedWith(ds, '2026-11', 5000)).toBe(5000 - 3164 - 800);
    expect(upcomingDue(ds, OCT).map((i) => i.position.name)).toContain('Reparatur');
  });

  it('done after the tick or after its month; unpaid → „Offen aus November“', () => {
    const p = position(ds, 'pos-reparatur');
    expect(isOnceDone(ds, p, OCT)).toBe(false);
    expect(isOnceDone(ds, p, '2026-11')).toBe(false);
    expect(isOnceDone(ds, p, '2026-12')).toBe(true);
    expect(openFromPrevious(ds, '2026-12').find((g) => g.period === '2026-11')!.items.map((i) => i.position.name)).toContain('Reparatur');
    const paid = withRepair();
    paid.payments.push({ id: 'x', positionId: 'pos-reparatur', period: '2026-11', status: 'paid', plannedAmount: 500, actualAmount: 480, paidAt: '2026-11-15T10:00:00.000Z' });
    expect(isOnceDone(paid, position(paid, 'pos-reparatur'), '2026-11')).toBe(true);
    expect(planVsActual(paid, ['2026-11'], '2026-12').rows[0]!.actual).toBe(480);
  });
});

describe('Betrag ändern: Miete € 1.008 → € 1.050 ab 01.04.2027 (entered today)', () => {
  const ds = withRent('2027-04-01');

  it('October unchanged, from April € 2.706 monthly, forecast April € 2.755, Ø € 2.994,17', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(sumMonthlyEquivalent(ds, '2027-04', { kind: 'expense', frequency: 'monthly' })).toBe(2706);
    const f = yearForecast(ds, OCT);
    expect(f.months.find((m) => m.period === '2027-04')!.due).toBe(2755);
    expect(f.months.find((m) => m.period === '2027-03')!.due).toBe(2664);
    expect(cents(trueMonthlyBurden(ds, '2027-04'))).toBe(299417);
  });

  it('badge: next change from the current month', () => {
    const next = nextPlannedChange(position(ds, 'pos-miete'), OCT)!;
    expect([next.changedOn, next.amount]).toEqual(['2027-04-01', 1050]);
    expect(nextPlannedChange(position(ds, 'pos-miete'), '2027-04')).toBeNull();
    expect(nextPlannedChange(position(ds, 'pos-strom'), OCT)).toBeNull();
  });

  it('optimisations: geplant +€ 504 / Jahr', () => {
    const t = optimizationTimeline(ds, OCT);
    expect(t.entries.map((e) => [e.position.name, e.changedOn, e.reason, e.annualDelta, e.planned])).toEqual([
      ['Miete', '2027-04-01', 'Indexanpassung', 504, true],
    ]);
    expect([t.plannedAnnual, t.implementedAnnual]).toEqual([504, 0]);
    expect(strip(optimizationHeadline(t))).toBe('Geplant: +€ 504 / Jahr');
  });

  it('trend marker in April: Miete +€ 42/Monat · Indexanpassung', () => {
    const t = burdenTrend(ds, ['2027-03', '2027-04']);
    expect(t.changes).toEqual({ '2027-04': [{ positionName: 'Miete', monthlyDelta: 42, reason: 'Indexanpassung' }] });
  });
});

describe('Betrag ändern ab 01.10.2026, Oktober-Miete schon mit € 1.008 abgehakt', () => {
  const ds = withRent('2026-10-01');

  it('payment stays € 1.008, plan October € 1.050, Plan vs. Ist −€ 42', () => {
    const payment = ds.payments.find((p) => p.positionId === 'pos-miete' && p.period === OCT)!;
    expect([payment.plannedAmount, payment.actualAmount]).toEqual([1008, 1008]);
    const item = dueItems(ds, OCT).find((i) => i.position.id === 'pos-miete')!;
    expect([item.planned, item.payment!.actualAmount, item.delta]).toEqual([1050, 1008, -42]);
    expect(plannedForPeriod(ds, OCT)).toBe(3445);
    const pva = planVsActual(ds, [OCT], '2026-11');
    expect(pva.rows[0]).toMatchObject({ planned: 3445, actual: 3368, delta: -77 });
    expect(pva.topDeviations[0]).toEqual({ positionName: 'Miete', period: OCT, delta: -42 });
  });

  it('the first entry stays in the history; the change counts as implemented +€ 504 / Jahr', () => {
    const t = optimizationTimeline(ds, OCT);
    expect(t.entries.map((e) => [e.from.amount, e.to.amount, e.planned])).toEqual([[1008, 1050, false]]);
    expect(strip(optimizationHeadline(t))).toBe('Umgesetzt: +€ 504 / Jahr');
  });

  it('a tick set after the change keeps its snapshot (typo corrections never rewrite ticked months)', () => {
    const later = withRent('2026-10-01');
    const p = later.payments.find((x) => x.positionId === 'pos-miete' && x.period === OCT)!;
    p.paidAt = '2026-10-06T09:00:00.000Z';
    p.plannedAmount = 1050;
    position(later, 'pos-miete').history[1]!.amount = 1060; // typo correction afterwards
    expect(dueItems(later, OCT).find((i) => i.position.id === 'pos-miete')!.planned).toBe(1050);
  });
});
