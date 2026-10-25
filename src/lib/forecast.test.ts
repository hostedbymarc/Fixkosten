import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { categoryDistribution, forecastRange, forecastSummary, yearForecast } from './analytics';
import { fixedCosts, fixedCostsAvg, monthFigures, sumMoney } from './calc';
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
  it('seed: Ø line = sum of „Verteilung nach Kategorie“ (± 1 cent) = tile „Ø pro Monat“', () => {
    const ds = fixtureDataset();
    const f = yearForecast(ds, OCT);
    expect(Math.abs(f.average - categoryDistribution(ds, OCT).total)).toBeLessThanOrEqual(0.01);
    expect(f.average).toBe(fixedCostsAvg(ds, OCT));
    expect(f.average).toBe(2952.17);
  });

  it('one-time payments and one-offs never move the Ø line', () => {
    const ds = data();
    ds.oneOffs.push({ id: 'o', period: '2027-01', positionId: 'pos-strom', amount: 120, label: 'Nachzahlung' });
    const f = yearForecast(ds, OCT);
    expect(f.average).toBe(2952.17);
    expect(f.months.find((m) => m.period === '2027-01')!.regular).toBe(2713);
  });

  it('a position starting later / a dated change: the Ø line stays today’s value, like the distribution', () => {
    const ds = data();
    const miete = ds.positions.find((p) => p.id === 'pos-miete')!;
    miete.history.push({ ...miete.history[0]!, validFrom: '2027-04', amount: 1100, changedOn: '2027-04-01' });
    ds.positions.push({
      id: 'p-new',
      name: 'Neues Abo',
      categoryId: 'cat-abos',
      history: [{ validFrom: '2026-12', amount: 30, frequency: 'monthly', dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
      createdAt: '2026-10-05T08:00:00.000Z',
      sortOrder: 99,
    });
    const f = yearForecast(ds, OCT);
    expect(f.average).toBe(2952.17);
    expect(Math.abs(f.average - categoryDistribution(ds, OCT).total)).toBeLessThanOrEqual(0.01);
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
    expect(f.months.find((m) => m.period === '2026-11')!.due).toBe(2664 - 991 + 2826 + 620); // Nov without Immos and without the Sondertilgung
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
    const nov = f.months.find((m) => m.period === '2026-11')!;
    expect(nov.items.map((i) => [i.name, i.amount, !!i.once])).toEqual([
      ['iPhones + Zubehör', 2826, true],
      ['Hotel Copenhagen', 620, true],
    ]);
    expect(nov.once).toBe(3446);
    expect(f.peak!.period).toBe('2026-11');
    expect(nov.due).toBe(6110);
  });
});

describe('Jahresvorschau: bar colour follows the Ø line', () => {
  it('aboveAverage only for months above fixedCostsAvg(today)', () => {
    const ds = data();
    const f = yearForecast(ds, OCT);
    const today = fixedCostsAvg(ds, OCT);
    for (const m of f.months) expect(m.aboveAverage).toBe(Math.round(m.due * 100) > Math.round(today * 100));
    expect(f.months.filter((m) => m.aboveAverage).map((m) => m.period)).toEqual(['2026-10', '2026-11', '2026-12', '2027-02']);
  });

  it('heading: „€ 3.158 über Ø“ = 6.110 − 2.952,17, rounded', () => {
    const s = forecastSummary(yearForecast(data(), OCT));
    expect([s.value, s.sub].map((t) => t.replace(/\u00a0/g, ' '))).toEqual(['Nov 2026 · € 6.110', '€ 3.158 über Ø']);
  });
});

describe('Zeitraum und Aufschlag ab Jänner', () => {
  it('Zeitraum unter der Überschrift: aktueller Monat + 11, der erste Balken = Gesamt im Monat', () => {
    expect(forecastRange(yearForecast(fixtureDataset(), OCT))).toBe('Okt 2026 – Sep 2027');
    expect(forecastRange(yearForecast(fixtureDataset(), '2026-11'))).toBe('Nov 2026 – Okt 2027');
    for (const today of ['2026-10', '2026-11', '2027-02']) {
      expect(yearForecast(data(), today).months[0]!.due, today).toBe(monthFigures(data(), today).total);
    }
  });

  it('der Jahreswechsel addiert nichts: regulär = heutige Monatsposten + die in dem Monat fälligen nicht-monatlichen', () => {
    const ds = fixtureDataset();
    const f = yearForecast(ds, OCT);
    const monthlyToday = 2664; // 13 monatliche Ausgaben-Posten der Seed-Daten
    const extra: Record<string, number> = { '2026-10': 49 + 690, '2026-12': 262.02 + 87, '2027-01': 49, '2027-02': 1260 + 686, '2027-04': 49, '2027-06': 262.02, '2027-07': 49, '2027-09': 15, '2027-10': 49 + 690 };
    for (const m of f.months) expect(m.regular, m.period).toBeCloseTo(monthlyToday + (extra[m.period] ?? 0), 2);
  });
});
