// polster-stand-feld: „Aktueller Stand“ shows the Stand (the sum of the moves); a new value is a move „Korrektur“
// (source fix), the history is never rewritten. The fields write only a real change. Every write of the Polster keeps
// the invariant (Stand = sum of the moves, each month confirmed exactly one move of its own) – else nothing is
// written. Invented data only.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAmount } from '../lib/format';
import { fieldWrite } from '../lib/polster';
import { FixkostenDB } from './db';
import {
  addCushionMove,
  confirmCushion,
  CushionWriteError,
  setCushionBalance,
  setCushionGoal,
  undoCushion,
} from './kontoActions';
import { cushionBroken, KONTO_KEY, readKonto, storedKonto, toKontoSettings } from './settings';

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`polster-stand-feld-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const DAY = new Date(2026, 10, 24);
const LATER = new Date(2026, 10, 26);
const P = '2026-12';
const sum = (moves: { amount: number }[]) => moves.reduce((a, m) => a + m.amount, 0);

describe('„Aktueller Stand“: eine Korrektur über die Differenz', () => {
  it('erster Stand: Startwert; danach Korrektur ± (source fix); der Verlauf bleibt', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P, 300000, DAY, 300000);
    await addCushionMove(db, 20000, 'Bonus', DAY);
    const before = (await readKonto(db)).cushionMoves;
    // the field shows the Stand: 14.000 + 3.000 + 200 = 17.200; set to 16.000 → Korrektur −1.200
    expect((await readKonto(db)).cushionBalance).toBe(1720000);
    await setCushionBalance(db, 1600000, LATER);
    const s = await readKonto(db);
    expect(s.cushionMoves.slice(0, before.length)).toEqual(before);
    expect(s.cushionMoves.at(-1)).toMatchObject({ amount: -120000, source: 'fix', date: '2026-11-26' });
    expect([s.cushionBalance, sum(s.cushionMoves)]).toEqual([1600000, 1600000]);
    // the month's confirmation is untouched
    expect(s.cushionConfirmed[P]).toBe(300000);
    await setCushionBalance(db, 1700000, LATER);
    expect((await readKonto(db)).cushionMoves.filter((m) => m.source === 'fix').map((m) => m.amount)).toEqual([-120000, 100000]);
  });
  it('gleicher Wert: nichts wird geschrieben', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    await setCushionGoal(db, 2000000);
    const raw = JSON.stringify((await db.meta.get(KONTO_KEY))!.value);
    await setCushionBalance(db, 1400000, LATER);
    await setCushionGoal(db, 2000000);
    expect(JSON.stringify((await db.meta.get(KONTO_KEY))!.value)).toBe(raw);
  });
  it('Ziel nur durch Leeren entfernt; leerer Stand entfernt den Polster', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionGoal(db, null);
    expect((await readKonto(db)).cushionGoal).toBeNull();
    await setCushionBalance(db, 500000, DAY);
    await setCushionBalance(db, null);
    expect((await readKonto(db)).cushionBalance).toBeNull();
  });
});

describe('Feld schreibt nur bei echter Änderung (fieldWrite)', () => {
  it('gleicher Wert, kein Betrag oder leer ohne Wert: nichts', () => {
    expect(fieldWrite('14.000', 1400000, parseAmount)).toEqual({ write: false });
    expect(fieldWrite('14000,00', 1400000, parseAmount)).toEqual({ write: false });
    expect(fieldWrite('abc', 1400000, parseAmount)).toEqual({ write: false });
    expect(fieldWrite('', null, parseAmount)).toEqual({ write: false });
    expect(fieldWrite('  ', null, parseAmount)).toEqual({ write: false });
  });
  it('neuer Wert oder ausdrücklich geleert: schreiben', () => {
    expect(fieldWrite('15.000', 1400000, parseAmount)).toEqual({ write: true, value: 1500000 });
    expect(fieldWrite('', 1400000, parseAmount)).toEqual({ write: true, value: null });
    expect(fieldWrite('500', null, parseAmount)).toEqual({ write: true, value: 50000 });
  });
});

describe('Invariante: Stand = Summe, jeder bestätigte Monat genau eine eigene Bewegung', () => {
  it('erfüllt nach jedem Schreiben', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P, 300000, DAY, 300000);
    await addCushionMove(db, -50000, 'Zahnarzt', DAY);
    await setCushionBalance(db, 1000000, LATER);
    expect(cushionBroken(await readKonto(db))).toBeNull();
    await undoCushion(db, P);
    expect(cushionBroken(await readKonto(db))).toBeNull();
  });
  it('erkennt Verletzungen', () => {
    const base = { cushionBalance: 100, cushionMoves: [{ id: 'start', date: '2026-11-24', amount: 100, source: 'start' as const }], cushionConfirmed: {} };
    expect(cushionBroken(base)).toBeNull();
    expect(cushionBroken({ ...base, cushionBalance: 90 })).toMatch(/sum/);
    expect(cushionBroken({ ...base, cushionConfirmed: { [P]: 50 } })).toMatch(/0 moves/);
    expect(cushionBroken({ ...base, cushionMoves: [...base.cushionMoves, { id: `m-${P}`, date: '2026-11-24', amount: 40, source: 'split' }], cushionBalance: 140, cushionConfirmed: { [P]: 50 } })).toMatch(/≠ moves/);
  });
  it('verletzt → nicht schreiben, CushionWriteError', async () => {
    const db = newDb();
    await setCushionBalance(db, 1400000, DAY);
    // a broken entry (stored by hand): the Stand is not the sum of its moves
    const raw = { ...storedKonto(await readKonto(db)), cushionBalance: 1400000, cushionMoves: [{ id: 'start', date: '2026-11-24', amount: 1400000, source: 'start' }], cushionConfirmed: { [P]: 300000 }, cushionSurplus: {} };
    // the month confirmed without its move is repaired on reading (out of the start move): still consistent
    expect(cushionBroken(toKontoSettings(raw))).toBeNull();
    // a month whose moves do not add up cannot be repaired: writing it is refused
    await db.meta.put({ key: KONTO_KEY, value: { ...raw, cushionMoves: [...raw.cushionMoves, { id: `m-${P}`, date: '2026-11-24', amount: 100, source: 'split' }] } });
    const before = JSON.stringify((await db.meta.get(KONTO_KEY))!.value);
    await expect(addCushionMove(db, 1000, undefined, DAY)).rejects.toBeInstanceOf(CushionWriteError);
    expect(JSON.stringify((await db.meta.get(KONTO_KEY))!.value)).toBe(before);
  });
});

describe('Ältere Daten: bestätigte Monate ohne eigene Bewegung', () => {
  it('bekommen ihre Bewegung aus dem Startwert, die Summe bleibt der Stand', () => {
    const s = toKontoSettings({ cushionBalance: 1700000, cushionBalanceDate: '2026-11-20', cushionConfirmed: { [P]: 300000 } });
    expect(s.cushionMoves).toEqual([
      { id: 'start', date: '2026-11-20', amount: 1400000, source: 'start' },
      { id: `m-${P}`, date: '2026-11-20', amount: 300000, source: 'split' },
    ]);
    expect(cushionBroken(s)).toBeNull();
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
  });
});
