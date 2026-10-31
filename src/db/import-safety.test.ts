import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { BackupError, exportBackup, importBackup, importIntoEmpty, ImportTimeoutError, needsSetup, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { markPaid, saveMonthClose } from './repo';

const opened: FixkostenDB[] = [];

function newDb(name = `safety-${crypto.randomUUID()}`): FixkostenDB {
  const db = new FixkostenDB(name);
  opened.push(db);
  return db;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) await db.delete();
});

/** Every table including meta, as stored. */
async function everything(db: FixkostenDB) {
  return Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const)));
}

/** The import writes categories, positions, payments, …: table 3 fails after two were written. */
function failOnTable3(db: FixkostenDB) {
  const categories = vi.spyOn(db.categories, 'bulkAdd');
  const positions = vi.spyOn(db.positions, 'bulkAdd');
  vi.spyOn(db.payments, 'bulkAdd').mockImplementation(() => Promise.reject(new Error('Tabelle 3 kaputt')) as never);
  return () => {
    // the rollback really had something to undo
    expect(categories).toHaveBeenCalledOnce();
    expect(positions).toHaveBeenCalledOnce();
  };
}

describe('Import ist atomar (eine Transaktion über alle Tabellen)', () => {
  it('Erststart: Fehler in Tabelle 3 → Datenbank exakt wie vorher, Setup weiter offen', async () => {
    const db = newDb();
    await db.open();
    const before = await everything(db);
    const wroteFirstTwo = failOnTable3(db);
    await expect(importIntoEmpty(db, fixtureBackup())).rejects.toThrow('Tabelle 3 kaputt');
    wroteFirstTwo();
    expect(await everything(db)).toEqual(before);
    expect(await needsSetup(db)).toBe(true);
  });

  it('Erststart: echter Constraint-Fehler in Tabelle 3 (doppelter Haken) → nichts geschrieben', async () => {
    const db = newDb();
    await db.open();
    const before = await everything(db);
    const file = fixtureBackup();
    file.data.payments.push({ ...file.data.payments[0]!, id: 'dup' }); // same position and month
    await expect(importIntoEmpty(db, file)).rejects.toThrow();
    expect(await everything(db)).toEqual(before);
  });

  for (const mode of ['replace', 'merge'] as const) {
    it(`Einstellungen, ${mode}: Fehler in Tabelle 3 → alle Tabellen (inkl. meta) exakt wie vorher`, async () => {
      const db = newDb();
      await importIntoEmpty(db, fixtureBackup());
      await markPaid(db, 'pos-depotentgelt', '2026-10', 35);
      await saveMonthClose(db, '2026-10', { netSalary: 4700 });
      const before = await everything(db);
      const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(db))));
      if (mode === 'replace') failOnTable3(db);
      else vi.spyOn(db.payments, 'bulkPut').mockImplementation(() => Promise.reject(new Error('Tabelle 3 kaputt')) as never);
      await expect(importBackup(db, file, mode)).rejects.toThrow('Tabelle 3 kaputt');
      expect(await everything(db)).toEqual(before);
    });
  }
});

describe('Import-Timeout', () => {
  /** Another connection on schema v1 that refuses to close: our open waits („blocked“). */
  async function blockOpen(name: string) {
    const old = new FixkostenDB(name, { maxVersion: 1 });
    old.on('versionchange', () => false); // keep the connection open
    await old.open();
    return old;
  }

  it('wartet die Datenbank: verständliche Meldung, danach wird nichts mehr geschrieben', async () => {
    const name = `safety-${crypto.randomUUID()}`;
    const old = await blockOpen(name);
    const db = newDb(name);
    const started = Date.now();
    const result = importIntoEmpty(db, fixtureBackup(), { timeoutMs: 300 });
    await expect(result).rejects.toBeInstanceOf(ImportTimeoutError);
    await expect(result).rejects.toBeInstanceOf(BackupError); // the setup dialog shows its message
    await expect(result).rejects.toThrow(/zu lange.*nichts geändert/);
    expect(Date.now() - started).toBeLessThan(2000);
    // the blocker goes away, the database opens: the timed-out import must not write after all
    old.close();
    await db.open();
    await new Promise((r) => setTimeout(r, 100));
    expect(await db.categories.count()).toBe(0);
    expect(await needsSetup(db)).toBe(true);
    // and a new attempt works
    await importIntoEmpty(db, fixtureBackup());
    expect(await needsSetup(db)).toBe(false);
  });

  it('ein schneller Import läuft nicht in den Timeout', async () => {
    const db = newDb();
    await importIntoEmpty(db, fixtureBackup(), { timeoutMs: 5000 });
    expect(await db.positions.count()).toBe(fixtureBackup().data.positions.length);
  });
});
