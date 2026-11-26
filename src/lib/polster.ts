// polster-ziel: the Polster (a reserve the user builds up from Überschüsse) and its goal. Every amount here is in
// cents (integers); the Überschüsse come from the month cards (planRows → monthCard), the fixed costs from
// monthPlan. The Polster itself changes only when the user confirms or enters it – nothing here writes.

import type { CushionMilestone, CushionRule, KontoSettings } from '../db/settings';
import { CUSHION_MILESTONES } from '../db/settings';
import type { PlanRow } from './monthCard';
import type { MonthPlan } from './monthPlan';
import { PLAN_MONTHS } from './monthPlan';
import type { Period } from './types';

/** euros (two decimals) → cents */
export const toCents = (euros: number): number => Math.round(euros * 100);
/** cents → euros */
export const toEuros = (cents: number): number => cents / 100;

export interface Cushion {
  goal: number | null;
  balance: number | null;
  rule: CushionRule;
  share: number;
  confirmed: Partial<Record<Period, number>>;
  milestones: CushionMilestone[];
}

export const cushionOf = (s: KontoSettings): Cushion => ({
  goal: s.cushionGoal,
  balance: s.cushionBalance,
  rule: s.cushionRule,
  share: s.cushionShare,
  confirmed: s.cushionConfirmed,
  milestones: s.cushionMilestones,
});

/** Polster column and messages: as soon as a Polster is entered. */
export const cushionActive = (c: Pick<Cushion, 'balance'>): boolean => c.balance !== null;

/** Percent of the goal, rounded down (70 %, never 100 % before the goal is reached); null without a goal. */
export function cushionPercent(balance: number, goal: number | null): number | null {
  if (goal === null || goal <= 0) return null;
  return Math.max(0, Math.floor((balance * 100) / goal));
}

/** The next stage above `percent` (25/50/75/100); null at or above 100 %. */
export function nextStage(percent: number): CushionMilestone | null {
  return CUSHION_MILESTONES.find((m) => m > percent) ?? null;
}

/** Cents of the goal at `stage` % (rounded up: the stage is reached at this amount). */
export const stageAmount = (goal: number, stage: number): number => Math.ceil((goal * stage) / 100);

/**
 * Ø fixed costs of the next 12 months: every fixed cost of the plan (the bills of the account, big payments
 * included, and the ones paid directly) over 12 months, ÷ 12.
 */
export function fixedAverage(plan: MonthPlan): number {
  const total = plan.months.reduce((a, m) => a + toCents(m.bills) + toCents(m.direct), 0);
  return Math.round(total / PLAN_MONTHS);
}

/** How many months the Polster pays: balance ÷ per month, one decimal, ROUNDED DOWN; null without costs. */
export function monthsCovered(balance: number, perMonth: number): number | null {
  if (perMonth <= 0) return null;
  return Math.floor((balance * 10) / perMonth) / 10;
}

/** „Damit zahlst du“: months of fixed costs, and of fixed costs plus Spielgeld, today and at the goal. */
export interface CushionCover {
  fixed: number;
  spielgeld: number;
  months: number | null;
  monthsWithSpielgeld: number | null;
  atGoal: number | null;
  atGoalWithSpielgeld: number | null;
}

export function cushionCover(plan: MonthPlan, balance: number, goal: number | null): CushionCover {
  const fixed = fixedAverage(plan);
  const spielgeld = toCents(plan.spielgeld ?? 0);
  return {
    fixed,
    spielgeld,
    months: monthsCovered(balance, fixed),
    monthsWithSpielgeld: monthsCovered(balance, fixed + spielgeld),
    atGoal: goal === null ? null : monthsCovered(goal, fixed),
    atGoalWithSpielgeld: goal === null ? null : monthsCovered(goal, fixed + spielgeld),
  };
}

/**
 * How much of an Überschuss goes into the Polster (positive) or comes out of it (negative):
 * - Überschuss > 0: by the rule (all, or `share` % rounded down), at most up to the goal (no goal: no cap)
 * - Überschuss < 0: the gap from the Polster, at most what is in it (never below 0)
 */
export function cushionDelta(surplus: number, balance: number, c: Pick<Cushion, 'goal' | 'rule' | 'share'>): number {
  if (surplus > 0) {
    const part = c.rule === 'all' ? surplus : Math.floor((surplus * c.share) / 100);
    const room = c.goal === null ? part : Math.max(0, c.goal - balance);
    return Math.min(part, room);
  }
  if (surplus < 0) return -Math.min(-surplus, Math.max(0, balance));
  return 0;
}

/** The block of the green card for one month („So verteilst du den Überschuss“ / „Dein Polster deckt die Lücke“). */
export type Distribution =
  | { kind: 'fill'; amount: number; free: number; before: number; after: number }
  | { kind: 'take'; amount: number; before: number; after: number }
  | { kind: 'full' };

/**
 * The proposal for a month with Überschuss `surplus` (cents): fill (Überschuss > 0, goal set, not reached), full
 * (Überschuss > 0, goal reached), take (Überschuss < 0 and a Polster > 0); null otherwise. `amount` may be
 * chosen by the user („Anders aufteilen“): it is kept between 0 and what fits.
 */
export function distribution(surplus: number | null, c: Cushion, chosen?: number): Distribution | null {
  if (surplus === null) return null;
  const balance = c.balance ?? 0;
  if (surplus > 0) {
    if (c.goal === null) return null;
    if (balance >= c.goal) return { kind: 'full' };
    const room = c.goal - balance;
    const amount = chosen === undefined ? cushionDelta(surplus, balance, c) : Math.max(0, Math.min(chosen, surplus, room));
    return { kind: 'fill', amount, free: surplus - amount, before: balance, after: balance + amount };
  }
  if (surplus < 0 && balance > 0) {
    const amount = Math.min(-surplus, balance);
    return { kind: 'take', amount, before: balance, after: balance - amount };
  }
  return null;
}

/** „Ab € X Gehalt brauchst du den Polster nicht.“: the net salary plus the gap, in whole euros rounded up (cents). */
export const salaryWithoutCushion = (net: number, surplus: number): number => Math.ceil((net - surplus) / 100) * 100;

/** One row of „Dein Plan“ with the Polster: its Überschuss, what goes in or out, the Polster after it. */
export interface CushionRow {
  period: Period;
  /** the Überschuss of the month card in cents; null without a salary */
  surplus: number | null;
  /** + into, − out of the Polster (0 when the month is confirmed already: it is in the Polster today) */
  delta: number;
  /** the Polster after this month */
  balance: number;
  /** this month's distribution was confirmed already */
  confirmed: boolean;
}

/** The 12 months of „Dein Plan“: from today's Polster on, each Überschuss by the rule, up to the goal, never below 0. */
export function projectCushion(rows: PlanRow[], c: Cushion): CushionRow[] {
  let balance = c.balance ?? 0;
  return rows.map((r) => {
    const surplus = r.left === null ? null : toCents(r.left);
    const confirmed = c.confirmed[r.period] !== undefined;
    const delta = confirmed || surplus === null ? 0 : cushionDelta(surplus, balance, c);
    balance += delta;
    return { period: r.period, surplus, delta, balance, confirmed };
  });
}

/**
 * The message on top of „Dein Plan“ with the Polster:
 * - goal: reached in a month („Ziel im {Monat Jahr} erreicht.“), else how much is missing after the month the Polster
 *   is highest („Nach {Monat} fehlen nur noch € X.“); none without a goal
 * - drop: the first month the Polster goes down („Bei € {Gehalt} Gehalt sinkt dein Polster ab {Monat}.“)
 */
export interface CushionMessage {
  goal: { kind: 'reached'; period: Period } | { kind: 'missing'; period: Period; amount: number } | null;
  drop: { period: Period } | null;
}

export function cushionMessage(proj: CushionRow[], c: Cushion): CushionMessage {
  let goal: CushionMessage['goal'] = null;
  if (c.goal !== null && proj.length) {
    const reached = proj.find((r) => r.balance >= c.goal!);
    if (reached) goal = { kind: 'reached', period: reached.period };
    else {
      const top = proj.reduce((best, r) => (r.balance > best.balance ? r : best), proj[0]!);
      goal = { kind: 'missing', period: top.period, amount: c.goal - top.balance };
    }
  }
  const down = proj.find((r) => r.delta < 0);
  return { goal, drop: down ? { period: down.period } : null };
}

/**
 * „Ziel im {Monat} erreicht, wenn dein {Monat}-Gehalt mindestens € X ist.“ for the first planned salary: X = its
 * planned net + (what is missing before it − its Überschuss); with the rule „Fester Anteil“ the Überschuss has to
 * be missing ÷ share. In whole euros, rounded up (cents). null: no planned month, no goal, or the goal is
 * reached without a higher salary.
 */
export function goalSalary(rows: PlanRow[], proj: CushionRow[], plan: MonthPlan, c: Cushion): { period: Period; amount: number } | null {
  if (c.goal === null) return null;
  const k = rows.findIndex((r) => r.estimated);
  if (k < 0) return null;
  const month = plan.months.find((m) => m.period === rows[k]!.period);
  const surplus = proj[k]!.surplus;
  if (!month || month.salary === null || surplus === null || proj[k]!.confirmed) return null;
  const before = k === 0 ? (c.balance ?? 0) : proj[k - 1]!.balance;
  const missing = c.goal - before;
  if (missing <= 0) return null;
  const needed = c.rule === 'all' ? missing : Math.ceil((missing * 100) / c.share);
  if (needed <= surplus) return null;
  return { period: rows[k]!.period, amount: Math.ceil((toCents(month.salary) + needed - surplus) / 100) * 100 };
}

/** The stages crossed from `before` to `after` (both cents) that were not celebrated yet. */
export function newStages(before: number, after: number, goal: number | null, celebrated: CushionMilestone[]): CushionMilestone[] {
  if (goal === null || after <= before) return [];
  return CUSHION_MILESTONES.filter((m) => before * 100 < m * goal && after * 100 >= m * goal && !celebrated.includes(m));
}

/** The Polster before month `period` in the plan (today's for the first row); null when the month is not in it. */
export function cushionBefore(proj: CushionRow[], period: Period, c: Cushion): number | null {
  const k = proj.findIndex((r) => r.period === period);
  if (k < 0) return null;
  return k === 0 ? (c.balance ?? 0) : proj[k - 1]!.balance;
}
