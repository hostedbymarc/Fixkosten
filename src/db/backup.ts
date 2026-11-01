import { localToday, MONTH_START_KEY, toMonthStart, type MonthStart } from '../lib/activeMonth';
import type {
  Category,
  ChangeLog,
  MonthClose,
  OneOff,
  Payment,
  Position,
  Reminder,
} from '../lib/types';
import type { Table, Transaction } from 'dexie';
import { traceImport } from '../lib/importTrace';
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
  /** device settings that travel with the data; missing in older files (→ defaults) */
  settings?: {
    /** Einstellungen → „Neuer Monat beginnt am“ (src/lib/activeMonth.ts) */
    monthStartDay?: MonthStart;
  };
}

export class BackupError extends Error {}

/** A normal import takes well under a second; far beyond that something waits that will not come. */
export const IMPORT_TIMEOUT_MS = 20_000;

export class ImportTimeoutError extends BackupError {
  constructor() {
    super('Der Import hat zu lange gedauert und wurde abgebrochen. Es wurde nichts geändert – bitte erneut versuchen.');
  }
}

export interface ImportOptions {
  timeoutMs?: number;
}

/**
 * Runs the whole import in ONE transaction over every table, so it lands completely or not at
 * all. Past the timeout the transaction is aborted (IndexedDB rolls it back) or, if it has not
 * started yet (database still opening), never runs.
 */
async function importTransaction(db: FixkostenDB, timeoutMs: number, body: () => Promise<void>): Promise<void> {
  let timedOut = false;
  let finished = false;
  let tx: Transaction | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (finished) return;
      timedOut = true;
      try {
        tx?.abort();
      } catch {
        // already over
      }
      traceImport('timeout', { timeoutMs });
      reject(new ImportTimeoutError());
    }, timeoutMs);
  });
  const run = db.transaction('rw', db.tables, async (t) => {
    tx = t;
    if (timedOut) throw new ImportTimeoutError();
    t.on('complete', () => {
      finished = true;
    });
    await body();
    if (timedOut) throw new ImportTimeoutError();
  });
  run.catch(() => {}); // after a timeout nobody waits for it any more
  try {
    await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

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
  // settings are optional; an unknown value is dropped (→ default on import)
  if (raw.settings !== undefined) {
    const settings = isObject(raw.settings) ? raw.settings : {};
    raw.settings = settings.monthStartDay === undefined ? {} : { monthStartDay: toMonthStart(settings.monthStartDay) };
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

/** Einstellung „Neuer Monat beginnt am“ (meta, no schema change); default 1. */
export async function readMonthStart(db: FixkostenDB): Promise<MonthStart> {
  return toMonthStart((await db.meta.get(MONTH_START_KEY))?.value);
}

export async function writeMonthStart(db: FixkostenDB, start: MonthStart): Promise<void> {
  await db.meta.put({ key: MONTH_START_KEY, value: toMonthStart(start) });
}

/** The file's setting; a file without it sets the default 1 (replace, first import, undo) or keeps the current one (merge). */
async function importSettings(db: FixkostenDB, backup: BackupFile, keepWhenMissing: boolean) {
  const start = backup.settings?.monthStartDay;
  if (start !== undefined) await writeMonthStart(db, start);
  else if (!keepWhenMissing) await writeMonthStart(db, 1);
}

async function markSetupDone(db: FixkostenDB, extra: { key: string; value: unknown }[] = []) {
  await db.meta.bulkPut([
    { key: 'schemaVersion', value: SCHEMA_VERSION },
    { key: 'setupCompletedAt', value: new Date().toISOString() },
    ...extra,
  ]);
}

/** First-start import. Refuses to touch a database that already holds data. */
export async function importIntoEmpty(db: FixkostenDB, backup: BackupFile, options: ImportOptions = {}): Promise<void> {
  try {
    await importTransaction(db, options.timeoutMs ?? IMPORT_TIMEOUT_MS, async () => {
      traceImport('tx-start', { mode: 'first' });
      if (!(await needsSetup(db))) {
        throw new BackupError('Es sind bereits Daten vorhanden – es wird nichts überschrieben.');
      }
      await writeAll(db, backup.data);
      await importSettings(db, backup, false);
      await markSetupDone(db, [{ key: 'importedAt', value: new Date().toISOString() }]);
    });
  } catch (err) {
    traceImport('tx-failed', { error: String(err) });
    throw err;
  }
  traceImport('committed');
}

export async function startEmpty(db: FixkostenDB): Promise<void> {
  await db.transaction('rw', db.meta, async () => markSetupDone(db));
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  let raw: unknown;
  try {
    const text = await file.text();
    traceImport('file-read', { bytes: text.length });
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('Die Datei ist kein gültiges JSON.');
  }
  traceImport('json-parsed');
  const backup = parseBackup(raw);
  traceImport('validated');
  return backup;
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
    settings: { monthStartDay: await readMonthStart(db) },
  };
}

/**
 * 'erbse-backup-2026-10-05.json'. Only the file name changed with the rename: the content
 * keeps format 'fixkosten-backup', and import never looks at the name, so old
 * fixkosten-*.json files keep working.
 */
export function backupFileName(prefix = 'erbse-backup'): string {
  const d = localToday();
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
  for (const table of TABLES) {
    await (db[table] as Table<unknown>).bulkAdd(data[table]);
    traceImport('table-written', { table, rows: data[table].length });
  }
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
export async function importBackup(db: FixkostenDB, backup: BackupFile, mode: ImportMode, options: ImportOptions = {}): Promise<void> {
  traceImport('import-start', { mode });
  const snapshot = await exportBackup(db);
  traceImport('snapshot-taken');
  try {
    await importTransaction(db, options.timeoutMs ?? IMPORT_TIMEOUT_MS, async () => {
      traceImport('tx-start', { mode });
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
        traceImport('tables-merged');
      }
      await importSettings(db, backup, mode === 'merge');
      await markSetupDone(db, [{ key: 'importedAt', value: new Date().toISOString() }]);
    });
  } catch (err) {
    traceImport('tx-failed', { error: String(err) });
    throw err;
  }
  traceImport('committed');
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
    await importSettings(db, snapshot, false);
    await db.meta.delete(UNDO_KEY);
    return true;
  });
}
