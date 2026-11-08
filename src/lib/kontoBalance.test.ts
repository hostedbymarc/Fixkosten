import { describe, expect, it } from 'vitest';
import { DEFAULT_KONTO, toKontoSettings, type KontoSettings } from '../db/settings';
import { activeMonth } from './activeMonth';
import { dayKey, depositDone, dueCard, expectedBalance, kontoState, newMilestones, reachedMilestones, streakBadge, streakOf } from './kontoBalance';
import type { Category, Dataset, OneOff, Payment, Position } from './types';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Investieren', kind: 'savings', color: '#0F766E', sortOrder: 1 },
];
const pos = (id: string, amount: number, opts: Partial<Position> = {}, dueMonths = ALL): Position => ({
  id,
  name: id,
  categoryId: 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: dueMonths.length === 12 ? 'monthly' : 'annual', dueMonths }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  ...opts,
});
const paid = (positionId: string, period: string, amount: number, paidAt: string): Payment => ({
  id: `${positionId}-${period}`,
  positionId,
  period,
  status: 'paid',
  plannedAmount: amount,
  actualAmount: amount,
  paidAt,
});
const ds = (positions: Position[], payments: Payment[] = [], oneOffs: OneOff[] = []): Dataset => ({
  categories: CATS,
  positions,
  payments,
  oneOffs,
  monthClose: [],
  reminders: [],
  changeLog: [],
});
const settings = (patch: Partial<KontoSettings>): KontoSettings => ({ ...toKontoSettings({}), enabled: true, setupDone: true, rounding: 1, roundingOn: true, buffer: 0, ...patch });

// Miete 1000 monatlich (Fixkostenkonto), Versicherung 600 im Februar (Fixkostenkonto), ETF 300 (Alltagskonto)
// → Dauerauftrag 1000 + 50 = 1050
const MIETE = pos('miete', 1000);
const VERS = pos('vers', 600, {}, [2]);
const ETF = pos('etf', 300, { categoryId: 'va' });
const DATA = ds([MIETE, VERS, ETF]);
const ANCHOR = { amount: 500, at: '2026-11-03T10:00:00.000Z' };

describe('Erwarteter Kontostand = Anker + bestätigte Einzahlungen − abgehakte Positionen seit dem Anker', () => {
  it('ohne Anker (Daten aus PR #39): der gespeicherte Kontostand, unverändert', () => {
    expect(expectedBalance(DATA, settings({ balance: 1234.56 }))).toBe(1234.56);
  });

  it('nur der Anker', () => {
    expect(expectedBalance(DATA, settings({ anchor: ANCHOR }))).toBe(500);
  });

  it('bestätigte Einzahlung nach dem Anker zählt mit dem Dauerauftrag ihres Monats, vorher nicht', () => {
    const s = settings({
      anchor: ANCHOR,
      checks: [
        { period: '2026-11', deposited: true, answeredAt: '2026-11-03T09:00:00.000Z' }, // before: already in the anchor
        { period: '2026-12', deposited: true, answeredAt: '2026-12-01T08:00:00.000Z' },
        { period: '2027-01', deposited: false, answeredAt: '2027-01-01T08:00:00.000Z' }, // „Noch nicht“: no money
      ],
    });
    expect(expectedBalance(DATA, s)).toBe(500 + 1050);
  });

  it('abgehakte Fixkostenkonto-Positionen nach dem Anker ziehen ab; Alltagskonto und Abhaken vor dem Anker nicht', () => {
    const d = ds(
      [MIETE, VERS, ETF],
      [
        paid('miete', '2026-11', 1000, '2026-11-02T08:00:00.000Z'), // before the anchor
        paid('miete', '2026-12', 1000, '2026-12-02T08:00:00.000Z'),
        paid('etf', '2026-12', 300, '2026-12-02T08:00:00.000Z'), // Alltagskonto
        { ...paid('vers', '2027-02', 600, '2027-02-02T08:00:00.000Z'), status: 'skipped' },
      ],
    );
    expect(expectedBalance(d, settings({ anchor: ANCHOR }))).toBe(500 - 1000);
  });

  it('Einmalbeträge auf dem Fixkostenkonto: abgehakt nach dem Anker zählt, offen nicht', () => {
    const d = ds(
      [MIETE],
      [],
      [
        { id: 'o1', positionId: 'miete', period: '2026-12', amount: 80, label: 'Nachzahlung', paidAt: '2026-12-05T08:00:00.000Z' },
        { id: 'o2', positionId: 'miete', period: '2026-12', amount: 40, label: 'offen' },
      ],
    );
    expect(expectedBalance(d, settings({ anchor: ANCHOR }))).toBe(420);
  });

  it('neuer Anker mitten im Monat: alles davor ist im neuen Betrag, nur Späteres zählt', () => {
    const d = ds([MIETE], [paid('miete', '2026-12', 1000, '2026-12-02T08:00:00.000Z'), paid('miete', '2027-01', 1000, '2027-01-20T08:00:00.000Z')]);
    const checks = [
      { period: '2026-12', deposited: true, answeredAt: '2026-12-01T08:00:00.000Z' },
      { period: '2027-01', deposited: true, answeredAt: '2027-01-01T08:00:00.000Z' },
    ];
    // „Anderer Betrag“ on 15 January: € 700
    const s = settings({ anchor: { amount: 700, at: '2027-01-15T12:00:00.000Z' }, checks });
    expect(expectedBalance(d, s)).toBe(700 - 1000);
  });

  it('Monatsbeginn am 25.: Check und Abhaken des Dezembers ab dem 25. November zählen ab dem Anker', () => {
    const today = new Date(2026, 10, 26); // 26 Nov → active month December
    expect(activeMonth(today, 25)).toBe('2026-12');
    const d = ds([MIETE], [paid('miete', '2026-12', 1000, '2026-11-26T09:00:00.000Z')]);
    const s = settings({
      anchor: { amount: 200, at: '2026-11-25T18:00:00.000Z' },
      checks: [{ period: '2026-12', deposited: true, answeredAt: '2026-11-26T08:00:00.000Z' }],
    });
    expect(expectedBalance(d, s)).toBe(200 + 1000 - 1000);
    expect(depositDone(s, '2026-12')).toBe(true);
  });
});

describe('Status aus den gespeicherten Daten', () => {
  it('nicht eingerichtet', () => {
    const st = kontoState(DATA, '2026-11', settings({ setupDone: false }));
    expect(st.status).toBe('setup');
  });
  it('Lücke → „Zur Seite gelegt“ (neuer Anker = Stand + Lücke) → gedeckt', () => {
    const s = settings({ anchor: { amount: 0, at: ANCHOR.at } });
    const before = kontoState(DATA, '2026-11', s);
    // a gap, spread over the deposits until February (verteilt, where possible)
    expect(before.status).toBe('spread');
    // Nov: +1050 − 1000 = 50; Dec 100; Jan 150; Feb 200 − 600 = −400 → gap 400, in February
    expect(before.gap).toBe(400);
    expect(before.gapMonth).toBe('2027-02');
    const after = kontoState(DATA, '2026-11', settings({ anchor: { amount: before.balance + before.gap, at: '2026-11-03T11:00:00.000Z' } }));
    expect(after.status).toBe('covered');
    expect(after.gap).toBe(0);
    expect(after.coveredUntil).toBe('2027-10');
  });
  it('Dauerauftrag diesen Monat bestätigt: keine zweite Einzahlung im aktiven Monat', () => {
    const s = settings({ anchor: { amount: 1050, at: ANCHOR.at }, checks: [{ period: '2026-11', deposited: true, answeredAt: '2026-11-03T09:00:00.000Z' }] });
    expect(kontoState(DATA, '2026-11', s).overview.simulation.months[0]!.deposit).toBe(0);
  });
  it('„Ich habe noch keinen“: diesen Monat kommt keine Einzahlung', () => {
    const s = settings({ anchor: { amount: 0, at: ANCHOR.at }, orderStartsAfter: '2026-11' });
    expect(kontoState(DATA, '2026-11', s).overview.simulation.months[0]!.deposit).toBe(0);
  });
  it('Daten aus PR #39 (Kontostand, kein Anker) rechnen wie vorher', () => {
    const old = toKontoSettings({ enabled: true, inviteDismissed: false, balance: 300, receivedFor: '2026-11', rounding: 1, buffer: 0 });
    const st = kontoState(DATA, '2026-11', old);
    expect(old.setupDone).toBe(true);
    expect(st.balance).toBe(300);
    expect(st.overview.simulation.months[0]!.deposit).toBe(0);
  });
});

const check = (period: string, deposited = true) => ({ period, deposited, answeredAt: `${period}-01T08:00:00.000Z` });

describe('Serie (abgeleitet aus den Checks)', () => {
  it('4 Monate in Folge bis zum aktiven Monat', () => {
    const s = streakOf(
      ['2026-08', '2026-09', '2026-10', '2026-11'].map((p) => check(p)),
      '2026-11',
    );
    expect(s).toEqual({ current: 4, best: 4, broken: false });
    expect(streakBadge(s)).toBe(4);
  });
  it('aktiver Monat noch offen: zählt bis zum Vormonat', () => {
    expect(streakOf([check('2026-09'), check('2026-10')], '2026-11').current).toBe(2);
  });
  it('verpasste Bestätigung beendet die Serie ohne Tadel: „Neue Serie startet.“', () => {
    const s = streakOf([check('2026-07'), check('2026-08'), check('2026-09'), check('2026-10', false), check('2026-11')], '2026-11');
    expect(s).toEqual({ current: 1, best: 3, broken: true });
    expect(streakBadge(s)).toBe('new');
  });
  it('ein Monat ohne Vorgeschichte: kein Abzeichen', () => {
    expect(streakBadge(streakOf([check('2026-11')], '2026-11'))).toBeNull();
  });
  it('keine Checks', () => {
    expect(streakOf([], '2026-11')).toEqual({ current: 0, best: 0, broken: false });
  });
});

describe('Meilensteine', () => {
  it('zum ersten Mal alles gedeckt, 3 und 6 Monate in Folge, ein Jahr', () => {
    const run = (n: number) =>
      streakOf(
        Array.from({ length: n }, (_, i) => check(`2026-${String(i + 1).padStart(2, '0')}`)),
        '2026-12',
      );
    const confirmed = { milestonesShown: [], checks: [check('2026-10')] };
    expect(reachedMilestones(confirmed, 'spread', run(2))).toEqual([]);
    expect(reachedMilestones(confirmed, 'covered', run(3))).toEqual(['firstPod', 'streak3']);
    expect(reachedMilestones(confirmed, 'setup', run(6))).toEqual(['streak3', 'streak6']);
    const year = streakOf(
      Array.from({ length: 12 }, (_, i) => check(`2026-${String(i + 1).padStart(2, '0')}`)),
      '2026-12',
    );
    expect(reachedMilestones(confirmed, 'lump', year)).toEqual(['streak3', 'streak6', 'year']);
  });
  it('einmal gezeigt bleibt es (auch wenn später etwas fehlt), Toast nur einmal', () => {
    const none = streakOf([], '2026-11');
    const checks = [check('2026-10')];
    expect(reachedMilestones({ milestonesShown: ['firstPod'], checks }, 'spread', none)).toEqual(['firstPod']);
    expect(newMilestones({ milestonesShown: ['firstPod'], checks }, 'covered', none)).toEqual([]);
    expect(newMilestones({ milestonesShown: [], checks }, 'covered', none)).toEqual(['firstPod']);
    // covered, but no month confirmed yet: not yet
    expect(newMilestones({ milestonesShown: [], checks: [] }, 'covered', none)).toEqual([]);
  });
});

describe('Monats-Check: welche Karte', () => {
  const base = settings({ anchor: { amount: 0, at: '2026-11-03T10:00:00.000Z' } });
  const nov4 = new Date(2026, 10, 4, 9);
  it('nicht eingerichtet oder Modus aus: keine Karte', () => {
    expect(dueCard({ ...base, setupDone: false }, '2026-11', nov4, { setUpThisSession: false })).toBeNull();
    expect(dueCard({ ...base, enabled: false }, '2026-11', nov4, { setUpThisSession: false })).toBeNull();
  });
  it('Monat nicht bestätigt → „Neuer Monat…“; bestätigt → keine', () => {
    expect(dueCard(base, '2026-11', nov4, { setUpThisSession: false })).toBe('month');
    expect(dueCard({ ...base, checks: [check('2026-11')] }, '2026-11', nov4, { setUpThisSession: false })).toBeNull();
  });
  it('„Noch nicht“ fragt erst am nächsten Tag wieder (höchstens einmal pro Tag)', () => {
    const snoozed = { ...base, snoozedOn: dayKey(nov4), checks: [check('2026-11', false)] };
    expect(dueCard(snoozed, '2026-11', new Date(2026, 10, 4, 22), { setUpThisSession: false })).toBeNull();
    expect(dueCard(snoozed, '2026-11', new Date(2026, 10, 5, 7), { setUpThisSession: false })).toBe('month');
  });
  it('simulierter Monatswechsel: im Dezember fragt die Karte wieder', () => {
    const s = { ...base, checks: [check('2026-11')] };
    expect(dueCard(s, '2026-11', nov4, { setUpThisSession: false })).toBeNull();
    expect(dueCard(s, '2026-12', new Date(2026, 11, 1, 8), { setUpThisSession: false })).toBe('month');
  });
  it('alle 3 Monate: „Stimmt dein Kontostand noch?“', () => {
    const s = { ...base, checks: [check('2027-02')] };
    expect(dueCard(s, '2027-01', new Date(2027, 0, 20), { setUpThisSession: false })).toBe('month');
    expect(dueCard({ ...s, checks: [check('2027-01')] }, '2027-01', new Date(2027, 0, 20), { setUpThisSession: false })).toBeNull();
    expect(dueCard({ ...s, checks: [check('2027-02')] }, '2027-02', new Date(2027, 1, 3), { setUpThisSession: false })).toBe('balance');
    expect(
      dueCard({ ...s, checks: [check('2027-02')], balanceCheckedOn: '2027-02-03' }, '2027-02', new Date(2027, 1, 3), { setUpThisSession: false }),
    ).toBeNull();
  });
  it('„Weiß ich gerade nicht“: Erinnerung beim nächsten Öffnen, nicht gleich nach der Einrichtung', () => {
    const s = { ...base, balanceUnknown: true };
    expect(dueCard(s, '2026-11', nov4, { setUpThisSession: true })).toBe('month');
    expect(dueCard(s, '2026-11', nov4, { setUpThisSession: false })).toBe('remind');
  });
});

describe('Einstellungen: alte Einträge, Export → Import', () => {
  it('alter Eintrag ohne die neuen Felder wird korrekt gelesen', () => {
    const old = { enabled: true, inviteDismissed: true, balance: 0, receivedFor: '2026-10', rounding: 10 };
    // a stored rounding counts as „Monatsbetrag runden“ on; the buffer is € 100 for existing setups too
    expect(toKontoSettings(old)).toEqual({ ...DEFAULT_KONTO, ...old, roundingOn: true, buffer: 100, setupDone: false });
    expect(toKontoSettings({ ...old, balance: 80 }).setupDone).toBe(true);
  });
  it('toKontoSettings ist idempotent (Export → Import ergibt dieselben Einstellungen)', () => {
    const full = toKontoSettings({
      enabled: true,
      balance: 12.5,
      anchor: { amount: 12.5, at: '2026-11-03T10:00:00.000Z' },
      hasAccount: false,
      setupSteps: 3,
      setupDone: true,
      balanceUnknown: true,
      checks: [check('2026-12'), check('2026-11', false), { period: '2026-12', deposited: false, answeredAt: '2026-12-02T08:00:00.000Z' }],
      snoozedOn: '2026-11-04',
      balanceCheckedOn: '2026-11-03',
      orderStartsAfter: '2026-11',
      plan: { accountDone: true, orderDone: true, gapDone: false },
      milestonesShown: ['firstPod', 'firstPod', 'nope'],
    });
    expect(full.checks.map((c) => [c.period, c.deposited])).toEqual([
      ['2026-11', false],
      ['2026-12', false], // one per month, the last answer wins
    ]);
    expect(full.milestonesShown).toEqual(['firstPod']);
    expect(toKontoSettings(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });
});
