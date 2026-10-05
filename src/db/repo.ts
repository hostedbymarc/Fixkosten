import Dexie from 'dexie';
import { format } from 'date-fns';
import { archivedPeriod, currentPlan, planForPeriod } from '../lib/calc';
import { addPeriods } from '../lib/period';
import type {
  Category,
  ChangeLog,
  Dataset,
  Kind,
  MonthClose,
  OneOff,
  Payment,
  Period,
  PlanEntry,
  Position,
} from '../lib/types';
import type { FixkostenDB } from './db';

export function newId(): string {
  return crypto.randomUUID();
}

export class RepoError extends Error {}

export async function loadDataset(db: FixkostenDB): Promise<Dataset> {
  const [categories, positions, payments, oneOffs, monthClose, reminders, changeLog] = await Promise.all([
    db.categories.toArray(),
    db.positions.toArray(),
    db.payments.toArray(),
    db.oneOffs.toArray(),
    db.monthClose.toArray(),
    db.reminders.toArray(),
    db.changeLog.toArray(),
  ]);
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

function log(entry: Omit<ChangeLog, 'id' | 'at'>): ChangeLog {
  return { id: newId(), at: new Date().toISOString(), ...entry };
}

const trimmed = (text: string | undefined) => (text?.trim() ? text.trim() : undefined);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

async function addPayment(db: FixkostenDB, payment: Payment): Promise<Payment> {
  try {
    await db.payments.add(payment);
    return payment;
  } catch (err) {
    // double tap: the unique [positionId+period] index already holds an entry
    if (err instanceof Dexie.ConstraintError) {
      return (await db.payments.where({ positionId: payment.positionId, period: payment.period }).first())!;
    }
    throw err;
  }
}

/** One tap on the circle: paid with the planned amount. Idempotent; turns a skipped entry into a tick. */
export async function markPaid(
  db: FixkostenDB,
  positionId: string,
  period: Period,
  plannedAmount: number,
): Promise<Payment> {
  const existing = await db.payments.where({ positionId, period }).first();
  if (existing?.status === 'paid') return existing;
  if (existing) {
    const paid: Payment = { ...existing, status: 'paid', actualAmount: existing.plannedAmount, paidAt: new Date().toISOString() };
    await db.payments.put(paid);
    return paid;
  }
  return addPayment(db, {
    id: newId(),
    positionId,
    period,
    status: 'paid',
    plannedAmount,
    actualAmount: plannedAmount,
    paidAt: new Date().toISOString(),
  });
}

/** "Entfallen": the payment did not happen; counts nowhere as spending. */
export async function markSkipped(
  db: FixkostenDB,
  positionId: string,
  period: Period,
  plannedAmount: number,
): Promise<Payment> {
  const existing = await db.payments.where({ positionId, period }).first();
  if (existing) return existing;
  return addPayment(db, {
    id: newId(),
    positionId,
    period,
    status: 'skipped',
    plannedAmount,
    actualAmount: 0,
    paidAt: new Date().toISOString(),
  });
}

export async function updatePayment(
  db: FixkostenDB,
  id: string,
  changes: Pick<Payment, 'actualAmount'> & { note?: string },
): Promise<void> {
  await db.payments.update(id, { actualAmount: changes.actualAmount, note: trimmed(changes.note) });
}

/** Removes a tick and returns it so the caller can offer undo. */
export async function removePayment(db: FixkostenDB, id: string): Promise<Payment | undefined> {
  const payment = await db.payments.get(id);
  if (payment) await db.payments.delete(id);
  return payment;
}

export async function restorePayment(db: FixkostenDB, payment: Payment): Promise<void> {
  await db.payments.put(payment);
}

// ---------------------------------------------------------------------------
// Month close
// ---------------------------------------------------------------------------

export interface MonthCloseInput {
  netSalary?: number;
  freeActual?: number;
  note?: string;
}

/** Saves the month close; an entirely empty close is removed. */
export async function saveMonthClose(db: FixkostenDB, period: Period, input: MonthCloseInput): Promise<void> {
  const note = trimmed(input.note);
  if (input.netSalary === undefined && input.freeActual === undefined && note === undefined) {
    await db.monthClose.delete(period);
    return;
  }
  const close: MonthClose = {
    period,
    netSalary: input.netSalary,
    freeActual: input.freeActual,
    note,
    updatedAt: new Date().toISOString(),
  };
  await db.monthClose.put(close);
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type PlanInput = Omit<PlanEntry, 'validFrom'>;

export interface PositionDraft {
  name: string;
  categoryId: string;
  note?: string;
  plan: PlanInput;
}

function normalizePlan(plan: PlanInput): PlanInput {
  const out: PlanInput = {
    amount: Math.round(plan.amount * 100) / 100,
    frequency: plan.frequency,
    dueMonths:
      plan.frequency === 'monthly'
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [...new Set(plan.dueMonths)].sort((a, b) => a - b),
  };
  if (plan.dueDay !== undefined) out.dueDay = plan.dueDay;
  return out;
}

export async function createPosition(db: FixkostenDB, draft: PositionDraft, validFrom: Period): Promise<string> {
  return db.transaction('rw', db.positions, db.changeLog, async () => {
    const last = await db.positions.orderBy('sortOrder').last();
    const position: Position = {
      id: newId(),
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      note: trimmed(draft.note),
      history: [{ validFrom, ...normalizePlan(draft.plan) }],
      createdAt: new Date().toISOString(),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    };
    await db.positions.add(position);
    await db.changeLog.add(log({ positionId: position.id, type: 'created', validFrom, to: position.history[0] }));
    return position.id;
  });
}

/** Name, category and note change without a question. */
export async function updatePositionInfo(
  db: FixkostenDB,
  id: string,
  info: { name: string; categoryId: string; note?: string },
): Promise<void> {
  await db.transaction('rw', db.positions, db.changeLog, async () => {
    const position = await db.positions.get(id);
    if (!position) throw new RepoError('Position nicht gefunden.');
    const next = { name: info.name.trim(), categoryId: info.categoryId, note: trimmed(info.note) };
    const before = { name: position.name, categoryId: position.categoryId, note: position.note };
    if (before.name === next.name && before.categoryId === next.categoryId && before.note === next.note) return;
    await db.positions.update(id, next);
    await db.changeLog.add(log({ positionId: id, type: 'edited', from: before, to: next }));
  });
}

export type PlanChangeMode = { type: 'from'; validFrom: Period } | { type: 'correct' };

/**
 * Changes amount or schedule.
 * - 'from': new history entry from `validFrom` (+ ChangeLog 'amount' = optimisation/increase).
 *   Earlier months keep their plan.
 * - 'correct': overwrites the entry valid in `today` (typo). Logged as 'corrected',
 *   which never counts as an optimisation; ChangeLog entries that reference the
 *   corrected entry are fixed so later savings stay right.
 * Ticked months never change: they keep their payment snapshot.
 */
export async function changePlan(
  db: FixkostenDB,
  id: string,
  input: PlanInput,
  mode: PlanChangeMode,
  today: Period,
): Promise<void> {
  const plan = normalizePlan(input);
  await db.transaction('rw', db.positions, db.changeLog, async () => {
    const position = await db.positions.get(id);
    if (!position) throw new RepoError('Position nicht gefunden.');

    if (mode.type === 'from') {
      const before = planForPeriod(position, mode.validFrom) ?? currentPlan(position, mode.validFrom)!;
      const entry: PlanEntry = { validFrom: mode.validFrom, ...plan };
      const history = [...position.history.filter((e) => e.validFrom !== mode.validFrom), entry].sort((a, b) =>
        a.validFrom.localeCompare(b.validFrom),
      );
      await db.positions.update(id, { history });
      await db.changeLog.add(log({ positionId: id, type: 'amount', validFrom: mode.validFrom, from: before, to: entry }));
      return;
    }

    const target = planForPeriod(position, today) ?? currentPlan(position, today)!;
    const corrected: PlanEntry = { validFrom: target.validFrom, ...plan };
    const history = position.history.map((e) => (e.validFrom === target.validFrom ? corrected : e));
    await db.positions.update(id, { history });
    await db.changeLog
      .where('positionId')
      .equals(id)
      .modify((entry) => {
        if (entry.type !== 'amount' && entry.type !== 'created') return;
        if ((entry.to as PlanEntry | undefined)?.validFrom === target.validFrom) entry.to = corrected;
        if ((entry.from as PlanEntry | undefined)?.validFrom === target.validFrom) entry.from = corrected;
      });
    await db.changeLog.add(
      log({ positionId: id, type: 'corrected', validFrom: target.validFrom, from: target, to: corrected }),
    );
  });
}

/** Local calendar date, so the archive month never shifts at midnight UTC. */
function localDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export interface ArchiveUndo {
  positionId: string;
  logId: string;
}

/** Archives from the current month on. A tick in this month keeps it visible there. */
export async function archivePosition(db: FixkostenDB, id: string): Promise<ArchiveUndo> {
  return db.transaction('rw', db.positions, db.changeLog, async () => {
    const entry = log({ positionId: id, type: 'archived' });
    await db.positions.update(id, { archivedAt: localDate() });
    await db.changeLog.add(entry);
    return { positionId: id, logId: entry.id };
  });
}

/** Undo right after archiving: as if it never happened. */
export async function undoArchive(db: FixkostenDB, undo: ArchiveUndo): Promise<void> {
  await db.transaction('rw', db.positions, db.changeLog, async () => {
    await db.positions
      .where('id')
      .equals(undo.positionId)
      .modify((p) => {
        delete p.archivedAt;
      });
    await db.changeLog.delete(undo.logId);
  });
}

/** Restore from the archive, active again from `today`; the months in between stay empty. */
export async function restorePosition(db: FixkostenDB, id: string, today: Period): Promise<void> {
  await db.transaction('rw', db.positions, db.changeLog, async () => {
    const position = await db.positions.get(id);
    const archived = position && archivedPeriod(position);
    if (!position || !archived) return;
    const lastPaused = addPeriods(today, -1);
    const pauses = [...(position.pauses ?? [])];
    if (archived <= lastPaused) pauses.push({ from: archived, to: lastPaused });
    await db.positions
      .where('id')
      .equals(id)
      .modify((p) => {
        delete p.archivedAt;
        p.pauses = pauses;
      });
    await db.changeLog.add(log({ positionId: id, type: 'restored', validFrom: today }));
  });
}

/** Deletes a position for good, including its payments, one-offs and history. */
export async function deletePositionPermanently(db: FixkostenDB, id: string): Promise<void> {
  await db.transaction('rw', [db.positions, db.payments, db.oneOffs, db.changeLog], async () => {
    await db.payments.where('positionId').equals(id).delete();
    await db.oneOffs.where('positionId').equals(id).delete();
    await db.changeLog.where('positionId').equals(id).delete();
    await db.positions.delete(id);
  });
}

/**
 * New order of the positions of one category. Reuses their existing sortOrder
 * slots so positions of other categories are untouched.
 */
export async function reorderPositions(db: FixkostenDB, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.positions, async () => {
    const positions = await db.positions.bulkGet(orderedIds);
    const slots = positions.map((p) => p!.sortOrder).sort((a, b) => a - b);
    await Promise.all(orderedIds.map((id, i) => db.positions.update(id, { sortOrder: slots[i]! })));
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryDraft {
  name: string;
  color: string;
  kind: Kind;
}

async function assertExpenseRemains(db: FixkostenDB, changedId: string, nextKind: Kind | null) {
  const categories = await db.categories.toArray();
  const remaining = categories.filter((c) => (c.id === changedId ? nextKind === 'expense' : c.kind === 'expense'));
  if (remaining.length === 0) throw new RepoError('Mindestens eine Ausgaben-Kategorie muss bleiben.');
}

export async function createCategory(db: FixkostenDB, draft: CategoryDraft): Promise<string> {
  return db.transaction('rw', db.categories, async () => {
    const last = await db.categories.orderBy('sortOrder').last();
    const category: Category = {
      id: newId(),
      name: draft.name.trim(),
      color: draft.color,
      kind: draft.kind,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    };
    await db.categories.add(category);
    return category.id;
  });
}

export async function updateCategory(db: FixkostenDB, id: string, draft: CategoryDraft): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await assertExpenseRemains(db, id, draft.kind);
    await db.categories.update(id, { name: draft.name.trim(), color: draft.color, kind: draft.kind });
  });
}

/** Deletes a category; its positions (archived ones too) move to `moveToId` first. */
export async function deleteCategory(db: FixkostenDB, id: string, moveToId?: string): Promise<void> {
  await db.transaction('rw', db.categories, db.positions, async () => {
    await assertExpenseRemains(db, id, null);
    const count = await db.positions.where('categoryId').equals(id).count();
    if (count > 0) {
      if (!moveToId || moveToId === id || !(await db.categories.get(moveToId))) {
        throw new RepoError('Bitte eine Kategorie wählen, in die die Positionen verschoben werden.');
      }
      await db.positions.where('categoryId').equals(id).modify({ categoryId: moveToId });
    }
    await db.categories.delete(id);
  });
}

export async function reorderCategories(db: FixkostenDB, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(orderedIds.map((id, i) => db.categories.update(id, { sortOrder: i })));
  });
}

// ---------------------------------------------------------------------------
// One-offs (Nachzahlung / Gutschrift)
// ---------------------------------------------------------------------------

export interface OneOffDraft {
  positionId: string;
  period: Period;
  /** always positive; `credit` makes it negative */
  amount: number;
  credit: boolean;
  label: string;
}

export async function saveOneOff(db: FixkostenDB, draft: OneOffDraft, id?: string): Promise<string> {
  const existing = id ? await db.oneOffs.get(id) : undefined;
  const oneOff: OneOff = {
    id: existing?.id ?? newId(),
    positionId: draft.positionId,
    period: draft.period,
    amount: (draft.credit ? -1 : 1) * Math.abs(Math.round(draft.amount * 100) / 100),
    label: draft.label.trim(),
  };
  if (existing?.paidAt) oneOff.paidAt = existing.paidAt;
  await db.oneOffs.put(oneOff);
  return oneOff.id;
}

export async function toggleOneOffPaid(db: FixkostenDB, id: string): Promise<void> {
  await db.oneOffs
    .where('id')
    .equals(id)
    .modify((o) => {
      if (o.paidAt) delete o.paidAt;
      else o.paidAt = new Date().toISOString();
    });
}

export async function deleteOneOff(db: FixkostenDB, id: string): Promise<OneOff | undefined> {
  const oneOff = await db.oneOffs.get(id);
  if (oneOff) await db.oneOffs.delete(id);
  return oneOff;
}

export async function restoreOneOff(db: FixkostenDB, oneOff: OneOff): Promise<void> {
  await db.oneOffs.put(oneOff);
}
