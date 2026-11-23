// monat-feinschliff: a salary is named after the calendar month it is paid in. The payday is the first day
// of the period („Neuer Monat beginnt am“): with the 25th the November screen (25.10.–24.11.) holds the salary
// paid on 25 October – the „Oktober-Gehalt“. With the 1st nothing changes (the payday lies in the month itself).
// Stored data stays as it is (the salary belongs to its period); only the labels follow this rule.
import { localToday, type MonthStart } from './activeMonth';
import { netSalaryForPeriod } from './calc';
import { periodStartDate } from './kontoBalance';
import { t } from './kontoTexts';
import { dayLabel } from './kontoWords';
import { addPeriods, monthName, toPeriod } from './period';
import { lastSalary } from './salarySplit';
import type { Dataset, Period } from './types';

/** The day the salary of `period` is paid. */
export function payday(period: Period, start: MonthStart): Date {
  return periodStartDate(period, start);
}

/** The calendar month the salary of `period` is paid in. */
export function salaryMonth(period: Period, start: MonthStart): Period {
  return toPeriod(payday(period, start));
}

/** „Oktober-Gehalt“ */
export function salaryName(period: Period, start: MonthStart): string {
  return t('salary.name', { monat: monthName(salaryMonth(period, start)) });
}

/** Paid out already (from the payday on, the day itself included)? */
export function paidOut(period: Period, start: MonthStart, today: Date = localToday()): boolean {
  const d = payday(period, start);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return t0.getTime() >= d.getTime();
}

/**
 * „ausgezahlt am 25. November“ (from that day on) or „kommt am 25. November“; `short`: „25.11.“ (the tiles,
 * one line even on the iPhone SE)
 */
export function salaryWhen(period: Period, start: MonthStart, today: Date = localToday(), short = false): string {
  const d = payday(period, start);
  const datum = short ? `${d.getDate()}.${d.getMonth() + 1}.` : dayLabel(d, today);
  return t(paidOut(period, start, today) ? 'salary.paid' : 'salary.comes', { datum });
}

/**
 * ONE salary = ONE entry (monat-feinschliff-2): the salary paid on the first day of `period` is stored in the
 * month close of `period` – the card „Dein Monat“ (for its next salary) and the tile of that month read and write
 * the same entry. Not entered yet: „Gehalt zum Planen“, else the last one entered before (plannedSalary, the same
 * fallback as monthPlan), muted.
 */
/** where the salary of a month comes from: its own entry, „Gehalt zum Planen“, the last one entered */
export type SalarySource = 'own' | 'plan' | 'last';

/**
 * gehalt-zum-planen: the salary a month counts with. Its own entry (€ 0 included) first; without one
 * „Gehalt zum Planen“ when set; else the last one entered before it (at most two years back).
 */
export function plannedSalary(ds: Dataset, period: Period, planSalary: number | null): { value: number | null; source: SalarySource | null } {
  const own = netSalaryForPeriod(ds, period);
  if (own !== null) return { value: own, source: 'own' };
  if (planSalary !== null) return { value: planSalary, source: 'plan' };
  const last = lastSalary(ds, addPeriods(period, -1));
  return last ? { value: last.salary, source: 'last' } : { value: null, source: null };
}

export interface SalaryView {
  /** the month close it is stored in */
  period: Period;
  /** „November-Gehalt“ */
  title: string;
  /** the entered salary, else the fallback; null without any */
  value: number | null;
  /** value is the fallback (shown muted, „geplant“) */
  fallback: boolean;
  /** where value comes from (null without any) */
  source: SalarySource | null;
  /** „ausgezahlt am 25.11.“ / „kommt am 25.11.“ (short: one line in the tile) */
  when: string;
}

export function salaryView(ds: Dataset, period: Period, start: MonthStart, today: Date = localToday(), planSalary: number | null = null): SalaryView {
  const { value, source } = plannedSalary(ds, period, planSalary);
  return {
    period,
    title: salaryName(period, start),
    value,
    fallback: source === 'plan' || source === 'last',
    source,
    when: salaryWhen(period, start, today, true),
  };
}
