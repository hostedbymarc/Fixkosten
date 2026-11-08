// Every write of the Fixkostenkonto: setup, plan, monthly check, new anchor, milestones. All through
// the one meta entry (src/db/settings.ts); the schema does not change.

import { dayKey } from '../lib/kontoBalance';
import type { Period } from '../lib/types';
import type { FixkostenDB } from './db';
import { readKonto, writeKonto, type GapMode, type KontoCheck, type Milestone } from './settings';

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
 * The setup questions answered: saved at once; the plan (amount, gap, how it is closed) then reads
 * everything from the stored state (kontoState) – the same numbers as tile, sheet and settings.
 * Erbse takes this month's deposit as already in the amount set aside (it comes when the month begins).
 */
export async function finishSetup(db: FixkostenDB, a: SetupAnswers, ctx: { active: Period; now: Date }): Promise<void> {
  const at = ctx.now.toISOString();
  const amount = Math.round(a.balance * 100) / 100;
  await writeKonto(db, {
    enabled: true,
    hasAccount: a.hasAccount,
    orderRuns: a.hasAccount ? a.orderRuns : null,
    balance: amount,
    anchor: { amount, at },
    balanceUnknown: false,
    balanceCheckedOn: dayKey(ctx.now),
    receivedFor: ctx.active,
    orderStartsAfter: null,
    plan: { accountDone: false, orderDone: false, gapDone: false },
    setupSteps: a.hasAccount ? 3 : 2,
    setupDone: true,
  });
  session.setUp = true;
}

/** „Auf {n} Monate verteilen“ / „Auf einmal zur Seite legen“ (setup, tile, sheet, settings). */
export async function setGapMode(db: FixkostenDB, mode: GapMode): Promise<void> {
  await writeKonto(db, { gapMode: mode });
}

/**
 * Monthly check: „Ja“ (with the amount of the month: base plus extra) / „Noch nicht“. „Ja“ is the
 * deposit of the month: the expected balance grows by exactly that amount.
 */
export async function answerMonthCheck(db: FixkostenDB, active: Period, deposited: boolean, now: Date, amount?: number): Promise<void> {
  const current = await readKonto(db);
  const check: KontoCheck = { period: active, deposited, answeredAt: now.toISOString(), ...(deposited && amount !== undefined ? { amount: Math.round(amount * 100) / 100 } : {}) };
  await writeKonto(db, {
    checks: upsertCheck(current.checks, check),
    ...(deposited ? { receivedFor: active } : { snoozedOn: dayKey(now) }),
  });
}

/** „Zur Seite gelegt“ under the one-time amount: the amount set aside grows by it (a new anchor). */
export async function confirmLump(db: FixkostenDB, balance: number, lump: number, now: Date): Promise<void> {
  await setAnchor(db, balance + lump, now);
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
