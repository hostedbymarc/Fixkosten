import type {
  Category,
  ChangeLog,
  MonthClose,
  OneOff,
  Payment,
  Position,
  Reminder,
} from '../lib/types';
import { SCHEMA_VERSION, type FixkostenDB } from './db';
import { upgradePaymentV3, upgradePositionV3 } from './migrations';

/** Oldest backup version that can still be imported (migrated on the fly). */
const MIN_IMPORT_VERSION = 2;

export const BACKUP_FORMAT = 'fixkosten-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: {
    categories: Category[];
    positions: Position[];
    payments: Payment[];
    oneOffs: OneOff[];
    monthClose: MonthClose[];
    changeLog: ChangeLog[];
    reminders: Reminder[];
  };
}

export class BackupError extends Error {}

const TABLES = ['categories', 'positions', 'payments', 'oneOffs', 'monthClose', 'changeLog', 'reminders'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the outer structure of a backup file. Throws BackupError with a German message. */
export function parseBackup(raw: unknown): BackupFile {
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || !isObject(raw.data)) {
    throw new BackupError('Das ist keine Fixkosten-Sicherung.');
  }
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || version < MIN_IMPORT_VERSION || version > SCHEMA_VERSION) {
    throw new BackupError(
      `Diese Sicherung hat Version ${String(version)}, unterstützt werden ${MIN_IMPORT_VERSION}–${SCHEMA_VERSION}.`,
    );
  }
  const data = raw.data;
  for (const table of TABLES) {
    const rows = data[table] ?? [];
    if (!Array.isArray(rows) || !rows.every(isObject)) {
      throw new BackupError(`Die Sicherung ist beschädigt (${table}).`);
    }
    data[table] = rows;
  }
  // same record migrations as the database upgrade
  if (version < 3) {
    data.positions = (data.positions as Record<string, unknown>[]).map((p) => upgradePositionV3({ ...p }));
    data.payments = (data.payments as Record<string, unknown>[]).map((p) => upgradePaymentV3({ ...p }));
    raw.schemaVersion = 3;
  }
  const positions = data.positions as Position[];
  const categoryIds = new Set((data.categories as Category[]).map((c) => c.id));
  for (const p of positions) {
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || !categoryIds.has(p.categoryId) || !Array.isArray(p.history) || p.history.length === 0) {
      throw new BackupError('Die Sicherung ist beschädigt (Positionen).');
    }
  }
  return raw as unknown as BackupFile;
}

/** True only for a database that has never been set up — the first start. */
export async function needsSetup(db: FixkostenDB): Promise<boolean> {
  const [categories, positions, payments, seeded, setup] = await Promise.all([
    db.categories.count(),
    db.positions.count(),
    db.payments.count(),
    db.meta.get('seededAt'), // set by the phase-1 auto seed
    db.meta.get('setupCompletedAt'),
  ]);
  return categories === 0 && positions === 0 && payments === 0 && !seeded && !setup;
}

async function markSetupDone(db: FixkostenDB, extra: { key: string; value: unknown }[] = []) {
  await db.meta.bulkPut([
    { key: 'schemaVersion', value: SCHEMA_VERSION },
    { key: 'setupCompletedAt', value: new Date().toISOString() },
    ...extra,
  ]);
}

/** First-start import. Refuses to touch a database that already holds data. */
export async function importIntoEmpty(db: FixkostenDB, backup: BackupFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    if (!(await needsSetup(db))) {
      throw new BackupError('Es sind bereits Daten vorhanden – es wird nichts überschrieben.');
    }
    await db.categories.bulkAdd(backup.data.categories);
    await db.positions.bulkAdd(backup.data.positions);
    await db.payments.bulkAdd(backup.data.payments);
    await db.oneOffs.bulkAdd(backup.data.oneOffs);
    await db.monthClose.bulkAdd(backup.data.monthClose);
    await db.changeLog.bulkAdd(backup.data.changeLog);
    await db.reminders.bulkAdd(backup.data.reminders);
    await markSetupDone(db, [{ key: 'importedAt', value: new Date().toISOString() }]);
  });
}

export async function startEmpty(db: FixkostenDB): Promise<void> {
  await db.transaction('rw', db.meta, async () => markSetupDone(db));
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupError('Die Datei ist kein gültiges JSON.');
  }
  return parseBackup(raw);
}
