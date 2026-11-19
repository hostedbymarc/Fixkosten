// „So teilt sich dein Gehalt“ (ruecklage-spielgeld): the salary of a month, split into what goes to the
// Rücklage (the monthly amount from kontoState), what is paid straight from the salary, the
// Vermögensaufbau from the net salary, the Spielgeld (and, when the answer is „Aus dem Überschuss“, what
// was spent above it) – the rest is the Überschuss. Only reads: kontoState, monthItems, monthFigures.
import { overflowMode, type KontoSettings, type OverflowAnswer, type OverflowMode } from '../db/settings';
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
  /** next: the salary is not entered for that month – the last one entered, from this month („wie im {Monat}“) */
  salaryFrom: Period | null;
  /** net salary of the month; null = not entered */
  salary: number | null;
  /** „Zur Seite legen“: the amount of this month (base, plus the extra while spreading) */
  reserve: number;
  /** „Direkt vom Gehalt“: Fixkosten paid straight from the salary */
  direct: number;
  directItems: SourceItem[];
  /** „Vermögensaufbau“ from the net salary that does not go through the Rücklage or the Spielgeld */
  wealth: number;
  /** „Spielgeld pro Monat“; null = not set */
  spielgeld: number | null;
  /** spent from the Spielgeld this month (everything due on it) */
  spent: number;
  spentItems: SourceItem[];
  /** spent above the Spielgeld (0 without one) */
  overflow: number;
  /** where the overflow comes from (stored answer, else from the surplus) */
  overflowSource: OverflowAnswer;
  overflowMode: OverflowMode;
  /** the part of the overflow from another source (all, nothing, or the amount given, at most the overflow) */
  overflowOther: number;
  /** the overflow as a line of the split: what comes from the surplus (overflow − overflowOther) */
  overflowCounted: number;
  /** „Überschuss“ (with Spielgeld) / „Bleibt dir“ (without); null without salary */
  rest: number | null;
}

export function salarySplit(ds: Dataset, period: Period, state: KontoState, settings: Pick<KontoSettings, 'spielgeld' | 'spielgeldOverflow'>): SalarySplit {
  const items = monthItems(ds, period).filter((i) => i.fromNet);
  const directItems = items.filter((i) => i.kind === 'expense' && i.account === 'girokonto');
  const wealthItems = items.filter((i) => i.kind === 'savings' && i.account === 'girokonto');
  const spentItems = items.filter((i) => i.account === 'spielgeld');
  const reserve = state.months.find((m) => m.period === period)?.amount ?? state.order;
  const direct = sum(directItems);
  const wealth = sum(wealthItems);
  const spent = sum(spentItems);
  const spielgeld = settings.spielgeld;
  const overflow = spielgeld === null ? 0 : euros(Math.max(cents(spent) - cents(spielgeld), 0));
  const overflowSource = settings.spielgeldOverflow[period] ?? 'surplus';
  const mode = overflowMode(overflowSource);
  const overflowOther =
    mode === 'other' ? overflow : mode === 'part' && typeof overflowSource === 'object' ? euros(Math.min(cents(overflowSource.otherAmount), cents(overflow))) : 0;
  const overflowCounted = euros(cents(overflow) - cents(overflowOther));
  // without a Spielgeld, what is paid from it still leaves the salary
  const play = spielgeld ?? spent;
  const salary = netSalaryForPeriod(ds, period);
  const rest =
    salary === null
      ? null
      : euros(cents(salary) - cents(reserve) - cents(direct) - cents(wealth) - cents(play) - cents(overflowCounted));
  return { kind: 'current', period, salaryFrom: null, salary, reserve, direct, directItems, wealth, spielgeld, spent, spentItems, overflow, overflowSource, overflowMode: mode, overflowOther, overflowCounted, rest };
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
 * „Nächstes Gehalt“: the salary of the month after `period` (missing: the last one entered, „wie im {Monat}“),
 * minus exactly the amount of the Zur-Seite-Kachel (`reserve`, default state.next.amount), what that month
 * plans straight from the salary and as Vermögensaufbau, and the Spielgeld limit (no overflow: nothing is
 * spent yet). Without a Spielgeld: what that month plans on it.
 */
export function nextSalarySplit(
  ds: Dataset,
  period: Period,
  state: KontoState,
  settings: Pick<KontoSettings, 'spielgeld'>,
  reserve: number = state.next.amount,
): SalarySplit {
  const next = addPeriods(period, 1);
  const items = monthItems(ds, next).filter((i) => i.fromNet);
  const directItems = items.filter((i) => i.kind === 'expense' && i.account === 'girokonto');
  const wealthItems = items.filter((i) => i.kind === 'savings' && i.account === 'girokonto');
  const spentItems = items.filter((i) => i.account === 'spielgeld');
  const direct = sum(directItems);
  const wealth = sum(wealthItems);
  const spent = sum(spentItems);
  const spielgeld = settings.spielgeld;
  const play = spielgeld ?? spent;
  const own = netSalaryForPeriod(ds, next);
  const last = own === null ? lastSalary(ds, period) : null;
  const salary = own ?? last?.salary ?? null;
  const rest = salary === null ? null : euros(cents(salary) - cents(reserve) - cents(direct) - cents(wealth) - cents(play));
  return {
    kind: 'next',
    period: next,
    salaryFrom: last?.from ?? null,
    salary,
    reserve,
    direct,
    directItems,
    wealth,
    spielgeld,
    spent,
    spentItems,
    overflow: 0,
    overflowSource: 'surplus',
    overflowMode: 'surplus',
    overflowOther: 0,
    overflowCounted: 0,
    rest,
  };
}

/**
 * Advice on the tile (only a hint, the choice stays with the user), only with a Spielgeld, a salary and a gap:
 * the Überschuss covers the one-time amount (or the gap while spreading) → „auf einmal“, else → „verteilt“.
 */
export interface LumpAdvice {
  advice: 'lump' | 'spread';
  /** Überschuss of the split with the base amount set aside (the same calculation as „So teilt sich dein Gehalt“) */
  rest: number;
  /** the one-time amount (lump) or the gap (spread): what would be set aside at once */
  amount: number;
  /** what stays after setting `amount` aside at once: rest − amount („Danach bleiben dir …“) */
  left: number;
  /** what would be missing at once, as a positive amount (−left when left < 0, else 0): „würden dir … fehlen“ */
  missing: number;
}

export function lumpAdvice(state: KontoState, split: SalarySplit): LumpAdvice | null {
  if (split.spielgeld === null || split.rest === null || state.gap <= 0 || !state.mode) return null;
  const amount = state.mode === 'lump' ? state.lump : state.gap;
  const left = euros(cents(split.rest) - cents(amount));
  return { advice: left >= 0 ? 'lump' : 'spread', rest: split.rest, amount, left, missing: left < 0 ? -left : 0 };
}

/**
 * The advice of the tile: always from the NEXT salary, with the base amount (without the extra) set aside –
 * the Überschuss that is left in a normal month decides whether the gap can be closed at once.
 */
export function tileAdvice(ds: Dataset, active: Period, state: KontoState, settings: Pick<KontoSettings, 'spielgeld'>): LumpAdvice | null {
  return lumpAdvice(state, nextSalarySplit(ds, active, state, settings, state.order));
}
