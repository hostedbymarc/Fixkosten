import Dexie from 'dexie';
import type { Dataset, MonthClose, Payment, Period } from '../lib/types';
import type { FixkostenDB } from './db';

export function newId(): string {
  return crypto.randomUUID();
}

export async function loadDataset(db: FixkostenDB): Promise<Dataset> {
  const [categories, positions, payments, oneOffs, monthClose, reminders] = await Promise.all([
    db.categories.toArray(),
    db.positions.toArray(),
    db.payments.toArray(),
    db.oneOffs.toArray(),
    db.monthClose.toArray(),
    db.reminders.toArray(),
  ]);
  return { categories, positions, payments, oneOffs, monthClose, reminders };
}

/** One tap on the circle: paid with the planned amount. Idempotent. */
export async function markPaid(
  db: FixkostenDB,
  positionId: string,
  period: Period,
  plannedAmount: number,
): Promise<Payment> {
  const existing = await db.payments.where({ positionId, period }).first();
  if (existing) return existing;
  const payment: Payment = {
    id: newId(),
    positionId,
    period,
    plannedAmount,
    actualAmount: plannedAmount,
    paidAt: new Date().toISOString(),
  };
  try {
    await db.payments.add(payment);
  } catch (err) {
    // double tap: the unique [positionId+period] index already holds a tick
    if (err instanceof Dexie.ConstraintError) {
      return (await db.payments.where({ positionId, period }).first())!;
    }
    throw err;
  }
  return payment;
}

export async function updatePayment(
  db: FixkostenDB,
  id: string,
  changes: Pick<Payment, 'actualAmount'> & { note?: string },
): Promise<void> {
  await db.payments.update(id, {
    actualAmount: changes.actualAmount,
    note: changes.note?.trim() ? changes.note.trim() : undefined,
  });
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

export interface MonthCloseInput {
  netSalary?: number;
  freeActual?: number;
  note?: string;
}

/** Saves the month close; an entirely empty close is removed. */
export async function saveMonthClose(db: FixkostenDB, period: Period, input: MonthCloseInput): Promise<void> {
  const note = input.note?.trim() ? input.note.trim() : undefined;
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
