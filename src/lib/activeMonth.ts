// Aktiver Monat: the one place that turns „heute“ into the month Erbse works with.
//
// Einstellungen → „Neuer Monat beginnt am“: 1. (Kalendermonat, default), 15.–28. or Monatsletzter.
// From that day on the following month is active, e.g. when the salary comes at the end of the
// month. Everything that used to mean „current month“ (start month, banner, analysis, Ø, positions)
// goes through activeMonth().

import { addPeriods, toPeriod } from './period';
import type { Period } from './types';

/** Day of the month the new month begins on; 'last' = Monatsletzter. */
export type MonthStart = number | 'last';
export const DEFAULT_MONTH_START: MonthStart = 1;
/** meta key in the database (no schema change) */
export const MONTH_START_KEY = 'monthStartDay';
/** Choices in the settings: 1, 15–28, Monatsletzter. */
export const MONTH_START_CHOICES: MonthStart[] = [1, ...Array.from({ length: 14 }, (_, i) => 15 + i), 'last'];

export function isMonthStart(value: unknown): value is MonthStart {
  return value === 'last' || value === 1 || (typeof value === 'number' && Number.isInteger(value) && value >= 15 && value <= 28);
}

/** Reads a stored value; anything unknown (old data, old files) is the calendar month. */
export function toMonthStart(value: unknown): MonthStart {
  return isMonthStart(value) ? value : DEFAULT_MONTH_START;
}

export function monthStartLabel(start: MonthStart): string {
  return start === 1 ? '1. (Kalendermonat)' : start === 'last' ? 'Monatsletzter' : `${start}.`;
}

/** The local date and time now – the only clock for month logic. */
export function localToday(): Date {
  return new Date();
}

/**
 * The active month for `today` (local time). Calendar month for start 1; otherwise from the start
 * day on the following month. A month shorter than the start day uses its last day as the start.
 */
export function activeMonth(today: Date, start: MonthStart): Period {
  const calendar = toPeriod(today);
  if (start === 1) return calendar;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const startDay = start === 'last' ? lastDay : Math.min(start, lastDay);
  return today.getDate() >= startDay ? addPeriods(calendar, 1) : calendar;
}

/** The calendar month of today (not the active month): for today's date in a form. */
export function calendarMonth(today: Date = localToday()): Period {
  return toPeriod(today);
}
