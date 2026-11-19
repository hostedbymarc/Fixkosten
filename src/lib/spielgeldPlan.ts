// „Dein Spielgeld“ (spielgeld-planer): how much Spielgeld fits next to the Rücklage. For each month m of the
// plan: möglich_m = Netto_m − Zur-Seite-Betrag_m (with the extra) − Direkt bezahlt_m − Vermögensaufbau_m
// (from the net salary). A missing salary: the last one entered, marked as estimated. While an extra runs,
// two minimums: over the extra months (A) and over the months after (B). Only reads kontoState (the months
// and their amounts) and salarySplit's parts (monthItems), nothing is computed twice.
import { netSalaryForPeriod } from './calc';
import type { KontoState } from './kontoBalance';
import { addPeriods } from './period';
import { lastSalary, salarySplit } from './salarySplit';
import type { Dataset, Period } from './types';

const cents = (v: number) => Math.round(v * 100);
const euros = (c: number) => c / 100;

export interface SpielgeldMonth {
  period: Period;
  salary: number;
  /** no salary entered for this month: the last one entered */
  estimated: boolean;
  /** Zur-Seite-Betrag of the month (base + extra) */
  reserve: number;
  /** of it: the extra */
  extra: number;
  direct: number;
  wealth: number;
  /** salary − reserve − direct − wealth */
  possible: number;
}

export interface Window {
  /** first and last month of the group */
  from: Period;
  to: Period;
  /** the smallest possible Spielgeld of the group */
  possible: number;
  /** the Zur-Seite-Betrag that limits it (of the month with the minimum) */
  reserve: number;
}

export interface SpielgeldPlan {
  months: SpielgeldMonth[];
  /** while an extra runs: the extra months (A); null without an extra */
  extra: Window | null;
  /** the months without an extra (B); null when every month has an extra */
  after: Window | null;
  /** the planned Spielgeld; null = not set (no status) */
  spielgeld: number | null;
  /** ok: fits into A (or B without an extra); over: it does not */
  status: 'ok' | 'over' | null;
  /** ok: what is left (limit − Spielgeld); over: what is missing each month (Spielgeld − limit) */
  difference: number;
  /** the tip: A and B rounded down to € 50 (never below 0) */
  tipExtra: number | null;
  tipAfter: number | null;
}

/** Rounded down to whole € 50, never below 0 (the tip). */
export function floor50(v: number): number {
  return Math.max(0, Math.floor(cents(v) / 5000) * 50);
}

function group(months: SpielgeldMonth[]): Window | null {
  if (!months.length) return null;
  const min = months.reduce((a, m) => (m.possible < a.possible ? m : a));
  return { from: months[0]!.period, to: months.at(-1)!.period, possible: min.possible, reserve: min.reserve };
}

/** The plan from its months (pure: the Unit-Tests feed months directly). */
export function planFromMonths(months: SpielgeldMonth[], spielgeld: number | null): SpielgeldPlan {
  const lastExtra = months.reduce((idx, m, i) => (m.extra > 0 ? i : idx), -1);
  const extra = lastExtra < 0 ? null : group(months.slice(0, lastExtra + 1));
  const after = group(months.slice(lastExtra + 1));
  const limit = extra ?? after;
  const status = spielgeld === null || !limit ? null : cents(spielgeld) <= cents(limit.possible) ? 'ok' : 'over';
  const difference = spielgeld === null || !limit ? 0 : euros(Math.abs(cents(limit.possible) - cents(spielgeld)));
  return {
    months,
    extra,
    after,
    spielgeld,
    status,
    difference,
    tipExtra: extra ? floor50(extra.possible) : null,
    tipAfter: after ? floor50(after.possible) : null,
  };
}

/**
 * The months of the plan: from the next amount to set aside (state.next) on, as far as kontoState plans.
 * Null without any net salary entered.
 */
export function spielgeldMonths(ds: Dataset, state: KontoState): SpielgeldMonth[] | null {
  const startIndex = Math.max(state.months.findIndex((m) => m.period === state.next.period), 0);
  const out: SpielgeldMonth[] = [];
  for (const m of state.months.slice(startIndex)) {
    const own = netSalaryForPeriod(ds, m.period);
    const salary = own ?? lastSalary(ds, addPeriods(m.period, -1))?.salary ?? null;
    if (salary === null) return null;
    // the parts of the month exactly as „So teilt sich dein Gehalt“ shows them (Spielgeld not deducted here)
    const split = salarySplit(ds, m.period, state, { spielgeld: null });
    out.push({
      period: m.period,
      salary,
      estimated: own === null,
      reserve: m.amount,
      extra: m.extra,
      direct: split.direct,
      wealth: split.wealth,
      possible: euros(cents(salary) - cents(m.amount) - cents(split.direct) - cents(split.wealth)),
    });
  }
  return out.length ? out : null;
}

/** „Dein Spielgeld“: null without a net salary („Trag dein Netto-Gehalt ein …“). */
export function spielgeldPlan(ds: Dataset, state: KontoState, spielgeld: number | null): SpielgeldPlan | null {
  const months = spielgeldMonths(ds, state);
  return months ? planFromMonths(months, spielgeld) : null;
}
