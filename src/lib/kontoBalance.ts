// Kontostand-Modell of the Fixkostenkonto: the expected balance, THE state (standing order, gap,
// status, plan) that tile, sheet, „Dein Plan“ and settings all show, the monthly checks, the series
// and the milestones. Pure functions over the stored settings (src/db/settings.ts) and the
// dataset; nothing here is stored, everything is derived.
//
// Expected balance = anchor + confirmed deposits since the anchor − Fixkostenkonto positions ticked as
// paid since the anchor. „Since“ is a moment (ISO timestamp), not a month: a new anchor in the middle
// of a month and a month start other than the 1st need no special case. Unconfirmed months bring no
// deposit until the user confirms them.

import type { KontoCheck, KontoSettings, Milestone } from '../db/settings';
import { MILESTONES } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { kontoOverview, onKonto, standingOrder, type KontoOverview } from './fixkostenkonto';
import { addPeriods, toPeriod } from './period';
import type { Dataset, Period } from './types';

const cents = (v: number) => Math.round(v * 100);
const after = (iso: string, anchor: string) => Date.parse(iso) > Date.parse(anchor);

/** The expected balance today. Without an anchor (data from PR #39): the stored balance. */
export function expectedBalance(ds: Dataset, s: Pick<KontoSettings, 'anchor' | 'balance' | 'checks' | 'rounding'>): number {
  const anchor = s.anchor;
  if (!anchor) return s.balance;
  let total = cents(anchor.amount);
  for (const c of s.checks) {
    if (c.deposited && after(c.answeredAt, anchor.at)) total += cents(standingOrder(ds, c.period, s.rounding).amount);
  }
  for (const p of ds.payments) {
    if (p.status !== 'paid' || !after(p.paidAt, anchor.at)) continue;
    const position = ds.positions.find((x) => x.id === p.positionId);
    if (position && onKonto(ds, position, p.period)) total -= cents(p.actualAmount);
  }
  for (const o of ds.oneOffs) {
    if (!o.paidAt || !o.positionId || !after(o.paidAt, anchor.at)) continue;
    const position = ds.positions.find((x) => x.id === o.positionId);
    if (position && onKonto(ds, position, o.period)) total -= cents(o.amount);
  }
  return total / 100;
}

/** This month's standing order is already on the account (or none comes this month). */
export function depositDone(s: Pick<KontoSettings, 'receivedFor' | 'checks' | 'orderStartsAfter'>, active: Period): boolean {
  return s.receivedFor === active || s.orderStartsAfter === active || s.checks.some((c) => c.period === active && c.deposited);
}

// ---------------------------------------------------------------------------
// Eine Wahrheit: every number and the status come from kontoState, nowhere else

/**
 * The three states, only in words:
 * - setup: not set up, or the monthly amount („Dauerauftrag einrichten“ / „Leg jeden Monat … zur Seite“) is still open
 * - gap: only the one-time amount is missing („Ab Februar 2027 reicht das Geld nicht.“)
 * - covered: everything done, no month below 0 („Alles eingeplant bis Oktober 2027.“)
 * „covered“ never comes while a point of the plan is open.
 */
export type KontoStatus = 'setup' | 'gap' | 'covered';

/** 'order': the monthly amount (standing order, or set aside by hand); 'gap': the one-time amount */
export type PlanStepId = 'order' | 'gap';

export interface PlanStep {
  id: PlanStepId;
  done: boolean;
  /** order: a new standing order to set up (false: check the running one, or set aside by hand) */
  isNew: boolean;
}

export interface KontoState {
  overview: KontoOverview;
  /** expected amount set aside today („Schon zur Seite gelegt“) */
  balance: number;
  /** the rounded monthly amount (= overview.order.amount) */
  order: number;
  /** false: „Nein, ich plane nur“ – no own account, the money is set aside by hand */
  hasAccount: boolean;
  /** the setup questions are answered and stored */
  setupDone: boolean;
  /** one-time amount in euros, whole cents; 0 = nothing missing. = the lowest balance below 0 */
  gap: number;
  /** first month that ends below 0: „Ab Februar 2027 reicht das Geld nicht.“ */
  gapFrom: Period | null;
  /** last day before gapFrom begins (with „Neuer Monat beginnt am“): „Leg bis 24. Jänner 2027 …“ */
  gapBy: Date | null;
  /** month of the lowest balance: there exactly `gap` is missing */
  gapMonth: Period | null;
  /** last month of the simulation: „Alles eingeplant bis …“ */
  coveredUntil: Period;
  /** always two points: the monthly amount, the one-time amount */
  plan: PlanStep[];
  planDone: number;
  status: KontoStatus;
  streak: Streak;
}

/** Points of „Dein Plan“. Data from PR #39 (set up, never asked): the standing order counts as there. */
export function planSteps(s: KontoSettings, gap: number): PlanStep[] {
  const legacy = s.setupDone && s.hasAccount === null;
  return [
    { id: 'order', isNew: s.hasAccount === true && s.orderRuns === false, done: s.setupDone && (legacy || s.plan.orderDone) },
    { id: 'gap', isNew: false, done: s.setupDone && cents(gap) <= 0 },
  ];
}

export function statusOf(setupDone: boolean, plan: PlanStep[]): KontoStatus {
  if (!setupDone || plan.some((p) => p.id !== 'gap' && !p.done)) return 'setup';
  return plan.find((p) => p.id === 'gap')!.done ? 'covered' : 'gap';
}

/**
 * First day of a period with „Neuer Monat beginnt am“: start 1 → the 1st of that month; otherwise
 * the start day of the month before (from that day on the period is active), capped at its last day.
 */
export function periodStartDate(period: Period, start: MonthStart): Date {
  const [y, m] = period.split('-').map(Number) as [number, number];
  if (start === 1) return new Date(y, m - 1, 1);
  const lastDay = new Date(y, m - 1, 0).getDate();
  return new Date(y, m - 2, start === 'last' ? lastDay : Math.min(start, lastDay));
}

/** The last day before `period` begins: until then the one-time amount must be set aside. */
export function lastDayBefore(period: Period, start: MonthStart): Date {
  const d = periodStartDate(period, start);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
}

export function kontoState(ds: Dataset, active: Period, s: KontoSettings, start: MonthStart = 1): KontoState {
  const balance = expectedBalance(ds, s);
  const overview = kontoOverview(ds, active, { balance, receivedFor: depositDone(s, active) ? active : null, rounding: s.rounding });
  const sim = overview.simulation;
  const gap = cents(sim.gap) > 0 ? cents(sim.gap) / 100 : 0;
  const gapFrom = gap > 0 ? (sim.months.find((m) => cents(m.end) < 0)?.period ?? sim.lowestPeriod) : null;
  const plan = planSteps(s, gap);
  return {
    overview,
    balance,
    order: overview.order.amount,
    hasAccount: s.hasAccount !== false,
    setupDone: s.setupDone,
    gap,
    gapFrom,
    gapBy: gapFrom ? lastDayBefore(gapFrom, start) : null,
    gapMonth: gap > 0 ? sim.lowestPeriod : null,
    coveredUntil: sim.months.at(-1)?.period ?? active,
    plan,
    planDone: plan.filter((p) => p.done).length,
    status: statusOf(s.setupDone, plan),
    streak: streakOf(s.checks, active),
  };
}

/**
 * Day of the standing order, from „Neuer Monat beginnt am“ – so the text matches the simulation
 * (the deposit arrives when the active month begins): „am 1.“, „am 25.“, „am Monatsletzten“.
 */
export function orderDay(start: MonthStart): string {
  return start === 'last' ? 'am Monatsletzten' : `am ${start}.`;
}

// ---------------------------------------------------------------------------
// Serie

export interface Streak {
  /** confirmed months in a row up to the active month (or the month before while this one is open) */
  current: number;
  /** longest series ever */
  best: number;
  /** an earlier series ended (a month was not confirmed) */
  broken: boolean;
}

export function streakOf(checks: KontoCheck[], active: Period): Streak {
  const deposited = new Set(checks.filter((c) => c.deposited).map((c) => c.period));
  const run = (end: Period) => {
    let n = 0;
    for (let p = end; deposited.has(p); p = addPeriods(p, -1)) n++;
    return n;
  };
  const end = deposited.has(active) ? active : addPeriods(active, -1);
  const current = run(end);
  const start = addPeriods(end, -(current - 1));
  const broken = [...deposited].some((p) => p < start && p <= end);
  const best = Math.max(current, ...[...deposited].map(run));
  return { current, best, broken };
}

/** Badge in the tile: „4 Monate in Folge“ from 2 on; after a missed month „Neue Serie startet.“. */
export function streakBadge(streak: Streak): number | 'new' | null {
  if (streak.current >= 2) return streak.current;
  return streak.broken ? 'new' : null;
}

// ---------------------------------------------------------------------------
// Meilensteine

/** Reached milestones: „Zum ersten Mal alles eingeplant“ (once seen, it stays), series of 3, 6 and 12 months. */
export function reachedMilestones(s: Pick<KontoSettings, 'milestonesShown'>, status: KontoStatus, streak: Streak): Milestone[] {
  const reached = new Set<Milestone>(s.milestonesShown);
  if (status === 'covered') reached.add('firstPod');
  if (streak.best >= 3) reached.add('streak3');
  if (streak.best >= 6) reached.add('streak6');
  if (streak.best >= 12) reached.add('year');
  return MILESTONES.filter((m) => reached.has(m));
}

/** Milestones reached but not yet celebrated (toast once). */
export function newMilestones(s: Pick<KontoSettings, 'milestonesShown'>, status: KontoStatus, streak: Streak): Milestone[] {
  return reachedMilestones(s, status, streak).filter((m) => !s.milestonesShown.includes(m));
}

// ---------------------------------------------------------------------------
// Monats-Check: which card the month screen shows (at most one)

export type CheckCard = 'remind' | 'month' | 'balance' | null;

/** 'YYYY-MM-DD' of a local date */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Months between the last balance confirmation and `today` before „Stimmt dein Kontostand noch?“ */
export const BALANCE_CHECK_MONTHS = 3;

/**
 * - remind: balance unknown (older setup „Weiß ich gerade nicht“) → on the next start (not in the same session)
 * - month: the active month's standing order is not confirmed; „Noch nicht“ asks again on a later day
 * - balance: every 3 months since the anchor or the last „Stimmt“
 */
export function dueCard(s: KontoSettings, active: Period, today: Date, opts: { setUpThisSession: boolean }): CheckCard {
  if (!s.enabled || !s.setupDone) return null;
  if (s.balanceUnknown && !opts.setUpThisSession) return 'remind';
  if (!depositDone(s, active) && s.snoozedOn !== dayKey(today)) return 'month';
  const last = [s.balanceCheckedOn, s.anchor ? dayKey(new Date(s.anchor.at)) : null]
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  if (last && addPeriods(last.slice(0, 7) as Period, BALANCE_CHECK_MONTHS) <= toPeriod(today)) return 'balance';
  return null;
}
