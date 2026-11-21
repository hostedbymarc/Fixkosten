// monat-feinschliff: a salary is named after the calendar month it is paid in. The payday is the first day
// of the period („Neuer Monat beginnt am“): with the 25th the November screen (25.10.–24.11.) holds the salary
// paid on 25 October – the „Oktober-Gehalt“. With the 1st nothing changes (the payday lies in the month itself).
// Stored data stays as it is (the salary belongs to its period); only the labels follow this rule.
import type { KontoCheck } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { periodStartDate } from './kontoBalance';
import { t } from './kontoTexts';
import { dayLabel } from './kontoWords';
import { monthName, toPeriod } from './period';
import type { Period } from './types';

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

/** The kind of a month next to the active one. */
export type MonthKind = 'past' | 'active' | 'future';
export function monthKind(period: Period, active: Period): MonthKind {
  return period < active ? 'past' : period > active ? 'future' : 'active';
}

/**
 * The neutral status of a month's salary in the Netto tile (other months, „Fixkosten einplanen“ set up):
 * - past: „Überwiesen ✓“ (or „Zur Seite gelegt ✓“) when the transfer was marked, else „Nicht markiert“
 * - future: „Kommt am {Auszahlungstag}“
 * - active: none (the card „Dein Monat“ has its own button)
 */
export interface SalaryStatus {
  kind: 'marked' | 'unmarked' | 'comes';
  text: string;
}

export function salaryStatus(
  period: Period,
  active: Period,
  start: MonthStart,
  checks: Pick<KontoCheck, 'period' | 'deposited'>[],
  hasAccount: boolean,
  today?: Date,
): SalaryStatus | null {
  const kind = monthKind(period, active);
  if (kind === 'active') return null;
  if (kind === 'future') return { kind: 'comes', text: t('salary.comes', { datum: dayLabel(payday(period, start), today) }) };
  const marked = checks.some((c) => c.period === period && c.deposited);
  return marked
    ? { kind: 'marked', text: t(hasAccount ? 'salary.marked' : 'salary.marked.aside') }
    : { kind: 'unmarked', text: t('salary.unmarked') };
}
