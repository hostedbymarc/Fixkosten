// Pure record migrations. Used by the Dexie upgrade functions and by the
// backup import, so an old backup file goes through exactly the same steps.

import type { Frequency, Payment, PlanEntry, Position } from '../lib/types';

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Position as stored up to schema v2. */
export interface PositionV2 {
  id: string;
  name: string;
  categoryId: string;
  frequency: Frequency;
  dueMonths: number[];
  dueDay?: number;
  note?: string;
  amountHistory: { validFrom: string; amount: number }[];
  createdAt: string;
  archivedAt?: string;
  sortOrder: number;
  isVariable?: boolean;
}

/**
 * v2 → v3: amountHistory + frequency/dueMonths/dueDay become `history`.
 * Mutates in place (Dexie modify) and returns the record. Idempotent.
 */
export function upgradePositionV3(record: Record<string, unknown>): Position {
  if (Array.isArray(record.history)) return record as unknown as Position;
  const old = record as unknown as PositionV2;
  const frequency = old.frequency ?? 'monthly';
  const dueMonths = frequency === 'monthly' ? [...ALL_MONTHS] : [...(old.dueMonths ?? [])];
  const history: PlanEntry[] = [...(old.amountHistory ?? [])]
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    .map((entry) => {
      const plan: PlanEntry = { validFrom: entry.validFrom, amount: entry.amount, frequency, dueMonths: [...dueMonths] };
      if (old.dueDay !== undefined) plan.dueDay = old.dueDay;
      return plan;
    });
  record.history = history;
  delete record.amountHistory;
  delete record.frequency;
  delete record.dueMonths;
  delete record.dueDay;
  delete record.isVariable;
  return record as unknown as Position;
}

/** v2 → v3: every existing payment was a tick. */
export function upgradePaymentV3(record: Record<string, unknown>): Payment {
  if (record.status !== 'paid' && record.status !== 'skipped') record.status = 'paid';
  return record as unknown as Payment;
}
