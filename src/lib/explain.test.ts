import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { averageMonthExplanation } from './explain';
import { fixedCostsAvg, freeAfterFixedAvg, netSalaryForPeriod } from './calc';

const OCT = '2026-10';
const plain = (s: string) => s.replace(/ /g, ' ');

describe('Tooltip „im Ø-Monat“', () => {
  it('values = Netto, Ø pro Monat and the difference from calc.ts (4.788 / 2.952,17 / 1.835,83)', () => {
    const ds = fixtureDataset();
    ds.monthClose.push({ period: OCT, netSalary: 4788, updatedAt: '' });
    const e = averageMonthExplanation(ds, OCT)!;
    expect(e.netSalary).toBe(netSalaryForPeriod(ds, OCT));
    expect(e.fixedCostsAvg).toBe(fixedCostsAvg(ds, OCT));
    expect(e.free).toBe(freeAfterFixedAvg(ds, OCT));
    expect([e.netSalary, e.fixedCostsAvg, e.free]).toEqual([4788, 2952.17, 1835.83]);
    expect(plain(e.formula)).toBe('Netto € 4.788 − Ø Fixkosten € 2.952,17 = € 1.835,83');
  });

  it('follows the data: other salary, other result', () => {
    const ds = fixtureDataset();
    ds.monthClose.push({ period: OCT, netSalary: 5000, updatedAt: '' });
    expect(plain(averageMonthExplanation(ds, OCT)!.formula)).toBe('Netto € 5.000 − Ø Fixkosten € 2.952,17 = € 2.047,83');
  });

  it('no net salary → null (icon hidden)', () => {
    expect(averageMonthExplanation(fixtureDataset(), OCT)).toBeNull();
  });
});
