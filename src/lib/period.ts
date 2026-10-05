import { addMonths, format, parse } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Period } from './types';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPeriod(value: string): value is Period {
  return PERIOD_RE.test(value);
}

export function toPeriod(date: Date): Period {
  return format(date, 'yyyy-MM');
}

export function periodToDate(period: Period): Date {
  return parse(period, 'yyyy-MM', new Date(2000, 0, 1));
}

export function addPeriods(period: Period, months: number): Period {
  return toPeriod(addMonths(periodToDate(period), months));
}

/** 1–12 */
export function monthOf(period: Period): number {
  return Number(period.slice(5, 7));
}

export function yearOf(period: Period): number {
  return Number(period.slice(0, 4));
}

/** 'Oktober 2026' */
export function periodLabel(period: Period): string {
  return format(periodToDate(period), 'LLLL yyyy', { locale: de });
}

/** 'Oktober' */
export function monthName(period: Period): string {
  return format(periodToDate(period), 'LLLL', { locale: de });
}

/** 'Okt' for month 1–12 */
export function shortMonthName(month: number): string {
  return format(new Date(2000, month - 1, 1), 'LLL', { locale: de }).replace('.', '');
}

/** Inclusive list of periods from..to. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  for (let p = from; p <= to; p = addPeriods(p, 1)) out.push(p);
  return out;
}
