// Words for „Fixkosten einplanen“: dates, months and the bills, the same everywhere (tile, sheet,
// setup, settings, monthly check). With „Neuer Monat beginnt am“ ≠ 1 a month that is meant as a
// period is said with its date („ab 25. Februar“, „bis 24. Oktober“), not only with its name;
// the month of a bill stays its name („Im Februar kommen …“).
import type { MonthStart } from './activeMonth';
import { localToday } from './activeMonth';
import type { KontoDebit } from './fixkostenkonto';
import { formatEUR } from './format';
import { lastDayBefore, periodStartDate, type KontoState } from './kontoBalance';
import { t } from './kontoTexts';
import { addPeriods, monthName, periodLabel, toPeriod } from './period';
import type { Period } from './types';

/** „24. Jänner“; with the year only when the day is a year or more away („24. Jänner 2028“). */
export function dayLabel(d: Date, today: Date = localToday()): string {
  const months = (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth();
  return months < 12 ? `${d.getDate()}. ${monthName(toPeriod(d))}` : `${d.getDate()}. ${periodLabel(toPeriod(d))}`;
}

/** The day a month's deposit comes: „1. Dezember“, with the 25th „25. November“. */
export function depositDay(period: Period, start: MonthStart, today?: Date): string {
  return dayLabel(periodStartDate(period, start), today);
}

/** A period as its start: „März“; with the 25th „25. Februar“ (for „ab …“). */
export function fromLabel(period: Period, start: MonthStart, today?: Date): string {
  return start === 1 ? monthName(period) : dayLabel(periodStartDate(period, start), today);
}

/** A period as its end: „Oktober 2027“; with the 25th „24. Oktober“ (for „bis …“). */
export function untilLabel(period: Period, start: MonthStart, today?: Date): string {
  return start === 1 ? periodLabel(period) : dayLabel(lastDayBefore(addPeriods(period, 1), start), today);
}

/** A period as a whole: „November“; with the 25th „den Monat seit 25. Oktober“ (for „für …“). */
export function periodName(period: Period, start: MonthStart, today?: Date): string {
  return start === 1 ? monthName(period) : `den Monat seit ${dayLabel(periodStartDate(period, start), today)}`;
}

/** „A“, „A und B“ – the largest one or two bills. */
export function billNames(bills: KontoDebit[], max = 2): string {
  const names = bills.slice(0, max).map((b) => b.name);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

/**
 * The reason: „Im Februar kommen Kfz-Versicherung und Haushaltsversicherung.“ (one bill: „kommt“);
 * without big bills „Ab Februar reicht das Geld nicht.“; already this month „Diesen Monat reicht das Geld nicht.“
 */
export function reasonText(state: KontoState, start: MonthStart, today?: Date): string {
  if (!state.gapFrom) return '';
  if (state.gapFrom === state.months[0]?.period) return t('reason.now');
  if (!state.gapBills.length) return t('reason.short', { monat: fromLabel(state.gapFrom, start, today) });
  return t(state.gapBills.length === 1 ? 'reason.bill' : 'reason.bills', { monat: monthName(state.gapFrom), rechnungen: billNames(state.gapBills) });
}

/** The deadline of the one-time amount has passed (the money is missing in the active month): „jetzt“. */
export function deadlinePassed(by: Date | null, today: Date = localToday()): boolean {
  if (!by) return true;
  return by < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/** How the gap is closed, in one sentence: „Darum bis dahin € 362,48 extra, ab März € 2.920.“ / „Leg bis 31. Jänner € 1.087,43 extra zur Seite.“ */
export function planText(state: KontoState, start: MonthStart, today?: Date): string {
  if (state.mode === 'spread' && state.gapFrom) {
    return t('plan.spread', { extra: formatEUR(state.extra), folgemonat: fromLabel(addPeriods(state.gapFrom, 1), start, today), betrag: formatEUR(state.order) });
  }
  if (state.mode === 'lump') {
    const betrag = formatEUR(state.lump);
    return deadlinePassed(state.gapBy, today) ? t('plan.lump.now', { betrag }) : t('plan.lump', { datum: dayLabel(state.gapBy!, today), betrag });
  }
  return '';
}

/** „am 1. Dezember, wenn dein Gehalt kommt“ / with an own account „per Dauerauftrag am 1. Dezember“. */
export function whenText(state: KontoState, start: MonthStart, today?: Date): string {
  const datum = depositDay(state.next.period, start, today);
  return t(state.hasAccount ? 'plan.when.order' : 'plan.when', { datum });
}

/** „Alles eingeplant bis Oktober 2027.“ (with the 25th: „bis 24. Oktober 2027“) */
export function coveredText(state: KontoState, start: MonthStart, today?: Date): string {
  return t('status.covered', { monat: untilLabel(state.coveredUntil, start, today) });
}
