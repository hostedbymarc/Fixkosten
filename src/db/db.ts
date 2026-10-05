import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { toPeriod } from '../lib/period';
import { upgradePaymentV3, upgradePositionV3, type PositionV2 } from './migrations';
import type {
  Category,
  ChangeLog,
  MetaEntry,
  MonthClose,
  OneOff,
  Payment,
  Position,
  Reminder,
} from '../lib/types';

/** Bump together with a new db.version(n) block (and a backup migration). */
export const SCHEMA_VERSION = 3;

/** Schema v1 as shipped in phase 1. Never change it: devices already run it. */
const SCHEMA_V1 = {
  categories: 'id, sortOrder',
  positions: 'id, categoryId, sortOrder, archivedAt',
  // one tick per position and month
  payments: 'id, &[positionId+period], period, positionId',
  oneOffs: 'id, period, positionId',
  income: 'validFrom',
  changeLog: 'id, at, positionId',
  reminders: 'id, month',
  meta: 'key',
};

/** v2: income (validFrom) replaced by per-month closes. */
const SCHEMA_V2_CHANGES = {
  income: null,
  monthClose: 'period',
};

/** v3: no index changes, only the record shape (see migrateToV3). */
const SCHEMA_V3_CHANGES = {};

export const IMMOS_CATEGORY: Category = {
  id: 'cat-immos',
  name: 'Meine Immos',
  kind: 'expense',
  color: '#2E2E8A',
  sortOrder: 0,
};

/**
 * 53-bit string hash (cyrb53). The v2 migration matches positions by name,
 * but the names themselves must not ship in the public bundle.
 */
export function nameHash(name: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < name.length; i++) {
    const ch = name.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Hashed names of the positions that move to "Meine Immos" in v2. */
export const IMMOS_NAME_HASHES = new Set([
  'yfqpf3lgxu', // Kredit 1220
  'nmtcecyq2e', // BK 1220
  '2bcdiis4tdi', // BK 1160
  'qxnemloql', // Baurechtszins
]);

/**
 * v1 → v2 data migration. Keeps every payment, amount and note.
 * - adds "Meine Immos" in first place and moves the four property positions
 *   there by name (missing/renamed positions are skipped silently)
 * - removes `isVariable` from all positions
 * - carries a legacy income value over into the current month's close
 * Runs inside the IndexedDB upgrade transaction: only IDB awaits, no other async work.
 */
export async function migrateToV2(tx: Transaction): Promise<void> {
  const categories = tx.table<Category, string>('categories');
  const positions = tx.table<PositionV2, string>('positions');

  // A database that never got data stays empty; only existing setups get the category.
  if ((await categories.count()) > 0) {
    let immos =
      (await categories.get(IMMOS_CATEGORY.id)) ??
      (await categories.filter((c) => c.name === IMMOS_CATEGORY.name).first());
    if (!immos) {
      await categories.toCollection().modify((c) => {
        c.sortOrder += 1;
      });
      immos = { ...IMMOS_CATEGORY };
      await categories.add(immos);
    }
    const immosId = immos.id;
    await positions
      .filter((p) => IMMOS_NAME_HASHES.has(nameHash(p.name.trim())))
      .modify((p) => {
        p.categoryId = immosId;
      });
  }

  await positions.toCollection().modify((p) => {
    delete p.isVariable;
  });

  // income is deleted by Dexie only after this function has run
  const legacyIncome = await tx.table<{ validFrom: string; netMonthly: number }>('income').toArray();
  if (legacyIncome.length > 0) {
    const latest = legacyIncome.reduce((a, b) => (b.validFrom > a.validFrom ? b : a));
    await tx.table<MonthClose, string>('monthClose').put({
      period: toPeriod(new Date()),
      netSalary: latest.netMonthly,
      updatedAt: new Date().toISOString(),
    });
  }

  await tx.table<MetaEntry, string>('meta').put({ key: 'schemaVersion', value: 2 });
}

/**
 * v2 → v3 data migration. Nothing is dropped:
 * - positions: amountHistory + frequency/dueMonths/dueDay → versioned `history`
 * - payments: status 'paid' for every existing tick
 */
export async function migrateToV3(tx: Transaction): Promise<void> {
  await tx.table('positions').toCollection().modify((p: Record<string, unknown>) => {
    upgradePositionV3(p);
  });
  await tx.table('payments').toCollection().modify((p: Record<string, unknown>) => {
    upgradePaymentV3(p);
  });
  await tx.table<MetaEntry, string>('meta').put({ key: 'schemaVersion', value: 3 });
}

export class FixkostenDB extends Dexie {
  categories!: EntityTable<Category, 'id'>;
  positions!: EntityTable<Position, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  oneOffs!: EntityTable<OneOff, 'id'>;
  monthClose!: EntityTable<MonthClose, 'period'>;
  changeLog!: EntityTable<ChangeLog, 'id'>;
  reminders!: EntityTable<Reminder, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  /** `maxVersion` lets tests create a v1 database and upgrade it later. */
  constructor(name = 'fixkosten', options: { maxVersion?: number } = {}) {
    super(name);
    const maxVersion = options.maxVersion ?? SCHEMA_VERSION;
    // Only indexed fields are listed; all other fields are stored as-is.
    this.version(1).stores(SCHEMA_V1);
    if (maxVersion >= 2) this.version(2).stores(SCHEMA_V2_CHANGES).upgrade(migrateToV2);
    if (maxVersion >= 3) this.version(3).stores(SCHEMA_V3_CHANGES).upgrade(migrateToV3);
  }
}

export const db = new FixkostenDB();
