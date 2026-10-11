import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { yearForecast } from './analytics';
import { fixedCosts, fixedCostsAvg, sumMoney } from './calc';
import type { Dataset, Position } from './types';

const OCT = '2026-10';

function once(id: string, name: string, categoryId: string, amount: number, dueDate: string): Position {
  return {
    id,
    name,
    categoryId,
    history: [{ validFrom: dueDate.slice(0, 7), amount, frequency: 'once', dueMonths: [Number(dueDate.slice(5, 7))], dueDay: 1, dueDate }],
    createdAt: '2026-10-05T08:00:00.000Z',
    sortOrder: 100,
  };
}

/** Seed plus one-time payments in expense categories and in Vermögensaufbau. */
function data(): Dataset {
  const ds = fixtureDataset();
  ds.positions.push(
    once('p1', 'iPhones + Zubehör', 'cat-abos', 2826, '2026-11-03'),
    once('p2', 'Hotel Copenhagen', 'cat-abos', 620, '2026-11-01'),
    once('p3', 'Hotel MUC', 'cat-wohnen', 130, '2026-12-01'),
    once('p4', 'Sondertilgung Depot', 'cat-investing', 5000, '2026-11-15'),
  );
  return ds;
}

describe('Jahresvorschau: consistent with the month screen', () => {
  it('Ø line === tile „Ø pro Monat“ (fixedCostsAvg of today), also with future changes', () => {
    const ds = data();
    expect(yearForecast(ds, OCT).average).toBe(fixedCostsAvg(ds, OCT));
    // a dated change inside the window does not move the line away from the tile
    const kredit = ds.positions.find((p) => p.id === 'pos-miete')!;
    kredit.history.push({ ...kredit.history[0]!, validFrom: '2027-04', amount: 1100, changedOn: '2027-04-01' });
    expect(yearForecast(ds, OCT).average).toBe(fixedCostsAvg(ds, OCT));
  });

  it('every month = fixedCosts of that month (expense categories only, incl. one-time payments)', () => {
    const ds = data();
    for (const m of yearForecast(ds, OCT).months) expect(m.due).toBe(fixedCosts(ds, m.period));
  });

  it('no Vermögensaufbau positions: Investing, and „Meine Immos“ once marked as savings', () => {
    const ds = data();
    ds.categories.find((c) => c.id === 'cat-immos')!.kind = 'savings';
    const savingsIds = new Set(ds.positions.filter((p) => ['cat-investing', 'cat-immos'].includes(p.categoryId)).map((p) => p.name));
    const f = yearForecast(ds, OCT);
    for (const m of f.months) for (const i of m.items) expect(savingsIds.has(i.name), i.name).toBe(false);
    expect(f.months[0]!.due).toBe(2664 - 991 + 2826 + 620); // Nov without Immos and without the Sondertilgung
    expect(f.months.find((m) => m.period === '2027-06')!.items.map((i) => i.name)).not.toContain('Baurechtszins');
  });

  it('footer: total = sum of the 12 months, „davon einmalig“ = sum of the one-time payments', () => {
    const f = yearForecast(data(), OCT);
    expect(f.total).toBe(sumMoney(f.months.map((m) => m.due)));
    expect(f.onceTotal).toBe(2826 + 620 + 130);
    expect(f.onceTotal).toBe(sumMoney(f.months.map((m) => m.once)));
  });

  it('items sorted by amount, largest first; November peak', () => {
    const f = yearForecast(data(), OCT);
    expect(f.months[0]!.items.map((i) => [i.name, i.amount, !!i.once])).toEqual([
      ['iPhones + Zubehör', 2826, true],
      ['Hotel Copenhagen', 620, true],
    ]);
    expect(f.months[0]!.once).toBe(3446);
    expect(f.peak!.period).toBe('2026-11');
    expect(f.months[0]!.due).toBe(6110);
  });
});

describe('Jahresvorschau: bar colour follows the Ø line', () => {
  it('aboveAverage only for months above fixedCostsAvg(today)', () => {
    const ds = data();
    const f = yearForecast(ds, OCT);
    for (const m of f.months) expect(m.aboveAverage).toBe(Math.round(m.due * 100) > Math.round(f.average * 100));
    expect(f.months.filter((m) => m.aboveAverage).map((m) => m.period)).toEqual(['2026-11', '2026-12', '2027-02', '2027-10']);
  });
});
