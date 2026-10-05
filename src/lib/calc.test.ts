import { describe, expect, it } from 'vitest';
import { buildSeed } from '../db/seed';
import {
  actualForPeriod,
  amountForPeriod,
  annualCost,
  annualizedSavingsFromChanges,
  defaultDueMonths,
  dueInPeriod,
  dueItems,
  equivalentByCategory,
  freeCashflow,
  groupByCategory,
  monthlyEquivalent,
  periodProgress,
  plannedForPeriod,
  remindersForPeriod,
  reserveNeeded,
  savingsForPeriod,
  savingsRate,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
  upcomingDue,
} from './calc';
import type { Dataset, Position } from './types';

const OCT = '2026-10';
const FEB = '2027-02';

function seed(): Dataset {
  return buildSeed();
}

function position(ds: Dataset, id: string): Position {
  const p = ds.positions.find((x) => x.id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
}

describe('control values (seed, October 2026)', () => {
  const ds = seed();

  it('monthly expenses without investing: € 2.664', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
  });

  it('monthly incl. investing (old notes "GESAMT"): € 3.464', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { frequency: 'monthly' })).toBe(3464);
  });

  it('due October 2026 (expenses): € 3.403', () => {
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
  });

  it('reserve for non-monthly costs: € 288,17 / month', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'quarterly' })).toBeCloseTo(16.33, 2);
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'semiannual' })).toBeCloseTo(43.67, 2);
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'annual' })).toBeCloseTo(228.17, 2);
    expect(reserveNeeded(ds, OCT)).toBeCloseTo(288.17, 2);
    expect(Math.round(reserveNeeded(ds, OCT) * 100)).toBe(28817);
  });

  it('true monthly burden (expenses, spread): € 2.952,17', () => {
    expect(Math.round(trueMonthlyBurden(ds, OCT) * 100)).toBe(295217);
  });

  it('yearly sum of annual positions: € 2.738', () => {
    expect(annualCost(ds, OCT, { kind: 'expense', frequency: 'annual' })).toBe(2738);
  });

  it('due February (expenses): € 4.610', () => {
    expect(plannedForPeriod(ds, FEB)).toBe(4610);
  });

  it('hero: € 3.368 of € 3.403 paid, 1 open (Depotentgelt)', () => {
    const progress = periodProgress(ds, OCT);
    expect(progress.planned).toBe(3403);
    expect(progress.paidActual).toBe(3368);
    expect(progress.openCount).toBe(1);
    expect(progress.openPlanned).toBe(35);
    const open = dueItems(ds, OCT).filter((i) => i.kind === 'expense' && !i.payment);
    expect(open.map((i) => i.position.name)).toEqual(['Depotentgelt']);
  });

  it('investing never counts into fixed costs', () => {
    expect(plannedForPeriod(ds, OCT, 'savings')).toBe(800);
    expect(savingsForPeriod(ds, OCT)).toBe(800);
    expect(actualForPeriod(ds, OCT)).toBe(3368);
    expect(actualForPeriod(ds, OCT, 'savings')).toBe(800);
  });
});

describe('sum invariance: positions = categories = total', () => {
  const ds = seed();
  const periods = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-06', '2027-09'];

  it.each(periods)('due amounts in %s', (period) => {
    for (const kind of ['expense', 'savings'] as const) {
      const items = dueItems(ds, period).filter((i) => i.kind === kind);
      const positionCents = items.reduce((acc, i) => acc + Math.round(i.planned * 100), 0);
      const groupCents = groupByCategory(items).reduce((acc, g) => acc + Math.round(g.planned * 100), 0);
      const totalCents = Math.round(plannedForPeriod(ds, period, kind) * 100);
      expect(groupCents).toBe(positionCents);
      expect(totalCents).toBe(positionCents);
    }
  });

  it.each(periods)('monthly equivalents in %s', (period) => {
    const byPosition = ds.positions
      .filter((p) => ds.categories.find((c) => c.id === p.categoryId)?.kind === 'expense')
      .reduce((acc, p) => acc + monthlyEquivalent(p, period), 0);
    const byCategory = equivalentByCategory(ds, period).reduce((acc, c) => acc + c.monthly, 0);
    const total = trueMonthlyBurden(ds, period);
    expect(byCategory).toBeCloseTo(total, 9);
    expect(byPosition).toBeCloseTo(total, 9);
  });

  it('a year of due amounts equals 12 × true monthly burden', () => {
    const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
      '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09'];
    const yearCents = months.reduce((acc, p) => acc + Math.round(plannedForPeriod(ds, p) * 100), 0);
    expect(yearCents).toBe(Math.round(trueMonthlyBurden(ds, OCT) * 12 * 100));
  });
});

describe('due logic', () => {
  const ds = seed();

  it('quarterly positions are due in Jan/Apr/Jul/Oct only', () => {
    const p = position(ds, 'pos-depotentgelt');
    expect(dueInPeriod(p, '2026-10')).toBe(true);
    expect(dueInPeriod(p, '2026-11')).toBe(false);
    expect(dueInPeriod(p, '2027-01')).toBe(true);
  });

  it('nothing is due before the first amount is valid', () => {
    expect(plannedForPeriod(ds, '2026-09')).toBe(0);
  });

  it('upcoming shows non-monthly dues of the next 2 months', () => {
    const names = upcomingDue(ds, OCT, 2).map((i) => `${i.period} ${i.position.name}`);
    expect(names).toEqual(['2026-12 Baurechtszins', '2026-12 Parqet']);
  });

  it('reminders by month', () => {
    expect(remindersForPeriod(ds, '2026-11').map((r) => r.text)).toEqual([
      'Jahresabrechnung Strom/Gas/Wiener Netze',
    ]);
    expect(remindersForPeriod(ds, OCT)).toEqual([]);
  });

  it('default due months per frequency', () => {
    expect(defaultDueMonths('quarterly', 1)).toEqual([1, 4, 7, 10]);
    expect(defaultDueMonths('quarterly', 11)).toEqual([2, 5, 8, 11]);
    expect(defaultDueMonths('semiannual', 6)).toEqual([6, 12]);
    expect(defaultDueMonths('annual', 2)).toEqual([2]);
    expect(defaultDueMonths('monthly', 5)).toHaveLength(12);
  });
});

describe('amount history & archive', () => {
  it('amount change applies from validFrom, past months unchanged', () => {
    const ds = seed();
    const handy = position(ds, 'pos-handy');
    handy.amountHistory.push({ validFrom: '2027-01', amount: 8 });
    expect(amountForPeriod(handy, '2026-12')).toBe(10);
    expect(amountForPeriod(handy, '2027-01')).toBe(8);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(plannedForPeriod(ds, '2027-03')).toBe(2664 - 2);
  });

  it('annualized savings from changes: Handy 15 → 10 saves € 60/year', () => {
    const ds = seed();
    const handy = position(ds, 'pos-handy');
    handy.amountHistory = [
      { validFrom: '2026-01', amount: 15 },
      { validFrom: '2026-10', amount: 10 },
    ];
    const gym = position(ds, 'pos-gym');
    gym.amountHistory.push({ validFrom: '2027-01', amount: 40 }); // +5/month
    const cash = position(ds, 'pos-cash'); // savings never count as optimisation
    cash.amountHistory.push({ validFrom: '2027-01', amount: 300 });

    const result = annualizedSavingsFromChanges(ds, { from: '2026-01', to: '2027-12' });
    expect(result.changes.map((c) => [c.position.name, c.annualSavings])).toEqual([
      ['Gym', -60],
      ['Handy', 60],
    ]);
    expect(result.total).toBe(0);
    expect(annualizedSavingsFromChanges(ds, { from: '2026-10', to: '2026-12' }).total).toBe(60);
  });

  it('archived positions drop out from the archive month, history stays', () => {
    const ds = seed();
    position(ds, 'pos-gym').archivedAt = '2026-12-15T10:00:00.000Z';
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(plannedForPeriod(ds, '2026-12')).toBeCloseTo(2978.02, 9);
  });

  it('a paid position archived in the same month still shows in that month', () => {
    const ds = seed();
    position(ds, 'pos-gym').archivedAt = '2026-10-04T10:00:00.000Z';
    expect(dueItems(ds, OCT).some((i) => i.position.id === 'pos-gym')).toBe(true);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664 - 35);
  });
});

describe('actuals, deltas, one-offs', () => {
  it('delta = actual − planned; one-offs count into actuals', () => {
    const ds = seed();
    const strom = ds.payments.find((p) => p.positionId === 'pos-strom')!;
    strom.actualAmount = 76;
    const item = dueItems(ds, OCT).find((i) => i.position.id === 'pos-strom')!;
    expect(item.delta).toBe(12);
    ds.oneOffs.push({ id: 'o1', positionId: 'pos-strom', period: OCT, amount: -40.5, label: 'Gutschrift' });
    expect(actualForPeriod(ds, OCT)).toBe(3368 + 12 - 40.5);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
  });
});

describe('income, savings rate, free cashflow', () => {
  it('null without income', () => {
    const ds = seed();
    expect(savingsRate(ds, OCT)).toBeNull();
    expect(freeCashflow(ds, OCT)).toBeNull();
  });

  it('uses the income valid for the period', () => {
    const ds = seed();
    ds.income.push({ validFrom: '2026-10', netMonthly: 4000 }, { validFrom: '2027-01', netMonthly: 5000 });
    expect(savingsRate(ds, OCT)).toBeCloseTo(0.2, 9);
    expect(savingsRate(ds, '2027-01')).toBeCloseTo(0.16, 9);
    expect(freeCashflow(ds, OCT)).toBeCloseTo(247.83, 9);
  });
});
