import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FixkostenDB } from '../db/db';
import { answerMonthCheck, confirmLump, finishSetup, setGapMode } from '../db/kontoActions';
import { readKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { activeMonth } from './activeMonth';
import { orderWindow, simulateKonto, standingOrder } from './fixkostenkonto';
import { kontoState, lastDayBefore, orderDay, periodStartDate } from './kontoBalance';
import { KONTO_TEXTS, sentences, wordCount } from './kontoTexts';
import type { Category, Dataset, Position } from './types';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [{ id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 }];
const pos = (id: string, amount: number, dueMonths = ALL): Position => ({
  id,
  name: id,
  categoryId: 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: dueMonths.length === 12 ? 'monthly' : 'annual', dueMonths }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
});
const ds = (positions: Position[]): Dataset => ({ categories: CATS, positions, payments: [], oneOffs: [], monthClose: [], reminders: [], changeLog: [] });
// Miete 1000 monatlich, Versicherung 600 im Februar → Dauerauftrag 1050 (Rundung 1)
const DATA = ds([pos('miete', 1000), pos('vers', 600, [2])]);
const ACTIVE = '2026-11';
const NOW = new Date('2026-11-04T09:00:00.000Z');

const opened: FixkostenDB[] = [];
async function newDb(patch: Partial<KontoSettings> = {}): Promise<FixkostenDB> {
  const db = new FixkostenDB(`konto-${crypto.randomUUID()}`);
  opened.push(db);
  await db.meta.put({ key: 'fixkostenkonto', value: { enabled: true, inviteDismissed: false, balance: 0, receivedFor: null, rounding: 1, ...patch } });
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
});
const stateOf = async (db: FixkostenDB) => kontoState(DATA, ACTIVE, await readKonto(db));

describe('Texte: Du-Form, höchstens 12 Wörter je Satz, keine Schote, „zur Seite legen“ statt „einzahlen“', () => {
  for (const [id, text] of Object.entries(KONTO_TEXTS)) {
    it(id, () => {
      for (const s of sentences(text)) expect(wordCount(s), s).toBeLessThanOrEqual(12);
      expect(text).not.toMatch(/Schote|Erbsen?\s*=|\b1 Erbse\b/i);
      expect(text).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
      expect(text).not.toMatch(/einzahlen|eingezahlt|gedeckt|Fixkostenkonto eröffnen/i);
    });
  }
});

describe('Status aus dem Modell: gedeckt nur ohne Lücke, verteilt nur wenn möglich', () => {
  for (const hasAccount of [null, true, false] as const)
    for (const gapMode of [null, 'spread', 'lump'] as const)
      for (const amount of [0, 1000, 100_000]) {
        const s = toKontoSettings({
          enabled: true,
          balance: amount,
          rounding: 1,
          setupDone: true,
          hasAccount,
          gapMode,
          receivedFor: ACTIVE,
          anchor: { amount, at: '2026-11-03T10:00:00.000Z' },
        });
        it(`Konto ${hasAccount} · Lücke ${gapMode} · Stand ${amount}`, () => {
          const st = kontoState(DATA, ACTIVE, s);
          if (st.gap <= 0) expect(st.status).toBe('covered');
          else if (st.canSpread && gapMode !== 'lump') expect(st.status).toBe('spread');
          else expect(st.status).toBe('lump');
          // with the plan never below 0
          for (const m of st.planSimulation.months) expect(Math.round(m.end * 100)).toBeGreaterThanOrEqual(0);
        });
      }
  it('nicht eingerichtet: auch mit großem Kontostand nie gedeckt', () => {
    const s = toKontoSettings({ enabled: true, balance: 0, rounding: 1, setupDone: false, anchor: { amount: 99_999, at: '2026-11-03T10:00:00.000Z' } });
    expect(kontoState(DATA, ACTIVE, s).status).toBe('setup');
  });
});

describe('Einrichtung in beiden Varianten (mit und ohne eigenes Konto; gespeichert, dann eine Wahrheit)', () => {
  it('mit Konto, Stand 0, Dauerauftrag läuft: diesen Monat schon drin; die Miete fehlt sofort → automatisch auf einmal', async () => {
    const db = await newDb();
    await finishSetup(db, { hasAccount: true, balance: 0, orderRuns: true }, { active: ACTIVE, now: NOW });
    const s = await readKonto(db);
    expect(s.receivedFor).toBe(ACTIVE);
    expect(s.orderStartsAfter).toBeNull();
    // the deposit of this month is in the amount set aside: none is asked
    expect(s.checks).toEqual([]);
    let st = await stateOf(db);
    expect(st.overview.simulation.months[0]!.deposit).toBe(0);
    expect(st.order).toBe(1050);
    expect(st.hasAccount).toBe(true);
    // Nov −1000 (first below 0 already now: no deposit left before it); lowest Feb −1450
    expect(st.gapFrom).toBe(ACTIVE);
    expect(st.canSpread).toBe(false);
    expect(st.status).toBe('lump');
    expect(st.gap).toBe(1450);
    await confirmLump(db, st.balance, st.lump, new Date('2026-11-04T09:05:00.000Z'));
    st = await stateOf(db);
    expect(st.status).toBe('covered');
  });

  it('mit Konto, Dauerauftrag läuft nicht: auch dann zählt dieser Monat als zur Seite gelegt', async () => {
    const db = await newDb();
    await finishSetup(db, { hasAccount: true, balance: 500, orderRuns: false }, { active: ACTIVE, now: NOW });
    const s = await readKonto(db);
    expect(s.orderRuns).toBe(false);
    expect(s.receivedFor).toBe(ACTIVE);
    expect(kontoState(DATA, ACTIVE, s).overview.simulation.months[0]!.deposit).toBe(0);
  });

  it('ohne Konto, € 1.000: Lücke im Februar, verteilt auf Dez, Jän, Feb; „Lieber auf einmal?“ und zurück', async () => {
    const db = await newDb();
    await finishSetup(db, { hasAccount: false, balance: 1000, orderRuns: null }, { active: ACTIVE, now: NOW });
    let st = await stateOf(db);
    expect(st.hasAccount).toBe(false);
    // Nov 0, Dec 50, Jan 100, Feb 150 − 600 = −450
    expect(st.gap).toBe(450);
    expect(st.gapFrom).toBe('2027-02');
    expect(st.deposits).toBe(3);
    expect(st.status).toBe('spread');
    expect(st.extra).toBe(150);
    await setGapMode(db, 'lump');
    st = await stateOf(db);
    expect(st.status).toBe('lump');
    expect(st.lump).toBe(450);
    await setGapMode(db, 'spread');
    expect((await stateOf(db)).status).toBe('spread');
  });

  it('Monats-Check „Ja“ speichert den Betrag des Monats; der Stand wächst genau darum', async () => {
    const db = await newDb();
    await finishSetup(db, { hasAccount: false, balance: 1000, orderRuns: null }, { active: ACTIVE, now: NOW });
    await answerMonthCheck(db, '2026-12', true, new Date('2026-12-01T09:00:00.000Z'), 1200);
    const s = await readKonto(db);
    expect(s.checks).toEqual([{ period: '2026-12', deposited: true, answeredAt: '2026-12-01T09:00:00.000Z', amount: 1200 }]);
    expect(kontoState(DATA, '2026-12', s).balance).toBe(2200);
  });

  it('Betrag mit Cent: Lücke auf den Cent wie überall', async () => {
    const db = await newDb();
    await finishSetup(db, { hasAccount: true, balance: 184.21, orderRuns: false }, { active: ACTIVE, now: NOW });
    const st = await stateOf(db);
    expect(st.gap).toBe(Math.round(-st.overview.simulation.lowest * 100) / 100);
    expect(Math.round(st.gap * 100) % 100).toBe(79);
  });
});

describe('Lücke: „Leg bis {Datum} einmalig € Y zur Seite.“', () => {
  // Strom 100 monthly, Versicherung 1200 in March → monthly amount 200; with 100 set aside and the
  // deposit of November already in: Nov 0, Dec +100, Jan +200, Feb +300, Mar −700 (first minus),
  // Apr −600 … the lowest is March, but take a later, deeper one: Kfz 900 in May
  const D2 = ds([pos('strom', 100), pos('vers', 1200, [3]), pos('kfz', 900, [5])]);
  const settings = (patch: Partial<KontoSettings> = {}) =>
    toKontoSettings({
      enabled: true,
      balance: 0,
      rounding: 1,
      setupDone: true,
      hasAccount: true,
      orderRuns: true,
      receivedFor: ACTIVE,
      plan: { accountDone: false, orderDone: true, gapDone: false },
      anchor: { amount: 0, at: '2026-11-03T10:00:00.000Z' },
      ...patch,
    });

  it('erster Minus-Monat und tiefster Monat sind verschieden: Datum vom ersten, Betrag vom tiefsten', () => {
    const st = kontoState(D2, ACTIVE, settings());
    const months = st.overview.simulation.months;
    const firstMinus = months.find((m) => Math.round(m.end * 100) < 0)!;
    expect(st.gapFrom).toBe(firstMinus.period);
    expect(st.gapMonth).toBe(st.overview.simulation.lowestPeriod);
    expect(st.gapFrom).not.toBe(st.gapMonth);
    expect(st.gapFrom! < st.gapMonth!).toBe(true);
    // amount = the lowest balance, not the first minus
    expect(st.gap).toBe(Math.round(-st.overview.simulation.lowest * 100) / 100);
    expect(st.gap).toBeGreaterThan(-firstMinus.end);
    // date = last day before the first minus month begins (start day 1: last day of the month before)
    const by = st.gapBy!;
    const [y, m] = st.gapFrom!.split('-').map(Number) as [number, number];
    expect([by.getFullYear(), by.getMonth() + 1, by.getDate()]).toEqual([m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, new Date(y, m - 1, 0).getDate()]);
  });

  it('mit „Neuer Monat beginnt am 25.“: das Datum ist der 24. des Vormonats', () => {
    const st = kontoState(D2, ACTIVE, settings(), 25);
    const [y, m] = st.gapFrom!.split('-').map(Number) as [number, number];
    expect(st.gapBy).toEqual(new Date(y, m - 2, 24));
  });

  it('periodStartDate / lastDayBefore: Tag 1, 25, Monatsletzter, Jahreswechsel', () => {
    expect(periodStartDate('2027-02', 1)).toEqual(new Date(2027, 1, 1));
    expect(lastDayBefore('2027-02', 1)).toEqual(new Date(2027, 0, 31));
    expect(periodStartDate('2027-02', 25)).toEqual(new Date(2027, 0, 25));
    expect(lastDayBefore('2027-02', 25)).toEqual(new Date(2027, 0, 24));
    expect(periodStartDate('2027-03', 'last')).toEqual(new Date(2027, 1, 28));
    expect(lastDayBefore('2027-01', 15)).toEqual(new Date(2026, 11, 14));
    // the same rule as activeMonth: from the start day on, the period is active
    for (const start of [1, 15, 25, 28, 'last'] as const) {
      const d = periodStartDate('2027-04', start);
      expect(activeMonth(d, start)).toBe('2027-04');
      expect(activeMonth(lastDayBefore('2027-04', start), start)).toBe('2027-03');
    }
  });

  it('keine Lücke: kein Datum, kein Monat', () => {
    const st = kontoState(D2, ACTIVE, settings({ anchor: { amount: 5000, at: '2026-11-03T10:00:00.000Z' } }));
    expect(st.gap).toBe(0);
    expect(st.gapFrom).toBeNull();
    expect(st.gapBy).toBeNull();
    expect(st.status).toBe('covered');
  });
});

describe('Datum: Tag aus „Neuer Monat beginnt am“', () => {
  it('Text: am 1., am 25., am Monatsletzten', () => {
    expect(orderDay(1)).toBe('am 1.');
    expect(orderDay(25)).toBe('am 25.');
    expect(orderDay('last')).toBe('am Monatsletzten');
  });

  it('Beginn am 25.: ab dem 25. November ist Dezember aktiv, die Einzahlung vom 25. ist die erste des Dezembers', () => {
    expect(activeMonth(new Date(2026, 10, 24), 25)).toBe('2026-11');
    expect(activeMonth(new Date(2026, 10, 25), 25)).toBe('2026-12');
    // the window and the simulation run on months (periods), not on calendar days: same numbers for every start day
    const fromNov = standingOrder(DATA, '2026-11', 1);
    expect(orderWindow('2026-12')[0]).toBe('2027-01');
    const sim = simulateKonto(DATA, '2026-12', { balance: 0, receivedThisMonth: false, deposit: fromNov.amount });
    expect(sim.months[0]).toMatchObject({ period: '2026-12', deposit: 1050, debits: 1000, end: 50 });
  });

  it('Monatsletzter im Februar: der 28. ist der Beginn', () => {
    expect(activeMonth(new Date(2027, 1, 27), 'last')).toBe('2027-02');
    expect(activeMonth(new Date(2027, 1, 28), 'last')).toBe('2027-03');
  });
});
