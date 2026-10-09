import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { burdenTrend, categoryDistribution, monthCloseSeries, optimizationTimeline } from './analytics';
import {
  dueItems,
  fixedCosts,
  fixedCostsAvg,
  freeAfterFixed,
  freeAfterFixedAvg,
  planChanges,
  remainder,
  reserveNeeded,
  savingsRate,
  sumMoney,
  wealthBuilding,
  wealthBuildingAvg,
} from './calc';
import { addPeriods } from './period';
import type { Dataset } from './types';

const OCT = '2026-10';
const cents = (v: number) => Math.round(v * 100);

/** Seed with „Meine Immos“ marked as Vermögensaufbau (like the live data) and net salary € 4.788 in October. */
function live(immosAsWealth = true): Dataset {
  const ds = fixtureDataset();
  if (immosAsWealth) ds.categories.find((c) => c.id === 'cat-immos')!.kind = 'savings';
  ds.monthClose.push({ period: OCT, netSalary: 4788, updatedAt: '' });
  return ds;
}

/** Everything due in the month, computed without the kind split: actual if ticked, plan if open, plus one-offs. */
function allDue(ds: Dataset, period: string): number {
  const items = dueItems(ds, period)
    .filter((i) => i.due && i.status !== 'skipped')
    .map((i) => (i.status === 'paid' ? i.payment!.actualAmount : i.planned));
  return sumMoney([...items, ...ds.oneOffs.filter((o) => o.period === period).map((o) => o.amount)]);
}

describe('Regression „Frei verfügbar −€ 490“: savings category with monthly + semiannual positions', () => {
  it('Vermögensaufbau is never subtracted from „Frei verfügbar“; each position counted once', () => {
    const ds = live();
    // Meine Immos: Kredit 1220 € 735, BK 1220 € 169, BK 1160 € 87 monthly + Baurechtszins € 262,02 semiannual (Jun/Dec)
    expect(freeAfterFixed(ds, OCT)).toBe(4788 - fixedCosts(ds, OCT));
    expect(freeAfterFixed(ds, OCT)).toBe(2376);
    expect(cents(savingsRate(ds, OCT)!)).toBe(37); // 37,4 %, never 59,5 %
    // December: the semiannual Baurechtszins lands once, in Vermögensaufbau only
    expect(wealthBuilding(ds, '2026-12')).toBe(1791 + 262.02);
    expect(fixedCosts(ds, '2026-12')).toBe(allDue(ds, '2026-12') - 1791 - 262.02);
  });
});

describe('Control values (seed, „Meine Immos“ + „Investing“ as Vermögensaufbau, net € 4.788)', () => {
  const ds = live();

  it('month: fixed € 2.412, Vermögensaufbau € 1.791, free € 2.376, remainder € 585, rate 37,4 %', () => {
    expect(fixedCosts(ds, OCT)).toBe(2412);
    expect(wealthBuilding(ds, OCT)).toBe(1791);
    expect(freeAfterFixed(ds, OCT)).toBe(2376);
    expect(remainder(ds, OCT)).toBe(585);
    expect(Math.round(savingsRate(ds, OCT)! * 1000)).toBe(374);
  });

  it('average: fixed € 1.917,50, free € 2.870,50, Vermögensaufbau € 1.834,67, Jahreskosten € 244,50', () => {
    expect(cents(fixedCostsAvg(ds, OCT))).toBe(191750);
    expect(freeAfterFixedAvg(ds, OCT)).toBe(2870.5);
    expect(cents(wealthBuildingAvg(ds, OCT))).toBe(183467);
    expect(cents(reserveNeeded(ds, OCT))).toBe(24450);
  });

  it('Gegenprobe „Meine Immos“ as expense: fixed € 3.403, Vermögensaufbau € 800, rate 16,7 %', () => {
    const expense = live(false);
    expect(fixedCosts(expense, OCT)).toBe(3403);
    expect(wealthBuilding(expense, OCT)).toBe(800);
    expect(Math.round(savingsRate(expense, OCT)! * 1000)).toBe(167);
  });
});

describe('Invariance: every position in exactly one pot', () => {
  it('fixedCosts + wealthBuilding = everything due, every month of a year, both classifications', () => {
    for (const ds of [live(), live(false)]) {
      ds.oneOffs.push(
        { id: 'o1', period: OCT, positionId: 'pos-strom', amount: 50, label: 'Nachzahlung' },
        { id: 'o2', period: OCT, positionId: 'pos-kredit-1220', amount: -20, label: 'Gutschrift' },
      );
      for (let i = 0; i < 12; i++) {
        const p = addPeriods(OCT, i);
        expect(cents(fixedCosts(ds, p)) + cents(wealthBuilding(ds, p))).toBe(cents(allDue(ds, p)));
      }
    }
    expect(fixedCosts(live(), OCT) + wealthBuilding(live(), OCT)).toBe(4203);
  });
});

describe('Vermögensaufbau never counts as a fixed cost in the analysis', () => {
  const ds = live();

  it('distribution and trend show expense categories only', () => {
    const shares = categoryDistribution(ds, OCT);
    expect(JSON.stringify(shares)).not.toContain('cat-immos');
    expect(JSON.stringify(shares)).not.toContain('cat-investing');
    expect(cents(burdenTrend(ds, [OCT]).points[0]!.total)).toBe(191750);
  });

  it('optimisations ignore Vermögensaufbau positions', () => {
    const kredit = ds.positions.find((p) => p.id === 'pos-kredit-1220')!;
    kredit.history.push({ ...kredit.history[0]!, validFrom: '2026-11', amount: 700, changedOn: '2026-11-01' });
    expect(planChanges(ds)).toEqual([]);
    expect(optimizationTimeline(ds, OCT).entries).toEqual([]);
  });

  it('month close series: calculated = free after fixed costs, rate from Vermögensaufbau', () => {
    const [row] = monthCloseSeries(ds, [OCT]);
    expect(row!.calculated).toBe(2376);
    expect(Math.round(row!.savingsRate! * 1000)).toBe(374);
  });
});
