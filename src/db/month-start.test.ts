// Einstellung „Neuer Monat beginnt am“: stored in meta (no schema change), carried by export/import.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import seed from '../../tests/fixtures/seed.json';
import { LIVE_FILE, liveBackup } from '../../tests/fixtures/live';
import { exportBackup, importBackup, importIntoEmpty, parseBackup, readMonthStart, undoLastImport, writeMonthStart } from './backup';
import { FixkostenDB, SCHEMA_VERSION } from './db';

let n = 0;
const fresh = () => new FixkostenDB(`month-start-${n++}`);

describe('Einstellung „Neuer Monat beginnt am“: Export und Import', () => {
  it('ohne Einstellung: Default 1; gespeichert als meta, keine neue Tabelle, Schema unverändert', async () => {
    const db = fresh();
    await importIntoEmpty(db, liveBackup());
    expect(await readMonthStart(db)).toBe(1);
    await writeMonthStart(db, 25);
    expect(await readMonthStart(db)).toBe(25);
    expect((await db.meta.get('monthStartDay'))?.value).toBe(25);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['categories', 'changeLog', 'meta', 'monthClose', 'oneOffs', 'payments', 'positions', 'reminders']);
    expect(SCHEMA_VERSION).toBe(4);
    await db.delete();
  });

  it('Export trägt den Wert mit (25 und Monatsletzter); Import auf ein anderes Gerät übernimmt ihn', async () => {
    for (const start of [25, 'last'] as const) {
      const src = fresh();
      const dst = fresh();
      await importIntoEmpty(src, liveBackup());
      await writeMonthStart(src, start);
      const file = JSON.parse(JSON.stringify(await exportBackup(src)));
      expect(file.settings).toEqual({ monthStartDay: start });
      expect(file.schemaVersion).toBe(4);
      await importIntoEmpty(dst, parseBackup(file));
      expect(await readMonthStart(dst)).toBe(start);
      await src.delete();
      await dst.delete();
    }
  });

  it('alte Dateien ohne Einstellung (Schema 2 vom 05.10., Export vom 25.10.) → Default 1', async () => {
    for (const raw of [seed, JSON.parse(readFileSync(LIVE_FILE, 'utf8'))]) {
      const backup = parseBackup(structuredClone(raw));
      expect(backup.settings).toBeUndefined();
      const db = fresh();
      await importIntoEmpty(db, backup);
      expect(await readMonthStart(db)).toBe(1);
      await db.delete();
    }
  });

  it('Ersetzen mit alter Datei → 1; Zusammenführen mit alter Datei behält den Wert; Datei mit Wert setzt ihn; Rückgängig stellt ihn wieder her', async () => {
    const db = fresh();
    await importIntoEmpty(db, liveBackup());
    await writeMonthStart(db, 25);
    await importBackup(db, liveBackup(), 'merge');
    expect(await readMonthStart(db)).toBe(25);
    await importBackup(db, liveBackup(), 'replace');
    expect(await readMonthStart(db)).toBe(1);
    expect(await undoLastImport(db)).toBe(true);
    expect(await readMonthStart(db)).toBe(25);
    await importBackup(db, { ...liveBackup(), settings: { monthStartDay: 20 } }, 'merge');
    expect(await readMonthStart(db)).toBe(20);
    await db.delete();
  });

  it('ungültiger Wert in einer Datei wird verworfen (→ Default)', async () => {
    const raw = JSON.parse(readFileSync(LIVE_FILE, 'utf8'));
    for (const bad of [31, 3, '25', null]) {
      const backup = parseBackup({ ...structuredClone(raw), settings: { monthStartDay: bad } });
      const db = fresh();
      await importIntoEmpty(db, backup);
      expect(await readMonthStart(db)).toBe(1);
      await db.delete();
    }
  });
});
