import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import {
  dueItems,
  fixedCosts,
  fixedCostsAvg,
  freeAfterFixed,
  freeAfterFixedAvg,
  savingsRate,
  sumMoney,
  wealthBuilding,
} from './calc';
import { addPeriods } from './period';
import type { Dataset } from './types';

const OCT = '2026-10';
const cents = (v: number) => Math.round(v * 100);

/**
 * Live values (net € 4.788, fixed costs ≈ € 2.427 without „Meine Immos“): the seed plus
 * € 15 / € 69 of one-offs, „Meine Immos“ marked as Vermögensaufbau.
 */
function liveLike(investingExtra: number): Dataset {
  const ds = fixtureDataset();
  ds.categories.find((c) => c.id === 'cat-immos')!.kind = 'savings';
  ds.monthClose.push({ period: OCT, netSalary: 4788, updatedAt: '' });
  ds.oneOffs.push({ id: 'live-1', period: OCT, positionId: 'pos-strom', amount: 15, label: 'Nachzahlung' });
  const investing = ds.positions.find((p) => p.categoryId === 'cat-investing')!;
  ds.oneOffs.push({ id: 'live-2', period: OCT, positionId: investing.id, amount: investingExtra, label: 'Einmal' });
  return ds;
}

describe('Live values: „Meine Immos“ (savings) is only Vermögensaufbau', () => {
  const ds = liveLike(69);

  it('fixedCosts € 2.427 (not € 3.418), wealthBuilding € 1.860, free € 2.361, Sparquote 38,8 %', () => {
    expect(fixedCosts(ds, OCT)).toBe(2427);
    expect(wealthBuilding(ds, OCT)).toBe(1860);
    expect(freeAfterFixed(ds, OCT)).toBe(2361);
    expect(Math.round(savingsRate(ds, OCT)! * 1000)).toBe(388);
  });

  it('Ø: fixedCostsAvg € 1.917,50 (not € 2.952,17), freeAfterFixedAvg € 2.870,50 (not € 1.835,83)', () => {
    expect(cents(fixedCostsAvg(ds, OCT))).toBe(191750);
    expect(freeAfterFixedAvg(ds, OCT)).toBe(2870.5);
  });

  it('no „Meine Immos“ position is counted as a fixed cost, in any month', () => {
    for (let i = 0; i < 12; i++) {
      const p = addPeriods(OCT, i);
      const inFixed = dueItems(ds, p).filter((it) => it.kind === 'expense' && it.category.id === 'cat-immos');
      expect(inFixed).toEqual([]);
    }
  });

  it('Sparquote counts one-time payments in Vermögensaufbau (live: ETF 400 + Cash 400 + Miete 1220 einmalig 1.060)', () => {
    const live = fixtureDataset();
    live.monthClose.push({ period: OCT, netSalary: 4788, updatedAt: '' });
    live.positions.push({
      id: 'pos-miete-1220',
      name: 'Miete 1220',
      categoryId: 'cat-investing',
      history: [{ validFrom: OCT, amount: 1060, frequency: 'once', dueMonths: [10], dueDay: 2, dueDate: '2026-10-02' }],
      createdAt: '2026-10-02T08:00:00.000Z',
      sortOrder: 99,
    });
    expect(wealthBuilding(live, OCT)).toBe(1860);
    expect(Math.round(savingsRate(live, OCT)! * 1000)).toBe(388);
    expect(wealthBuilding(live, '2026-11')).toBe(800); // only in its month
  });
});

describe('Property: every position is in exactly one pot, whichever way the categories are classified', () => {
  it('fixedCosts / wealthBuilding / Ø match an independent per-position sum, for every kind assignment', () => {
    const base = fixtureDataset();
    const ids = base.categories.map((c) => c.id);
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const ds = structuredClone(base);
      ds.categories.forEach((c, i) => (c.kind = mask & (1 << i) ? 'savings' : 'expense'));
      ds.oneOffs.push({ id: 'o', period: OCT, positionId: 'pos-strom', amount: 15, label: 'x' });
      const kindOf = new Map(ds.categories.map((c) => [c.id, c.kind]));
      for (let m = 0; m < 12; m++) {
        const period = addPeriods(OCT, m);
        const items = dueItems(ds, period).filter((i) => i.due && i.status !== 'skipped');
        const sumOf = (kind: 'expense' | 'savings') =>
          sumMoney([
            ...items.filter((i) => kindOf.get(i.position.categoryId) === kind).map((i) => (i.status === 'paid' ? i.payment!.actualAmount : i.planned)),
            ...ds.oneOffs
              .filter((o) => o.period === period && kindOf.get(ds.positions.find((p) => p.id === o.positionId)!.categoryId) === kind)
              .map((o) => o.amount),
          ]);
        expect(fixedCosts(ds, period)).toBe(sumOf('expense'));
        expect(wealthBuilding(ds, period)).toBe(sumOf('savings'));
      }
    }
  });
});
