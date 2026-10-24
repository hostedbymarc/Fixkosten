// Explanations shown next to figures. Values come from calc.ts, never computed here.

import { fixedCostsAvg, freeAfterFixedAvg, netSalaryForPeriod, wealthBuildingAvg, type MonthFigures } from './calc';
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

export interface DeductionsExplanation {
  /** „€ 5.649 Fixkosten + € 800 Vermögensaufbau“ */
  breakdown: string;
  /** with salary „Netto € 7.819 − Abzüge € 6.449 = Frei verfügbar € 1.370“, without „… = € 6.449“ */
  formula: string;
}

/** Hero „Abzüge vom Netto“: breakdown and calculation, from monthFigures only. */
export function deductionsExplanation(f: Pick<MonthFigures, 'total' | 'wealth' | 'deductions' | 'netSalary' | 'free'>): DeductionsExplanation {
  const breakdown = `${formatEUR(f.total)} Fixkosten + ${formatEUR(f.wealth)} Vermögensaufbau`;
  return {
    breakdown,
    formula:
      f.netSalary === null || f.free === null
        ? `${breakdown} = ${formatEUR(f.deductions)}`
        : `Netto ${formatEUR(f.netSalary)} − Abzüge ${formatEUR(f.deductions)} = Frei verfügbar ${formatEUR(f.free)}`,
  };
}
