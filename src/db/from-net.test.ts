import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import seed from '../../tests/fixtures/seed.json';
import { readFileSync } from 'node:fs';
import { LIVE_FILE, liveBackup, MIETE_1220, OKT, withMieteNotFromNet } from '../../tests/fixtures/live';
import { monthFigures, wealthFromNet } from '../lib/calc';
import { exportBackup, importIntoEmpty, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { createPosition, loadDataset, updatePositionInfo } from './repo';

describe("Schalter „Von ‚Frei verfügbar' abziehen“: Export und Import", () => {
  it('alte Dateien (fixkosten-backup Schema 2 vom 05.10., Export vom 25.10. Schema 4) importieren ohne Feld = an', () => {
    for (const raw of [seed, JSON.parse(readFileSync(LIVE_FILE, 'utf8'))]) {
      const backup = parseBackup(structuredClone(raw));
      expect(backup.data.positions.every((p) => p.fromNet === undefined)).toBe(true);
    }
    // „Miete 1220“ counts from the net salary by default
    const live = liveBackup().data;
    const ds = { ...live };
    expect(wealthFromNet(ds, OKT)).toBe(1860);
  });

  it('Export → Import erhält „aus“ und „an“', async () => {
    const src = new FixkostenDB('fromnet-src');
    const dst = new FixkostenDB('fromnet-dst');
    const backup = liveBackup();
    await importIntoEmpty(src, { ...backup, data: withMieteNotFromNet(backup.data) });
    const file = JSON.parse(JSON.stringify(await exportBackup(src)));
    expect(file.data.positions.find((p: { id: string }) => p.id === MIETE_1220).fromNet).toBe(false);
    await importIntoEmpty(dst, parseBackup(file));
    const back = await loadDataset(dst);
    expect(back.positions.find((p) => p.id === MIETE_1220)!.fromNet).toBe(false);
    expect(back.positions.filter((p) => p.fromNet === false)).toHaveLength(1);
    const f = monthFigures(back, OKT);
    expect([f.wealth, f.wealthFromNet, f.deductions, f.free]).toEqual([1860, 800, 4288.5, 499.5]);
    await src.delete();
    await dst.delete();
  });

  it('Repo: „an“ hinterlässt kein Feld, „aus“ speichert false; Umschalten im Bearbeiten-Sheet', async () => {
    const db = new FixkostenDB('fromnet-repo');
    const backup = liveBackup();
    await importIntoEmpty(db, backup);
    const investieren = backup.data.categories.find((c) => c.name === 'Investieren')!.id;
    const plan = { amount: 500, frequency: 'once' as const, dueMonths: [11], dueDate: '2026-11-02' };
    const on = await createPosition(db, { name: 'Bonus', categoryId: investieren, plan, fromNet: true }, '2026-11');
    const off = await createPosition(db, { name: 'Mieteinnahme', categoryId: investieren, plan, fromNet: false }, '2026-11');
    expect('fromNet' in (await db.positions.get(on))!).toBe(false);
    expect((await db.positions.get(off))!.fromNet).toBe(false);
    await updatePositionInfo(db, off, { name: 'Mieteinnahme', categoryId: investieren, fromNet: true });
    expect((await db.positions.get(off))!.fromNet).toBeUndefined();
    await updatePositionInfo(db, MIETE_1220, { name: 'Miete 1220', categoryId: investieren, fromNet: false });
    expect((await db.positions.get(MIETE_1220))!.fromNet).toBe(false);
    await db.delete();
  });
});
