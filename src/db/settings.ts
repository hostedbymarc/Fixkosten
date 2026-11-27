// Fixkostenkonto settings and the country: meta entries (key-value), no schema change. They
// travel with the backup under `settings` (src/db/backup.ts) only once they were set.

import { COUNTRY_KEY, isCountry, toCountry, type Country } from '../lib/country';
import { DEFAULT_ROUNDING, toRounding, type Rounding } from '../lib/fixkostenkonto';
import { localToday } from '../lib/activeMonth';
import { isPeriod } from '../lib/period';
import type { Period } from '../lib/types';
import type { FixkostenDB } from './db';

export const KONTO_KEY = 'fixkostenkonto';

export interface KontoAnchor {
  /** balance the user stated */
  amount: number;
  /** when (ISO timestamp): deposits confirmed and positions ticked after it move the expected balance */
  at: string;
}

/** Monthly check „Hast du € X zur Seite gelegt?“ – one per month. */
export interface KontoCheck {
  period: Period;
  deposited: boolean;
  /** ISO timestamp of the answer */
  answeredAt: string;
  /** the amount confirmed (base plus extra of that month); older checks: none – the base amount counts */
  amount?: number;
}

/** How the gap is closed: spread over the deposits until the first month below 0, or set aside at once. */
export type GapMode = 'spread' | 'lump';
export const GAP_MODES: GapMode[] = ['spread', 'lump'];

/**
 * „Dein Plan“ (monat-verdichtet): Bei Fälligkeit (due), Gleichmäßig (even), Eigener Plan (custom, the
 * saving setting of each position). Not stored: derived from the old gapMode („auf einmal“ → due,
 * „verteilt“ or not asked → even), so existing installations keep their numbers.
 */
export type PlanMode = 'due' | 'even' | 'custom';
export const PLAN_MODES: PlanMode[] = ['due', 'even', 'custom'];

/** Sicherheitspuffer: the balance with the plan never goes below it at a month's end. */
export type Buffer = 0 | 100 | 250 | 500;
export const BUFFERS: Buffer[] = [0, 100, 250, 500];
export const DEFAULT_BUFFER: Buffer = 100;

// 'firstPod' (stored id, kept for existing data) = „Zum ersten Mal alles gedeckt“
export const MILESTONES = ['firstPod', 'streak3', 'streak6', 'year'] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface KontoSettings {
  /** mode on: tile on the month screen, sheet, analysis section */
  enabled: boolean;
  /** „Später“ on the invitation card: the card does not come back (settings only) */
  inviteDismissed: boolean;
  /** „Kontostand heute“ as entered last (kept for older app versions; the anchor is what counts) */
  balance: number;
  /** month for which the standing order already arrived; another month = not yet */
  receivedFor: Period | null;
  rounding: Rounding;
  /** „Monatsbetrag runden“: off → to the cent. Not stored: on when a rounding was stored (every setup before this switch) */
  roundingOn: boolean;
  /** Sicherheitspuffer (default € 100, also for existing setups) */
  buffer: Buffer;
  // ---- Einrichtung und Plan (all optional in storage; defaults below) ----
  /** balance anchor; none: `balance` without corrections (data from PR #39) */
  anchor: KontoAnchor | null;
  /** „Hast du ein eigenes Konto für Fixkosten?“ – false: „Nein, ich plane nur“ (null: not asked) */
  hasAccount: boolean | null;
  /** answer to „Läuft dein Dauerauftrag schon?“ (null: not asked) */
  orderRuns: boolean | null;
  /** setup questions answered (older setups; not shown any more) */
  setupSteps: number;
  /** both setup questions answered → „Dein Plan“ */
  setupDone: boolean;
  /** balance unknown (older setup „Weiß ich gerade nicht“): ask for it on the next start */
  balanceUnknown: boolean;
  checks: KontoCheck[];
  /** „Noch nicht“ on the monthly check: not again on this day (YYYY-MM-DD) */
  snoozedOn: string | null;
  /** last „Stimmt dein Kontostand noch?“ (YYYY-MM-DD); asked again after 3 months */
  balanceCheckedOn: string | null;
  /** no standing order arrives in this month (it is set up only now) */
  orderStartsAfter: Period | null;
  /** „Dein Plan“ */
  plan: { accountDone: boolean; orderDone: boolean; gapDone: boolean };
  /** milestones whose toast came already (it comes once) */
  milestonesShown: Milestone[];
  /** how the gap is closed (null: not asked – spread when possible) */
  gapMode: GapMode | null;
  /** „So funktioniert Erbse“ was shown: it opens by itself only once, right after the setup */
  walkthroughSeen: boolean;
  /** „Spielgeld pro Monat“ (cents allowed); null = off */
  spielgeld: number | null;
  /** per month: where the part above the Spielgeld comes from; missing = from the surplus (Überschuss) */
  spielgeldOverflow: Partial<Record<Period, OverflowAnswer>>;
  /** months whose „{Monat} erledigt“ was celebrated (the confetti plays once per month) */
  celebratedMonths: Period[];
  /** „Dein Plan“; null: not chosen – derived from gapMode (planModeOf) */
  planMode: PlanMode | null;
  /** „Gehalt zum Planen“ (gehalt-zum-planen): the net salary of months without an entry; null = the last one entered */
  planSalary: number | null;
  /** the hint „Leg dein Gehalt zum Planen fest“ was tapped: it does not come back */
  planSalaryHintSeen: boolean;
  // ---- polster-ziel (all in cents; the switch „Überschuss als Polster mitnehmen“ of plan-optionen is gone:
  // a stored `cushion` is ignored on reading and left out on writing) ----
  /** „Polster-Ziel“ in cents; null = none */
  cushionGoal: number | null;
  /** „Schon geschafft“: the Polster today in cents; null = none (no Polster column, no Polster messages) */
  cushionBalance: number | null;
  /** the day the Polster was last entered or changed (YYYY-MM-DD) */
  cushionBalanceDate: string | null;
  /** „Überschuss bis zum Ziel“: all into the Polster, or a fixed share (`cushionShare` %) */
  cushionRule: CushionRule;
  /** the share of the rule „Fester Anteil“ in percent (1–99) */
  cushionShare: number;
  /** stages (25/50/75/100 %) already celebrated: each only once */
  cushionMilestones: CushionMilestone[];
  /** per month: the amount confirmed in cents (+ „Polster aufgefüllt“, − „Aus Polster genommen“) – once per month */
  cushionConfirmed: Partial<Record<Period, number>>;
  // ---- polster-feinschliff (cents) ----
  /**
   * Every change of the Polster, in order: „Polster aufgefüllt“ / „Aus Polster genommen“ of a month (split / gap),
   * „+ Einzahlen“ / „− Entnehmen“ (manual) and the Stand entered (start). cushionBalance is always their sum (never
   * below 0). Data without moves: one start move from the Stand (no loss).
   */
  cushionMoves: CushionMove[];
  /** per confirmed month: the Überschuss when it was confirmed – a later change shows the difference */
  cushionSurplus: Partial<Record<Period, number>>;
  /** „Spielgeld für {Monat}“ – „Nur {Monat}“: the Spielgeld of one month in cents (instead of `spielgeld`) */
  spielgeldOverrides: Partial<Record<Period, number>>;
}

export type CushionMoveSource = 'split' | 'gap' | 'manual' | 'start' | 'fix';
export interface CushionMove {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** cents, + into the Polster, − out of it */
  amount: number;
  source: CushionMoveSource;
  /** „+ Einzahlen“ / „− Entnehmen“: up to 40 characters */
  note?: string;
}
export const CUSHION_NOTE_MAX = 40;
const MOVE_SOURCES: CushionMoveSource[] = ['split', 'gap', 'manual', 'start', 'fix'];

export type CushionRule = 'all' | 'share';
export const CUSHION_MILESTONES = [25, 50, 75, 100] as const;
export type CushionMilestone = (typeof CUSHION_MILESTONES)[number];
export const DEFAULT_CUSHION_SHARE = 50;

/** „Aus dem Überschuss“ (counts against the salary) / „Andere Quelle“ (not from the net salary, like a Vermögensaufbau payment with fromNet false) */
export type OverflowSource = 'surplus' | 'other';
/** „Teilweise“: `otherAmount` (cents allowed, at most the overflow) from another source, the rest from the surplus */
export interface OverflowPart {
  mode: 'part';
  otherAmount: number;
}
/** The stored answer per month: the old values „surplus“/„other“ stay as they are; a part is an object (additive). */
export type OverflowAnswer = OverflowSource | OverflowPart;
export type OverflowMode = OverflowSource | 'part';

export const overflowMode = (a: OverflowAnswer | undefined): OverflowMode => (a === undefined ? 'surplus' : typeof a === 'string' ? a : 'part');

function parseOverflow(x: unknown): OverflowAnswer | null {
  if (x === 'surplus' || x === 'other') return x;
  if (isObj(x) && x.mode === 'part') {
    const amount = money(x.otherAmount);
    if (amount !== null && amount >= 0) return { mode: 'part', otherAmount: amount };
  }
  return null;
}

export const DEFAULT_KONTO: KontoSettings = {
  enabled: false,
  inviteDismissed: false,
  balance: 0,
  receivedFor: null,
  rounding: DEFAULT_ROUNDING,
  roundingOn: false,
  buffer: DEFAULT_BUFFER,
  anchor: null,
  hasAccount: null,
  orderRuns: null,
  setupSteps: 0,
  setupDone: false,
  balanceUnknown: false,
  checks: [],
  snoozedOn: null,
  balanceCheckedOn: null,
  orderStartsAfter: null,
  plan: { accountDone: false, orderDone: false, gapDone: false },
  milestonesShown: [],
  gapMode: null,
  walkthroughSeen: false,
  spielgeld: null,
  spielgeldOverflow: {},
  celebratedMonths: [],
  planMode: null,
  planSalary: null,
  planSalaryHintSeen: false,
  cushionGoal: null,
  cushionBalance: null,
  cushionBalanceDate: null,
  cushionRule: 'all',
  cushionShare: DEFAULT_CUSHION_SHARE,
  cushionMilestones: [],
  cushionConfirmed: {},
  cushionMoves: [],
  cushionSurplus: {},
  spielgeldOverrides: {},
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const isTimestamp = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** a whole number of cents (≥ 0 unless `signed`) */
const cent = (v: unknown, signed = false): number | null =>
  typeof v === 'number' && Number.isFinite(v) && (signed || v >= 0) ? Math.round(v) : null;

/**
 * Any stored value → valid settings (unknown parts fall back to the defaults). Idempotent, so an
 * export → import gives identical settings. Data from from PR #39 (PR #39) has none of the
 * new fields: with a balance it counts as set up (no setup prompt), without one it does not.
 */
export function toKontoSettings(value: unknown): KontoSettings {
  if (!isObj(value))
    return {
      ...DEFAULT_KONTO,
      plan: { ...DEFAULT_KONTO.plan },
      checks: [],
      milestonesShown: [],
      spielgeldOverflow: {},
      cushionMilestones: [],
      cushionConfirmed: {},
      cushionMoves: [],
      cushionSurplus: {},
      spielgeldOverrides: {},
    };
  const v = value;
  const balance = money(v.balance) ?? 0;
  const anchor = isObj(v.anchor) && money(v.anchor.amount) !== null && isTimestamp(v.anchor.at) ? { amount: money(v.anchor.amount)!, at: v.anchor.at } : null;
  const checks = (Array.isArray(v.checks) ? v.checks : [])
    .filter(
      (c): c is Record<string, unknown> =>
        isObj(c) && typeof c.period === 'string' && isPeriod(c.period) && typeof c.deposited === 'boolean' && isTimestamp(c.answeredAt),
    )
    .map((c) => ({
      period: c.period as Period,
      deposited: c.deposited as boolean,
      answeredAt: c.answeredAt as string,
      ...(money(c.amount) !== null && money(c.amount)! >= 0 ? { amount: money(c.amount)! } : {}),
    }))
    // one per month (the last answer wins), in month order
    .reduce<KontoCheck[]>((acc, c) => [...acc.filter((x) => x.period !== c.period), c], [])
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const plan = isObj(v.plan) ? v.plan : {};
  const cushion = parseCushion(v);
  const steps = typeof v.setupSteps === 'number' && Number.isInteger(v.setupSteps) ? Math.min(3, Math.max(0, v.setupSteps)) : 0;
  return {
    enabled: v.enabled === true,
    inviteDismissed: v.inviteDismissed === true,
    balance,
    receivedFor: typeof v.receivedFor === 'string' && isPeriod(v.receivedFor) ? v.receivedFor : null,
    rounding: toRounding(v.rounding),
    roundingOn: typeof v.roundingOn === 'boolean' ? v.roundingOn : isRounding(v.rounding),
    buffer: BUFFERS.includes(v.buffer as Buffer) ? (v.buffer as Buffer) : DEFAULT_BUFFER,
    anchor,
    hasAccount: typeof v.hasAccount === 'boolean' ? v.hasAccount : null,
    orderRuns: typeof v.orderRuns === 'boolean' ? v.orderRuns : null,
    setupSteps: steps,
    setupDone: typeof v.setupDone === 'boolean' ? v.setupDone : derivedSetupDone({ balance, anchor }),
    balanceUnknown: v.balanceUnknown === true,
    checks,
    snoozedOn: isDay(v.snoozedOn) ? v.snoozedOn : null,
    balanceCheckedOn: isDay(v.balanceCheckedOn) ? v.balanceCheckedOn : null,
    orderStartsAfter: typeof v.orderStartsAfter === 'string' && isPeriod(v.orderStartsAfter) ? v.orderStartsAfter : null,
    plan: { accountDone: plan.accountDone === true, orderDone: plan.orderDone === true, gapDone: plan.gapDone === true },
    milestonesShown: (Array.isArray(v.milestonesShown) ? v.milestonesShown : []).filter(
      (m, i, all): m is Milestone => MILESTONES.includes(m as Milestone) && all.indexOf(m) === i,
    ),
    gapMode: GAP_MODES.includes(v.gapMode as GapMode) ? (v.gapMode as GapMode) : null,
    walkthroughSeen: v.walkthroughSeen === true,
    spielgeld: money(v.spielgeld) !== null && money(v.spielgeld)! > 0 ? money(v.spielgeld) : null,
    spielgeldOverflow: Object.fromEntries(
      Object.entries(isObj(v.spielgeldOverflow) ? v.spielgeldOverflow : {})
        .map(([k, x]) => [k, parseOverflow(x)] as const)
        .filter(([k, x]) => isPeriod(k) && x !== null),
    ) as Partial<Record<Period, OverflowAnswer>>,
    celebratedMonths: (Array.isArray(v.celebratedMonths) ? v.celebratedMonths : []).filter(
      (p, i, all): p is Period => typeof p === 'string' && isPeriod(p) && all.indexOf(p) === i,
    ),
    planMode: PLAN_MODES.includes(v.planMode as PlanMode) ? (v.planMode as PlanMode) : null,
    planSalary: money(v.planSalary) !== null && money(v.planSalary)! > 0 ? money(v.planSalary) : null,
    planSalaryHintSeen: v.planSalaryHintSeen === true,
    cushionGoal: cent(v.cushionGoal) !== null && cent(v.cushionGoal)! > 0 ? cent(v.cushionGoal) : null,
    cushionBalance: cushion.balance,
    cushionBalanceDate: isDay(v.cushionBalanceDate) ? v.cushionBalanceDate : null,
    cushionRule: v.cushionRule === 'share' ? 'share' : 'all',
    cushionShare:
      typeof v.cushionShare === 'number' && Number.isInteger(v.cushionShare) && v.cushionShare >= 1 && v.cushionShare <= 99 ? v.cushionShare : DEFAULT_CUSHION_SHARE,
    cushionMilestones: (Array.isArray(v.cushionMilestones) ? v.cushionMilestones : [])
      .filter((m, i, all): m is CushionMilestone => CUSHION_MILESTONES.includes(m as CushionMilestone) && all.indexOf(m) === i)
      .sort((a, b) => a - b),
    cushionConfirmed: Object.fromEntries(
      Object.entries(isObj(v.cushionConfirmed) ? v.cushionConfirmed : {})
        .map(([k, x]) => [k, cent(x, true)] as const)
        .filter(([k, x]) => isPeriod(k) && x !== null && x !== 0),
    ) as Partial<Record<Period, number>>,
    cushionMoves: cushion.moves,
    cushionSurplus: centMap(v.cushionSurplus, true),
    spielgeldOverrides: centMap(v.spielgeldOverrides),
  };
}

/** { 'YYYY-MM': cents } (≥ 0 unless `signed`) */
function centMap(v: unknown, signed = false): Partial<Record<Period, number>> {
  return Object.fromEntries(
    Object.entries(isObj(v) ? v : {})
      .map(([k, x]) => [k, cent(x, signed)] as const)
      .filter(([k, x]) => isPeriod(k) && x !== null),
  ) as Partial<Record<Period, number>>;
}

/**
 * The Polster and its moves: the balance is the sum of the moves (never below 0). Stored data without moves
 * (polster-ziel): a start move of the Stand, on the day it was entered – nothing is lost. A month confirmed without a
 * move of its own (polster-ziel, or read by polster-feinschliff): its move `m-YYYY-MM` of the amount confirmed, taken
 * out of the start move – the sum stays the Stand. No Polster: no moves.
 */
function parseCushion(v: Record<string, unknown>): { balance: number | null; moves: CushionMove[] } {
  const stored = cent(v.cushionBalance);
  if (stored === null) return { balance: null, moves: [] };
  const date = isDay(v.cushionBalanceDate) ? v.cushionBalanceDate : dayOf(localToday());
  let moves: CushionMove[] = (Array.isArray(v.cushionMoves) ? v.cushionMoves : [])
    .filter(
      (m): m is Record<string, unknown> =>
        isObj(m) && typeof m.id === 'string' && m.id !== '' && isDay(m.date) && cent(m.amount, true) !== null && MOVE_SOURCES.includes(m.source as CushionMoveSource),
    )
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .map((m) => {
      const note = typeof m.note === 'string' ? m.note.trim().slice(0, CUSHION_NOTE_MAX) : '';
      return { id: m.id as string, date: m.date as string, amount: cent(m.amount, true)!, source: m.source as CushionMoveSource, ...(note ? { note } : {}) };
    });
  if (moves.length === 0 && stored > 0) moves = [{ id: 'start', date, amount: stored, source: 'start' }];
  // confirmed months without a move of their own: their move, out of the start move
  const confirmed = Object.entries(isObj(v.cushionConfirmed) ? v.cushionConfirmed : {})
    .map(([k, x]) => [k, cent(x, true)] as const)
    .filter((e): e is readonly [string, number] => isPeriod(e[0]) && e[1] !== null && e[1] !== 0);
  const missing = confirmed.filter(([p]) => !moves.some((m) => m.id === `m-${p}`));
  if (missing.length) {
    const total = missing.reduce((a, [, x]) => a + x, 0);
    const start = moves.find((m) => m.id === 'start');
    moves = [
      ...(start ? moves.map((m) => (m === start ? { ...m, amount: m.amount - total } : m)) : [...moves, { id: 'start', date, amount: -total, source: 'start' as const }]),
      ...missing.map(([p, x]) => ({ id: `m-${p}`, date, amount: x, source: x > 0 ? ('split' as const) : ('gap' as const) })),
    ].filter((m) => m.amount !== 0 || m.id.startsWith('m-'));
  }
  return { balance: Math.max(0, moves.reduce((a, m) => a + m.amount, 0)), moves };
}

/**
 * polster-stand-feld: what every write of the Polster keeps – the Stand is the sum of the moves, and every month
 * confirmed has exactly one move of its own (`m-YYYY-MM`), its differences (`m-YYYY-MM-…`) adding up to the amount
 * confirmed. null when it holds, else what is wrong.
 */
export function cushionBroken(s: Pick<KontoSettings, 'cushionBalance' | 'cushionMoves' | 'cushionConfirmed'>): string | null {
  if (s.cushionBalance === null) return s.cushionMoves.length ? 'moves without a Polster' : null;
  const sum = s.cushionMoves.reduce((a, m) => a + m.amount, 0);
  if (sum !== s.cushionBalance) return `Stand ${s.cushionBalance} ≠ sum ${sum}`;
  for (const [p, amount] of Object.entries(s.cushionConfirmed)) {
    const own = s.cushionMoves.filter((m) => m.id === `m-${p}`);
    if (own.length !== 1) return `${p}: ${own.length} moves`;
    const all = s.cushionMoves.filter((m) => m.id === `m-${p}` || m.id.startsWith(`m-${p}-`)).reduce((a, m) => a + m.amount, 0);
    if (all !== amount) return `${p}: confirmed ${amount} ≠ moves ${all}`;
  }
  return null;
}

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Never touched „Fixkosten einplanen“: no entry, or one that only remembers celebrated months
 * („{Monat} erledigt“ writes them for everyone) or „Gehalt zum Planen“ – the invitation card still shows.
 */
export function kontoUntouched(stored: KontoSettings | null): boolean {
  if (stored === null) return true;
  // „Gehalt zum Planen“ is a setting of its own (Einstellungen → Gehalt): it does not count as touched either
  // the Polster (polster-ziel) is set in Einstellungen as well, without the Fixkostenkonto
  const cushionless = {
    cushionGoal: null,
    cushionBalance: null,
    cushionBalanceDate: null,
    cushionRule: 'all' as const,
    cushionShare: DEFAULT_CUSHION_SHARE,
    cushionMilestones: [],
    cushionConfirmed: {},
    cushionMoves: [],
    cushionSurplus: {},
  };
  return (
    JSON.stringify(storedKonto({ ...stored, celebratedMonths: [], planSalary: null, planSalaryHintSeen: false, ...cushionless })) ===
    JSON.stringify(storedKonto(DEFAULT_KONTO))
  );
}

const isRounding = (v: unknown) => v === 1 || v === 5 || v === 10;

/** Without a stored setupDone: set up when there is a balance or an anchor. */
function derivedSetupDone(s: Pick<KontoSettings, 'balance' | 'anchor'>): boolean {
  return Math.round(s.balance * 100) !== 0 || s.anchor !== null;
}

/** What is stored and exported: the fields of PR #39 always, every newer field only when it differs
 * from what toKontoSettings would derive without it. An entry from from PR #39 therefore stays
 * byte for byte the same when it is read and written back, and toKontoSettings(storedKonto(s)) = s. */
export type StoredKontoSettings = Pick<KontoSettings, 'enabled' | 'inviteDismissed' | 'balance' | 'receivedFor' | 'rounding'> & Partial<KontoSettings>;

export function storedKonto(s: KontoSettings): StoredKontoSettings {
  const out: StoredKontoSettings = {
    enabled: s.enabled,
    inviteDismissed: s.inviteDismissed,
    balance: s.balance,
    receivedFor: s.receivedFor,
    rounding: s.rounding,
  };
  const derivedDone = derivedSetupDone(s);
  if (s.anchor) out.anchor = s.anchor;
  if (s.hasAccount !== null) out.hasAccount = s.hasAccount;
  if (s.orderRuns !== null) out.orderRuns = s.orderRuns;
  if (s.setupSteps !== 0) out.setupSteps = s.setupSteps;
  if (s.setupDone !== derivedDone) out.setupDone = s.setupDone;
  if (s.balanceUnknown) out.balanceUnknown = true;
  if (s.checks.length) out.checks = s.checks;
  if (s.snoozedOn) out.snoozedOn = s.snoozedOn;
  if (s.balanceCheckedOn) out.balanceCheckedOn = s.balanceCheckedOn;
  if (s.orderStartsAfter) out.orderStartsAfter = s.orderStartsAfter;
  if (s.plan.accountDone || s.plan.orderDone || s.plan.gapDone) out.plan = s.plan;
  if (s.milestonesShown.length) out.milestonesShown = s.milestonesShown;
  if (s.gapMode) out.gapMode = s.gapMode;
  if (s.walkthroughSeen) out.walkthroughSeen = true;
  if (s.spielgeld !== null) out.spielgeld = s.spielgeld;
  if (Object.keys(s.spielgeldOverflow).length) out.spielgeldOverflow = s.spielgeldOverflow;
  if (s.celebratedMonths.length) out.celebratedMonths = s.celebratedMonths;
  if (s.planMode) out.planMode = s.planMode;
  if (s.planSalary !== null) out.planSalary = s.planSalary;
  if (s.planSalaryHintSeen) out.planSalaryHintSeen = true;
  if (s.cushionGoal !== null) out.cushionGoal = s.cushionGoal;
  if (s.cushionBalance !== null) out.cushionBalance = s.cushionBalance;
  if (s.cushionBalanceDate) out.cushionBalanceDate = s.cushionBalanceDate;
  if (s.cushionRule !== 'all') out.cushionRule = s.cushionRule;
  if (s.cushionShare !== DEFAULT_CUSHION_SHARE) out.cushionShare = s.cushionShare;
  if (s.cushionMilestones.length) out.cushionMilestones = s.cushionMilestones;
  if (Object.keys(s.cushionConfirmed).length) out.cushionConfirmed = s.cushionConfirmed;
  if (s.cushionMoves.length) out.cushionMoves = s.cushionMoves;
  if (Object.keys(s.cushionSurplus).length) out.cushionSurplus = s.cushionSurplus;
  if (Object.keys(s.spielgeldOverrides).length) out.spielgeldOverrides = s.spielgeldOverrides;
  // `rounding` is always stored, so a missing `roundingOn` reads as on
  if (!s.roundingOn) out.roundingOn = false;
  if (s.buffer !== DEFAULT_BUFFER) out.buffer = s.buffer;
  return out;
}

/** Stored settings, or null when the Fixkostenkonto was never touched (existing installation → invitation). */
export async function readKontoRaw(db: FixkostenDB): Promise<KontoSettings | null> {
  const entry = await db.meta.get(KONTO_KEY);
  return entry ? toKontoSettings(entry.value) : null;
}

export async function readKonto(db: FixkostenDB): Promise<KontoSettings> {
  return (await readKontoRaw(db)) ?? { ...DEFAULT_KONTO };
}

export async function writeKonto(db: FixkostenDB, patch: Partial<KontoSettings>): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const current = await readKonto(db);
    const merged = { ...current, ...patch };
    // „eingerichtet“ follows the balance until the setup sets it (a balance counts as set up, as for data from PR #39)
    if (!('setupDone' in patch) && current.setupDone === derivedSetupDone(current)) merged.setupDone = derivedSetupDone(merged);
    await db.meta.put({ key: KONTO_KEY, value: storedKonto(toKontoSettings(merged)) });
  });
}

/** Stored country, or null when none was chosen (→ AT, the format the app always had). */
export async function readCountryRaw(db: FixkostenDB): Promise<Country | null> {
  const value = (await db.meta.get(COUNTRY_KEY))?.value;
  return isCountry(value) ? value : null;
}

export async function writeCountry(db: FixkostenDB, country: Country): Promise<void> {
  await db.meta.put({ key: COUNTRY_KEY, value: toCountry(country) });
}
