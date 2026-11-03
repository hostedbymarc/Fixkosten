// Fixkostenkonto settings and the country: meta entries (key-value), no schema change. They
// travel with the backup under `settings` (src/db/backup.ts) only once they were set.

import { COUNTRY_KEY, isCountry, toCountry, type Country } from '../lib/country';
import { DEFAULT_ROUNDING, toRounding, type Rounding } from '../lib/fixkostenkonto';
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

/** Monthly check „Ist dein Dauerauftrag eingegangen?“ – one per month. */
export interface KontoCheck {
  period: Period;
  deposited: boolean;
  /** ISO timestamp of the answer */
  answeredAt: string;
}

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
  // ---- Schote (all optional in storage; defaults below) ----
  /** balance anchor; none: `balance` without corrections (data from before the Schote) */
  anchor: KontoAnchor | null;
  /** answer to „Hast du ein eigenes Konto nur für Rechnungen?“ (null: not asked) */
  hasAccount: boolean | null;
  /** setup questions answered (0–3) */
  setupSteps: number;
  /** setup finished → the tile shows the pod */
  setupDone: boolean;
  /** „Weiß ich gerade nicht“: ask for the balance on the next start */
  balanceUnknown: boolean;
  checks: KontoCheck[];
  /** „Noch nicht“ on the monthly check: not again on this day (YYYY-MM-DD) */
  snoozedOn: string | null;
  /** last „Stimmt dein Kontostand noch?“ (YYYY-MM-DD); asked again after 3 months */
  balanceCheckedOn: string | null;
  /** „Ich habe noch keinen“: no standing order arrives in this month */
  orderStartsAfter: Period | null;
  /** „Dein Plan“ */
  plan: { accountDone: boolean; orderDone: boolean; gapDone: boolean };
  /** milestones whose toast came already (it comes once) */
  milestonesShown: Milestone[];
}

export const DEFAULT_KONTO: KontoSettings = {
  enabled: false,
  inviteDismissed: false,
  balance: 0,
  receivedFor: null,
  rounding: DEFAULT_ROUNDING,
  anchor: null,
  hasAccount: null,
  setupSteps: 0,
  setupDone: false,
  balanceUnknown: false,
  checks: [],
  snoozedOn: null,
  balanceCheckedOn: null,
  orderStartsAfter: null,
  plan: { accountDone: false, orderDone: false, gapDone: false },
  milestonesShown: [],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const isTimestamp = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Any stored value → valid settings (unknown parts fall back to the defaults). Idempotent, so an
 * export → import gives identical settings. Data from before the Schote (PR #39) has none of the
 * new fields: with a balance it counts as set up (no setup prompt), without one it does not.
 */
export function toKontoSettings(value: unknown): KontoSettings {
  if (!isObj(value)) return { ...DEFAULT_KONTO, plan: { ...DEFAULT_KONTO.plan }, checks: [], milestonesShown: [] };
  const v = value;
  const balance = money(v.balance) ?? 0;
  const anchor = isObj(v.anchor) && money(v.anchor.amount) !== null && isTimestamp(v.anchor.at) ? { amount: money(v.anchor.amount)!, at: v.anchor.at } : null;
  const checks = (Array.isArray(v.checks) ? v.checks : [])
    .filter(
      (c): c is Record<string, unknown> =>
        isObj(c) && typeof c.period === 'string' && isPeriod(c.period) && typeof c.deposited === 'boolean' && isTimestamp(c.answeredAt),
    )
    .map((c) => ({ period: c.period as Period, deposited: c.deposited as boolean, answeredAt: c.answeredAt as string }))
    // one per month (the last answer wins), in month order
    .reduce<KontoCheck[]>((acc, c) => [...acc.filter((x) => x.period !== c.period), c], [])
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const plan = isObj(v.plan) ? v.plan : {};
  const steps = typeof v.setupSteps === 'number' && Number.isInteger(v.setupSteps) ? Math.min(3, Math.max(0, v.setupSteps)) : 0;
  return {
    enabled: v.enabled === true,
    inviteDismissed: v.inviteDismissed === true,
    balance,
    receivedFor: typeof v.receivedFor === 'string' && isPeriod(v.receivedFor) ? v.receivedFor : null,
    rounding: toRounding(v.rounding),
    anchor,
    hasAccount: typeof v.hasAccount === 'boolean' ? v.hasAccount : null,
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
  };
}

/** Without a stored setupDone: set up when there is a balance or an anchor. */
function derivedSetupDone(s: Pick<KontoSettings, 'balance' | 'anchor'>): boolean {
  return Math.round(s.balance * 100) !== 0 || s.anchor !== null;
}

/** What is stored and exported: the fields of PR #39 always, every newer field only when it differs
 * from what toKontoSettings would derive without it. An entry from before the Schote therefore stays
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
  if (s.setupSteps !== 0) out.setupSteps = s.setupSteps;
  if (s.setupDone !== derivedDone) out.setupDone = s.setupDone;
  if (s.balanceUnknown) out.balanceUnknown = true;
  if (s.checks.length) out.checks = s.checks;
  if (s.snoozedOn) out.snoozedOn = s.snoozedOn;
  if (s.balanceCheckedOn) out.balanceCheckedOn = s.balanceCheckedOn;
  if (s.orderStartsAfter) out.orderStartsAfter = s.orderStartsAfter;
  if (s.plan.accountDone || s.plan.orderDone || s.plan.gapDone) out.plan = s.plan;
  if (s.milestonesShown.length) out.milestonesShown = s.milestonesShown;
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
