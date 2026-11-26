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
//          due, in equal rates from its start month (default: the first salary) up to the month it is due;
//          one with saving.mode 'once' (komplett-ansparen) comes from ONE salary – all of it, or a part and
//          the rest when it is due. Its due month takes it „aus Rücklage“.
//          One with saving.mode 'range' (plan-optionen) is split in equal rates over the salaries from
//          fromSalaryMonth to toSalaryMonth, the cent rest on the first rate.
// What is saved already (the expected balance of kontoState) is handed out to the next big payments in
// date order: „€ Y schon angespart · {Monat} noch € Z“. When this month's deposit is in already, the bills
// of this month are taken from it first.
// Ticks change nothing here (spielgeld-pille-rechenfehler): every bill counts, ticked or not, from the
// balance of kontoBalance.planBalance.
// Money in integer cents. Pure functions; only kontoState, dueItems and the salary parts are read.

import type { KontoSettings, PlanMode } from '../db/settings';
import type { MonthStart } from './activeMonth';
import { dueItems, type SourceItem } from './calc';
import { onKonto, roundStep, simulateKonto, standingOrder, type KontoSimulation } from './fixkostenkonto';
import { kontoState, periodStartDate, type KontoState } from './kontoBalance';
import { addPeriods } from './period';
import { salaryParts } from './salarySplit';
import { plannedSalary } from './salaryMonth';
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
  /** due: paid in its month · spread: saved up in rates before · once: from one salary · range: split over chosen salaries · even: in the even amount */
  mode: 'due' | 'spread' | 'once' | 'range' | 'even';
  /** spread, range: first month of the rates */
  start: Period | null;
  /** range: last month of the rates; spread: the month it is due */
  end: Period | null;
  /** spread: number of rates (up to and including the due month); range: of the chosen salaries */
  rates: number;
  /** spread: one rate (rounded up to the cent); range: every rate but the first */
  rate: number;
  /** range: the first rate (it carries the cent rest); spread: = rate */
  firstRate: number;
  /** already saved for it (from today's balance, in date order) */
  saved: number;
  /** what is still needed in its month (due) or by its month (spread): amount − saved */
  rest: number;
  /** once: the period whose salary carries it („vom {Monat}-Gehalt“) */
  salaryMonth: Period | null;
  /** once: what that salary carries (≤ rest) */
  fromSalary: number;
  /** once: a part was chosen („Teilbetrag“), not all of it */
  partial: boolean;
  /** what goes to the account for it in its own month (due: rest, once: rest − fromSalary, spread: the last rate, range: its rate in that month or 0) */
  atDue: number;
}

/**
 * komplett-ansparen: one line of ① in a month of the plan. `due`: a bill due this month („{Name} · fällig
 * {Monat}“) with what this salary still carries and what was saved for it before; `for`: money set aside for a
 * later payment („{Name} · für {Monat}“).
 */
export interface ReserveLine {
  key: string;
  name: string;
  kind: 'due' | 'for';
  /** the month the bill is due */
  period: Period;
  /** what this month's salary carries for it */
  amount: number;
  /** due: saved for it before („€ X schon angespart“) */
  saved: number;
}

export interface PlanMonth {
  period: Period;
  /** the day the salary comes („Neuer Monat beginnt am“) */
  payday: Date;
  /** net salary; missing: „Gehalt zum Planen“, else the last one entered (estimated); null without any */
  salary: number | null;
  /** planned, not entered („geplant“) */
  estimated: boolean;
  /** T: to the account in this month */
  transfer: number;
  /** of T: the extra of „Gleichmäßig“ (kontoState) */
  extra: number;
  /** of T: the rates of payments saved up in this month (custom) */
  rates: number;
  /** every bill of the account in this month (ticked or not) */
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
  /** the lines of ① (custom and due; null with „Gleichmäßig“): their sum plus rounding is `transfer` */
  lines: ReserveLine[] | null;
  /** of the bills due this month: what was saved before („€ X aus Rücklage“) */
  fromReserve: number;
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
  /** komplett-ansparen: every big payment of it is saved up before it („✓ Schon angespart“) */
  saved: boolean;
}

export interface MonthPlan {
  /** the monthly checks of the settings (alle-monate-gleich: ① of a past month is what was transferred) */
  checks: KontoSettings['checks'];
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
   * `first`; after it, the same plan computed from the start of the active period (its deposit is taken back out
   * of the plan's balance).
   */
  current: PlanMonth;
  /** no net salary entered at all */
  noSalary: boolean;
  payments: BigPayment[];
  spielgeld: number | null;
  /** polster-feinschliff: the Spielgeld of a month – its own („Nur {Monat}“) or `spielgeld` */
  spielgeldFor: (period: Period) => number | null;
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
  /** „Gehalt zum Planen“ (settings); null: not set */
  planSalary: number | null;
  /**
   * gehalt-zum-planen: the largest amount missing in the plan – the month and how much its „Frei für dich“
   * is below the Spielgeld (none set: below 0). null when nothing is missing or a salary is missing.
   */
  shortfall: Shortfall | null;
}

export interface Shortfall {
  period: Period;
  amount: number;
}

/** The month whose „Frei für dich“ is furthest below `target` (the first of equal ones); null when none is. */
export function shortfallOf(months: PlanMonth[], target: number | ((p: Period) => number)): Shortfall | null {
  let worst: Shortfall | null = null;
  for (const m of months) {
    if (m.free === null) return null;
    const miss = cents(typeof target === 'number' ? target : target(m.period)) - cents(m.free);
    if (miss > 0 && (worst === null || miss > cents(worst.amount))) worst = { period: m.period, amount: euros(miss) };
  }
  return worst;
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

/** Every bill of the account in `period`, ticked or not (as simulateKonto with countPaid). */
function billsOf(ds: Dataset, period: Period, start: MonthStart = 1): Bill[] {
  const out: Bill[] = [];
  for (const i of dueItems(ds, period, start)) {
    if (!i.due || i.status === 'skipped' || !i.fromNet || !onKonto(ds, i.position, period)) continue;
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
    if (o.period !== period || !o.positionId) continue;
    const position = ds.positions.find((p) => p.id === o.positionId);
    if (!position || !onKonto(ds, position, period) || cents(o.amount) === 0) continue;
    out.push({ key: `${o.id}@${period}`, positionId: null, name: `${position.name}: ${o.label}`, amount: cents(o.amount), period, monthly: false, day: 32, sortOrder: position.sortOrder });
  }
  return out;
}

const byDate = (a: Bill, b: Bill) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.day - b.day || b.amount - a.amount || a.sortOrder - b.sortOrder);

/** The net salary of a month (plannedSalary): its entry, else „Gehalt zum Planen“, else the last one entered. */
function salaryOf(ds: Dataset, period: Period, planSalary: number | null): { salary: number | null; estimated: boolean } {
  const { value, source } = plannedSalary(ds, period, planSalary);
  return { salary: value, estimated: source === 'plan' || source === 'last' };
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
  spielgeld: SpielgeldOf,
  planSalary: number | null,
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
    const prevDue = b.positionId ? lastDue.get(b.positionId) : undefined;
    // once: the occurrence its salary saves for (the first one due from that salary on); later ones when due
    const onceHere = setting?.mode === 'once' && !!setting.salaryMonth && setting.salaryMonth <= b.period && (!prevDue || setting.salaryMonth > prevDue);
    // range (plan-optionen): likewise the first occurrence due from its first salary on
    const rangeHere = setting?.mode === 'range' && !!setting.fromSalaryMonth && setting.fromSalaryMonth <= b.period && (!prevDue || setting.fromSalaryMonth > prevDue);
    const pmode: BigPayment['mode'] =
      mode === 'even'
        ? 'even'
        : mode === 'custom' && setting?.mode === 'spread'
          ? 'spread'
          : mode === 'custom' && onceHere
            ? 'once'
            : mode === 'custom' && rangeHere
              ? 'range'
              : 'due';
    let startP: Period | null = null;
    let endP: Period | null = null;
    let rates = 0;
    let rate = 0;
    let firstRate = 0;
    let salaryP: Period | null = null;
    let fromSalary = 0;
    if (pmode === 'once') {
      const wanted = setting!.salaryMonth!;
      salaryP = wanted < first ? first : wanted;
      fromSalary = need <= 0 ? 0 : setting!.amount === undefined ? need : Math.min(Math.max(Math.round(setting!.amount), 0), need);
      const at = index.get(salaryP);
      if (at !== undefined) rateCents[at] = rateCents[at]! + fromSalary;
    }
    if (pmode === 'spread' && need > 0) {
      // the first occurrence from its start month, every later one from the month after the one before
      const wanted = prevDue ? addPeriods(prevDue, 1) : (setting?.startMonth ?? first);
      startP = wanted < first ? first : wanted > b.period ? b.period : wanted;
      const from = index.get(startP) ?? 0;
      const to = index.get(b.period) ?? 0;
      rates = to - from + 1;
      const r = Math.ceil(need / rates - 1e-9);
      rate = r;
      firstRate = r;
      endP = b.period;
      for (let i = from; i <= to; i++) rateCents[i] = rateCents[i]! + r;
    }
    if (pmode === 'range' && need > 0) {
      // equal rates over the chosen salaries (within the plan, up to the month it is due), the cent rest first
      const wantFrom = setting!.fromSalaryMonth!;
      startP = wantFrom < first ? first : wantFrom;
      const wantTo = setting!.toSalaryMonth ?? b.period;
      endP = wantTo > b.period ? b.period : wantTo < startP ? startP : wantTo;
      const from = index.get(startP) ?? 0;
      const to = index.get(endP) ?? from;
      rates = to - from + 1;
      rate = Math.floor(need / rates);
      firstRate = need - rate * (rates - 1);
      for (let i = from; i <= to; i++) rateCents[i] = rateCents[i]! + (i === from ? firstRate : rate);
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
      end: endP,
      rates,
      rate: euros(rate),
      firstRate: euros(firstRate),
      saved: euros(s),
      rest: euros(need),
      salaryMonth: salaryP,
      fromSalary: euros(fromSalary),
      partial: pmode === 'once' && setting!.amount !== undefined,
      atDue: euros(
        pmode === 'once'
          ? need - fromSalary
          : pmode === 'spread'
            ? rates > 0
              ? rate
              : 0
            : pmode === 'range'
              ? rates > 0 && endP === b.period
                ? rates === 1
                  ? firstRate
                  : rate
                : 0
              : Math.max(need, 0),
      ),
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
      const dueRest = duePays.filter((p) => p.mode === 'due' || p.mode === 'once').reduce((a, p) => a + cents(p.atDue), 0);
      transfer = roundUp(monthly + dueRest + rateCents[i]!, step);
    }
    transfers.push(transfer);
    const { salary, estimated } = salaryOf(ds, period, planSalary);
    const parts = salaryParts(ds, period, start);
    const free = salary === null ? null : euros(cents(salary) - transfer - cents(parts.direct) - cents(parts.wealth));
    // ① line by line (not with „Gleichmäßig“: its standing order is not made of single bills)
    let lines: ReserveLine[] | null = null;
    let fromReserve = 0;
    if (mode !== 'even') {
      lines = [];
      for (const b of [...own].sort(byDate)) {
        const pay = b.monthly ? undefined : duePays.find((p) => p.key === b.key);
        const amount = pay ? cents(pay.atDue) : b.amount;
        const saved = b.amount - amount;
        fromReserve += saved;
        lines.push({ key: b.key, name: b.name, kind: 'due', period, amount: euros(amount), saved: euros(saved) });
      }
      for (const p of payments) {
        if (p.period <= period) continue;
        const here =
          p.mode === 'once' && p.salaryMonth === period
            ? cents(p.fromSalary)
            : p.mode === 'spread' && p.start !== null && p.start <= period && p.rates > 0
              ? cents(p.rate)
              : p.mode === 'range' && p.start !== null && p.end !== null && p.start <= period && period <= p.end && p.rates > 0
                ? cents(p.start === period ? p.firstRate : p.rate)
                : 0;
        if (here > 0) lines.push({ key: `${p.key}>${period}`, name: p.name, kind: 'for', period: p.period, amount: euros(here), saved: 0 });
      }
    }
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
      short: free !== null && spielgeld(period) !== null && cents(free) < cents(spielgeld(period)!),
      lines,
      fromReserve: euros(fromReserve),
    });
  }
  return { months, payments, transfers };
}

const lowest = (months: PlanMonth[]): number | null =>
  months.some((m) => m.free === null) ? null : months.reduce((a, m) => Math.min(a, m.free!), Infinity);

/** every month keeps its Spielgeld (none: does not go below 0) */
const keeps = (months: PlanMonth[], spielgeld: SpielgeldOf) => months.every((m) => m.free !== null && cents(m.free) >= cents(spielgeld(m.period) ?? 0));

/** the Spielgeld of a month (euros); null: none */
type SpielgeldOf = (period: Period) => number | null;

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
function proposals(run: Run, base: Record<string, SavingSetting>, first: Period, spielgeld: SpielgeldOf): { savings: Record<string, SavingSetting>; list: Proposal[] } | null {
  const savings: Record<string, SavingSetting> = { ...base };
  for (const id of Object.keys(savings)) if (savings[id]!.mode === 'spread') delete savings[id];
  for (let round = 0; round < PLAN_MONTHS; round++) {
    const c = run('custom', savings);
    const miss = c.months.find((m) => m.free !== null && cents(m.free) < cents(spielgeld(m.period) ?? 0));
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
  // „Nur {Monat}“ (polster-feinschliff): a month's own Spielgeld; none without a Spielgeld at all
  const overrides = s.spielgeldOverrides ?? {};
  const spielgeldFor: SpielgeldOf = (p) => (spielgeld === null ? null : overrides[p] !== undefined ? overrides[p]! / 100 : spielgeld);
  const savings = opts.savings ?? storedSavings(ds);
  // the even plan is kontoState with the gap spread (lump only when no deposit is left before it)
  // spielgeld-pille-rechenfehler: the plan does not depend on what is ticked. Every bill counts in its month,
  // ticked or not, from planBalance (kontoBalance): a tick used to take a bill off the balance while it still
  // counted in its month – twice, so ① rose by what was saved for it
  const state = kontoState(ds, active, { ...s, gapMode: 'spread' }, start, { planning: true });
  const first = state.next.period;
  const periods = Array.from({ length: PLAN_MONTHS }, (_, i) => addPeriods(first, i));
  const bills = periods.map((p) => billsOf(ds, p, start));
  const sum = (b: Bill[]) => b.reduce((a, x) => a + x.amount, 0);
  const planBalance = cents(state.planBalance);
  // this month's deposit is in already: the bills of this month are paid from the balance first
  const nowBills = first !== active ? sum(billsOf(ds, active, start)) : 0;
  const available = planBalance - nowBills;
  const step = roundStep(s);
  const run: Run = (m, sv) => core(ds, state, periods, bills, available, m, sv, step, start, spielgeldFor, s.planSalary);
  const chosen = run(mode, savings);
  const due = mode === 'due' ? chosen : run('due', savings);
  const even = mode === 'even' ? chosen : run('even', savings);
  // the active period from its start (monat-ist-monat): only needed once this month's deposit is in
  let current = chosen.months[0]!;
  if (first !== active) {
    const fromStart = Array.from({ length: PLAN_MONTHS }, (_, i) => addPeriods(active, i));
    const allBills = fromStart.map((p) => billsOf(ds, p, start));
    const check = s.checks.find((c) => c.period === active && c.deposited);
    const deposit = cents(check?.amount ?? (check ? standingOrder(ds, active, step).amount : state.months[0]?.amount ?? state.order));
    current = core(ds, state, fromStart, allBills, planBalance - deposit, mode, savings, step, start, spielgeldFor, s.planSalary).months[0]!;
  }
  const noSalary = chosen.months.some((m) => m.salary === null);
  const lowestFree = lowest(chosen.months);
  const fits = spielgeld === null || lowestFree === null ? null : keeps(chosen.months, spielgeldFor);
  // the simpler plan that keeps the Spielgeld (none set: that nothing goes below 0)
  const recommended = noSalary ? null : keeps(due.months, spielgeldFor) ? 'due' : keeps(even.months, spielgeldFor) ? 'even' : null;

  let answer: PlanAnswer | null = null;
  if (!noSalary && spielgeld !== null) {
    if (fits) answer = { kind: 'ok' };
    else {
      const targeted = proposals(run, savings, first, spielgeldFor);
      if (targeted) answer = { kind: 'save', via: 'custom', proposals: targeted.list };
      else if (keeps(even.months, spielgeldFor)) answer = { kind: 'save', via: 'even', proposals: [] };
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

  const bigMonth = bigMonthOf(chosen.months, first, spielgeld, fits);

  // the balance with the plan: deposits from the active month on (this month's is in already: none)
  const deposits = [first === active ? chosen.transfers[0]! : 0, ...chosen.transfers.slice(first === active ? 1 : 0)].map(euros);
  const simulation =
    mode === 'even'
      ? state.planSimulation
      : simulateKonto(ds, active, { balance: state.planBalance, receivedThisMonth: first !== active, deposit: 0, deposits, countPaid: true });

  return {
    mode,
    checks: s.checks,
    hasAccount: state.hasAccount,
    state,
    balance: state.balance,
    months: chosen.months,
    first: chosen.months[0]!,
    current,
    noSalary,
    payments: chosen.payments,
    spielgeld,
    spielgeldFor,
    lowestFree,
    fits,
    answer,
    recommended,
    bigMonth,
    simulation,
    planSalary: s.planSalary,
    shortfall: noSalary ? null : shortfallOf(chosen.months, (p) => spielgeldFor(p) ?? 0),
  };
}

/**
 * „Nächster großer Monat“: from `from` on (komplett-ansparen: the month shown, the active one or a later one), the
 * first month whose bills are 25 % above the average of the 12 months of the plan. null: none (or beyond the plan).
 */
function bigMonthOf(months: PlanMonth[], from: Period, spielgeld: number | null, fits: boolean | null): BigMonth | null {
  const totals = months.map((m) => cents(m.bills));
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  if (!(avg > 0)) return null;
  const i = months.findIndex((m, k) => m.period >= from && totals[k]! >= avg * BIG_MONTH_FACTOR);
  if (i < 0) return null;
  const month = months[i]!;
  const due = month.due;
  return {
    period: month.period,
    total: euros(totals[i]!),
    top: [...due].sort((a, b) => b.amount - a.amount).slice(0, 2),
    ready: spielgeld === null ? month.free === null || month.free >= 0 : !month.short && fits !== false,
    saved: due.length > 0 && due.every((p) => cents(p.atDue) === 0),
  };
}

/** „Nächster großer Monat“ for the month shown (`period`): from it on; none for a month before the active one. */
export function bigMonthFrom(plan: MonthPlan, period: Period): BigMonth | null {
  if (period < plan.current.period) return null;
  if (period <= plan.first.period) return plan.bigMonth;
  return bigMonthOf(plan.months, period, plan.spielgeld, plan.fits);
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
    const saving = plan.payments.filter(
      (p) =>
        (p.mode === 'spread' && p.rates > 0 && p.start !== null && p.start <= first.period && p.period >= first.period) ||
        (p.mode === 'range' && p.rates > 0 && p.start !== null && p.end !== null && p.start <= first.period && first.period <= p.end) ||
        (p.mode === 'once' && p.salaryMonth === first.period && p.fromSalary > 0),
    );
    const month = saving.reduce<Period | null>((m, p) => (m === null || p.period < m ? p.period : m), null);
    return { amount: first.rates, month, names: saving.filter((p) => p.period === month).map((p) => p.name) };
  }
  const due = first.due.filter((p) => (p.mode === 'due' || p.mode === 'once') && p.atDue > 0);
  if (due.length === 0) return null;
  return { amount: Math.round(due.reduce((a, p) => a + p.atDue, 0) * 100) / 100, month: null, names: due.map((p) => p.name) };
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
