// The words of the tile, the sheet and the setup: dates, month names with „Neuer Monat beginnt am“
// (1 vs. 25), the reason and how the gap is closed. Numbers: your data rebuilt (see kontoPlan.test.ts).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { toKontoSettings, type KontoSettings } from '../db/settings';
import { formatEUR } from './format';
import { kontoState } from './kontoBalance';
import { billNames, coveredText, dayLabel, depositDay, fromLabel, periodName, planText, reasonText, untilLabel, whenText } from './kontoWords';
import type { Category, Dataset, Position } from './types';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [{ id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 }];
const pos = (id: string, name: string, amount: number, dueMonths = ALL): Position => ({
  id,
  name,
  categoryId: 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: dueMonths.length === 12 ? 'monthly' : 'annual', dueMonths }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
});
const DATA: Dataset = {
  categories: CATS,
  positions: [pos('miete', 'Miete', 2500), pos('kfz', 'Kfz-Versicherung', 3200, [2]), pos('haushalt', 'Haushaltsversicherung', 1840, [2])],
  payments: [],
  oneOffs: [],
  monthClose: [],
  reminders: [],
  changeLog: [],
};
const NOV = '2026-11';
const setUp = (balance: number, patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({ enabled: true, balance, rounding: 5, setupDone: true, hasAccount: false, receivedFor: NOV, anchor: { amount: balance, at: '2026-11-08T09:00:00.000Z' }, ...patch });
const eur = (v: number) => formatEUR(v);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 10));
});
afterAll(() => vi.useRealTimers());

describe('Datum: „24. Jänner“, mit Jahr erst ab 12 Monaten', () => {
  const today = new Date(2026, 10, 8);
  it('ohne und mit Jahr', () => {
    expect(dayLabel(new Date(2027, 0, 31), today)).toBe('31. Jänner');
    expect(dayLabel(new Date(2027, 10, 1), today)).toBe('1. November 2027');
  });
});

describe('Monatsnamen eindeutig: „Neuer Monat beginnt am“ 1 oder 25', () => {
  it('am 1.: Monatsnamen', () => {
    expect(depositDay('2026-12', 1)).toBe('1. Dezember');
    expect(fromLabel('2027-03', 1)).toBe('März');
    expect(untilLabel('2027-10', 1)).toBe('Oktober 2027');
    expect(periodName('2026-11', 1)).toBe('November');
  });
  it('am 25.: mit Datum statt nur „November“', () => {
    expect(depositDay('2026-12', 25)).toBe('25. November');
    expect(fromLabel('2027-03', 25)).toBe('25. Februar');
    expect(untilLabel('2027-10', 25)).toBe('24. Oktober');
    expect(periodName('2026-11', 25)).toBe('den Monat seit 25. Oktober');
  });
});

describe('Grund und Plan in einem Satz (deine Daten nachgebaut)', () => {
  it('verteilt: „Im Februar kommen … Darum bis dahin € 362,48 extra, ab März € 2.920.“', () => {
    const st = kontoState(DATA, NOV, setUp(5192.57));
    expect(billNames(st.gapBills)).toBe('Kfz-Versicherung und Haushaltsversicherung');
    expect(reasonText(st, 1)).toBe('Im Februar kommen Kfz-Versicherung und Haushaltsversicherung.');
    expect(planText(st, 1)).toBe(`Darum bis dahin ${eur(362.48)} extra, ab März ${eur(2920)}.`);
    expect(whenText(st, 1)).toBe('am 1. Dezember, wenn dein Gehalt kommt');
    expect(whenText({ ...st, hasAccount: true }, 1)).toBe('per Dauerauftrag am 1. Dezember');
  });
  it('auf einmal: „Leg bis 31. Jänner € 1.087,43 extra zur Seite.“', () => {
    const st = kontoState(DATA, NOV, setUp(5192.57, { gapMode: 'lump' }));
    expect(planText(st, 1)).toBe(`Leg bis 31. Jänner ${eur(1087.43)} extra zur Seite.`);
  });
  it('am 25.: „ab 25. Februar“ statt „ab März“', () => {
    const st = kontoState(DATA, NOV, setUp(5192.57), 25);
    expect(planText(st, 25)).toContain('ab 25. Februar');
  });
  it('ohne Lücke: „Alles eingeplant bis Oktober 2027.“', () => {
    const st = kontoState(DATA, NOV, setUp(9000));
    expect(coveredText(st, 1)).toBe('Alles eingeplant bis Oktober 2027.');
    expect(coveredText(st, 25)).toBe('Alles eingeplant bis 24. Oktober.');
  });
  it('eine Rechnung: „kommt“; schon diesen Monat: „Diesen Monat reicht das Geld nicht.“', () => {
    const one = kontoState({ ...DATA, positions: [pos('miete', 'Miete', 2500), pos('kfz', 'Kfz-Versicherung', 5040, [2])] }, NOV, setUp(5192.57));
    expect(reasonText(one, 1)).toBe('Im Februar kommt Kfz-Versicherung.');
    const now = kontoState(DATA, NOV, setUp(100));
    expect(now.gapFrom).toBe(NOV);
    expect(reasonText(now, 1)).toBe('Diesen Monat reicht das Geld nicht.');
  });
  it('drei Rechnungen: die zwei größten im Satz', () => {
    expect(billNames([{ name: 'A', amount: 3 }, { name: 'B', amount: 2 }, { name: 'C', amount: 1 }])).toBe('A und B');
    expect(billNames([{ name: 'A', amount: 3 }], 2)).toBe('A');
  });
});
