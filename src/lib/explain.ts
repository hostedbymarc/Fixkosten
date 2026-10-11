// Explanations shown next to figures. Values come from calc.ts, never computed here.

import { fixedCostsAvg, freeAfterFixedAvg, netSalaryForPeriod } from './calc';
import { formatEUR } from './format';
import type { Dataset, Period } from './types';

export interface AverageMonthExplanation {
  netSalary: number;
  /** „Ø pro Monat“: fixed costs spread over the year */
  fixedCostsAvg: number;
  /** freeAfterFixedAvg: what the tile shows as „im Ø-Monat“ */
  free: number;
  /** „Netto € 4.788 − Ø Fixkosten € 2.952,17 = € 1.835,83“ */
  formula: string;
}

/** Tooltip of „im Ø-Monat“; null without a net salary (the line is not shown then). */
export function averageMonthExplanation(ds: Dataset, period: Period): AverageMonthExplanation | null {
  const netSalary = netSalaryForPeriod(ds, period);
  const free = freeAfterFixedAvg(ds, period);
  if (netSalary === null || free === null) return null;
  const avg = fixedCostsAvg(ds, period);
  return {
    netSalary,
    fixedCostsAvg: avg,
    free,
    formula: `Netto ${formatEUR(netSalary)} − Ø Fixkosten ${formatEUR(avg)} = ${formatEUR(free)}`,
  };
}
