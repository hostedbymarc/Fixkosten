import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import {
  actualForPeriod,
  amountForPeriod,
  annualCost,
  annualizedSavingsFromChanges,
  currentPlan,
  dueDayInPeriod,
  defaultDueMonths,
  dueInPeriod,
  dueItems,
  equivalentByCategory,
  expectedSavings,
  expectedSpend,
  freeCalculated,
  freeGap,
  groupByCategory,
  monthlyEquivalent,
  openFromPrevious,
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
  return fixtureDataset();
}

function categoryDue(ds: Dataset, period: string, categoryId: string): number {
  return groupByCategory(dueItems(ds, period)).find((g) => g.category.id === categoryId)?.planned ?? 0;
}

function categoryEquivalent(ds: Dataset, period: string, categoryId: string): number {
  return equivalentByCategory(ds, period).find((c) => c.category.id === categoryId)!.monthly;
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

  it('Meine Immos: monthly € 991, spread € 1.034,67, due Jun/Dec € 1.253,02', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos', frequency: 'monthly' })).toBe(991);
    expect(Math.round(categoryEquivalent(ds, OCT, 'cat-immos') * 100)).toBe(103467);
    expect(categoryDue(ds, '2027-06', 'cat-immos')).toBe(1253.02);
    expect(categoryDue(ds, '2026-12', 'cat-immos')).toBe(1253.02);
    expect(categoryDue(ds, OCT, 'cat-immos')).toBe(991);
    expect(ds.positions.filter((p) => p.categoryId === 'cat-immos').map((p) => p.name)).toEqual([
      'Kredit 1220', 'BK 1220', 'BK 1160', 'Baurechtszins',
    ]);
  });

  it('Wohnen & Leben monthly = spread € 1.602; Abos & Freizeit monthly € 71', () => {
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-wohnen', frequency: 'monthly' })).toBe(1602);
    expect(categoryEquivalent(ds, OCT, 'cat-wohnen')).toBe(1602);
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-abos', frequency: 'monthly' })).toBe(71);
  });

  it('true monthly burden = sum of all categories spread, rounded after summing', () => {
    const sum = equivalentByCategory(ds, OCT).reduce((acc, c) => acc + c.monthly, 0);
    expect(Math.round(sum * 100)).toBe(295217);
    expect(Math.round(trueMonthlyBurden(ds, OCT) * 100)).toBe(295217);
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

/** Adds a plan version from `validFrom` with a new amount (schedule unchanged). */
function changeAmount(p: Position, validFrom: string, amount: number): void {
  const base = currentPlan(p, validFrom)!;
  p.history.push({ ...base, validFrom, amount });
}

describe('versioned plans (history)', () => {
  it('amount change applies from validFrom, past months unchanged', () => {
    const ds = seed();
    const handy = position(ds, 'pos-handy');
    changeAmount(handy, '2027-01', 8);
    expect(amountForPeriod(handy, '2026-12')).toBe(10);
    expect(amountForPeriod(handy, '2027-01')).toBe(8);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(plannedForPeriod(ds, '2027-03')).toBe(2664 - 2);
  });

  it('schedule change: quarterly → annual from 2027 moves due months', () => {
    const ds = seed();
    const depot = position(ds, 'pos-depotentgelt');
    depot.history.push({ validFrom: '2027-01', amount: 120, frequency: 'annual', dueMonths: [3] });
    expect(dueInPeriod(depot, '2026-10')).toBe(true);
    expect(dueInPeriod(depot, '2027-01')).toBe(false);
    expect(dueInPeriod(depot, '2027-03')).toBe(true);
    expect(monthlyEquivalent(depot, '2026-10')).toBeCloseTo(35 / 3, 9);
    expect(monthlyEquivalent(depot, '2027-03')).toBe(10);
  });

  it('ticked months keep their payment snapshot even if the plan entry is corrected', () => {
    const ds = seed();
    position(ds, 'pos-handy').history[0]!.amount = 8; // typo correction of the Oct entry
    const item = dueItems(ds, OCT).find((i) => i.position.id === 'pos-handy')!;
    expect(item.planned).toBe(10);
    expect(item.delta).toBe(0);
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2662);
  });

  it('optimisations come from the ChangeLog: Handy 15 → 10 saves € 60/year, corrections never count', () => {
    const ds = seed();
    const handy = position(ds, 'pos-handy');
    const plan = (amount: number, validFrom: string) => ({ ...handy.history[0]!, validFrom, amount });
    ds.changeLog.push(
      { id: 'c1', at: '', positionId: 'pos-handy', type: 'amount', validFrom: '2026-10', from: plan(15, '2026-01'), to: plan(10, '2026-10') },
      { id: 'c2', at: '', positionId: 'pos-gym', type: 'amount', validFrom: '2027-01', from: { ...plan(35, '2026-10') }, to: plan(40, '2027-01') },
      { id: 'c3', at: '', positionId: 'pos-cash', type: 'amount', validFrom: '2027-01', from: plan(400, '2026-10'), to: plan(300, '2027-01') },
      { id: 'c4', at: '', positionId: 'pos-strom', type: 'corrected', validFrom: '2026-10', from: plan(64, '2026-10'), to: plan(60, '2026-10') },
    );
    const result = annualizedSavingsFromChanges(ds, { from: '2026-01', to: '2027-12' });
    expect(result.changes.map((c) => [c.position.name, c.annualSavings, c.annualDelta])).toEqual([
      ['Gym', -60, 60],
      ['Handy', 60, -60],
    ]);
    expect(result.total).toBe(0);
    expect(annualizedSavingsFromChanges(ds, { from: '2026-10', to: '2026-12' }).total).toBe(60);
  });

  it('archived positions drop out from the archive month, history stays', () => {
    const ds = seed();
    position(ds, 'pos-gym').archivedAt = '2026-12-15';
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(plannedForPeriod(ds, '2026-12')).toBeCloseTo(2978.02, 9);
  });

  it('a paid position archived in the same month still shows in that month', () => {
    const ds = seed();
    position(ds, 'pos-gym').archivedAt = '2026-10-04';
    expect(dueItems(ds, OCT).some((i) => i.position.id === 'pos-gym')).toBe(true);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664 - 35);
  });

  it('pauses between archive and restore stay empty', () => {
    const ds = seed();
    position(ds, 'pos-gym').pauses = [{ from: '2026-11', to: '2027-01' }];
    expect(plannedForPeriod(ds, '2026-12')).toBeCloseTo(2978.02, 9);
    expect(dueInPeriod(position(ds, 'pos-gym'), '2027-01')).toBe(false);
    expect(dueInPeriod(position(ds, 'pos-gym'), '2027-02')).toBe(true);
  });

  it('due day 31 means the last day of the month', () => {
    expect(dueDayInPeriod(31, '2027-02')).toBe(28);
    expect(dueDayInPeriod(31, '2028-02')).toBe(29);
    expect(dueDayInPeriod(31, '2026-11')).toBe(30);
    expect(dueDayInPeriod(3, '2026-10')).toBe(3);
  });
});

describe('actuals, deltas, one-offs', () => {
  it('delta = actual − planned; ticked one-offs count into actuals', () => {
    const ds = seed();
    const strom = ds.payments.find((p) => p.positionId === 'pos-strom')!;
    strom.actualAmount = 76;
    const item = dueItems(ds, OCT).find((i) => i.position.id === 'pos-strom')!;
    expect(item.delta).toBe(12);
    ds.oneOffs.push({ id: 'o1', positionId: 'pos-strom', period: OCT, amount: -40.5, label: 'Gutschrift' });
    expect(actualForPeriod(ds, OCT)).toBe(3368 + 12);
    ds.oneOffs[0]!.paidAt = '2026-10-20T10:00:00.000Z';
    expect(actualForPeriod(ds, OCT)).toBe(3368 + 12 - 40.5);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
  });

  it('Nachzahlung € 120 in Nov 2026: expectedSpend +120, plan and Ø pro Monat unchanged', () => {
    const ds = seed();
    const before = expectedSpend(ds, '2026-11');
    ds.oneOffs.push({ id: 'o1', positionId: 'pos-strom', period: '2026-11', amount: 120, label: 'Jahresabrechnung' });
    expect(expectedSpend(ds, '2026-11')).toBe(before + 120);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(Math.round(trueMonthlyBurden(ds, '2026-11') * 100)).toBe(295217);
    expect(annualizedSavingsFromChanges(ds, { from: '2026-01', to: '2027-12' }).total).toBe(0);
    const strom = dueItems(ds, '2026-11').find((i) => i.position.id === 'pos-strom')!;
    expect(strom.oneOffs.map((o) => o.amount)).toEqual([120]);
  });

  it('Gutschrift € 45: expectedSpend −45 and freeCalculated +45', () => {
    const ds = seed();
    ds.monthClose.push({ period: '2026-11', netSalary: 5000, updatedAt: '' });
    const spend = expectedSpend(ds, '2026-11');
    const free = freeCalculated(ds, '2026-11')!;
    ds.oneOffs.push({ id: 'o2', positionId: 'pos-strom', period: '2026-11', amount: -45, label: 'Gutschrift' });
    expect(expectedSpend(ds, '2026-11')).toBe(spend - 45);
    expect(freeCalculated(ds, '2026-11')).toBe(free + 45);
  });

  it('a one-off on a position not due that month shows as a carrier, never counted as plan', () => {
    const ds = seed();
    ds.oneOffs.push({ id: 'o3', positionId: 'pos-baurechtszins', period: '2026-11', amount: 12, label: 'Nachverrechnung' });
    const carrier = dueItems(ds, '2026-11').find((i) => i.position.id === 'pos-baurechtszins')!;
    expect(carrier.due).toBe(false);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(expectedSpend(ds, '2026-11')).toBe(2664 + 12);
  });
});

describe('open from previous months', () => {
  it('Depotentgelt open in Oct → shown in Nov under "Offen aus Oktober"; paid → Oct € 3.403, Nov unchanged', () => {
    const ds = seed();
    const groups = openFromPrevious(ds, '2026-11');
    expect(groups.map((g) => [g.period, g.items.map((i) => i.position.name), g.planned])).toEqual([
      ['2026-10', ['Depotentgelt'], 35],
    ]);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
    expect(periodProgress(ds, '2026-11').openCount).toBe(13);

    ds.payments.push({
      id: 'p-depot', positionId: 'pos-depotentgelt', period: OCT, status: 'paid',
      plannedAmount: 35, actualAmount: 35, paidAt: '2026-11-02T08:00:00.000Z',
    });
    expect(openFromPrevious(ds, '2026-11')).toEqual([]);
    expect(periodProgress(ds, OCT).paidActual).toBe(3403);
    expect(plannedForPeriod(ds, '2026-11')).toBe(2664);
  });

  it('"Entfallen" (skipped) counts nowhere and is no longer open', () => {
    const ds = seed();
    ds.monthClose.push({ period: OCT, netSalary: 5000, updatedAt: '' });
    ds.payments.push({
      id: 'p-skip', positionId: 'pos-depotentgelt', period: OCT, status: 'skipped',
      plannedAmount: 35, actualAmount: 0, paidAt: '2026-11-02T08:00:00.000Z',
    });
    expect(openFromPrevious(ds, '2026-11')).toEqual([]);
    expect(plannedForPeriod(ds, OCT)).toBe(3368);
    expect(expectedSpend(ds, OCT)).toBe(3368);
    expect(actualForPeriod(ds, OCT)).toBe(3368);
    expect(periodProgress(ds, OCT)).toMatchObject({ openCount: 0, planned: 3368, paidActual: 3368, ratio: 1 });
    expect(freeCalculated(ds, OCT)).toBe(5000 - 3368 - 800);
  });

  it('nothing before the first month with data is ever reported open', () => {
    const ds = seed();
    expect(openFromPrevious(ds, OCT)).toEqual([]);
    const groups = openFromPrevious(ds, '2027-01');
    expect(groups.map((g) => g.period)).toEqual(['2026-12', '2026-11', '2026-10']);
  });
});

describe('month close: salary, free money, savings rate', () => {
  function withClose(netSalary?: number, freeActual?: number): Dataset {
    const ds = seed();
    ds.monthClose.push({ period: OCT, netSalary, freeActual, updatedAt: '2026-10-31T18:00:00.000Z' });
    return ds;
  }

  it('without salary everything is null, never 0', () => {
    const ds = seed();
    expect(freeCalculated(ds, OCT)).toBeNull();
    expect(freeGap(ds, OCT)).toBeNull();
    expect(savingsRate(ds, OCT)).toBeNull();
    expect(freeGap(withClose(undefined, 650), OCT)).toBeNull();
  });

  it('Oct 2026, salary 5.000: spend 3.403, savings 800, free 797, actual 650 → gap −147, rate 16,0 %', () => {
    const ds = withClose(5000, 650);
    expect(expectedSpend(ds, OCT)).toBe(3403);
    expect(expectedSavings(ds, OCT)).toBe(800);
    expect(freeCalculated(ds, OCT)).toBe(797);
    expect(freeGap(ds, OCT)).toBe(-147);
    expect(savingsRate(ds, OCT)).toBeCloseTo(0.16, 9);
  });

  it('without freeActual there is a calculated value but no gap', () => {
    const ds = withClose(5000);
    expect(freeCalculated(ds, OCT)).toBe(797);
    expect(freeGap(ds, OCT)).toBeNull();
  });

  it('expectedSpend uses actuals for ticked and plan for open positions, plus one-offs', () => {
    const ds = withClose(5000, 650);
    ds.payments.find((p) => p.positionId === 'pos-strom')!.actualAmount = 76; // +12
    ds.oneOffs.push({ id: 'o1', period: OCT, amount: -40.5, label: 'Gutschrift' });
    expect(expectedSpend(ds, OCT)).toBe(3403 + 12 - 40.5);
    expect(freeCalculated(ds, OCT)).toBe(797 - 12 + 40.5);
  });

  it('salary is per month: other months stay null', () => {
    const ds = withClose(5000, 650);
    expect(freeCalculated(ds, '2026-11')).toBeNull();
  });
});
