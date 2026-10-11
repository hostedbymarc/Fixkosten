import { describe, expect, it } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { SAVINGS_NET, SAVINGS_WEALTH, withSavings, type SavingsScenario } from '../../tests/fixtures/savings';
import { savingsAverage, savingsCard, savingsHistory, savingsPeriod } from './analytics';
import { netSalaryForPeriod, savingsRate, sumMoney, wealthBuilding } from './calc';
import { formatEUR, formatPercent as pct } from './format';

/** '38,8 %' with a plain space (Intl uses a no-break space) */
const formatPercent = (v: number) => pct(v).replace(/\s/g, ' ');
import type { Dataset } from './types';

const OCT = '2026-10';

function data(scenario: SavingsScenario = 'history'): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = withSavings(fixtureBackup(), scenario).data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

describe('Sparquote-Karte: Werte aus calc.ts', () => {
  it('Netto 4.788 / Vermögensaufbau 1.860 → 38,8 %, exakt savingsRate und wealthBuilding', () => {
    const ds = data();
    const card = savingsCard(ds, OCT)!;
    expect(card.period).toBe(OCT);
    expect(card.netSalary).toBe(SAVINGS_NET);
    expect(card.wealth).toBe(SAVINGS_WEALTH);
    expect(card.wealth).toBe(wealthBuilding(ds, OCT));
    expect(card.rate).toBe(savingsRate(ds, OCT));
    expect(formatPercent(card.rate)).toBe('38,8 %');
    expect(formatEUR(card.wealth).replace(/\s/g, ' ')).toBe('€ 1.860');
  });

  it('seed fixture: same values as calc.ts for every month with a Netto', () => {
    const ds = data();
    for (const m of ds.monthClose) {
      const card = savingsCard(ds, m.period)!;
      expect(card.rate).toBe(savingsRate(ds, m.period));
      expect(card.wealth).toBe(wealthBuilding(ds, m.period));
      expect(card.netSalary).toBe(netSalaryForPeriod(ds, m.period));
    }
  });

  it('Zusammensetzung: savings categories, add up to Vermögensaufbau, shares = amount / total', () => {
    const card = savingsCard(data(), OCT)!;
    expect(card.partsBy).toBe('category');
    expect(card.parts.map((p) => [p.name, p.amount])).toEqual([
      ['Investing', 1560],
      ['Altersvorsorge', 300],
    ]);
    expect(sumMoney(card.parts.map((p) => p.amount))).toBe(card.wealth);
    for (const p of card.parts) expect(p.share).toBeCloseTo(p.amount / card.wealth, 10);
    expect(formatPercent(card.parts[0]!.share)).toBe('83,9 %');
  });

  it('only one savings category → its positions; one-offs and paid amounts count like wealthBuilding', () => {
    const ds = data();
    ds.categories = ds.categories.filter((c) => c.id !== 'cat-vorsorge');
    ds.positions = ds.positions.filter((p) => p.categoryId !== 'cat-vorsorge');
    ds.payments.push({
      id: 'pay-cash-jul',
      positionId: 'pos-cash',
      period: '2026-07',
      status: 'paid',
      plannedAmount: 400,
      actualAmount: 350,
      paidAt: '2026-07-03T08:00:00.000Z',
    } as Dataset['payments'][number]);
    const card = savingsCard(ds, '2026-07')!;
    expect(card.partsBy).toBe('position');
    expect(card.parts.map((p) => [p.name, p.amount])).toEqual([
      ['ETF Welt', 1260],
      ['TR Sparpläne', 400],
      ['Cash', 350],
    ]);
    expect(sumMoney(card.parts.map((p) => p.amount))).toBe(wealthBuilding(ds, '2026-07'));
  });

  it('no Netto this month → latest month with Netto; none at all → null (empty state)', () => {
    const fallback = data('fallback');
    expect(savingsPeriod(fallback, OCT)).toBe('2026-09');
    expect(savingsCard(fallback, OCT)!.period).toBe('2026-09');
    expect(savingsCard(data('empty'), OCT)).toBeNull();
    expect(savingsHistory(data('empty'), OCT)).toEqual([]);
  });

  it('Sparquote above 100 % stays the real value', () => {
    const ds = data('one-month');
    ds.monthClose[0]!.netSalary = 1500;
    const card = savingsCard(ds, OCT)!;
    expect(card.rate).toBeCloseTo(1.24, 10);
    expect(formatPercent(card.rate)).toBe('124,0 %');
  });
});

describe('Sparquote-Verlauf', () => {
  it('month without Netto is a gap (null), not 0 %', () => {
    const points = savingsHistory(data(), OCT);
    expect(points.map((p) => p.period)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(points[1]).toEqual({ period: '2026-08', rate: null, wealth: null, netSalary: null });
    expect(points[0]!.wealth).toBe(2360); // incl. one-off Sondereinzahlung
  });

  it('Ø line = mean of the months with Netto; N counts only those', () => {
    const points = savingsHistory(data(), OCT);
    const avg = savingsAverage(points)!;
    expect(avg.months).toBe(3);
    expect(avg.average).toBeCloseTo((2360 / 4650 + 1860 / 4788 + 1860 / 4788) / 3, 12);
    expect(formatPercent(avg.average)).toBe('42,8 %');
  });

  it('< 3 months with Netto: savingsAverage tells the card to show no chart', () => {
    expect(savingsAverage(savingsHistory(data('one-month'), OCT))!.months).toBe(1);
  });

  it('at most `count` months, ending today', () => {
    const ds = data();
    for (let m = 1; m <= 12; m++) ds.monthClose.push({ period: `2025-${String(m).padStart(2, '0')}`, netSalary: 4000, updatedAt: '' });
    const points = savingsHistory(ds, OCT);
    expect(points).toHaveLength(12);
    expect(points[0]!.period).toBe('2025-11');
    expect(points[11]!.period).toBe(OCT);
    expect(savingsHistory(ds, OCT, 7).map((p) => p.period)[0]).toBe('2026-04');
  });
});
