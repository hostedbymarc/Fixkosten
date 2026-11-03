// Every write of the Schote: setup, monthly check, new anchor, milestones. All through the one meta
// entry of the Fixkostenkonto (src/db/settings.ts); the schema does not change.

import type { SetupResult } from '../components/konto/KontoSetupSheet';
import { dayKey } from '../lib/kontoBalance';
import type { Period } from '../lib/types';
import type { FixkostenDB } from './db';
import { readKonto, writeKonto, type KontoCheck, type Milestone } from './settings';

/** Set once the setup was finished in this session: „Weiß ich gerade nicht“ reminds on the next start only. */
export const session = { setUp: false };

const upsertCheck = (checks: KontoCheck[], check: KontoCheck) => [...checks.filter((c) => c.period !== check.period), check];

/** A setup question was answered. */
export async function saveSetupProgress(db: FixkostenDB, steps: number): Promise<void> {
  const current = await readKonto(db);
  if (steps > current.setupSteps) await writeKonto(db, { setupSteps: steps });
}

/**
 * „Fertig“ in „Dein Plan“: the balance becomes the anchor (plus the one-time transfer when it is
 * done), the answer to „schon eingegangen?“ becomes this month's check.
 */
export async function finishSetup(db: FixkostenDB, r: SetupResult, ctx: { active: Period; gap: number; now: Date }): Promise<void> {
  const at = ctx.now.toISOString();
  const current = await readKonto(db);
  const amount = Math.round((r.balance + (r.gapDone ? ctx.gap : 0)) * 100) / 100;
  let checks = current.checks;
  // „Ja“: already on the balance (same moment as the anchor → not counted twice); „Nein“: asked again from tomorrow
  if (r.order === 'yes') checks = upsertCheck(checks, { period: ctx.active, deposited: true, answeredAt: at });
  if (r.order === 'no') checks = upsertCheck(checks, { period: ctx.active, deposited: false, answeredAt: at });
  if (r.order === 'none') checks = checks.filter((c) => c.period !== ctx.active);
  await writeKonto(db, {
    enabled: true,
    hasAccount: r.hasAccount,
    balance: amount,
    anchor: { amount, at },
    balanceUnknown: r.balanceUnknown,
    balanceCheckedOn: r.balanceUnknown ? null : dayKey(ctx.now),
    checks,
    receivedFor: r.order === 'yes' ? ctx.active : null,
    snoozedOn: r.order === 'no' ? dayKey(ctx.now) : current.snoozedOn,
    orderStartsAfter: r.order === 'none' ? ctx.active : null,
    plan: { accountDone: r.accountDone, orderDone: r.orderDone, gapDone: r.gapDone },
    setupSteps: 3,
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

/** A point of „Dein Plan“ done later (sheet „Muss ich jetzt etwas tun?“). */
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
