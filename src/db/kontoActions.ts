// Every write of the Fixkostenkonto: setup, plan, monthly check, new anchor, milestones. All through
// the one meta entry (src/db/settings.ts); the schema does not change.

import { dayKey } from '../lib/kontoBalance';
import type { Period } from '../lib/types';
import type { FixkostenDB } from './db';
import { readKonto, writeKonto, type KontoCheck, type Milestone } from './settings';

/** Set once the setup was finished in this session: a balance reminder comes on the next start only. */
export const session = { setUp: false };

const upsertCheck = (checks: KontoCheck[], check: KontoCheck) => [...checks.filter((c) => c.period !== check.period), check];

/** The answers of the setup. */
export interface SetupAnswers {
  /** „Hast du ein eigenes Konto für Fixkosten?“ – false: „Nein, ich plane nur“ */
  hasAccount: boolean;
  /** „Wie viel hast du heute schon für Fixkosten zur Seite gelegt?“; 0 with „Noch nichts“ */
  balance: number;
  /** „Läuft dein Dauerauftrag schon?“ – only asked with an own account (null otherwise) */
  orderRuns: boolean | null;
}

/**
 * All questions answered: saved at once, „Dein Plan“ then reads everything from the stored state
 * (kontoState) – the same numbers as tile, sheet and settings.
 * This month brings nothing more in every case: a running standing order arrived at the start of the
 * month (it is in the amount), a new one – or setting aside by hand – starts next month.
 */
export async function finishSetup(db: FixkostenDB, a: SetupAnswers, ctx: { active: Period; now: Date }): Promise<void> {
  const at = ctx.now.toISOString();
  const current = await readKonto(db);
  const amount = Math.round(a.balance * 100) / 100;
  const runs = a.hasAccount && a.orderRuns === true;
  const checks = runs
    ? upsertCheck(current.checks, { period: ctx.active, deposited: true, answeredAt: at })
    : current.checks.filter((c) => c.period !== ctx.active);
  await writeKonto(db, {
    enabled: true,
    hasAccount: a.hasAccount,
    orderRuns: a.hasAccount ? a.orderRuns : null,
    balance: amount,
    anchor: { amount, at },
    balanceUnknown: false,
    balanceCheckedOn: dayKey(ctx.now),
    checks,
    receivedFor: runs ? ctx.active : null,
    orderStartsAfter: runs ? null : ctx.active,
    plan: { accountDone: false, orderDone: false, gapDone: false },
    setupSteps: a.hasAccount ? 3 : 2,
    setupDone: true,
  });
  session.setUp = true;
}

/** Monthly check: „Ja“ / „Noch nicht“. */
export async function answerMonthCheck(db: FixkostenDB, active: Period, deposited: boolean, now: Date): Promise<void> {
  const current = await readKonto(db);
  await writeKonto(db, {
    checks: upsertCheck(current.checks, { period: active, deposited, answeredAt: now.toISOString() }),
    ...(deposited ? {} : { snoozedOn: dayKey(now) }),
  });
}

/** A balance the user states („Anderer Betrag“, the reminder, the field in the sheet): a new anchor. */
export async function setAnchor(db: FixkostenDB, amount: number, now: Date): Promise<void> {
  const value = Math.round(amount * 100) / 100;
  await writeKonto(db, { balance: value, anchor: { amount: value, at: now.toISOString() }, balanceUnknown: false, balanceCheckedOn: dayKey(now) });
}

/** „Stimmt“ on „Stimmt dein Kontostand noch?“ */
export async function confirmBalance(db: FixkostenDB, now: Date): Promise<void> {
  await writeKonto(db, { balanceCheckedOn: dayKey(now) });
}

/** „Erledigt“ on a point of „Dein Plan“ (the one-time transfer is a new anchor instead, see setAnchor). */
export async function setPlan(db: FixkostenDB, patch: Partial<{ accountDone: boolean; orderDone: boolean; gapDone: boolean }>): Promise<void> {
  const current = await readKonto(db);
  await writeKonto(db, { plan: { ...current.plan, ...patch } });
}

export async function markMilestones(db: FixkostenDB, milestones: Milestone[]): Promise<void> {
  const current = await readKonto(db);
  const shown = [...new Set([...current.milestonesShown, ...milestones])];
  if (shown.length !== current.milestonesShown.length) await writeKonto(db, { milestonesShown: shown });
}

/**
 * Data from PR #39: a balance without an anchor. On the first start after the update it becomes the
 * anchor of that moment, so later ticks and confirmations move the expected balance.
 */
export async function adoptLegacyBalance(db: FixkostenDB, now: Date): Promise<void> {
  const current = await readKonto(db);
  if (!current.enabled || !current.setupDone || current.anchor) return;
  await writeKonto(db, { anchor: { amount: current.balance, at: now.toISOString() } });
}
