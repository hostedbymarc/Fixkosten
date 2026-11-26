// polster-feinschliff: the moves of the Polster (sum = Stand, the start value derived from an older Stand,
// „Rückgängig“), „+ Einzahlen“ / „− Entnehmen“ any time, the difference after a confirmation, „Spielgeld für
// {Monat}“ only / from a month, „Polster vor Rot“. Invented data only (tests/fixtures).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P2, P3 } from '../../tests/fixtures/golden-month';
import { monthCard, planRows } from '../lib/monthCard';
import { monthPlan } from '../lib/monthPlan';
import { addPeriods } from '../lib/period';
import { bigMonthCushion, cushionLevel, cushionOf, movesNewestFirst, projectCushion, surplusDiff, type Cushion } from '../lib/polster';
import type { PlanRow } from '../lib/monthCard';
import { exportBackup, importIntoEmpty, parseBackup, type BackupFile } from './backup';
import { FixkostenDB } from './db';
import {
  addCushionMove,
  confirmCushion,
  removeCushionMove,
  setCushionBalance,
  setCushionGoal,
  setSpielgeldFor,
  settleCushionDiff,
  undoCushion,
} from './kontoActions';
import { readKonto, storedKonto, toKontoSettings, writeKonto } from './settings';

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`polster-feinschliff-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const DAY = new Date(2026, 10, 24);
const LATER = new Date(2026, 10, 26);
const sum = (moves: { amount: number }[]) => moves.reduce((a, m) => a + m.amount, 0);

describe('Bewegungen: der Stand ist ihre Summe', () => {
  it('Startwert aus einem Stand ohne Bewegungen (polster-ziel): eine Bewegung „Stand eingetragen“, kein Datenverlust', () => {
    const s = toKontoSettings({ enabled: true, cushionGoal: 2000000, cushionBalance: 1400000, cushionBalanceDate: '2026-11-20', cushionConfirmed: { '2026-11': 300000 } });
    expect(s.cushionBalance).toBe(1400000);
    // polster-stand-feld: the month confirmed gets its own move, out of the start move (the sum stays the Stand)
    expect(s.cushionMoves).toEqual([
      { id: 'start', date: '2026-11-20', amount: 1100000, source: 'start' },
      { id: 'm-2026-11', date: '2026-11-20', amount: 300000, source: 'split' },
    ]);
    // stored and read again: the same, and the moves travel along
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
    expect(storedKonto(s).cushionMoves).toHaveLength(2);
  });
  it('Stand 0 oder kein Polster: keine Bewegungen', () => {
    expect(toKontoSettings({ cushionBalance: 0 }).cushionMoves).toEqual([]);
    expect(toKontoSettings({ cushionBalance: null, cushionMoves: [{ id: 'a', date: '2026-11-20', amount: 500, source: 'manual' }] }).cushionMoves).toEqual([]);
  });
  it('mit Bewegungen zählt ihre Summe (nie unter 0); ungültige fallen weg, Notiz höchstens 40 Zeichen', () => {
    const s = toKontoSettings({
      cushionBalance: 999,
      cushionMoves: [
        { id: 'a', date: '2026-11-20', amount: 500000, source: 'start' },
        { id: 'b', date: '2026-11-21', amount: -20000, source: 'manual', note: `  ${'x'.repeat(50)} ` },
        { id: 'b', date: '2026-11-21', amount: -1, source: 'manual' },
        { id: 'c', date: 'gestern', amount: 1, source: 'manual' },
        { id: 'd', date: '2026-11-21', amount: 1, source: 'irgendwas' },
      ],
    });
    expect(s.cushionMoves.map((m) => m.id)).toEqual(['a', 'b']);
    expect(s.cushionMoves[1]!.note).toHaveLength(40);
    expect(s.cushionBalance).toBe(480000);
  });
  it('„Aktueller Stand“ ändern: eine Korrektur der Differenz; leer entfernt Polster und Bewegungen', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    await setCushionBalance(db, 1500000, LATER);
    let s = await readKonto(db);
    expect(s.cushionMoves.map((m) => [m.amount, m.source, m.date])).toEqual([
      [1400000, 'start', '2026-11-24'],
      [100000, 'fix', '2026-11-26'],
    ]);
    expect(sum(s.cushionMoves)).toBe(s.cushionBalance);
    await setCushionBalance(db, null);
    s = await readKonto(db);
    expect([s.cushionBalance, s.cushionMoves]).toEqual([null, []]);
  });
});

describe('Einzahlen und Entnehmen jederzeit', () => {
  it('beliebig oft, Stand sofort, Etappen für alle Bewegungen, Rückgängig je Bewegung', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    const a = await addCushionMove(db, 50000, 'Bonus', DAY);
    expect(a).toMatchObject({ amount: 50000, stages: [] });
    const b = await addCushionMove(db, 50000, undefined, DAY);
    // 14.000 + 500 + 500 = 15.000 = 75 % des Ziels
    expect(b!.stages).toEqual([75]);
    const c = await addCushionMove(db, -30000, 'Zahnarzt', LATER);
    let s = await readKonto(db);
    expect(s.cushionBalance).toBe(1470000);
    expect(sum(s.cushionMoves)).toBe(1470000);
    expect(s.cushionMoves.filter((m) => m.source === 'manual').map((m) => [m.amount, m.note ?? null])).toEqual([
      [50000, 'Bonus'],
      [50000, null],
      [-30000, 'Zahnarzt'],
    ]);
    // ids are distinct on the same day
    expect(new Set(s.cushionMoves.map((m) => m.id)).size).toBe(s.cushionMoves.length);
    await removeCushionMove(db, c!.id);
    s = await readKonto(db);
    expect(s.cushionBalance).toBe(1500000);
    // the stage stays celebrated
    await removeCushionMove(db, b!.id);
    expect((await addCushionMove(db, 50000, undefined, DAY))!.stages).toEqual([]);
  });
  it('Entnehmen höchstens den Stand; nichts zu bewegen: null', async () => {
    const db = newDb();
    await setCushionBalance(db, 20000, DAY);
    expect(await addCushionMove(db, -50000, undefined, DAY)).toMatchObject({ amount: -20000 });
    expect((await readKonto(db)).cushionBalance).toBe(0);
    expect(await addCushionMove(db, -100, undefined, DAY)).toBeNull();
  });
  it('unabhängig vom Monat: Bestätigen bleibt je Monat einmal, eine Bewegung „split“ mit Rückgängig', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    await addCushionMove(db, 10000, undefined, DAY);
    expect(await confirmCushion(db, P2, 457800, DAY, 457800)).toEqual([75]);
    expect(await confirmCushion(db, P2, 1000, DAY)).toBeNull();
    await addCushionMove(db, 10000, undefined, DAY);
    let s = await readKonto(db);
    expect(s.cushionMoves.find((m) => m.id === `m-${P2}`)).toMatchObject({ amount: 457800, source: 'split' });
    expect(s.cushionBalance).toBe(1400000 + 10000 + 457800 + 10000);
    await undoCushion(db, P2);
    s = await readKonto(db);
    expect(s.cushionBalance).toBe(1420000);
    expect(s.cushionConfirmed[P2]).toBeUndefined();
    expect(sum(s.cushionMoves)).toBe(1420000);
  });
});

describe('Differenz nach dem Bestätigen', () => {
  it('Überschuss höher: „Differenz in den Polster“ – eine Bewegung, der Monat merkt sich den neuen Überschuss', async () => {
    const db = newDb();
    await setCushionGoal(db, 3000000);
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P2, 457800, DAY, 457800);
    expect(surplusDiff((await readKonto(db)).cushionSurplus[P2], 487800)).toBe(30000);
    const r = await settleCushionDiff(db, P2, 487800, true, DAY);
    expect(r).toMatchObject({ amount: 30000 });
    const s = await readKonto(db);
    expect([s.cushionBalance, s.cushionConfirmed[P2], s.cushionSurplus[P2]]).toEqual([1887800, 487800, 487800]);
    expect(surplusDiff(s.cushionSurplus[P2], 487800)).toBe(0);
    // „Rückgängig“ of the difference: back to the first confirmation
    await removeCushionMove(db, r!.id);
    const back = await readKonto(db);
    expect([back.cushionBalance, back.cushionConfirmed[P2], back.cushionSurplus[P2]]).toEqual([1857800, 457800, 457800]);
    // „Rückgängig“ of the month takes its differences along
    await settleCushionDiff(db, P2, 487800, true, DAY);
    await undoCushion(db, P2);
    expect((await readKonto(db)).cushionBalance).toBe(1400000);
  });
  it('Überschuss niedriger: „Differenz entnehmen“; „Passt so“: kein Geld, kein Hinweis mehr', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P2, 457800, DAY, 457800);
    await settleCushionDiff(db, P2, 407800, true, DAY);
    expect((await readKonto(db)).cushionBalance).toBe(1807800);
    await settleCushionDiff(db, P2, 300000, false, DAY);
    const s = await readKonto(db);
    expect([s.cushionBalance, s.cushionSurplus[P2]]).toEqual([1807800, 300000]);
  });
});

describe('Export und Import', () => {
  it('cushionMoves, cushionSurplus und spielgeldOverrides reisen mit; ohne sie: Startwert aus dem Stand', async () => {
    const source = newDb();
    const ds = goldenDataset();
    await source.categories.bulkPut(ds.categories);
    await source.positions.bulkPut(ds.positions);
    await setCushionBalance(source, 1400000, DAY);
    await addCushionMove(source, 25000, 'Bonus', DAY);
    await confirmCushion(source, P2, 457800, DAY, 457800);
    await setSpielgeldFor(source, P2, 50000, 'only');
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    expect(file.settings?.fixkostenkonto?.cushionMoves).toHaveLength(3);
    expect(file.settings?.fixkostenkonto?.spielgeldOverrides).toEqual({ [P2]: 50000 });

    const withFields = newDb();
    await importIntoEmpty(withFields, file);
    const a = await readKonto(withFields);
    expect([a.cushionBalance, a.cushionMoves.length, a.cushionSurplus[P2], a.spielgeldOverrides[P2]]).toEqual([1882800, 3, 457800, 50000]);

    const konto = Object.fromEntries(Object.entries(file.settings!.fixkostenkonto!).filter(([k]) => !['cushionMoves', 'cushionSurplus', 'spielgeldOverrides'].includes(k)));
    const without: BackupFile = { ...file, settings: { ...file.settings, fixkostenkonto: konto as never } };
    const withoutFields = newDb();
    await importIntoEmpty(withoutFields, parseBackup(JSON.parse(JSON.stringify(without))));
    const b = await readKonto(withoutFields);
    expect([b.cushionBalance, b.cushionMoves.map((m) => [m.amount, m.source]), b.spielgeldOverrides]).toEqual([1882800, [[1882800 - 457800, 'start'], [457800, 'split']], {}]);
  });
});

describe('Spielgeld für {Monat}: nur / ab', () => {
  const s0 = goldenSettings();
  const ds = goldenDataset();
  const limitOf = (s: typeof s0, p: string) => monthCard(ds, p, monthPlan(ds, P2, s, 25), 25).spielgeld?.limit;
  it('„Nur Dezember“: nur Dezember anders, Jänner unverändert; Überschuss und Dein Plan folgen', async () => {
    const db = newDb();
    await writeKonto(db, s0);
    // well above what is spent: ④ = the limit
    await setSpielgeldFor(db, P2, 150000, 'only');
    const s = await readKonto(db);
    expect(limitOf(s, P2)).toBe(1500);
    expect(limitOf(s, P3)).toBe(s0.spielgeld);
    const before = monthCard(ds, P2, monthPlan(ds, P2, s0, 25), 25).left!;
    const after = monthCard(ds, P2, monthPlan(ds, P2, s, 25), 25).left!;
    const spent = monthCard(ds, P2, monthPlan(ds, P2, s0, 25), 25).unplanned.total;
    expect(Math.round((before - after) * 100)).toBe(150000 - Math.round(spent * 100));
    const rows = planRows(ds, monthPlan(ds, P2, s, 25), 25);
    expect(rows.find((r) => r.period === P2)!.spielgeld).toBe(1500);
    expect(rows.find((r) => r.period === P3)!.spielgeld).toBe(s0.spielgeld);
    // back to the usual one
    await setSpielgeldFor(db, P2, null, 'only');
    expect((await readKonto(db)).spielgeldOverrides).toEqual({});
  });
  it('„Ab Jänner“: das Limit in den Einstellungen; Monate davor ab dem aktiven behalten ihres', async () => {
    const db = newDb();
    await writeKonto(db, s0);
    await setSpielgeldFor(db, P2, 50000, 'only');
    await setSpielgeldFor(db, P3, 40000, 'from', P2);
    const s = await readKonto(db);
    expect(s.spielgeld).toBe(400);
    expect(s.spielgeldOverrides).toEqual({ [P2]: 50000 });
    expect(limitOf(s, P3)).toBe(400);
    expect(limitOf(s, addPeriods(P3, 3))).toBe(400);
  });
});

describe('Polster vor Rot', () => {
  const C = (balance: number): Cushion => ({ goal: null, balance: balance * 100, rule: 'all', share: 50, confirmed: {}, milestones: [] });
  const rows = (lefts: number[]): PlanRow[] =>
    lefts.map((left, i) => ({ period: addPeriods(P2, i), estimated: false, transfer: 0, before: left, left, spielgeld: 0 }));
  it('alle Lücken gedeckt: covered; der Polster würde unter 0 fallen: short mit dem Fehlbetrag', () => {
    expect(cushionLevel(projectCushion(rows([500, -900, 200]), C(1000)))).toEqual({ kind: 'covered' });
    expect(cushionLevel(projectCushion(rows([-900, -400, 300]), C(1000)))).toEqual({ kind: 'short', period: addPeriods(P2, 1), amount: 30000 });
    expect(cushionLevel(projectCushion(rows([500, 200]), C(1000)))).toBeNull();
  });
  it('Tabellenwerte unverändert: der Polster nie unter 0', () => {
    expect(projectCushion(rows([-900, -400]), C(1000)).map((r) => [r.delta, r.balance])).toEqual([
      [-90000, 10000],
      [-10000, 0],
    ]);
  });
  it('„Polster deckt es · € X aus dem Polster“ nur, wenn der Polster davor die ganze Lücke deckt', () => {
    const proj = projectCushion(rows([-200, 0, -500]), C(600));
    const c = C(600);
    expect(bigMonthCushion(proj, addPeriods(P2, 2), c, 50000)).toBeNull();
    expect(bigMonthCushion(proj, addPeriods(P2, 2), c, 40000)).toBe(40000);
    expect(bigMonthCushion(proj, addPeriods(P2, 2), { ...c, balance: null }, 100)).toBeNull();
    expect(bigMonthCushion(proj, addPeriods(P2, 2), c, 0)).toBeNull();
  });
  it('Verlauf: neueste zuerst', () => {
    const list = movesNewestFirst([
      { id: 'a', date: '2026-11-20' },
      { id: 'b', date: '2026-11-24' },
      { id: 'c', date: '2026-11-24' },
      { id: 'd', date: '2026-11-21' },
    ]);
    expect(list.map((m) => m.id)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('cushionOf liest die Einstellungen', () => {
    expect(cushionOf(toKontoSettings({ cushionBalance: 500 })).balance).toBe(500);
  });
});
