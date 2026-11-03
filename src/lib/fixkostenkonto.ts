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
function onKonto(ds: Dataset, position: Position, period: Period): boolean {
  const kind = kindOfCategory(ds, position.categoryId);
  if (!kind || accountOf(ds, position) !== 'fixkostenkonto') return false;
  return countsFromNet(kind, position, planForPeriod(position, period));
}

// ---------------------------------------------------------------------------
// F1 · Dauerauftrag
// ---------------------------------------------------------------------------

export interface StandingOrder {
  /** Σ monthly shares (monthly full, quarterly ÷3, semiannual ÷6, annual ÷12), exact to fractions of a cent */
  exact: number;
  /** `exact` rounded UP to the rounding step */
  amount: number;
  rounding: Rounding;
  /** positions that make up the standing order, largest share first */
  positions: { position: Position; monthly: number }[];
}

/**
 * The monthly standing order: the monthly shares of every recurring position paid from the
 * Fixkostenkonto that is active in `period`, rounded up to 1, 5 or 10. One-time payments and
 * one-offs are not part of it (they show up in the simulation and the Startlücke).
 */
export function standingOrder(ds: Dataset, period: Period, rounding: Rounding = DEFAULT_ROUNDING): StandingOrder {
  const positions = ds.positions
    .filter((p) => {
      const plan = planForPeriod(p, period);
      return plan !== null && plan.frequency !== 'once' && isActiveInPeriod(p, period) && onKonto(ds, p, period);
    })
    .map((position) => ({ position, monthly: monthlyEquivalent(position, period) }))
    .filter((p) => p.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly || a.position.sortOrder - b.position.sortOrder);
  // monthlyEquivalent = integer numerator ÷ 1200: sum the numerators, divide once
  const numerator = positions.reduce((acc, p) => acc + Math.round(p.monthly * 1200), 0);
  const step = rounding * 100 * 1200;
  const amount = numerator <= 0 ? 0 : (Math.ceil(numerator / step) * step) / 1200 / 100;
  return { exact: numerator / 1200 / 100, amount, rounding, positions };
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

export function kontoOverview(
  ds: Dataset,
  active: Period,
  settings: { balance: number; receivedFor: Period | null; rounding: Rounding },
): KontoOverview {
  const order = standingOrder(ds, active, settings.rounding);
  const simulation = simulateKonto(ds, active, {
    balance: settings.balance,
    receivedThisMonth: settings.receivedFor === active,
    deposit: order.amount,
  });
  return { order, simulation };
}
