// Every write of the Fixkostenkonto: setup, plan, monthly check, new anchor, milestones. All through
// the one meta entry (src/db/settings.ts); the schema does not change.

import { celebratedUpTo } from '../lib/celebration';
import { dayKey } from '../lib/kontoBalance';
import { setupAccount } from '../lib/monthPlan';
import type { Period, SavingSetting } from '../lib/types';
import type { FixkostenDB } from './db';
import { readKonto, writeKonto, type GapMode, type KontoCheck, type Milestone, type PlanMode } from './settings';

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
  await assignAccounts(db, a.hasAccount);
  session.setUp = true;
}

/**
 * „Hast du ein eigenes Konto für Fixkosten?“ (monat-verdichtet): positions without a stored account get the
 * default – yes: everything „Rücklage“; no: monthly ones „Direkt“, all others „Rücklage“. Stored ones stay.
 */
export async function assignAccounts(db: FixkostenDB, hasAccount: boolean): Promise<void> {
  await db.transaction('rw', db.positions, db.categories, async () => {
    const kinds = new Map((await db.categories.toArray()).map((c) => [c.id, c.kind]));
    for (const p of await db.positions.toArray()) {
      const account = setupAccount(p, kinds.get(p.categoryId), hasAccount);
      if (account) await db.positions.update(p.id, { account });
    }
  });
}

/** „Eigenes Konto für Fixkosten“ in the settings: only the texts change („Aufs Fixkostenkonto“ / „Zur Seite legen“). */
export async function setHasAccount(db: FixkostenDB, hasAccount: boolean): Promise<void> {
  await writeKonto(db, { hasAccount });
}

/** „Bei Fälligkeit“ / „Gleichmäßig“ (and „Eigener Plan“ once a payment is changed on its own). */
export async function setPlanMode(db: FixkostenDB, mode: PlanMode): Promise<void> {
  await writeKonto(db, { planMode: mode });
}

/**
 * One big payment changed on its own: „im {Monat} zahlen“ or „vorher ansparen ab …“. The plan becomes
 * „Eigener Plan“. Coming from „Gleichmäßig“, every other big payment keeps saving up from the next salary
 * (`others`), so nothing else jumps.
 */
export async function setSaving(db: FixkostenDB, changes: Record<string, SavingSetting>, others: Record<string, SavingSetting> = {}): Promise<void> {
  await db.transaction('rw', db.positions, db.meta, async () => {
    for (const [id, saving] of Object.entries({ ...others, ...changes })) await db.positions.update(id, { saving });
    await writeKonto(db, { planMode: 'custom' });
  });
}

/** „Spielgeld auf € M setzen“: the Spielgeld and the plan that keeps it. */
export async function applyMax(db: FixkostenDB, amount: number, mode: PlanMode, savings: Record<string, SavingSetting>): Promise<void> {
  await db.transaction('rw', db.positions, db.meta, async () => {
    if (mode === 'custom') for (const [id, saving] of Object.entries(savings)) await db.positions.update(id, { saving });
    await writeKonto(db, { planMode: mode, spielgeld: amount > 0 ? Math.round(amount * 100) / 100 : null });
  });
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

/** „So funktioniert Erbse“ was shown (any way it opened): it never opens by itself again. */
export async function markWalkthroughSeen(db: FixkostenDB): Promise<void> {
  const current = await readKonto(db);
  if (!current.walkthroughSeen) await writeKonto(db, { walkthroughSeen: true });
}

/** „{Monat} erledigt“ was celebrated: the confetti does not play again for this month by itself. */
export async function markCelebrated(db: FixkostenDB, period: Period): Promise<void> {
  const current = await readKonto(db);
  if (!current.celebratedMonths.includes(period)) await writeKonto(db, { celebratedMonths: [...current.celebratedMonths, period].slice(-36) });
}

/**
 * alle-monate-gleich, once at the start: months after the active one leave celebratedMonths (ticking a
 * future month no longer celebrates; an old entry would keep its celebration from ever falling).
 */
export async function cleanCelebrated(db: FixkostenDB, active: Period): Promise<void> {
  const current = await readKonto(db);
  const kept = celebratedUpTo(current.celebratedMonths, active);
  if (kept.length !== current.celebratedMonths.length) await writeKonto(db, { celebratedMonths: kept });
}

/** „Spielgeld pro Monat“: an amount (cents allowed) or null = off. */
/** „Gehalt zum Planen“ (gehalt-zum-planen): empty or € 0 → not set (the last salary entered counts). */
export async function setPlanSalary(db: FixkostenDB, amount: number | null): Promise<void> {
  await writeKonto(db, { planSalary: amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null });
}

/** „Leg dein Gehalt zum Planen fest ›“ was tapped: the hint does not come back. */
export async function markPlanSalaryHintSeen(db: FixkostenDB): Promise<void> {
  await writeKonto(db, { planSalaryHintSeen: true });
}

export async function setSpielgeld(db: FixkostenDB, amount: number | null): Promise<void> {
  await writeKonto(db, { spielgeld: amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null });
}
