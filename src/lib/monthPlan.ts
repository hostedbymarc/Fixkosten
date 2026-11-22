// „Dein Monat“ and „Dein Plan“ (monat-verdichtet): ONE calculation for the month card, the sheet, the
// hint „Nächster großer Monat“, the setup and the analysis. Everything reads monthPlan(), nothing sums
// on its own.
//
// For each salary m of the plan (12 salaries from the next one, kontoState.next):
//   T_m = what goes to the Fixkostenkonto (or is set aside) in month m
//   F_m = Netto_m − T_m − Direkt_m − Vermögensaufbau_m (planned, only from the net salary) = „Frei für dich“
// T_m depends on the plan mode:
//   due    „Bei Fälligkeit“: every bill of the account in month m, the monthly ones and the big ones due in m,
//          minus what is already saved for them (no Sicherheitspuffer: the money is used when it is due)
//   even   „Gleichmäßig“: the amount of kontoState (12-month standing order, extra, Sicherheitspuffer)
//   custom „Eigener Plan“: like due, but a position with saving.mode 'spread' is saved up before it is
//          due, in equal rates from its start month (default: the first salary) up to the month it is due
// What is saved already (the expected balance of kontoState) is handed out to the next big payments in
// date order: „€ Y schon angespart · {Monat} noch € Z“. When this month's deposit is in already, the open
// bills of this month are taken from it first.
// Money in integer cents. Pure functions; only kontoState, dueItems and the salary parts are read.

import type { KontoSettings, PlanMode } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { dueItems, netSalaryForPeriod, type SourceItem } from './calc';
import { onKonto, roundStep, simulateKonto, standingOrder, type KontoSimulation } from './fixkostenkonto';
import { kontoState, periodStartDate, type KontoState } from './kontoBalance';
import { addPeriods } from './period';
import { lastSalary, salaryParts } from './salarySplit';
import type { Dataset, Period, Position, SavingSetting } from './types';

export type { PlanMode };

const cents = (v: number) => Math.round(v * 100);
const euros = (c: number) => c / 100;
/** cents rounded up to the rounding step (0: to the cent) */
const roundUp = (c: number, step: number) => (step === 0 || c <= 0 ? c : Math.ceil(c / (step * 100)) * step * 100);

/** months of the plan: the next salary and the 11 after it */
export const PLAN_MONTHS = 12;
/** a month counts as big when its bills are at least 25 % above the average */
export const BIG_MONTH_FACTOR = 1.25;

/** One bill on the account in a month of the plan. */
interface Bill {
  key: string;
  positionId: string | null;
  name: string;
  /** cents */
  amount: number;
  period: Period;
  monthly: boolean;
  /** day of the month it is due (dueDate), for the date order within a month */
  day: number;
  sortOrder: number;
}

/** A big payment (not monthly) of the next 12 months and how it is paid. */
export interface BigPayment {
  key: string;
  positionId: string | null;
  name: string;
  amount: number;
  /** the month it is due */
  period: Period;
  /** due: paid in its month · spread: saved up in rates before · even: in the even amount */
  mode: 'due' | 'spread' | 'even';
  /** spread: first month of the rates */
  start: Period | null;
  /** spread: number of rates (up to and including the due month) */
  rates: number;
  /** spread: one rate (rounded up to the cent) */
  rate: number;
  /** already saved for it (from today's balance, in date order) */
  saved: number;
  /** what is still needed in its month (due) or by its month (spread): amount − saved */
  rest: number;
}

export interface PlanMonth {
  period: Period;
  /** the day the salary comes („Neuer Monat beginnt am“) */
  payday: Date;
  /** net salary; missing: the last one entered (estimated); null without any */
  salary: number | null;
  estimated: boolean;
  /** T: to the account in this month */
  transfer: number;
  /** of T: the extra of „Gleichmäßig“ (kontoState) */
  extra: number;
  /** of T: the rates of payments saved up in this month (custom) */
  rates: number;
  /** every bill of the account in this month (this month: only what is still open) */
  bills: number;
  /** the big payments due in this month with what they still need („inkl. € A für …“) */
  due: BigPayment[];
  direct: number;
  directItems: SourceItem[];
  wealth: number;
  /** F: „Frei für dich“; null without a salary */
  free: number | null;
  /** F below the planned Spielgeld */
  short: boolean;
}

export interface Proposal {
  positionId: string;
  name: string;
  /** the month it is due */
  period: Period;
  start: Period;
  rates: number;
  rate: number;
}

/**
 * The answer of „Dein Plan“ (only with a salary and a Spielgeld):
 * - ok: the chosen plan keeps the Spielgeld in every month
 * - save: it does not, but saving up does („Spar ab …“) – proposals for single payments, or the even plan
 * - max: no plan keeps it: at most `max` (rounded down to € 50)
 */
export type PlanAnswer =
  | { kind: 'ok' }
  | { kind: 'save'; via: 'custom' | 'even'; proposals: Proposal[] }
  | { kind: 'max'; max: number; via: { mode: PlanMode; savings: Record<string, SavingSetting> } };

export interface BigMonth {
  period: Period;
  /** every bill of the account in that month */
  total: number;
  /** the two largest big payments of it */
  top: BigPayment[];
  /** the chosen plan keeps the Spielgeld in that month */
  ready: boolean;
}

export interface MonthPlan {
  /** the plan mode in use */
  mode: PlanMode;
  /** „Aufs Fixkostenkonto“ (true) or „Zur Seite legen“ (false) */
  hasAccount: boolean;
  /** kontoState with the even plan („Gleichmäßig“): balance, buffer, status, checks */
  state: KontoState;
  /** saved today (expected balance) */
  balance: number;
  months: PlanMonth[];
  /** the next salary („Dein Gehalt am …“) */
  first: PlanMonth;
  /**
   * monat-ist-monat: the ACTIVE period with the chosen plan („Dein Monat“). Before this month's deposit it is
   * `first`; after it, the same plan computed from the start of the active period (its deposit and what was
   * paid from it since are taken back out of today's balance).
   */
  current: PlanMonth;
  /** no net salary entered at all */
  noSalary: boolean;
  payments: BigPayment[];
  spielgeld: number | null;
  /** the smallest F of the 12 months (null without a salary) */
  lowestFree: number | null;
  /** every month keeps the Spielgeld (null without a salary or a Spielgeld) */
  fits: boolean | null;
  answer: PlanAnswer | null;
  /** the simpler plan that keeps the Spielgeld in all 12 months: due first, then even; null when none */
  recommended: 'due' | 'even' | null;
  bigMonth: BigMonth | null;
  /** the balance with the plan followed (analysis chart) */
  simulation: KontoSimulation;
}

export interface PlanOptions {
  /** another mode than the stored one (the switch in the sheet, the candidates) */
  mode?: PlanMode;
  /** saving settings instead of the stored ones of the positions (custom) */
  savings?: Record<string, SavingSetting>;
  /** another Spielgeld than the stored one */
  spielgeld?: number | null;
}

/** The stored plan mode, or the one derived from the old way the gap was closed. */
export function planModeOf(s: Pick<KontoSettings, 'planMode' | 'gapMode'>): PlanMode {
  return s.planMode ?? (s.gapMode === 'lump' ? 'due' : 'even');
}

/** The saving setting of each position (custom), from the stored positions. */
export function storedSavings(ds: Dataset): Record<string, SavingSetting> {
  return Object.fromEntries(ds.positions.filter((p) => p.saving).map((p) => [p.id, p.saving!]));
}

function dayOf(date: string | undefined): number {
  const d = date ? Number(date.slice(8, 10)) : NaN;
  return Number.isFinite(d) ? d : 32;
}

/** Every bill of the account in `period` (the active month: only the open ones), as in simulateKonto. */
function billsOf(ds: Dataset, period: Period, openOnly: boolean): Bill[] {
  const out: Bill[] = [];
  for (const i of dueItems(ds, period)) {
    if (!i.due || i.status === 'skipped' || !i.fromNet || !onKonto(ds, i.position, period)) continue;
    if (openOnly && i.status !== 'open') continue;
    const amount = cents(i.status === 'paid' ? i.payment!.actualAmount : i.planned);
    if (amount === 0) continue;
    out.push({
      key: `${i.position.id}@${period}`,
      positionId: i.position.id,
      name: i.position.name,
      amount,
      period,
      monthly: i.plan?.frequency === 'monthly',
      day: dayOf(i.plan?.dueDate),
      sortOrder: i.position.sortOrder,
    });
  }
  for (const o of ds.oneOffs) {
    if (o.period !== period || !o.positionId || (openOnly && o.paidAt)) continue;
    const position = ds.positions.find((p) => p.id === o.positionId);
    if (!position || !onKonto(ds, position, period) || cents(o.amount) === 0) continue;
    out.push({ key: `${o.id}@${period}`, positionId: null, name: `${position.name}: ${o.label}`, amount: cents(o.amount), period, monthly: false, day: 32, sortOrder: position.sortOrder });
  }
  return out;
}

const byDate = (a: Bill, b: Bill) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.day - b.day || b.amount - a.amount || a.sortOrder - b.sortOrder);

/** The net salary of a month; missing: the last one entered before it. */
function salaryOf(ds: Dataset, period: Period): { salary: number | null; estimated: boolean } {
  const own = netSalaryForPeriod(ds, period);
  if (own !== null) return { salary: own, estimated: false };
  return { salary: lastSalary(ds, addPeriods(period, -1))?.salary ?? null, estimated: true };
}

interface Core {
  months: PlanMonth[];
  payments: BigPayment[];
  transfers: number[];
}

/** The months of one plan (mode + savings), for a Spielgeld. */
function core(
  ds: Dataset,
  state: KontoState,
  periods: Period[],
  bills: Bill[][],
  available: number,
  mode: PlanMode,
  savings: Record<string, SavingSetting>,
  step: number,
  start: MonthStart,
  spielgeld: number | null,
): Core {
  const first = periods[0]!;
  const index = new Map(periods.map((p, i) => [p, i]));
  // saved already: to the next big payments in date order
  const big = bills.flat().filter((b) => !b.monthly).sort(byDate);
  let left = Math.max(available, 0);
  const saved = new Map<string, number>();
  for (const b of big) {
    const take = Math.min(left, b.amount);
    saved.set(b.key, take);
    left -= take;
  }
  // the payments and their rates
  const rateCents = periods.map(() => 0);
  const lastDue = new Map<string, Period>();
  const payments: BigPayment[] = big.map((b) => {
    const s = saved.get(b.key) ?? 0;
    const need = b.amount - s;
    const setting = b.positionId ? savings[b.positionId] : undefined;
    const pmode: BigPayment['mode'] = mode === 'even' ? 'even' : mode === 'custom' && setting?.mode === 'spread' ? 'spread' : 'due';
    let startP: Period | null = null;
    let rates = 0;
    let rate = 0;
    if (pmode === 'spread' && need > 0) {
      // the first occurrence from its start month, every later one from the month after the one before
      const prev = b.positionId ? lastDue.get(b.positionId) : undefined;
      const wanted = prev ? addPeriods(prev, 1) : (setting?.startMonth ?? first);
      startP = wanted < first ? first : wanted > b.period ? b.period : wanted;
      const from = index.get(startP) ?? 0;
      const to = index.get(b.period) ?? 0;
      rates = to - from + 1;
      const r = Math.ceil(need / rates - 1e-9);
      rate = r;
      for (let i = from; i <= to; i++) rateCents[i] = rateCents[i]! + r;
    }
    if (b.positionId) lastDue.set(b.positionId, b.period);
    return {
      key: b.key,
      positionId: b.positionId,
      name: b.name,
      amount: euros(b.amount),
      period: b.period,
      mode: pmode,
      start: startP,
      rates,
      rate: euros(rate),
      saved: euros(s),
      rest: euros(need),
    };
  });
  const months: PlanMonth[] = [];
  const transfers: number[] = [];
  for (const [i, period] of periods.entries()) {
    const own = bills[i]!;
    const all = own.reduce((a, b) => a + b.amount, 0);
    const duePays = payments.filter((p) => p.period === period);
    let transfer: number;
    let extra = 0;
    if (mode === 'even') {
      const m = state.months.find((x) => x.period === period);
      transfer = cents(m?.amount ?? state.order);
      extra = cents(m?.extra ?? 0);
      // „auf einmal“ (no deposit before the gap): the one-time amount in the month before it, at the latest
      // in the first salary of the plan („Leg jetzt … extra zur Seite“)
      if (state.mode === 'lump' && state.gapFrom) {
        const by = addPeriods(state.gapFrom, -1);
        if ((by < first ? first : by) === period) transfer += cents(state.lump);
      }
    } else {
      // the monthly bills, the big ones paid when due (what is not saved yet), the rates of this month
      const monthly = own.filter((b) => b.monthly).reduce((a, b) => a + b.amount, 0);
      const dueRest = duePays.filter((p) => p.mode === 'due').reduce((a, p) => a + cents(p.rest), 0);
      transfer = roundUp(monthly + dueRest + rateCents[i]!, step);
    }
    transfers.push(transfer);
    const { salary, estimated } = salaryOf(ds, period);
    const parts = salaryParts(ds, period);
    const free = salary === null ? null : euros(cents(salary) - transfer - cents(parts.direct) - cents(parts.wealth));
    months.push({
      period,
      payday: periodStartDate(period, start),
      salary,
      estimated,
      transfer: euros(transfer),
      extra: euros(extra),
      rates: euros(rateCents[i]!),
      bills: euros(all),
      due: duePays,
      direct: parts.direct,
      directItems: parts.directItems,
      wealth: parts.wealth,
      free,
      short: free !== null && spielgeld !== null && cents(free) < cents(spielgeld),
    });
  }
  return { months, payments, transfers };
}

const lowest = (months: PlanMonth[]): number | null =>
  months.some((m) => m.free === null) ? null : months.reduce((a, m) => Math.min(a, m.free!), Infinity);

const keeps = (months: PlanMonth[], spielgeld: number) => {
  const l = lowest(months);
  return l !== null && cents(l) >= cents(spielgeld);
};

/** Rounded down to whole € 50, never below 0. */
export function floor50(v: number): number {
  return Math.max(0, Math.floor(cents(v) / 5000) * 50);
}

/** The months and payments of a plan for the candidates (no answer, no big month). */
type Run = (mode: PlanMode, savings: Record<string, SavingSetting>) => Core;

/**
 * Proposals „Spar ab {Monat} € X im Monat für {Zahlung} an.“: from „Bei Fälligkeit“, the big payments of
 * every month that misses the Spielgeld are saved up from the first salary on (largest first, until the
 * month keeps it). Null when even that does not keep it in every month.
 */
function proposals(run: Run, base: Record<string, SavingSetting>, first: Period, spielgeld: number): { savings: Record<string, SavingSetting>; list: Proposal[] } | null {
  const savings: Record<string, SavingSetting> = { ...base };
  for (const id of Object.keys(savings)) if (savings[id]!.mode === 'spread') delete savings[id];
  for (let round = 0; round < PLAN_MONTHS; round++) {
    const c = run('custom', savings);
    const miss = c.months.find((m) => m.free !== null && cents(m.free) < cents(spielgeld));
    if (!miss) {
      const list = c.payments
        .filter((p) => p.mode === 'spread' && p.positionId && p.rates > 0)
        .filter((p, i, all) => all.findIndex((x) => x.positionId === p.positionId) === i)
        .map((p) => ({ positionId: p.positionId!, name: p.name, period: p.period, start: p.start!, rates: p.rates, rate: p.rate }));
      return { savings, list };
    }
    const candidates = c.payments
      .filter((p) => p.period <= miss.period && p.positionId && p.mode === 'due' && p.rest > 0)
      .sort((a, b) => (a.period === miss.period ? 0 : 1) - (b.period === miss.period ? 0 : 1) || b.rest - a.rest);
    const next = candidates[0];
    if (!next) return null;
    savings[next.positionId!] = { mode: 'spread', startMonth: first };
  }
  return null;
}

/**
 * Settings → the plan. `start` is „Neuer Monat beginnt am“. Without „Fixkosten einplanen“ nobody calls it.
 */
export function monthPlan(ds: Dataset, active: Period, s: KontoSettings, start: MonthStart = 1, opts: PlanOptions = {}): MonthPlan {
  const mode = opts.mode ?? planModeOf(s);
  const spielgeld = opts.spielgeld === undefined ? s.spielgeld : opts.spielgeld;
  const savings = opts.savings ?? storedSavings(ds);
  // the even plan is kontoState with the gap spread (lump only when no deposit is left before it)
  const state = kontoState(ds, active, { ...s, gapMode: 'spread' }, start);
  const first = state.next.period;
  const periods = Array.from({ length: PLAN_MONTHS }, (_, i) => addPeriods(first, i));
  const bills = periods.map((p) => billsOf(ds, p, p === active));
  // this month's deposit is in already: the open bills of this month are paid from the balance first
  const openNow = first !== active ? billsOf(ds, active, true).reduce((a, b) => a + b.amount, 0) : 0;
  const available = cents(state.balance) - openNow;
  const step = roundStep(s);
  const run: Run = (m, sv) => core(ds, state, periods, bills, available, m, sv, step, start, spielgeld);
  const chosen = run(mode, savings);
  const due = mode === 'due' ? chosen : run('due', savings);
  const even = mode === 'even' ? chosen : run('even', savings);
  // the active period from its start (monat-ist-monat): only needed once this month's deposit is in
  let current = chosen.months[0]!;
  if (first !== active) {
    const fromStart = Array.from({ length: PLAN_MONTHS }, (_, i) => addPeriods(active, i));
    const allBills = fromStart.map((p) => billsOf(ds, p, false));
    const check = s.checks.find((c) => c.period === active && c.deposited);
    const deposit = cents(check?.amount ?? (check ? standingOrder(ds, active, step).amount : state.months[0]?.amount ?? state.order));
    const sum = (b: Bill[]) => b.reduce((a, x) => a + x.amount, 0);
    const paidSince = sum(allBills[0]!) - sum(billsOf(ds, active, true));
    current = core(ds, state, fromStart, allBills, cents(state.balance) - deposit + paidSince, mode, savings, step, start, spielgeld).months[0]!;
  }
  const noSalary = chosen.months.some((m) => m.salary === null);
  const lowestFree = lowest(chosen.months);
  const fits = spielgeld === null || lowestFree === null ? null : cents(lowestFree) >= cents(spielgeld);
  // the simpler plan that keeps the Spielgeld (none set: that nothing goes below 0)
  const target = spielgeld ?? 0;
  const recommended = noSalary ? null : keeps(due.months, target) ? 'due' : keeps(even.months, target) ? 'even' : null;

  let answer: PlanAnswer | null = null;
  if (!noSalary && spielgeld !== null) {
    if (fits) answer = { kind: 'ok' };
    else {
      const targeted = proposals(run, savings, first, spielgeld);
      if (targeted) answer = { kind: 'save', via: 'custom', proposals: targeted.list };
      else if (keeps(even.months, spielgeld)) answer = { kind: 'save', via: 'even', proposals: [] };
      else {
        // the best a plan can do: due, even, everything saved up from the first salary
        const allSpread: Record<string, SavingSetting> = Object.fromEntries(
          due.payments.filter((p) => p.positionId).map((p) => [p.positionId!, { mode: 'spread', startMonth: first } as SavingSetting]),
        );
        const candidates: { mode: PlanMode; savings: Record<string, SavingSetting>; low: number }[] = [
          { mode: 'due', savings, low: lowest(due.months)! },
          { mode: 'even', savings, low: lowest(even.months)! },
          { mode: 'custom', savings: allSpread, low: lowest(run('custom', allSpread).months)! },
        ];
        const best = candidates.reduce((a, c) => (c.low > a.low ? c : a));
        answer = { kind: 'max', max: floor50(best.low), via: { mode: best.mode, savings: best.savings } };
      }
    }
  }

  // „Nächster großer Monat“: the first month whose bills are 25 % above the average of the 12
  const totals = chosen.months.map((m) => cents(m.bills));
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const bigIndex = avg > 0 ? totals.findIndex((t) => t >= avg * BIG_MONTH_FACTOR) : -1;
  const bigMonth: BigMonth | null =
    bigIndex < 0
      ? null
      : {
          period: periods[bigIndex]!,
          total: euros(totals[bigIndex]!),
          top: [...chosen.months[bigIndex]!.due].sort((a, b) => b.amount - a.amount).slice(0, 2),
          ready: spielgeld === null ? chosen.months[bigIndex]!.free === null || chosen.months[bigIndex]!.free! >= 0 : !chosen.months[bigIndex]!.short && fits !== false,
        };

  // the balance with the plan: deposits from the active month on (this month's is in already: none)
  const deposits = [first === active ? chosen.transfers[0]! : 0, ...chosen.transfers.slice(first === active ? 1 : 0)].map(euros);
  const simulation =
    mode === 'even'
      ? state.planSimulation
      : simulateKonto(ds, active, { balance: state.balance, receivedThisMonth: first !== active, deposit: 0, deposits });

  return {
    mode,
    hasAccount: state.hasAccount,
    state,
    balance: state.balance,
    months: chosen.months,
    first: chosen.months[0]!,
    current,
    noSalary,
    payments: chosen.payments,
    spielgeld,
    lowestFree,
    fits,
    answer,
    recommended,
    bigMonth,
    simulation,
  };
}

/**
 * „inkl. …“ under ① (monat-feinschliff): what of T this salary carries beyond its monthly bills, and for whom.
 * - Gleichmäßig: the extra (or the one-time amount) – for the month the money is short and its big payments
 *   („inkl. € 326,81 für Februar · Steuerberater, Öffis“)
 * - Bei Fälligkeit: only when a big payment is due this month („inkl. € 262,00 Baurechtszins“)
 * - Eigener Plan: the rates of this month – for the month of the first payment saved up, and the payments;
 *   without rates like Bei Fälligkeit
 * null: nothing extra in this salary.
 */
export interface InclLine {
  amount: number;
  /** saving up for this month (Gleichmäßig, Eigener Plan); null: paid this month (Bei Fälligkeit) */
  month: Period | null;
  names: string[];
}

export function inclLine(plan: MonthPlan): InclLine | null {
  const first = plan.first;
  if (plan.mode === 'even') {
    const state = plan.state;
    const lumpHere = state.mode === 'lump' && state.gapFrom && first.transfer > (state.months.find((m) => m.period === first.period)?.amount ?? state.order);
    const amount = first.extra > 0 ? first.extra : lumpHere ? state.lump : 0;
    // the extra fills the month with the lowest balance (gapMonth): that month and its big payments
    const month = state.gapMonth ?? state.gapFrom;
    if (amount <= 0 || !month) return null;
    const names = plan.payments.filter((p) => p.period === month).map((p) => p.name);
    return { amount, month, names: names.length ? names : state.gapBills.map((b) => b.name) };
  }
  if (first.rates > 0) {
    const saving = plan.payments.filter((p) => p.mode === 'spread' && p.rates > 0 && p.start !== null && p.start <= first.period && p.period >= first.period);
    const month = saving.reduce<Period | null>((m, p) => (m === null || p.period < m ? p.period : m), null);
    return { amount: first.rates, month, names: saving.filter((p) => p.period === month).map((p) => p.name) };
  }
  const due = first.due.filter((p) => p.mode === 'due' && p.rest > 0);
  if (due.length === 0) return null;
  return { amount: Math.round(due.reduce((a, p) => a + p.rest, 0) * 100) / 100, month: null, names: due.map((p) => p.name) };
}

/**
 * The default account of a position after „Hast du ein eigenes Konto für Fixkosten?“ (only positions
 * without a stored account; stored ones stay): yes → everything „Rücklage“; no → monthly ones „Direkt“,
 * all others „Rücklage“. Vermögensaufbau stays „Direkt“ as before.
 */
export function setupAccount(position: Position, kind: 'expense' | 'savings' | undefined, hasAccount: boolean): 'fixkostenkonto' | 'girokonto' | null {
  if (position.account) return null;
  if (kind === 'savings') return 'girokonto';
  if (hasAccount) return 'fixkostenkonto';
  const plan = position.history.at(-1);
  return plan?.frequency === 'monthly' ? 'girokonto' : 'fixkostenkonto';
}
