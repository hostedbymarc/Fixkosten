// „So teilt sich dein Gehalt“ (ruecklage-spielgeld): the salary of a month, split into what goes to the
// Rücklage (the monthly amount from kontoState), what is paid straight from the salary, the
// Vermögensaufbau from the net salary, the Spielgeld (and, when the answer is „Aus dem Überschuss“, what
// was spent above it) – the rest is the Überschuss. Only reads: kontoState, monthItems, monthFigures.
import type { KontoSettings, OverflowSource } from '../db/settings';
import { monthItems, netSalaryForPeriod, type SourceItem } from './calc';
import type { KontoState } from './kontoBalance';
import type { Dataset, Period } from './types';

const cents = (v: number) => Math.round(v * 100);
const euros = (c: number) => c / 100;
const sum = (items: SourceItem[]) => euros(items.reduce((a, i) => a + cents(i.amount), 0));

export interface SalarySplit {
  period: Period;
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
  overflowSource: OverflowSource;
  /** the overflow as a line of the split: only „Aus dem Überschuss“ */
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
  const overflowCounted = overflowSource === 'surplus' ? overflow : 0;
  // without a Spielgeld, what is paid from it still leaves the salary
  const play = spielgeld ?? spent;
  const salary = netSalaryForPeriod(ds, period);
  const rest =
    salary === null
      ? null
      : euros(cents(salary) - cents(reserve) - cents(direct) - cents(wealth) - cents(play) - cents(overflowCounted));
  return { period, salary, reserve, direct, directItems, wealth, spielgeld, spent, spentItems, overflow, overflowSource, overflowCounted, rest };
}

/**
 * Advice on the tile (only a hint, the choice stays with the user), only with a Spielgeld, a salary and a gap:
 * the Überschuss covers the one-time amount (or the gap while spreading) → „auf einmal“, else → „verteilt“.
 */
export interface LumpAdvice {
  advice: 'lump' | 'spread';
  /** Überschuss after the Spielgeld */
  rest: number;
  /** the one-time amount (lump) or the gap (spread) */
  amount: number;
}

export function lumpAdvice(state: KontoState, split: SalarySplit): LumpAdvice | null {
  if (split.spielgeld === null || split.rest === null || state.gap <= 0 || !state.mode) return null;
  const amount = state.mode === 'lump' ? state.lump : state.gap;
  return { advice: cents(split.rest) >= cents(amount) ? 'lump' : 'spread', rest: split.rest, amount };
}
