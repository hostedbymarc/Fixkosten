import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { averageMonthExplanation, deductionsExplanation } from './explain';
import { fixedCostsAvg, freeAfterFixedAvg, netSalaryForPeriod, wealthBuildingAvg } from './calc';

const OCT = '2026-10';
const plain = (s: string) => s.replace(/ /g, ' ');

describe('Tooltip „im Ø-Monat“', () => {
  it('values = Netto, Ø pro Monat, Ø Vermögensaufbau and the result from calc.ts (4.788 / 2.952,17 / 800 / 1.035,83)', () => {
    const ds = fixtureDataset();
    ds.monthClose.push({ period: OCT, netSalary: 4788, updatedAt: '' });
    const e = averageMonthExplanation(ds, OCT)!;
    expect(e.netSalary).toBe(netSalaryForPeriod(ds, OCT));
    expect(e.fixedCostsAvg).toBe(fixedCostsAvg(ds, OCT));
    expect(e.free).toBe(freeAfterFixedAvg(ds, OCT));
    expect(e.wealthAvg).toBe(wealthBuildingAvg(ds, OCT));
    expect([e.netSalary, e.fixedCostsAvg, e.wealthAvg, e.free]).toEqual([4788, 2952.17, 800, 1035.83]);
    expect(plain(e.formula)).toBe('Netto € 4.788 − Ø Fixkosten € 2.952,17 − Ø Vermögensaufbau € 800,00 = € 1.035,83');
  });

  it('follows the data: other salary, other result', () => {
    const ds = fixtureDataset();
    ds.monthClose.push({ period: OCT, netSalary: 5000, updatedAt: '' });
    expect(plain(averageMonthExplanation(ds, OCT)!.formula)).toBe('Netto € 5.000 − Ø Fixkosten € 2.952,17 − Ø Vermögensaufbau € 800,00 = € 1.247,83');
  });

  it('no net salary → null (icon hidden)', () => {
    expect(averageMonthExplanation(fixtureDataset(), OCT)).toBeNull();
  });
});

describe('Hero „Abzüge vom Netto“', () => {
  const base = { total: 5649, wealthFromNet: 800, wealthNotFromNet: 0, deductions: 6449 };
  it('mit Netto: Aufschlüsselung und Netto − Abzüge = Frei verfügbar', () => {
    const e = deductionsExplanation({ ...base, netSalary: 7819, free: 1370 });
    expect(plain(e.breakdown)).toBe('€ 5.649 Fixkosten + € 800 Vermögensaufbau');
    expect(plain(e.formula)).toBe('Netto € 7.819 − Abzüge € 6.449 = Frei verfügbar € 1.370');
  });
  it('ohne Netto: die Rechnung kommt ohne Netto aus', () => {
    const e = deductionsExplanation({ ...base, netSalary: null, free: null });
    expect(plain(e.formula)).toBe('€ 5.649 Fixkosten + € 800 Vermögensaufbau = € 6.449');
  });
  it('negatives Frei verfügbar mit U+2212', () => {
    expect(plain(deductionsExplanation({ ...base, netSalary: 3000, free: -3449 }).formula)).toBe('Netto € 3.000 − Abzüge € 6.449 = Frei verfügbar −€ 3.449');
  });
});

describe('Hero: Vermögensaufbau nicht vom Netto', () => {
  it('Oktober, „Miete 1220“ aus: Aufschlüsselung nennt nur den Teil vom Netto, ⓘ nennt den Rest', () => {
    const e = deductionsExplanation({ total: 3488.5, wealthFromNet: 800, wealthNotFromNet: 1060, deductions: 4288.5, netSalary: 4788, free: 499.5 });
    expect(plain(e.breakdown)).toBe('€ 3.488,50 Fixkosten + € 800 Vermögensaufbau');
    expect(plain(e.formula)).toBe('Netto € 4.788 − Abzüge € 4.288,50 = Frei verfügbar € 499,50');
    expect(plain(e.notFromNet!)).toBe('€ 1.060 Vermögensaufbau nicht vom Netto, nicht abgezogen');
  });
  it('alles vom Netto: kein Zusatz', () => {
    expect(deductionsExplanation({ total: 1, wealthFromNet: 1, wealthNotFromNet: 0, deductions: 2, netSalary: null, free: null }).notFromNet).toBeNull();
  });
});
