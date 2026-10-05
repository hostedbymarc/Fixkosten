import Dexie from 'dexie';
import type { Dataset, Payment, Period } from '../lib/types';
import { SCHEMA_VERSION, type FixkostenDB } from './db';
import { SEED_PERIOD, buildSeed } from './seed';

export function newId(): string {
  return crypto.randomUUID();
}

/** Imports the seed exactly once (first start). Returns true if it seeded. */
export async function ensureSeeded(db: FixkostenDB): Promise<boolean> {
  return db.transaction('rw', db.tables, async () => {
    if (await db.meta.get('seededAt')) return false;
    const seed = buildSeed();
    await db.categories.bulkAdd(seed.categories);
    await db.positions.bulkAdd(seed.positions);
    await db.payments.bulkAdd(seed.payments);
    await db.reminders.bulkAdd(seed.reminders);
    await db.meta.bulkPut([
      { key: 'schemaVersion', value: SCHEMA_VERSION },
      { key: 'seededAt', value: new Date().toISOString() },
      { key: 'trackingStart', value: SEED_PERIOD },
    ]);
    return true;
  });
}

export async function loadDataset(db: FixkostenDB): Promise<Dataset> {
  const [categories, positions, payments, oneOffs, income, reminders] = await Promise.all([
    db.categories.toArray(),
    db.positions.toArray(),
    db.payments.toArray(),
    db.oneOffs.toArray(),
    db.income.toArray(),
    db.reminders.toArray(),
  ]);
  return { categories, positions, payments, oneOffs, income, reminders };
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
