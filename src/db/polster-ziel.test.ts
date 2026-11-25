// polster-ziel: the Polster settings – stored only when set, through export and import with and without the
// fields, the old switch `cushion` ignored; confirming once per month, „Rückgängig“, the stages only once.
// Invented data only (tests/fixtures).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { goldenDataset } from '../../tests/fixtures/golden-month';
import { exportBackup, importIntoEmpty, parseBackup, type BackupFile } from './backup';
import { FixkostenDB } from './db';
import { confirmCushion, setCushionBalance, setCushionGoal, setCushionRule, undoCushion } from './kontoActions';
import { DEFAULT_KONTO, kontoUntouched, readKonto, storedKonto, toKontoSettings } from './settings';

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`polster-ziel-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const DAY = new Date(2026, 10, 24);

describe('Einstellungen: additiv, nur gespeichert wenn gesetzt', () => {
  it('Standard: kein Ziel, kein Stand, Regel „alles“, Anteil 50 %; nichts davon gespeichert', () => {
    const s = toKontoSettings({ enabled: true });
    expect(s).toMatchObject({ cushionGoal: null, cushionBalance: null, cushionRule: 'all', cushionShare: 50, cushionMilestones: [], cushionConfirmed: {} });
    expect(Object.keys(storedKonto(s)).filter((k) => k.startsWith('cushion'))).toEqual([]);
  });
  it('Rundreise mit allen Feldern', () => {
    const s = toKontoSettings({
      enabled: true,
      cushionGoal: 2000000,
      cushionBalance: 1400000,
      cushionBalanceDate: '2026-11-24',
      cushionRule: 'share',
      cushionShare: 40,
      cushionMilestones: [50, 25, 25, 33],
      cushionConfirmed: { '2026-12': 457800, '2027-01': -187067, kaputt: 5, '2027-02': 0 },
    });
    expect(s.cushionMilestones).toEqual([25, 50]);
    expect(s.cushionConfirmed).toEqual({ '2026-12': 457800, '2027-01': -187067 });
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
  });
  it('ungültige Werte fallen auf den Standard zurück', () => {
    const s = toKontoSettings({ cushionGoal: -5, cushionBalance: 'x', cushionRule: 'alles', cushionShare: 120, cushionBalanceDate: 'gestern' });
    expect(s).toMatchObject({ cushionGoal: null, cushionBalance: null, cushionRule: 'all', cushionShare: 50, cushionBalanceDate: null });
  });
  it('der alte Schalter cushion wird ignoriert und nicht exportiert', () => {
    const s = toKontoSettings({ enabled: true, cushion: true });
    expect('cushion' in s).toBe(false);
    expect('cushion' in storedKonto(s)).toBe(false);
  });
  it('nur ein Polster gesetzt: die Einladung zum Fixkostenkonto bleibt', () => {
    expect(kontoUntouched({ ...DEFAULT_KONTO, cushionGoal: 2000000, cushionBalance: 0 })).toBe(true);
  });
});

describe('Bestätigen je Monat einmal, Rückgängig, Etappen einmalig', () => {
  it('„Polster aufgefüllt“: Stand + Betrag, Monat gemerkt, Etappe 75 % neu; zweites Bestätigen tut nichts', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    expect(await confirmCushion(db, '2026-12', 457800, DAY)).toEqual([75]);
    let s = await readKonto(db);
    expect([s.cushionBalance, s.cushionConfirmed['2026-12'], s.cushionMilestones, s.cushionBalanceDate]).toEqual([1857800, 457800, [75], '2026-11-24']);
    expect(await confirmCushion(db, '2026-12', 100000, DAY)).toBeNull();
    expect((await readKonto(db)).cushionBalance).toBe(1857800);
    await undoCushion(db, '2026-12', DAY);
    s = await readKonto(db);
    expect([s.cushionBalance, s.cushionConfirmed['2026-12']]).toEqual([1400000, undefined]);
    // the stage stays celebrated: crossing 75 % again is no second celebration
    expect(await confirmCushion(db, '2026-12', 457800, DAY)).toEqual([]);
    expect((await readKonto(db)).cushionMilestones).toEqual([75]);
  });
  it('„Aus Polster genommen“: Stand − Betrag, nie unter 0', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 100000, DAY);
    expect(await confirmCushion(db, '2027-01', -187067, DAY)).toEqual([]);
    const s = await readKonto(db);
    expect([s.cushionBalance, s.cushionConfirmed['2027-01']]).toEqual([0, -100000]);
    await undoCushion(db, '2027-01', DAY);
    expect((await readKonto(db)).cushionBalance).toBe(100000);
  });
  it('100 %: Etappe 100 einmal', async () => {
    const db = newDb();
    await setCushionGoal(db, 1000000);
    await setCushionBalance(db, 0, DAY);
    expect(await confirmCushion(db, '2026-12', 1000000, DAY)).toEqual([25, 50, 75, 100]);
  });
  it('Feld leeren entfernt Ziel und Stand; Regel und Anteil', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    await setCushionGoal(db, null);
    await setCushionBalance(db, null);
    await setCushionRule(db, 'share', 30);
    const s = await readKonto(db);
    expect([s.cushionGoal, s.cushionBalance, s.cushionBalanceDate, s.cushionRule, s.cushionShare]).toEqual([null, null, null, 'share', 30]);
  });
});

describe('Export und Import mit und ohne Polster-Felder', () => {
  it('reisen mit; ohne Felder: kein Polster', async () => {
    const source = newDb();
    const ds = goldenDataset();
    await source.categories.bulkPut(ds.categories);
    await source.positions.bulkPut(ds.positions);
    await setCushionGoal(source, 2000000);
    await setCushionBalance(source, 1400000, DAY);
    await setCushionRule(source, 'share', 40);
    await confirmCushion(source, '2026-12', 457800, DAY);
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    expect(file.settings?.fixkostenkonto).toMatchObject({ cushionGoal: 2000000, cushionBalance: 1857800, cushionRule: 'share', cushionShare: 40, cushionMilestones: [75] });

    const withFields = newDb();
    await importIntoEmpty(withFields, file);
    expect(await readKonto(withFields)).toMatchObject({ cushionGoal: 2000000, cushionBalance: 1857800, cushionConfirmed: { '2026-12': 457800 } });

    const konto = Object.fromEntries(Object.entries(file.settings!.fixkostenkonto!).filter(([k]) => !k.startsWith('cushion')));
    const without: BackupFile = { ...file, settings: { ...file.settings, fixkostenkonto: { ...konto, cushion: true } as never } };
    const withoutFields = newDb();
    await importIntoEmpty(withoutFields, parseBackup(JSON.parse(JSON.stringify(without))));
    expect(await readKonto(withoutFields)).toMatchObject({ cushionGoal: null, cushionBalance: null, cushionConfirmed: {} });
  });
});
