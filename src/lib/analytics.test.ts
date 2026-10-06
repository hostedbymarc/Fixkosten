import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { historyDataset } from '../../tests/fixtures/history';
import {
  burdenTrend,
  categoryDistribution,
  dataMonths,
  distributionHeadline,
  forecastHeadline,
  historyPeriods,
  monthCloseHeadline,
  monthCloseSeries,
  optimizationTimeline,
  planVsActual,
  planVsActualHeadline,
  trendHeadline,
  trendTooShortText,
  yearForecast,
} from './analytics';
import { trueMonthlyBurden } from './calc';
import { formatCompactEUR, formatPercent } from './format';
import type { Dataset, PlanEntry } from './types';

const OCT = '2026-10';
const cents = (v: number) => Math.round(v * 100);

/** Plan change "ab validFrom" exactly as repo.changePlan logs it. */
function changeFrom(ds: Dataset, positionId: string, validFrom: string, amount: number) {
  const position = ds.positions.find((p) => p.id === positionId)!;
  const before = position.history[position.history.length - 1]!;
  const entry: PlanEntry = { ...before, validFrom, amount };
  position.history.push(entry);
  ds.changeLog.push({ id: `c-${positionId}`, at: '', positionId, type: 'amount', validFrom, from: before, to: entry });
}

describe('1 · year forecast (seed, Nov 2026 – Okt 2027)', () => {
  const f = yearForecast(fixtureDataset(), OCT);

  it('due expenses per month', () => {
    expect(f.months.map((m) => [m.period, m.due])).toEqual([
      ['2026-11', 2664],
      ['2026-12', 3013.02],
      ['2027-01', 2713],
      ['2027-02', 4610],
      ['2027-03', 2664],
      ['2027-04', 2713],
      ['2027-05', 2664],
      ['2027-06', 2926.02],
      ['2027-07', 2713],
      ['2027-08', 2664],
      ['2027-09', 2679],
      ['2027-10', 3403],
    ]);
  });

  it('invariance: 12 months = € 35.426,04 = 12 × € 2.952,17', () => {
    expect(f.total).toBe(35426.04);
    expect(cents(f.average)).toBe(295217);
    expect(cents(f.average * 12)).toBe(cents(f.total));
  });

  it('above average months and their non-monthly positions', () => {
    expect(f.months.filter((m) => m.aboveAverage).map((m) => m.period)).toEqual(['2026-12', '2027-02', '2027-10']);
    const feb = f.months.find((m) => m.period === '2027-02')!;
    expect(feb.items).toEqual([
      { name: 'Steuerberater', amount: 1260 },
      { name: 'Offi (Jahreskarte)', amount: 686 },
    ]);
    expect(f.months[0]!.items).toEqual([]);
  });

  it('headline: Teuerster Monat: Februar 2027 · € 4.610 · € 1.658 über Schnitt', () => {
    expect(forecastHeadline(f).replace(/ /g, ' ')).toBe('Teuerster Monat: Februar 2027 · € 4.610 · € 1.658 über Schnitt');
  });

  it('one-offs are due in their month and listed, the spread average stays', () => {
    const ds = fixtureDataset();
    ds.oneOffs.push({ id: 'o1', positionId: 'pos-strom', period: '2026-11', amount: 120, label: 'Nachzahlung' });
    const g = yearForecast(ds, OCT);
    expect(g.months[0]!.due).toBe(2784);
    expect(g.months[0]!.items).toEqual([{ name: 'Strom: Nachzahlung', amount: 120 }]);
    expect(cents(g.average)).toBe(295217);
  });
});

describe('2 · distribution (spread, seed)', () => {
  const d = categoryDistribution(fixtureDataset(), OCT);

  it('categories descending with control values', () => {
    expect(d.rows.map((r) => [r.category.name, Math.round(r.monthly * 100) / 100])).toEqual([
      ['Wohnen & Leben', 1602],
      ['Meine Immos', 1034.67],
      ['Banking & Finanzen', 180.08],
      ['Abos & Freizeit', 78.25],
      ['Mobilität', 57.17],
    ]);
  });

  it('invariance on unrounded values: categories = positions = € 2.952,17', () => {
    const sum = d.rows.reduce((acc, r) => acc + r.monthly, 0);
    expect(sum).toBeCloseTo(d.total, 9);
    expect(cents(d.total)).toBe(295217);
    for (const r of d.rows) expect(r.positions.reduce((acc, p) => acc + p.monthly, 0)).toBeCloseTo(r.monthly, 9);
    expect(d.rows.reduce((acc, r) => acc + r.share, 0)).toBeCloseTo(1, 12);
  });

  it('positions inside a category are sorted, investing never shows up', () => {
    const banking = d.rows.find((r) => r.category.id === 'cat-banking')!;
    expect(banking.positions.map((p) => p.position.name)).toEqual([
      'Steuerberater',
      'Amex Gebühr',
      'Depotentgelt',
      'Entgelt Kontoführung',
      'Amex Membership Rewards Turbo',
    ]);
    expect(d.rows.some((r) => r.category.kind === 'savings')).toBe(false);
    expect(distributionHeadline(d)).toBe(`Wohnen & Leben ist der größte Block: ${formatPercent(1602 / 2952.17)} deiner Fixkosten.`);
  });
});

describe('3 · month close', () => {
  it('Okt 2026: salary 5.000, actual 650 → calculated 797, gap −147, rate 16,0 %', () => {
    const ds = fixtureDataset();
    ds.monthClose.push({ period: OCT, netSalary: 5000, freeActual: 650, updatedAt: '' });
    const [row] = monthCloseSeries(ds, [OCT]);
    expect(row).toEqual({ period: OCT, calculated: 797, actual: 650, gap: -147, savingsRate: 0.16 });
    expect(monthCloseHeadline([row!])!.replace(/ /g, ' ')).toBe('Oktober 2026: € 147 weniger frei als rechnerisch · Sparquote 16,0 %');
  });

  it('months without month close are gaps (null), never 0', () => {
    const ds = fixtureDataset();
    expect(monthCloseSeries(ds, ['2026-09', OCT])).toEqual([
      { period: '2026-09', calculated: null, actual: null, gap: null, savingsRate: null },
      { period: OCT, calculated: null, actual: null, gap: null, savingsRate: null },
    ]);
    expect(monthCloseHeadline(monthCloseSeries(ds, [OCT]))).toBeNull();
  });
});

describe('6 · optimisations', () => {
  function withChanges() {
    const ds = fixtureDataset();
    changeFrom(ds, 'pos-handy', '2026-11', 8);
    changeFrom(ds, 'pos-gym', '2027-01', 38);
    // typo correction: logged as 'corrected', never an optimisation
    const strom = ds.positions.find((p) => p.id === 'pos-strom')!;
    ds.changeLog.push({ id: 'typo', at: '', positionId: 'pos-strom', type: 'corrected', validFrom: OCT, from: strom.history[0], to: { ...strom.history[0]!, amount: 46 } });
    return ds;
  }

  it('Handy −€ 24/Jahr, Gym +€ 36/Jahr, net +€ 12/Jahr, typo not included', () => {
    const t = optimizationTimeline(withChanges());
    expect(t.entries.map((e) => [e.position.name, e.from.amount, e.to.amount, e.validFrom, e.annualDelta])).toEqual([
      ['Gym', 35, 38, '2027-01', 36],
      ['Handy', 10, 8, '2026-11', -24],
    ]);
    expect(t.netAnnual).toBe(12);
  });

  it('empty without changes', () => {
    expect(optimizationTimeline(fixtureDataset())).toEqual({ entries: [], netAnnual: 0 });
  });

  it('the forecast follows the changes month by month', () => {
    const f = yearForecast(withChanges(), OCT);
    expect(f.months[0]!.due).toBe(2662); // Nov: Handy 8
    expect(f.months[2]!.due).toBe(2714); // Jan: Handy 8, Gym 38, quarterly 49
  });
});

describe('history window with 1 month of data (seed)', () => {
  const ds = fixtureDataset();

  it('every range is just October 2026', () => {
    expect(dataMonths(ds, OCT)).toBe(1);
    for (const r of ['6m', '12m', 'all'] as const) expect(historyPeriods(ds, OCT, r)).toEqual([OCT]);
  });

  it('trend: too short → card text', () => {
    expect(trendTooShortText(ds, OCT).replace(/ /g, ' ')).toBe(
      'Ab 3 Monaten siehst du hier die Entwicklung. Bisher: € 2.952,17 Ø pro Monat seit Okt 2026.',
    );
  });

  it('plan vs. actual: the running month is marked and never a deviation', () => {
    const p = planVsActual(ds, [OCT], OCT);
    expect(p.rows).toEqual([{ period: OCT, planned: 3403, actual: 3368, delta: null, running: true }]);
    expect(p.topDeviations).toEqual([]);
    expect(p.closedMonths).toBe(0);
    expect(planVsActualHeadline(p)).toBe('');
  });
});

describe('history fixture (24 months, Nov 2024 – Okt 2026)', () => {
  const ds = historyDataset();

  it('ranges: 6M / 12M / Alles', () => {
    expect(dataMonths(ds, OCT)).toBe(24);
    expect(historyPeriods(ds, OCT, '6m')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(historyPeriods(ds, OCT, '12m')[0]).toBe('2025-11');
    expect(historyPeriods(ds, OCT, '12m')).toHaveLength(12);
    expect(historyPeriods(ds, OCT, 'all')[0]).toBe('2024-11');
    expect(historyPeriods(ds, OCT, 'all')).toHaveLength(24);
  });

  it('trend: categories stack exactly to the spread total in every month', () => {
    const t = burdenTrend(ds, historyPeriods(ds, OCT, 'all'));
    for (const p of t.points) {
      const sum = Object.values(p.byCategory).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(p.total, 9);
      expect(p.total).toBe(trueMonthlyBurden(ds, p.period));
    }
    expect(cents(t.points[t.points.length - 1]!.total)).toBe(295217);
    expect(t.points[0]!.total).toBeLessThan(t.points[t.points.length - 1]!.total);
    expect(trendHeadline(t)).toMatch(/Ø pro Monat seit Nov 2024 \(\+\d+,\d\s%\)\.$/);
  });

  it('plan vs. actual: deltas, top 5, running month excluded', () => {
    const periods = historyPeriods(ds, OCT, '12m');
    const p = planVsActual(ds, periods, OCT);
    expect(p.rows).toHaveLength(12);
    expect(p.rows[11]).toMatchObject({ period: OCT, running: true, delta: null });
    for (const r of p.rows.slice(0, 11)) expect(r.delta).toBe(Math.round((r.actual - r.planned) * 100) / 100);
    expect(p.closedMonths).toBe(11);
    expect(p.topDeviations).toHaveLength(5);
    expect(p.topDeviations.every((d) => d.period !== OCT && d.period >= '2025-11')).toBe(true);
    const abs = p.topDeviations.map((d) => Math.abs(d.delta));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
    expect(p.totalDelta).toBe(Math.round(p.rows.reduce((a, r) => a + (r.delta ?? 0), 0) * 100) / 100);
  });

  it('month close has gaps where no close was entered', () => {
    const rows = monthCloseSeries(ds, historyPeriods(ds, OCT, 'all'));
    const missing = rows.filter((r) => r.calculated === null).map((r) => r.period);
    expect(missing).toEqual(['2025-05', '2026-02', '2026-10']);
    expect(rows.filter((r) => r.calculated !== null).every((r) => r.savingsRate !== null)).toBe(true);
  });

  it('optimisations from 24 months of changes, typo excluded', () => {
    const t = optimizationTimeline(ds);
    expect(t.entries.length).toBeGreaterThanOrEqual(4);
    expect(t.entries.some((e) => e.position.id === 'pos-strom' && e.validFrom === '2024-11')).toBe(false);
    expect(t.entries.map((e) => e.position.id)).not.toContain('pos-tr-sparplaene'); // savings never count
    expect(t.netAnnual).toBe(Math.round(t.entries.reduce((a, e) => a + e.annualDelta, 0) * 100) / 100);
  });
});

describe('axis format', () => {
  it('€ 3,4k on the axis', () => {
    expect(formatCompactEUR(3403)).toBe('€ 3,4k');
    expect(formatCompactEUR(4000)).toBe('€ 4k');
    expect(formatCompactEUR(850)).toBe('€ 850');
    expect(formatCompactEUR(-1200)).toBe('−€ 1,2k');
    expect(formatCompactEUR(0)).toBe('€ 0');
  });
});
