// ruecklage-spielgeld, Absicherung: `account: 'spielgeld'` bleibt erhalten – beim Speichern (einmalig und
// wiederkehrend), über Monate, im Abgleich Position ↔ Monats-Instanz und bei Export → Import.
// Nachgebaute Daten (Fixture), keine echten.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { monthItems, dueItems } from '../lib/calc';
import { exportBackup, importBackup, importIntoEmpty, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { upgradePositionV5 } from './migrations';
import { changePlan, createPosition, loadDataset, markPaid, saveOneOff, setPositionAccount, updatePositionInfo } from './repo';

const OCT = '2026-10';
const NOV = '2026-11';
const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`spielgeld-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

async function withSpielgeld(): Promise<{ db: FixkostenDB; once: string }> {
  const db = newDb();
  await importIntoEmpty(db, fixtureBackup());
  // recurring: Miete → Spielgeld; one-time: a new position on Spielgeld
  await setPositionAccount(db, 'pos-miete', 'spielgeld');
  const once = await createPosition(db, { name: 'Konzert', categoryId: 'cat-abos', plan: { amount: 89.9, frequency: 'once', dueMonths: [], dueDate: '2026-11-20' }, account: 'spielgeld' }, NOV);
  return { db, once };
}

const accountOf = async (db: FixkostenDB, id: string) => (await db.positions.get(id))?.account;

describe('account „spielgeld“ bleibt erhalten', () => {
  it('beim Speichern im Bearbeiten-Dialog: Name, Notiz und Betrag ändern das Konto nicht (wiederkehrend und einmalig)', async () => {
    const { db, once } = await withSpielgeld();
    const miete = (await db.positions.get('pos-miete'))!;
    await updatePositionInfo(db, 'pos-miete', { name: 'Miete neu', categoryId: miete.categoryId, note: 'Test' });
    await changePlan(db, 'pos-miete', { amount: 1100, frequency: 'monthly', dueMonths: [] }, { type: 'from', validFrom: NOV }, OCT);
    await changePlan(db, 'pos-miete', { amount: 1010, frequency: 'monthly', dueMonths: [] }, { type: 'correct' }, OCT);
    const konzert = (await db.positions.get(once))!;
    await updatePositionInfo(db, once, { name: 'Konzert groß', categoryId: konzert.categoryId });
    expect(await accountOf(db, 'pos-miete')).toBe('spielgeld');
    expect(await accountOf(db, once)).toBe('spielgeld');
  });
  it('über Monate und im Abgleich Position ↔ Monats-Instanz (auch bezahlt und Einmalbetrag)', async () => {
    const { db, once } = await withSpielgeld();
    await markPaid(db, 'pos-miete', OCT, 1008);
    await saveOneOff(db, { period: NOV, positionId: 'pos-miete', amount: 40, credit: false, label: 'Nachzahlung' });
    const ds = await loadDataset(db);
    // spielgeld-planer: 'spielgeld' = „nicht eingeplant“ – the month instance shows it as such and sums skip it
    for (const period of [OCT, NOV, '2026-12', '2027-03']) {
      const miete = dueItems(ds, period).filter((i) => i.position.id === 'pos-miete');
      expect(miete.length).toBeGreaterThan(0);
      for (const i of miete) {
        expect(i.position.account).toBe('spielgeld');
        expect(i.unplanned).toBe(true);
      }
      expect(monthItems(ds, period).some((i) => i.name.startsWith('Miete'))).toBe(false);
    }
    expect(dueItems(ds, NOV).find((i) => i.position.name === 'Konzert')?.unplanned).toBe(true);
    expect(await accountOf(db, once)).toBe('spielgeld');
  });
  it('Neuladen (neue Verbindung zur selben Datenbank)', async () => {
    const { db, once } = await withSpielgeld();
    const again = new FixkostenDB(db.name);
    opened.push(again);
    expect(await accountOf(again, 'pos-miete')).toBe('spielgeld');
    expect(await accountOf(again, once)).toBe('spielgeld');
  });
  it('Export → Import (leer, zusammenführen, ersetzen)', async () => {
    const { db, once } = await withSpielgeld();
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(db))));
    for (const mode of ['empty', 'merge', 'replace'] as const) {
      const target = newDb();
      if (mode === 'empty') await importIntoEmpty(target, file);
      else {
        await importIntoEmpty(target, fixtureBackup());
        await importBackup(target, file, mode);
      }
      expect(await accountOf(target, 'pos-miete')).toBe('spielgeld');
      expect(await accountOf(target, once)).toBe('spielgeld');
    }
  });
  it('die v5-Hochstufung lässt „spielgeld“ stehen', () => {
    const p: Record<string, unknown> = { id: 'x', categoryId: 'cat-wohnen', account: 'spielgeld' };
    upgradePositionV5(p, () => 'expense');
    expect(p.account).toBe('spielgeld');
  });
});
