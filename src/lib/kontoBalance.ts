// Kontostand-Modell of „Fixkosten einplanen“: the expected balance, THE state (one amount per month,
// gap and how it is closed, status) that tile, sheet, setup and settings all show, the monthly checks, the series
// and the milestones. Pure functions over the stored settings (src/db/settings.ts) and the
// dataset; nothing here is stored, everything is derived.
//
// Expected balance = anchor + confirmed deposits since the anchor − Fixkostenkonto positions ticked as
// paid since the anchor. „Since“ is a moment (ISO timestamp), not a month: a new anchor in the middle
// of a month and a month start other than the 1st need no special case. Unconfirmed months bring no
// deposit until the user confirms them.

import type { GapMode, KontoCheck, KontoSettings, Milestone } from '../db/settings';
import { MILESTONES } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { kontoOverview, onKonto, roundStep, simulateKonto, standingOrder, type KontoDebit, type KontoOverview, type KontoSimulation } from './fixkostenkonto';
import { addPeriods, toPeriod } from './period';
import type { Dataset, Period } from './types';

const cents = (v: number) => Math.round(v * 100);
const after = (iso: string, anchor: string) => Date.parse(iso) > Date.parse(anchor);

/** The expected balance today. Without an anchor (data from PR #39): the stored balance. */
export function expectedBalance(ds: Dataset, s: Pick<KontoSettings, 'anchor' | 'balance' | 'checks' | 'rounding' | 'roundingOn'>): number {
  const anchor = s.anchor;
  if (!anchor) return s.balance;
  let total = cents(anchor.amount);
  for (const c of s.checks) {
    if (c.deposited && after(c.answeredAt, anchor.at)) total += cents(c.amount ?? standingOrder(ds, c.period, roundStep(s)).amount);
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
//
// ONE amount per month. The base amount (Grundbetrag) is the 12-month standing order. Is there a gap
// (the lowest balance with the base amount below 0), the user closes it one of two ways (gapMode):
// - spread: extra = gap ÷ the deposits still to come up to and including the first month below 0,
//   rounded up to the cent; until that month base + extra, after it the base amount. Recomputed every
//   month from the expected balance (a confirmed month carries its amount, so the rest shrinks).
// - lump: once, until the day before the first month below 0; every month the base amount.
// No deposit left until that month: lump, whatever was chosen.
// The deposit of the month comes when the month begins („Neuer Monat beginnt am“); at the setup it is
// in the amount already set aside.

/**
 * - setup: not set up
 * - covered: no gap – „Alles eingeplant bis …“
 * - spread: a gap, closed by the extra in the months up to it
 * - lump: a gap, closed by a one-time amount (chosen, or no deposit left before it)
 */
export type KontoStatus = 'setup' | 'covered' | 'spread' | 'lump';

/** The amount to set aside for one month (when it begins). */
export interface MonthAmount {
  period: Period;
  /** base + extra (spread, up to the first month below 0), else the base amount */
  amount: number;
  /** of it: the extra */
  extra: number;
}

export interface KontoState {
  overview: KontoOverview;
  /** expected amount set aside today („Schon zur Seite gelegt“) */
  balance: number;
  /** Sicherheitspuffer: with the plan no month ends below it */
  buffer: number;
  /** Grundbetrag: the rounded 12-month amount (= overview.order.amount) */
  order: number;
  /** false: „Nein, ich plane nur“ – no own account, the money is set aside by hand */
  hasAccount: boolean;
  /** the setup questions are answered and stored */
  setupDone: boolean;
  /** what is missing with the base amount alone so no month ends below the buffer, whole cents; 0 = nothing */
  gap: number;
  /** first month that ends below the buffer with the base amount alone: the bills of that month are the reason */
  gapFrom: Period | null;
  /** last day before gapFrom begins: until then the one-time amount („Leg bis 31. Jänner …“) */
  gapBy: Date | null;
  /** month of the lowest balance */
  gapMonth: Period | null;
  /** the big bills of gapFrom (not the monthly ones), largest first: „Im Februar kommen …“ */
  gapBills: KontoDebit[];
  /** deposits still to come up to and including gapFrom (the active month's while it is open) */
  deposits: number;
  /** spreading is possible: a gap and at least one deposit before it */
  canSpread: boolean;
  /** the way the gap is closed (null without a gap); lump also when spreading is not possible */
  mode: GapMode | null;
  /** spread: the extra of each deposit up to gapFrom (rounded up to the cent); else 0 */
  extra: number;
  /** lump: the one-time amount (= gap); else 0 */
  lump: number;
  /** the amount of each month of the simulation */
  months: MonthAmount[];
  /** the balance when the plan is followed (base + extra, or the one-time amount): never below 0 */
  planSimulation: KontoSimulation;
  /** this month's deposit is confirmed (or came with the setup) */
  monthDone: boolean;
  /** the next deposit to set aside: this month's while it is open, else next month's */
  next: MonthAmount;
  /** last month of the simulation: „Alles eingeplant bis …“ */
  coveredUntil: Period;
  status: KontoStatus;
  streak: Streak;
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

/** The big bills of a month: everything that is not monthly, largest first (at most `max`). */
function bigBills(sim: KontoSimulation, period: Period | null, max = 4): KontoDebit[] {
  const month = sim.months.find((m) => m.period === period);
  return (month?.items ?? []).filter((i) => !i.monthly && i.amount > 0).slice(0, max);
}

export function kontoState(ds: Dataset, active: Period, s: KontoSettings, start: MonthStart = 1): KontoState {
  const balance = expectedBalance(ds, s);
  const monthDone = depositDone(s, active);
  const overview = kontoOverview(ds, active, { balance, receivedFor: monthDone ? active : null, rounding: roundStep(s) });
  const sim = overview.simulation;
  const base = overview.order.amount;
  // the gap against the Sicherheitspuffer: what is missing so no month ends below it
  const buffer = cents(s.buffer);
  const short = sim.months.length ? buffer - cents(sim.lowest) : 0;
  const gap = short > 0 ? short / 100 : 0;
  const gapFrom = gap > 0 ? (sim.months.find((m) => cents(m.end) < buffer)?.period ?? sim.lowestPeriod) : null;
  // the deposits still to come up to and including the first month below 0
  const fromIndex = gapFrom ? sim.months.findIndex((m) => m.period === gapFrom) : -1;
  const deposits = fromIndex < 0 ? 0 : fromIndex + 1 - (monthDone ? 1 : 0);
  const canSpread = gap > 0 && deposits > 0;
  const mode: GapMode | null = gap <= 0 ? null : canSpread && s.gapMode !== 'lump' ? 'spread' : 'lump';
  const extra = mode === 'spread' ? Math.ceil((cents(gap) / deposits) - 1e-9) / 100 : 0;
  const lump = mode === 'lump' ? gap : 0;
  const months: MonthAmount[] = sim.months.map((m, i) => {
    const x = mode === 'spread' && i <= fromIndex && !(i === 0 && monthDone) ? extra : 0;
    return { period: m.period, amount: Math.round((base + x) * 100) / 100, extra: x };
  });
  // the plan followed: the extra with its months; the one-time amount in the month before the first below 0
  const lumpIndex = mode === 'lump' ? Math.max(fromIndex - 1, 0) : -1;
  const deposits$ = months.map((m, i) => m.amount + (i === lumpIndex ? lump : 0));
  const planSimulation =
    mode === null
      ? sim
      : simulateKonto(ds, active, {
          balance: balance + (lumpIndex === 0 && monthDone ? lump : 0),
          receivedThisMonth: monthDone,
          deposit: base,
          deposits: deposits$,
        });
  const next = monthDone ? (months[1] ?? months[0]!) : months[0]!;
  return {
    overview,
    balance,
    buffer: s.buffer,
    order: base,
    hasAccount: s.hasAccount !== false,
    setupDone: s.setupDone,
    gap,
    gapFrom,
    gapBy: gapFrom ? lastDayBefore(gapFrom, start) : null,
    gapMonth: gap > 0 ? sim.lowestPeriod : null,
    gapBills: bigBills(sim, gapFrom),
    deposits,
    canSpread,
    mode,
    extra,
    lump,
    months,
    planSimulation,
    monthDone,
    next,
    coveredUntil: sim.months.at(-1)?.period ?? active,
    status: !s.setupDone ? 'setup' : mode ?? 'covered',
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

/**
 * Reached milestones: „Zum ersten Mal alles eingeplant“ only with no gap left AND at least one month
 * confirmed (once seen, it stays); series of 3, 6 and 12 months.
 */
export function reachedMilestones(s: Pick<KontoSettings, 'milestonesShown' | 'checks'>, status: KontoStatus, streak: Streak): Milestone[] {
  const reached = new Set<Milestone>(s.milestonesShown);
  if (status === 'covered' && s.checks.some((c) => c.deposited)) reached.add('firstPod');
  if (streak.best >= 3) reached.add('streak3');
  if (streak.best >= 6) reached.add('streak6');
  if (streak.best >= 12) reached.add('year');
  return MILESTONES.filter((m) => reached.has(m));
}

/** Milestones reached but not yet celebrated (toast once). */
export function newMilestones(s: Pick<KontoSettings, 'milestonesShown' | 'checks'>, status: KontoStatus, streak: Streak): Milestone[] {
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
