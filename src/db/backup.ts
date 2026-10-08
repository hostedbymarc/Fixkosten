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
import { upgradePaymentV3, upgradePositionV3, upgradePositionV4 } from './migrations';

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
    throw new BackupError('Das ist keine Erbse-Sicherung.');
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
  }
  if (version < 4) {
    data.positions = (data.positions as Record<string, unknown>[]).map((p) =>
      upgradePositionV4({ ...p, history: ((p.history as Record<string, unknown>[] | undefined) ?? []).map((e) => ({ ...e })) }),
    );
  }
  raw.schemaVersion = SCHEMA_VERSION;
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

// ---------------------------------------------------------------------------
// Export, merge, replace, undo
// ---------------------------------------------------------------------------

const UNDO_KEY = 'undoImport';

/** Complete snapshot of the user data in backup format. */
export async function exportBackup(db: FixkostenDB): Promise<BackupFile> {
  const [categories, positions, payments, oneOffs, monthClose, changeLog, reminders] = await Promise.all([
    db.categories.toArray(),
    db.positions.toArray(),
    db.payments.toArray(),
    db.oneOffs.toArray(),
    db.monthClose.toArray(),
    db.changeLog.toArray(),
    db.reminders.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { categories, positions, payments, oneOffs, monthClose, changeLog, reminders },
  };
}

/**
 * 'erbse-backup-2026-10-05.json'. Only the file name changed with the rename: the content
 * keeps format 'fixkosten-backup', and import never looks at the name, so old
 * fixkosten-*.json files keep working.
 */
export function backupFileName(prefix = 'erbse-backup'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export async function markExported(db: FixkostenDB): Promise<void> {
  await db.meta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
}

export interface BackupSummary {
  positions: number;
  archived: number;
  payments: number;
  monthClose: number;
  oneOffs: number;
  /** first and last month with a tick */
  firstPeriod: string | null;
  lastPeriod: string | null;
}

export function summarize(data: BackupFile['data']): BackupSummary {
  const periods = data.payments.map((p) => p.period).sort();
  return {
    positions: data.positions.filter((p) => !p.archivedAt).length,
    archived: data.positions.filter((p) => p.archivedAt).length,
    payments: data.payments.length,
    monthClose: data.monthClose.length,
    oneOffs: data.oneOffs.length,
    firstPeriod: periods[0] ?? null,
    lastPeriod: periods[periods.length - 1] ?? null,
  };
}

async function writeAll(db: FixkostenDB, data: BackupFile['data']) {
  await db.categories.bulkAdd(data.categories);
  await db.positions.bulkAdd(data.positions);
  await db.payments.bulkAdd(data.payments);
  await db.oneOffs.bulkAdd(data.oneOffs);
  await db.monthClose.bulkAdd(data.monthClose);
  await db.changeLog.bulkAdd(data.changeLog);
  await db.reminders.bulkAdd(data.reminders);
}

async function clearAll(db: FixkostenDB) {
  await Promise.all([
    db.categories.clear(),
    db.positions.clear(),
    db.payments.clear(),
    db.oneOffs.clear(),
    db.monthClose.clear(),
    db.changeLog.clear(),
    db.reminders.clear(),
  ]);
}

export type ImportMode = 'merge' | 'replace';

/**
 * Imports a backup into a database that already holds data. The current state
 * is kept as a safety copy first, so the import can be undone.
 * - 'merge': entries from the file win on conflicts (same id; payments: same
 *   position and month); everything that only exists on this device stays.
 * - 'replace': this device afterwards holds exactly the file's data.
 */
export async function importBackup(db: FixkostenDB, backup: BackupFile, mode: ImportMode): Promise<void> {
  const snapshot = await exportBackup(db);
  await db.transaction('rw', db.tables, async () => {
    await db.meta.put({ key: UNDO_KEY, value: { snapshot, mode, at: new Date().toISOString() } });
    if (mode === 'replace') {
      await clearAll(db);
      await writeAll(db, backup.data);
    } else {
      const d = backup.data;
      await db.categories.bulkPut(d.categories);
      await db.positions.bulkPut(d.positions);
      // one tick per position and month: the file's entry replaces the local one
      for (const p of d.payments) {
        await db.payments.where({ positionId: p.positionId, period: p.period }).filter((x) => x.id !== p.id).delete();
      }
      await db.payments.bulkPut(d.payments);
      await db.oneOffs.bulkPut(d.oneOffs);
      await db.monthClose.bulkPut(d.monthClose);
      await db.changeLog.bulkPut(d.changeLog);
      await db.reminders.bulkPut(d.reminders);
    }
    await markSetupDone(db, [{ key: 'importedAt', value: new Date().toISOString() }]);
  });
}

export async function lastImport(db: FixkostenDB): Promise<{ mode: ImportMode; at: string } | null> {
  const entry = await db.meta.get(UNDO_KEY);
  if (!entry) return null;
  const { mode, at } = entry.value as { mode: ImportMode; at: string };
  return { mode, at };
}

/** Restores the state from right before the last import. */
export async function undoLastImport(db: FixkostenDB): Promise<boolean> {
  return db.transaction('rw', db.tables, async () => {
    const entry = await db.meta.get(UNDO_KEY);
    if (!entry) return false;
    const { snapshot } = entry.value as { snapshot: BackupFile };
    await clearAll(db);
    await writeAll(db, snapshot.data);
    await db.meta.delete(UNDO_KEY);
    return true;
  });
}
