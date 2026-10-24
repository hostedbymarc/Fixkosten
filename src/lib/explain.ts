// Explanations shown next to figures. Values come from calc.ts, never computed here.

import { fixedCostsAvg, freeAfterFixedAvg, netSalaryForPeriod, wealthBuildingAvg } from './calc';
import { formatAvg, formatEUR } from './format';
import type { Dataset, Period } from './types';

export interface AverageMonthExplanation {
  netSalary: number;
  /** „Ø pro Monat“: fixed costs spread over the year */
  fixedCostsAvg: number;
  /** Vermögensaufbau spread over the year */
  wealthAvg: number;
  /** freeAfterFixedAvg: what the tile shows as „im Ø-Monat“ */
  free: number;
  /** „Netto € 7.819 − Ø Fixkosten € 2.952,17 − Ø Vermögensaufbau € 800,00 = € 4.066,83“ */
  formula: string;
}

/** Tooltip of „im Ø-Monat“; null without a net salary (the line is not shown then). */
export function averageMonthExplanation(ds: Dataset, period: Period): AverageMonthExplanation | null {
  const netSalary = netSalaryForPeriod(ds, period);
  const free = freeAfterFixedAvg(ds, period);
  if (netSalary === null || free === null) return null;
  const avg = fixedCostsAvg(ds, period);
  const wealthAvg = wealthBuildingAvg(ds, period);
  return {
    netSalary,
    fixedCostsAvg: avg,
    wealthAvg,
    free,
    formula: `Netto ${formatEUR(netSalary)} − Ø Fixkosten ${formatAvg(avg)} − Ø Vermögensaufbau ${formatAvg(wealthAvg)} = ${formatAvg(free)}`,
  };
}
