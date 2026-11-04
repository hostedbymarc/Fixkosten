// Fixkostenkonto: which standing order fills the separate account for the fixed costs, which
// one-time top-up it needs, and whether it covers each of the next 12 months.
//
// Pure functions on top of calc.ts. Nothing here sums a plan by itself: monthly shares come from
// `monthlyEquivalent`, what is due in a month from `dueItems` (versioned plans, planned changes,
// ticks, skips). calc.ts itself is not changed. Money is carried in integer cents.

import { countsFromNet, dueItems, isActiveInPeriod, monthlyEquivalent, planForPeriod } from './calc';
import { defaultAccount } from '../db/migrations';
import { addPeriods } from './period';
import type { Account, Dataset, Kind, Period, Position } from './types';

export type Rounding = 1 | 5 | 10;
export const ROUNDING_CHOICES: Rounding[] = [1, 5, 10];
export const DEFAULT_ROUNDING: Rounding = 5;

export function toRounding(value: unknown): Rounding {
  return value === 1 || value === 5 || value === 10 ? value : DEFAULT_ROUNDING;
}

const toCents = (euros: number): number => Math.round(euros * 100);
const fromCents = (cents: number): number => cents / 100;

function kindOfCategory(ds: Dataset, categoryId: string): Kind | undefined {
  return ds.categories.find((c) => c.id === categoryId)?.kind;
}

/** Paying account of a position: the stored one, else Vermögensaufbau → Girokonto, everything else → Fixkostenkonto. */
export function accountOf(ds: Dataset, position: Position): Account {
  return position.account ?? defaultAccount(kindOfCategory(ds, position.categoryId));
}

/**
 * Does the position's money go through the Fixkostenkonto in `period`? Its account is the
 * Fixkostenkonto and it comes from the net salary (a one-time Vermögensaufbau payment with
 * „Von ‚Frei verfügbar‘ abziehen“ off never does).
 */
export function onKonto(ds: Dataset, position: Position, period: Period): boolean {
  const kind = kindOfCategory(ds, position.categoryId);
  if (!kind || accountOf(ds, position) !== 'fixkostenkonto') return false;
  return countsFromNet(kind, position, planForPeriod(position, period));
}

// ---------------------------------------------------------------------------
// F1 · Dauerauftrag
// ---------------------------------------------------------------------------

export interface StandingOrder {
  /** Σ all Fixkostenkonto debits of the 12 months from the next month on ÷ 12, exact to fractions of a cent */
  exact: number;
  /** `exact` rounded UP to the rounding step */
  amount: number;
  rounding: Rounding;
  /** first and last month of the window (the 12 months from the month after the active one) */
  from: Period;
  to: Period;
  /** positions that make up the standing order (their 12-month total ÷ 12), largest share first */
  positions: { position: Position; monthly: number }[];
  /** the position that moves the standing order most away from today's monthly shares, or null */
  cause: StandingOrderCause | null;
}

/**
 * Why the standing order differs from today's monthly shares, for its largest reason:
 * - change: a planned change (new amount `amount` from `period`)
 * - start: a position that starts in `period`
 * - end: a position whose last month is `period`
 * - once: a one-time payment (or Einmalbetrag) in `period`
 */
export interface StandingOrderCause {
  kind: 'change' | 'start' | 'end' | 'once';
  name: string;
  period: Period;
  /** change: the new amount; once: the one-time amount */
  amount: number;
  /** effect on the standing order per month (+ more, − less) */
  monthly: number;
}

/** The 12 months the standing order covers: the month after the active one and the 11 after it. */
export function orderWindow(active: Period): Period[] {
  return Array.from({ length: 12 }, (_, i) => addPeriods(active, i + 1));
}

/**
 * The monthly standing order: every debit on the Fixkostenkonto in the 12 months from the next
 * month on, divided by 12 and rounded up to 1, 5 or 10. That covers positions that start or end
 * in those months, planned changes and one-time payments; skipped months count nothing. Without
 * any of these it equals the sum of today's monthly shares (`monthlyEquivalent`).
 */
export function standingOrder(ds: Dataset, active: Period, rounding: Rounding = DEFAULT_ROUNDING): StandingOrder {
  const window = orderWindow(active);
  // cents per position over the window, and what each one-time debit and plan change was
  const totals = new Map<string, number>();
  const onceOf = new Map<string, { period: Period; cents: number }>();
  const addTo = (id: string, cents: number) => totals.set(id, (totals.get(id) ?? 0) + cents);
  for (const period of window) {
    for (const i of dueItems(ds, period)) {
      if (!i.due || i.status === 'skipped' || !i.fromNet || !onKonto(ds, i.position, period)) continue;
      const cents = toCents(i.status === 'paid' ? i.payment!.actualAmount : i.planned);
      addTo(i.position.id, cents);
      if (i.plan?.frequency === 'once') {
        const prev = onceOf.get(i.position.id);
        if (!prev || cents > prev.cents) onceOf.set(i.position.id, { period, cents });
      }
    }
    for (const o of ds.oneOffs) {
      if (o.period !== period || !o.positionId) continue;
      const position = ds.positions.find((p) => p.id === o.positionId);
      if (!position || !onKonto(ds, position, period)) continue;
      addTo(position.id, toCents(o.amount));
      const key = `${position.id}#oneoff`;
      const prev = onceOf.get(key);
      if (!prev || toCents(o.amount) > prev.cents) onceOf.set(key, { period, cents: toCents(o.amount) });
    }
  }
  const totalCents = [...totals.values()].reduce((a, b) => a + b, 0);
  const positions = ds.positions
    .filter((p) => (totals.get(p.id) ?? 0) > 0)
    .map((position) => ({ position, monthly: (totals.get(position.id) ?? 0) / 1200 }))
    .sort((a, b) => b.monthly - a.monthly || a.position.sortOrder - b.position.sortOrder);
  // 12 months × rounding step in cents
  const step = rounding * 100 * 12;
  const amount = totalCents <= 0 ? 0 : (Math.ceil(totalCents / step) * step) / 1200;
  return { exact: totalCents / 1200, amount, rounding, from: window[0]!, to: window[11]!, positions, cause: largestCause(ds, active, window, totals, onceOf) };
}

/** Today's monthly share of a recurring position on the Fixkostenkonto, in cents × 12 (0 if it is not one today). */
function steadyCents(ds: Dataset, position: Position, active: Period): number {
  const plan = planForPeriod(position, active);
  if (!plan || plan.frequency === 'once' || !isActiveInPeriod(position, active) || !onKonto(ds, position, active)) return 0;
  return Math.round(monthlyEquivalent(position, active) * 1200);
}

function largestCause(
  ds: Dataset,
  active: Period,
  window: Period[],
  totals: Map<string, number>,
  onceOf: Map<string, { period: Period; cents: number }>,
): StandingOrderCause | null {
  let best: { position: Position; diff: number } | null = null;
  for (const position of ds.positions) {
    const diff = (totals.get(position.id) ?? 0) - steadyCents(ds, position, active);
    // below 1 € a month it is not worth a line (rounding of cents)
    if (Math.abs(diff) < 1200) continue;
    if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { position, diff };
  }
  if (!best) return null;
  const { position, diff } = best;
  const monthly = diff / 1200;
  const once = onceOf.get(position.id) ?? onceOf.get(`${position.id}#oneoff`);
  const steady = steadyCents(ds, position, active);
  if (once && (steady === 0 || onceOf.has(`${position.id}#oneoff`)))
    return { kind: 'once', name: position.name, period: once.period, amount: once.cents / 100, monthly };
  if (steady === 0) {
    const first = window.find((p) => isActiveInPeriod(position, p)) ?? window[0]!;
    return { kind: 'start', name: position.name, period: first, amount: 0, monthly };
  }
  const base = planForPeriod(position, active);
  const changed = window.find((p) => isActiveInPeriod(position, p) && planForPeriod(position, p) !== base);
  if (changed) {
    const plan = planForPeriod(position, changed)!;
    return { kind: 'change', name: position.name, period: changed, amount: plan.amount, monthly };
  }
  // no new plan, less than today: it ends (archived or paused) – its last active month
  const stop = window.findIndex((p) => !isActiveInPeriod(position, p));
  const last = stop <= 0 ? active : window[stop - 1]!;
  return { kind: 'end', name: position.name, period: last, amount: 0, monthly };
}

// ---------------------------------------------------------------------------
// F2 / F3 · Simulation and Startlücke
// ---------------------------------------------------------------------------

export interface KontoInput {
  /** „Kontostand heute“ */
  balance: number;
  /** the standing order of the active month is already on the account */
  receivedThisMonth: boolean;
  /** monthly deposit (the rounded standing order) */
  deposit: number;
}

export interface KontoDebit {
  name: string;
  amount: number;
  once?: boolean;
}

export interface KontoMonth {
  period: Period;
  /** balance at the start of the month */
  start: number;
  /** deposit of the month (comes before every debit) */
  deposit: number;
  /** debits of the month; the active month only counts what is still open */
  debits: number;
  items: KontoDebit[];
  /** balance at the end of the month = start + deposit − debits */
  end: number;
}

export interface KontoSimulation {
  months: KontoMonth[];
  /** lowest month-end balance */
  lowest: number;
  /** month of the lowest balance */
  lowestPeriod: Period | null;
  /** Startlücke: one-time top-up so the balance never goes below 0 = max(0, −lowest) */
  gap: number;
  /** 12 deposits − all debits of the 12 months (incl. what is already ticked this month): > 0 = the account grows */
  surplus: number;
  /** the account grows by more than one deposit a year: the standing order is higher than needed */
  rising: boolean;
}

interface MonthDebits {
  /** everything of the month on the Fixkostenkonto (paid: actual, open: plan, skipped: 0) */
  allCents: number;
  /** open part only */
  openCents: number;
  allItems: KontoDebit[];
  openItems: KontoDebit[];
}

function monthDebits(ds: Dataset, period: Period): MonthDebits {
  const out: MonthDebits = { allCents: 0, openCents: 0, allItems: [], openItems: [] };
  const add = (item: KontoDebit, open: boolean) => {
    const cents = toCents(item.amount);
    out.allCents += cents;
    out.allItems.push(item);
    if (open) {
      out.openCents += cents;
      out.openItems.push(item);
    }
  };
  for (const i of dueItems(ds, period)) {
    if (!i.due || i.status === 'skipped' || !i.fromNet || !onKonto(ds, i.position, period)) continue;
    const amount = i.status === 'paid' ? i.payment!.actualAmount : i.planned;
    add({ name: i.position.name, amount, ...(i.plan?.frequency === 'once' ? { once: true } : {}) }, i.status === 'open');
  }
  for (const o of ds.oneOffs) {
    if (o.period !== period || !o.positionId) continue;
    const position = ds.positions.find((p) => p.id === o.positionId);
    if (!position || !onKonto(ds, position, period)) continue;
    add({ name: `${position.name}: ${o.label}`, amount: o.amount }, !o.paidAt);
  }
  const byAmount = (a: KontoDebit, b: KontoDebit) => b.amount - a.amount;
  out.allItems.sort(byAmount);
  out.openItems.sort(byAmount);
  return out;
}

/**
 * Balance of the Fixkostenkonto at the end of each of the `count` months from `active` on.
 * Assumption (shown in the UI): the monthly deposit arrives before every debit of the month.
 * The active month starts at „Kontostand heute“ and only counts what is still open (ticked
 * positions are already off the account); its deposit counts unless it already arrived.
 * Every later month: deposit, then everything due (planned changes included, skipped months not).
 */
export function simulateKonto(ds: Dataset, active: Period, input: KontoInput, count = 12): KontoSimulation {
  const depositCents = Math.max(toCents(input.deposit), 0);
  let balance = toCents(input.balance);
  let allDebits = 0;
  let lowest = Infinity;
  let lowestPeriod: Period | null = null;
  const months: KontoMonth[] = [];
  for (let i = 0; i < count; i++) {
    const period = addPeriods(active, i);
    const d = monthDebits(ds, period);
    const first = i === 0;
    const deposit = first && input.receivedThisMonth ? 0 : depositCents;
    const debits = first ? d.openCents : d.allCents;
    const start = balance;
    balance = start + deposit - debits;
    allDebits += d.allCents;
    if (balance < lowest) {
      lowest = balance;
      lowestPeriod = period;
    }
    months.push({
      period,
      start: fromCents(start),
      deposit: fromCents(deposit),
      debits: fromCents(debits),
      items: first ? d.openItems : d.allItems,
      end: fromCents(balance),
    });
  }
  const lowestCents = count > 0 ? lowest : 0;
  const surplus = depositCents * count - allDebits;
  return {
    months,
    lowest: fromCents(lowestCents),
    lowestPeriod,
    gap: fromCents(Math.max(0, -lowestCents)),
    surplus: fromCents(surplus),
    rising: depositCents > 0 && surplus > depositCents,
  };
}

/** Everything the sheet and the analysis show, from the settings. */
export interface KontoOverview {
  order: StandingOrder;
  simulation: KontoSimulation;
}

export function kontoOverview(ds: Dataset, active: Period, settings: { balance: number; receivedFor: Period | null; rounding: Rounding }): KontoOverview {
  const order = standingOrder(ds, active, settings.rounding);
  const simulation = simulateKonto(ds, active, { balance: settings.balance, receivedThisMonth: settings.receivedFor === active, deposit: order.amount });
  return { order, simulation };
}
