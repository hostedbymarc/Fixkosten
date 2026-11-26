// Every write of the Fixkostenkonto: setup, plan, monthly check, new anchor, milestones. All through
// the one meta entry (src/db/settings.ts); the schema does not change.

import { localToday } from '../lib/activeMonth';
import { celebratedUpTo } from '../lib/celebration';
import { dayKey } from '../lib/kontoBalance';
import { setupAccount } from '../lib/monthPlan';
import { addPeriods } from '../lib/period';
import { newStages } from '../lib/polster';
import type { Period, SavingSetting } from '../lib/types';
import type { FixkostenDB } from './db';
import { CUSHION_NOTE_MAX, readKonto, writeKonto, type CushionMilestone, type CushionMove, type CushionRule, type KontoSettings, type GapMode, type KontoCheck, type Milestone, type PlanMode } from './settings';

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

// ---- polster-ziel (cents) ----

/** „Polster-Ziel“: an empty field removes it. */
export async function setCushionGoal(db: FixkostenDB, cents: number | null): Promise<void> {
  await writeKonto(db, { cushionGoal: cents !== null && cents > 0 ? Math.round(cents) : null });
}

/**
 * „Schon geschafft“: sets the Polster (a move „Stand eingetragen“ of the difference, so the moves still add up to
 * it); an empty field removes the Polster and its moves.
 */
export async function setCushionBalance(db: FixkostenDB, cents: number | null, today: Date = localToday()): Promise<void> {
  if (cents === null) {
    await writeKonto(db, { cushionBalance: null, cushionBalanceDate: null, cushionMoves: [] });
    return;
  }
  const s = await readKonto(db);
  const target = Math.max(0, Math.round(cents));
  const diff = target - (s.cushionBalance ?? 0);
  const moves = s.cushionBalance === null ? [] : s.cushionMoves;
  const next = diff === 0 && s.cushionBalance !== null ? moves : [...moves, { id: moveId(moves, 'start'), date: dayKey(today), amount: diff, source: 'start' as const }];
  await writeKonto(db, { cushionBalance: target, cushionBalanceDate: dayKey(today), cushionMoves: next.filter((m) => m.amount !== 0) });
}

/** „Überschuss bis zum Ziel“: all into the Polster, or a fixed share. */
export async function setCushionRule(db: FixkostenDB, rule: CushionRule, share?: number): Promise<void> {
  await writeKonto(db, share === undefined ? { cushionRule: rule } : { cushionRule: rule, cushionShare: Math.min(99, Math.max(1, Math.round(share))) });
}

/** a new id: `base`, or `base-2`, `base-3` … when taken */
function moveId(moves: CushionMove[], base: string): string {
  if (!moves.some((m) => m.id === base)) return base;
  for (let n = 2; ; n++) if (!moves.some((m) => m.id === `${base}-${n}`)) return `${base}-${n}`;
}

/** The moves of a month's confirmation and its differences („m-YYYY-MM…“). */
const monthMoves = (period: Period) => (m: CushionMove) => m.id === `m-${period}` || m.id.startsWith(`m-${period}-`);

/** One move: changes the Polster by `cents` (out: at most what is in it) and the stages crossed. */
function withMove(s: KontoSettings, move: Omit<CushionMove, 'amount'> & { amount: number }) {
  const before = s.cushionBalance ?? 0;
  const amount = Math.max(-before, Math.round(move.amount));
  const after = before + amount;
  const stages = newStages(before, after, s.cushionGoal, s.cushionMilestones);
  return {
    amount,
    stages,
    patch: {
      cushionBalance: after,
      cushionMoves: [...s.cushionMoves, { ...move, amount }],
      cushionMilestones: [...s.cushionMilestones, ...stages].sort((a, b) => a - b),
    } satisfies Partial<KontoSettings>,
  };
}

/**
 * „Polster aufgefüllt“ (+) / „Aus Polster genommen“ (−) for a month: a move (split / gap), remembered for the month
 * (once: a second confirmation of the same month does nothing) with its Überschuss (`surplus`, cents) – a later
 * change of it shows the difference. Returns the stages newly reached, or null when the month was confirmed already.
 */
export async function confirmCushion(
  db: FixkostenDB,
  period: Period,
  cents: number,
  today: Date = localToday(),
  surplus?: number,
): Promise<CushionMilestone[] | null> {
  const s = await readKonto(db);
  if (s.cushionConfirmed[period] !== undefined || cents === 0) return null;
  const { amount, stages, patch } = withMove(s, { id: `m-${period}`, date: dayKey(today), amount: cents, source: cents > 0 ? 'split' : 'gap' });
  if (amount === 0) return null;
  await writeKonto(db, {
    ...patch,
    cushionBalanceDate: dayKey(today),
    cushionConfirmed: { ...s.cushionConfirmed, [period]: amount },
    ...(surplus === undefined ? {} : { cushionSurplus: { ...s.cushionSurplus, [period]: Math.round(surplus) } }),
  });
  return stages;
}

/** „Rückgängig“: takes the month's confirmation back, with its differences (the stages stay celebrated). */
export async function undoCushion(db: FixkostenDB, period: Period, today: Date = localToday()): Promise<void> {
  const s = await readKonto(db);
  if (s.cushionConfirmed[period] === undefined) return;
  const rest = { ...s.cushionConfirmed };
  delete rest[period];
  const surplus = { ...s.cushionSurplus };
  delete surplus[period];
  const moves = s.cushionMoves.filter((m) => !monthMoves(period)(m));
  await writeKonto(db, {
    cushionBalance: Math.max(0, moves.reduce((a, m) => a + m.amount, 0)),
    cushionBalanceDate: dayKey(today),
    cushionMoves: moves,
    cushionConfirmed: rest,
    cushionSurplus: surplus,
  });
}

/**
 * „+ Einzahlen“ / „− Entnehmen“: any time, as often as wanted, independent of the month's confirmation. Out: at
 * most what is in the Polster. Returns the move's id and the stages newly reached; null when nothing moves.
 */
export async function addCushionMove(
  db: FixkostenDB,
  cents: number,
  note?: string,
  today: Date = localToday(),
): Promise<{ id: string; amount: number; stages: CushionMilestone[] } | null> {
  const s = await readKonto(db);
  const text = note?.trim().slice(0, CUSHION_NOTE_MAX);
  const id = moveId(s.cushionMoves, `x-${dayKey(today)}`);
  const { amount, stages, patch } = withMove(s, { id, date: dayKey(today), amount: cents, source: 'manual', ...(text ? { note: text } : {}) });
  if (amount === 0) return null;
  await writeKonto(db, { ...patch, cushionBalanceDate: dayKey(today) });
  return { id, amount, stages };
}

/** „Rückgängig“ of a single move („+ Einzahlen“, „− Entnehmen“, a difference). */
export async function removeCushionMove(db: FixkostenDB, id: string, today: Date = localToday()): Promise<void> {
  const s = await readKonto(db);
  const move = s.cushionMoves.find((m) => m.id === id);
  if (!move) return;
  const moves = s.cushionMoves.filter((m) => m.id !== id);
  const period = /^m-(\d{4}-\d{2})-/.exec(id)?.[1];
  const patch: Partial<KontoSettings> = {
    cushionBalance: Math.max(0, moves.reduce((a, m) => a + m.amount, 0)),
    cushionBalanceDate: dayKey(today),
    cushionMoves: moves,
  };
  // a difference of a confirmed month: the month's amount and its Überschuss go back as well
  if (period && s.cushionConfirmed[period] !== undefined) {
    patch.cushionConfirmed = { ...s.cushionConfirmed, [period]: s.cushionConfirmed[period]! - move.amount };
    const surplus = s.cushionSurplus[period];
    if (surplus !== undefined) patch.cushionSurplus = { ...s.cushionSurplus, [period]: surplus - move.amount };
  }
  await writeKonto(db, patch);
}

/**
 * The Überschuss of a confirmed month changed: „Differenz in den Polster“ / „Differenz entnehmen“ (a move of the
 * difference, `diff` cents) or „Passt so“ (`move` false). Either way the month remembers the new Überschuss.
 */
export async function settleCushionDiff(
  db: FixkostenDB,
  period: Period,
  surplus: number,
  move: boolean,
  today: Date = localToday(),
): Promise<{ id: string; amount: number; stages: CushionMilestone[] } | null> {
  const s = await readKonto(db);
  const was = s.cushionSurplus[period];
  if (s.cushionConfirmed[period] === undefined || was === undefined) return null;
  const diff = Math.round(surplus) - was;
  if (!move || diff === 0) {
    await writeKonto(db, { cushionSurplus: { ...s.cushionSurplus, [period]: Math.round(surplus) } });
    return null;
  }
  const id = moveId(s.cushionMoves, `m-${period}-diff`);
  const { amount, stages, patch } = withMove(s, { id, date: dayKey(today), amount: diff, source: diff > 0 ? 'split' : 'gap' });
  await writeKonto(db, {
    ...patch,
    cushionBalanceDate: dayKey(today),
    cushionConfirmed: { ...s.cushionConfirmed, [period]: s.cushionConfirmed[period]! + amount },
    // what could not be taken (the Polster was empty) is accepted as it is
    cushionSurplus: { ...s.cushionSurplus, [period]: Math.round(surplus) },
  });
  return { id, amount, stages };
}

// ---- polster-feinschliff: „Spielgeld für {Monat}“ ----

/**
 * „Nur {Monat}“: the Spielgeld of one month (cents; null = back to the usual one). „Ab {Monat}“: the Spielgeld in
 * the settings (euros) – the month's own amount goes.
 */
export async function setSpielgeldFor(db: FixkostenDB, period: Period, cents: number | null, scope: 'only' | 'from', active: Period = period): Promise<void> {
  const s = await readKonto(db);
  const rest = { ...s.spielgeldOverrides };
  delete rest[period];
  if (scope === 'from') {
    // the months from the active one up to it keep the Spielgeld they had
    if (s.spielgeld !== null) for (let p = active; p < period; p = addPeriods(p, 1)) if (rest[p] === undefined) rest[p] = Math.round(s.spielgeld * 100);
    await writeKonto(db, { spielgeldOverrides: rest, spielgeld: cents !== null && cents > 0 ? cents / 100 : null });
    return;
  }
  await writeKonto(db, { spielgeldOverrides: cents === null ? rest : { ...rest, [period]: Math.max(0, Math.round(cents)) } });
}
