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
 * - setup: not set up, or a point of „Dein Plan“ other than the one-time transfer is still open
 * - gap: only the one-time transfer is missing („Im Februar 2027 fehlen € 865,79.“)
 * - covered: everything done, no month below 0 („Alles gedeckt bis Oktober 2027.“)
 * „covered“ never comes while a point of the plan is open.
 */
export type KontoStatus = 'setup' | 'gap' | 'covered';

export type PlanStepId = 'account' | 'order' | 'gap';

export interface PlanStep {
  id: PlanStepId;
  done: boolean;
  /** account: a new account to open (false: there is one); order: set up new (false: check the running one) */
  isNew: boolean;
}

export interface KontoState {
  overview: KontoOverview;
  /** expected balance today */
  balance: number;
  /** the rounded standing order (= overview.order.amount) */
  order: number;
  /** Startlücke in euros, whole cents; 0 = nothing missing */
  gap: number;
  /** month of the lowest balance: there exactly `gap` is missing */
  gapMonth: Period | null;
  /** last month of the simulation: „Alles gedeckt bis …“ */
  coveredUntil: Period;
  /** always three points: account, standing order, one-time transfer */
  plan: PlanStep[];
  planDone: number;
  status: KontoStatus;
  streak: Streak;
}

/** Points of „Dein Plan“. Data from PR #39 (set up, never asked): account and standing order count as there. */
export function planSteps(s: KontoSettings, gap: number): PlanStep[] {
  const legacy = s.setupDone && s.hasAccount === null;
  const hasAccount = s.hasAccount !== false;
  return [
    { id: 'account', isNew: !hasAccount, done: s.setupDone && (hasAccount || s.plan.accountDone) },
    { id: 'order', isNew: !legacy && s.orderRuns === false, done: s.setupDone && (legacy || s.plan.orderDone) },
    { id: 'gap', isNew: false, done: s.setupDone && cents(gap) <= 0 },
  ];
}

export function statusOf(setupDone: boolean, plan: PlanStep[]): KontoStatus {
  if (!setupDone || plan.some((p) => p.id !== 'gap' && !p.done)) return 'setup';
  return plan.find((p) => p.id === 'gap')!.done ? 'covered' : 'gap';
}

export function kontoState(ds: Dataset, active: Period, s: KontoSettings): KontoState {
  const balance = expectedBalance(ds, s);
  const overview = kontoOverview(ds, active, { balance, receivedFor: depositDone(s, active) ? active : null, rounding: s.rounding });
  const sim = overview.simulation;
  const gap = cents(sim.gap) > 0 ? cents(sim.gap) / 100 : 0;
  const plan = planSteps(s, gap);
  return {
    overview,
    balance,
    order: overview.order.amount,
    gap,
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

/** Reached milestones: „Zum ersten Mal alles gedeckt“ (once seen, it stays), series of 3, 6 and 12 months. */
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
