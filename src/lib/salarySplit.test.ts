// ruecklage-spielgeld: Gehalts-Aufteilung, Hero-Quellen, Empfehlung. Rebuilt data (no real data), shaped
// like the user's month: Gehalt € 8.302, Rücklage-Monatsbetrag € 2.909, Lebensmittel € 450 from the salary,
// Vermögensaufbau € 1.283, Spielgeld € 1.209, two one-time payments of € 3.028,45 from the Spielgeld.
import { describe, expect, it } from 'vitest';
import { DEFAULT_KONTO, storedKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { upgradePositionV5 } from '../db/migrations';
import { costSources, monthFigures } from './calc';
import { kontoState } from './kontoBalance';
import { lastSalary, nextSalarySplit, salarySplit } from './salarySplit';
import type { Account, Category, Dataset, Position } from './types';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Vermögensaufbau', kind: 'savings', color: '#5B5BD6', sortOrder: 1 },
];
const pos = (id: string, amount: number, opts: { months?: number[]; account?: Account; cat?: string; once?: string } = {}): Position => ({
  id,
  name: id,
  categoryId: opts.cat ?? 'fix',
  history: [
    opts.once
      ? { validFrom: opts.once.slice(0, 7), amount, frequency: 'once', dueMonths: [Number(opts.once.slice(5, 7))], dueDate: opts.once }
      : { validFrom: '2026-01', amount, frequency: (opts.months ?? ALL).length === 12 ? 'monthly' : 'annual', dueMonths: opts.months ?? ALL },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  ...(opts.account ? { account: opts.account } : {}),
});
const NOV = '2026-11';
const POSITIONS = [
  pos('Miete', 2500),
  pos('Versicherung', 4908, { months: [2] }),
  pos('Lebensmittel', 450, { account: 'girokonto' }),
  pos('ETF', 1283, { cat: 'va' }),
  pos('Urlaub', 1800, { account: 'spielgeld', once: '2026-11-20' }),
  pos('Konzert', 1228.45, { account: 'spielgeld', once: '2026-11-25' }),
];
const DATA: Dataset = {
  categories: CATS,
  positions: POSITIONS,
  payments: [],
  oneOffs: [],
  monthClose: [{ period: NOV, netSalary: 8302, updatedAt: '2026-11-01T00:00:00.000Z' }],
  reminders: [],
  changeLog: [],
};
const settings = (balance: number, patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance,
    rounding: 5,
    roundingOn: false,
    setupDone: true,
    hasAccount: true,
    receivedFor: NOV,
    gapMode: 'lump',
    anchor: { amount: balance, at: '2026-11-01T08:00:00.000Z' },
    spielgeld: 1209,
    ...patch,
  });
// the balance today that leaves a gap of exactly € 990,43 (the gap shrinks one to one with the balance)
const BALANCE = Math.round((kontoState(DATA, NOV, settings(0)).gap - 990.43) * 100) / 100;
const state = (patch: Partial<KontoSettings> = {}) => kontoState(DATA, NOV, settings(BALANCE, patch));

describe('Daten wie deine: Grundbetrag und Lücke', () => {
  it('Rücklage-Monatsbetrag € 2.909, auf einmal € 990,43', () => {
    const st = state();
    expect(st.order).toBe(2909);
    expect(st.mode).toBe('lump');
    expect(st.lump).toBe(990.43);
  });
});

describe('Gehalts-Aufteilung', () => {
  it('Spielgeld = geplanter Betrag; nicht eingeplante Käufe zählen nicht: Überschuss € 2.451', () => {
    const s = settings(BALANCE);
    const split = salarySplit(DATA, NOV, kontoState(DATA, NOV, s), s);
    expect(split).toMatchObject({ salary: 8302, reserve: 2909, direct: 450, wealth: 1283, spielgeld: 1209, rest: 2451 });
    expect(split.directItems.map((i) => i.name)).toEqual(['Lebensmittel']);
    expect(Object.keys(split)).not.toContain('overflow');
  });

  it('gespeicherte Überzug-Antworten werden nicht mehr gelesen', () => {
    const a = settings(BALANCE, { spielgeldOverflow: { [NOV]: 'other' } });
    const b = settings(BALANCE, { spielgeldOverflow: { [NOV]: { mode: 'part', otherAmount: 800 } } });
    expect(salarySplit(DATA, NOV, kontoState(DATA, NOV, a), a).rest).toBe(2451);
    expect(salarySplit(DATA, NOV, kontoState(DATA, NOV, b), b).rest).toBe(2451);
  });

  it('ohne Spielgeld: keine Zeile, „Bleibt dir“', () => {
    const s = settings(BALANCE, { spielgeld: null });
    const split = salarySplit(DATA, NOV, kontoState(DATA, NOV, s), s);
    expect(split.spielgeld).toBeNull();
    expect(split.rest).toBe(8302 - 2909 - 450 - 1283);
  });

  it('verteilt: Zur Seite legen inkl. Extra', () => {
    // this month not set aside yet: its amount carries the extra
    const s = settings(BALANCE - 3500, { gapMode: 'spread', receivedFor: null, spielgeldOverflow: { [NOV]: 'other' } });
    const st = kontoState(DATA, NOV, s);
    expect(st.mode).toBe('spread');
    const split = salarySplit(DATA, NOV, st, s);
    expect(split.reserve).toBe(st.months[0]!.amount);
    expect(st.months[0]!.extra).toBeGreaterThan(0);
    expect(split.reserve).toBe(Math.round((2909 + st.extra) * 100) / 100);
  });

  it('ohne Gehalt: kein Überschuss', () => {
    const ds = { ...DATA, monthClose: [] };
    const s = settings(BALANCE);
    expect(salarySplit(ds, NOV, kontoState(ds, NOV, s), s).rest).toBeNull();
  });
});

describe('Hero: Fixkosten nach Quelle', () => {
  it('Rücklage + Direkt bezahlt = Fixkosten-Summe; nicht eingeplant ist in keiner Quelle', () => {
    const src = costSources(DATA, NOV);
    expect(src).toEqual({ reserve: 2500, salary: 450 });
    expect(Math.round((src.reserve + src.salary) * 100)).toBe(Math.round(monthFigures(DATA, NOV).total * 100));
  });
  it('auch mit Einmalbetrag ohne Position und Vermögensaufbau daneben', () => {
    const ds = { ...DATA, oneOffs: [{ id: 'o', period: NOV, amount: 37.5, label: 'Nachzahlung' }] };
    const src = costSources(ds, NOV);
    expect(src.salary).toBe(487.5);
    expect(Math.round((src.reserve + src.salary) * 100)).toBe(Math.round(monthFigures(ds, NOV).total * 100));
  });
});

describe('Alte Überzug-Antworten bleiben gespeichert (nur additiv)', () => {
  it('alte Werte „surplus“/„other“ werden weiter gelesen; der Teilbetrag ist additiv gespeichert', () => {
    const s = toKontoSettings({ spielgeldOverflow: { '2026-10': 'other', '2026-11': 'surplus', '2026-12': { mode: 'part', otherAmount: 800.555 }, '2027-01': { mode: 'part' }, '2027-02': { mode: 'quatsch' } } });
    expect(s.spielgeldOverflow).toEqual({ '2026-10': 'other', '2026-11': 'surplus', '2026-12': { mode: 'part', otherAmount: 800.56 } });
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
    expect(storedKonto(s).spielgeldOverflow).toEqual({ '2026-10': 'other', '2026-11': 'surplus', '2026-12': { mode: 'part', otherAmount: 800.56 } });
  });
});

describe('Rücklage-Rechnung zählt nur fixkostenkonto', () => {
  it('direkt bezahlte und nicht eingeplante Positionen ändern den Monatsbetrag nicht', () => {
    const only = { ...DATA, positions: POSITIONS.filter((p) => ['Miete', 'Versicherung'].includes(p.id)) };
    expect(kontoState(only, NOV, settings(BALANCE)).order).toBe(state().order);
  });
});

describe('Speichern und Import: nur additiv', () => {
  it('bestehende account-Werte bleiben, spielgeld bleibt erhalten, fehlende bekommen den Standard', () => {
    const kinds = (id: string) => CATS.find((c) => c.id === id)?.kind;
    expect(upgradePositionV5({ categoryId: 'fix', account: 'girokonto' }, kinds).account).toBe('girokonto');
    expect(upgradePositionV5({ categoryId: 'fix', account: 'fixkostenkonto' }, kinds).account).toBe('fixkostenkonto');
    expect(upgradePositionV5({ categoryId: 'fix', account: 'spielgeld' }, kinds).account).toBe('spielgeld');
    expect(upgradePositionV5({ categoryId: 'va' }, kinds).account).toBe('girokonto');
    expect(upgradePositionV5({ categoryId: 'fix', account: 'quatsch' }, kinds).account).toBe('fixkostenkonto');
  });
  it('Einstellungen ohne neue Felder (alter Export): Spielgeld aus, kein Überzug', () => {
    const old = toKontoSettings({ enabled: true, balance: 300, receivedFor: null, rounding: 5 });
    expect(old.spielgeld).toBeNull();
    expect(old.spielgeldOverflow).toEqual({});
    expect('spielgeld' in storedKonto(old)).toBe(false);
    expect('spielgeldOverflow' in storedKonto(old)).toBe(false);
    expect(DEFAULT_KONTO.spielgeld).toBeNull();
  });
  it('Roundtrip mit Spielgeld und Antworten; ungültige Werte fallen weg', () => {
    const s = settings(100, { spielgeld: 1209.5, spielgeldOverflow: { [NOV]: 'other', '2026-12': 'surplus' } });
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
    const bad = toKontoSettings({ spielgeld: -5, spielgeldOverflow: { '2026-11': 'irgendwo', nope: 'other' } });
    expect(bad.spielgeld).toBeNull();
    expect(bad.spielgeldOverflow).toEqual({});
  });
});

describe('„Frei verfügbar“ ohne Fixkosten einplanen: unverändert', () => {
  it('Netto − Fixkosten − Vermögensaufbau vom Netto, egal ob Rücklage oder direkt', () => {
    const f = monthFigures(DATA, NOV);
    // Urlaub and Konzert are „nicht eingeplant“: not in the Fixkosten
    expect(f.total).toBe(2950);
    expect(f.wealthFromNet).toBe(1283);
    expect(f.free).toBe(4069);
    // Rücklage or Direkt does not move „Frei verfügbar“
    const allReserve = { ...DATA, positions: POSITIONS.map((p) => (p.account === 'spielgeld' ? p : { ...p, account: 'fixkostenkonto' as const })) };
    expect(monthFigures(allReserve, NOV).free).toBe(4069);
  });
});

describe('Nächstes Gehalt (Standard der Aufteilung)', () => {
  it('Zur Seite legen = genau der Betrag der Zur-Seite-Kachel (state.next.amount)', () => {
    const s = settings(BALANCE);
    const st = kontoState(DATA, NOV, s);
    const next = nextSalarySplit(DATA, NOV, st, s);
    expect(next.kind).toBe('next');
    expect(next.period).toBe('2026-12');
    expect(next.reserve).toBe(st.next.amount);
  });
  it('auch verteilt mit Extra: derselbe Betrag wie die Kachel', () => {
    const s = settings(BALANCE - 3500, { gapMode: 'spread', receivedFor: null });
    const st = kontoState(DATA, NOV, s);
    expect(st.next.extra).toBeGreaterThan(0);
    expect(nextSalarySplit(DATA, NOV, st, s).reserve).toBe(st.next.amount);
  });
  it('Planung des Folgemonats, Spielgeld = geplanter Betrag', () => {
    const s = settings(BALANCE);
    const split = nextSalarySplit(DATA, NOV, kontoState(DATA, NOV, s), s, 2909);
    expect(split).toMatchObject({ salary: 8302, salaryFrom: NOV, direct: 450, wealth: 1283, spielgeld: 1209, rest: 2451 });
  });
  it('Netto des Folgemonats eingetragen: kein Hinweis „wie im …“', () => {
    const ds = { ...DATA, monthClose: [...DATA.monthClose, { period: '2026-12', netSalary: 9000, updatedAt: '2026-12-01T00:00:00.000Z' }] };
    const s = settings(BALANCE);
    const split = nextSalarySplit(ds, NOV, kontoState(ds, NOV, s), s);
    expect(split.salary).toBe(9000);
    expect(split.salaryFrom).toBeNull();
  });
  it('Fallback-Netto: das zuletzt eingetragene, auch Monate zurück', () => {
    expect(lastSalary(DATA, '2027-02')).toEqual({ salary: 8302, from: NOV });
    expect(lastSalary({ ...DATA, monthClose: [] }, NOV)).toBeNull();
    const ds = { ...DATA, monthClose: [] };
    const s = settings(BALANCE);
    expect(nextSalarySplit(ds, NOV, kontoState(ds, NOV, s), s).rest).toBeNull();
  });
});
