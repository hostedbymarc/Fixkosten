// „So teilt sich dein Gehalt“: the salary of a month, split into what goes to the Rücklage (the monthly
// amount from kontoState), what is paid directly („Direkt bezahlt“), the Vermögensaufbau from the net
// salary and the planned Spielgeld (spielgeld-planer: only a planned value, never a source of payments) –
// the rest is the Überschuss. Positions „nicht eingeplant“ count nowhere (calc.isPlanned).
// Only reads: kontoState, monthItems, the net salary.
import type { KontoSettings } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { monthItems, netSalaryForPeriod, type SourceItem } from './calc';
import { addPeriods } from './period';
import type { KontoState } from './kontoBalance';
import type { Dataset, Period } from './types';

const cents = (v: number) => Math.round(v * 100);
const euros = (c: number) => c / 100;
const sum = (items: SourceItem[]) => euros(items.reduce((a, i) => a + cents(i.amount), 0));

export interface SalarySplit {
  /** „Aktuelles Gehalt“ (the month shown, actual values) or „Nächstes Gehalt“ (the following month, planned) */
  kind: 'current' | 'next';
  period: Period;
  /** next: the salary is not entered for that month – the last one entered, from this month („geschätzt wie zuletzt“) */
  salaryFrom: Period | null;
  /** net salary of the month; null = not entered */
  salary: number | null;
  /** „Zur Seite legen“: the amount of this month (base, plus the extra while spreading) */
  reserve: number;
  /** „Direkt bezahlt“: Fixkosten paid directly, not from the Rücklage */
  direct: number;
  directItems: SourceItem[];
  /** „Vermögensaufbau“ from the net salary that does not go through the Rücklage */
  wealth: number;
  /** „Spielgeld“: the planned amount per month; null = not set (no line) */
  spielgeld: number | null;
  /** „Überschuss“ (with Spielgeld) / „Bleibt dir“ (without); null without salary */
  rest: number | null;
}

/** The parts of one month that come out of the net salary, from the same items as monthFigures. */
export function salaryParts(ds: Dataset, period: Period, start: MonthStart = 1) {
  const items = monthItems(ds, period, start).filter((i) => i.fromNet);
  const directItems = items.filter((i) => i.kind === 'expense' && i.account === 'girokonto');
  const wealthItems = items.filter((i) => i.kind === 'savings' && i.account === 'girokonto');
  return { directItems, direct: sum(directItems), wealth: sum(wealthItems) };
}

const restOf = (salary: number | null, reserve: number, direct: number, wealth: number, spielgeld: number | null) =>
  salary === null ? null : euros(cents(salary) - cents(reserve) - cents(direct) - cents(wealth) - cents(spielgeld ?? 0));

export function salarySplit(ds: Dataset, period: Period, state: KontoState, settings: Pick<KontoSettings, 'spielgeld'>): SalarySplit {
  const { directItems, direct, wealth } = salaryParts(ds, period);
  const reserve = state.months.find((m) => m.period === period)?.amount ?? state.order;
  const spielgeld = settings.spielgeld;
  const salary = netSalaryForPeriod(ds, period);
  return { kind: 'current', period, salaryFrom: null, salary, reserve, direct, directItems, wealth, spielgeld, rest: restOf(salary, reserve, direct, wealth, spielgeld) };
}

/** The last net salary entered up to `period` (at most two years back): the amount and its month. */
export function lastSalary(ds: Dataset, period: Period): { salary: number; from: Period } | null {
  for (let i = 0; i < 24; i++) {
    const p = addPeriods(period, -i);
    const salary = netSalaryForPeriod(ds, p);
    if (salary !== null) return { salary, from: p };
  }
  return null;
}

/**
 * „Nächstes Gehalt“: the salary of the month after `period` (missing: the last one entered, „geschätzt wie
 * zuletzt“), minus exactly the amount of the Zur-Seite-Kachel (`reserve`, default state.next.amount), what
 * that month pays directly and as Vermögensaufbau, and the planned Spielgeld.
 */
export function nextSalarySplit(
  ds: Dataset,
  period: Period,
  state: KontoState,
  settings: Pick<KontoSettings, 'spielgeld'>,
  reserve: number = state.next.amount,
): SalarySplit {
  const next = addPeriods(period, 1);
  const { directItems, direct, wealth } = salaryParts(ds, next);
  const spielgeld = settings.spielgeld;
  const own = netSalaryForPeriod(ds, next);
  const last = own === null ? lastSalary(ds, period) : null;
  const salary = own ?? last?.salary ?? null;
  return { kind: 'next', period: next, salaryFrom: last?.from ?? null, salary, reserve, direct, directItems, wealth, spielgeld, rest: restOf(salary, reserve, direct, wealth, spielgeld) };
}
