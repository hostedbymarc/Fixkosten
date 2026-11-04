import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FixkostenDB } from '../db/db';
import { finishSetup, setAnchor, setPlan } from '../db/kontoActions';
import { readKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { activeMonth } from './activeMonth';
import { orderWindow, simulateKonto, standingOrder } from './fixkostenkonto';
import { kontoState, orderDay, planSteps, statusOf } from './kontoBalance';
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

describe('Texte: Du-Form, höchstens 12 Wörter je Satz, keine Schote', () => {
  for (const [id, text] of Object.entries(KONTO_TEXTS)) {
    it(id, () => {
      for (const s of sentences(text)) expect(wordCount(s), s).toBeLessThanOrEqual(12);
      expect(text).not.toMatch(/Schote|Erbsen?\s*=|\b1 Erbse\b/i);
      expect(text).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
    });
  }
});

describe('„Gedeckt“ nie, solange ein Plan-Punkt offen ist', () => {
  const bools = [true, false] as const;
  for (const hasAccount of [null, true, false] as const)
    for (const orderRuns of [null, true, false] as const)
      for (const accountDone of bools)
        for (const orderDone of bools)
          for (const amount of [0, 100_000]) {
            const s = toKontoSettings({
              enabled: true,
              balance: amount,
              rounding: 1,
              setupDone: true,
              hasAccount,
              orderRuns,
              anchor: { amount, at: '2026-11-03T10:00:00.000Z' },
              plan: { accountDone, orderDone, gapDone: false },
            });
            it(`Konto ${hasAccount} · läuft ${orderRuns} · erledigt ${accountDone}/${orderDone} · Stand ${amount}`, () => {
              const st = kontoState(DATA, ACTIVE, s);
              const open = st.plan.some((p) => !p.done);
              if (open) expect(st.status).not.toBe('covered');
              if (st.plan.some((p) => p.id !== 'gap' && !p.done)) expect(st.status).toBe('setup');
              expect(st.planDone).toBe(st.plan.filter((p) => p.done).length);
              expect(st.plan).toHaveLength(3);
            });
          }
  it('nicht eingerichtet: auch mit großem Kontostand nie gedeckt', () => {
    const s = toKontoSettings({ enabled: true, balance: 0, rounding: 1, setupDone: false, anchor: { amount: 99_999, at: '2026-11-03T10:00:00.000Z' } });
    expect(kontoState(DATA, ACTIVE, s).status).toBe('setup');
    expect(statusOf(false, planSteps(s, 0))).toBe('setup');
  });
});

describe('Einrichtung in beiden Antwort-Varianten (gespeichert, dann eine Wahrheit)', () => {
  it('Variante A: Kontostand 0, Dauerauftrag läuft → 2 von 3, dann „Erledigt“ und Lücke → gedeckt', async () => {
    const db = await newDb();
    await finishSetup(db, { balance: 0, hasAccount: true, orderRuns: true }, { active: ACTIVE, now: NOW });
    let st = await stateOf(db);
    // November: no further deposit (it arrived at the start of the month), Miete 1000 → −1000 …
    expect(st.overview.simulation.months[0]!.deposit).toBe(0);
    expect(st.order).toBe(1050);
    expect(st.plan.map((p) => [p.id, p.done, p.isNew])).toEqual([
      ['account', true, false],
      ['order', false, false],
      ['gap', false, false],
    ]);
    expect(st.status).toBe('setup');
    expect(st.planDone).toBe(1);
    await setPlan(db, { orderDone: true });
    st = await stateOf(db);
    expect(st.status).toBe('gap');
    // Nov −1000; Dec +50 → −950; Jan −900; Feb −1450 → gap 1450 in Februar
    expect(st.gap).toBe(1450);
    expect(st.gapMonth).toBe('2027-02');
    await setAnchor(db, st.balance + st.gap, new Date('2026-11-04T09:05:00.000Z'));
    st = await stateOf(db);
    expect(st.status).toBe('covered');
    expect(st.planDone).toBe(3);
  });

  it('Variante B: „Ich habe noch keins“, Dauerauftrag läuft nicht → Konto eröffnen und einrichten im Plan', async () => {
    const db = await newDb();
    await finishSetup(db, { balance: 0, hasAccount: false, orderRuns: false }, { active: ACTIVE, now: NOW });
    const s = await readKonto(db);
    expect(s.orderStartsAfter).toBe(ACTIVE);
    let st = kontoState(DATA, ACTIVE, s);
    expect(st.plan.map((p) => [p.id, p.done, p.isNew])).toEqual([
      ['account', false, true],
      ['order', false, true],
      ['gap', false, false],
    ]);
    expect(st.planDone).toBe(0);
    expect(st.status).toBe('setup');
    // paying the gap first does not make it „gedeckt“: account and standing order are still open
    await setAnchor(db, st.balance + st.gap, new Date('2026-11-04T09:05:00.000Z'));
    st = await stateOf(db);
    expect(st.gap).toBe(0);
    expect(st.planDone).toBe(1);
    expect(st.status).toBe('setup');
    await setPlan(db, { accountDone: true });
    expect((await stateOf(db)).status).toBe('setup');
    await setPlan(db, { orderDone: true });
    expect((await stateOf(db)).status).toBe('covered');
  });

  it('Kontostand mit Cent-Betrag: Lücke auf den Cent wie überall', async () => {
    const db = await newDb();
    await finishSetup(db, { balance: 184.21, hasAccount: true, orderRuns: false }, { active: ACTIVE, now: NOW });
    await setPlan(db, { orderDone: true });
    const st = await stateOf(db);
    // Nov 184,21 − 1000 = −815,79; Feb lowest −815,79 − 450 − … : the gap keeps the cents
    expect(st.gap).toBe(Math.round(-st.overview.simulation.lowest * 100) / 100);
    expect(Math.round(st.gap * 100) % 100).toBe(79);
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
