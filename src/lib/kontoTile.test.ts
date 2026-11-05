// The tile of „Fixkosten einplanen“: which view it shows and the sentence of the next task.
// Darstellung only: the numbers come from kontoState like everywhere else.
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayLabel, nextTaskText } from '../components/konto/KontoStatusView';
import { toKontoSettings, type KontoSettings } from '../db/settings';
import { formatEUR } from './format';
import { kontoState } from './kontoBalance';
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
// Strom 100 monthly, Versicherung 1200 in March, Kfz 900 in May: first minus March, lowest May
const DATA = ds([pos('strom', 100), pos('vers', 1200, [3]), pos('kfz', 900, [5])]);
const ACTIVE = '2026-11';
const settings = (patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance: 0,
    rounding: 1,
    setupDone: true,
    hasAccount: true,
    orderRuns: true,
    receivedFor: ACTIVE,
    plan: { accountDone: false, orderDone: false, gapDone: false },
    // 100 set aside, November's deposit already in: Nov 0, … Mar −700 (first minus), May lowest
    anchor: { amount: 100, at: '2026-11-03T10:00:00.000Z' },
    ...patch,
  });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10));
});
afterAll(() => vi.useRealTimers());

describe('Datum in Kachel, Plan und Einstellungen: „24. Jänner“', () => {
  const today = new Date(2026, 10, 4);
  it('innerhalb von 12 Monaten ohne Jahr', () => {
    expect(dayLabel(new Date(2027, 0, 24), today)).toBe('24. Jänner');
    expect(dayLabel(new Date(2026, 11, 31), today)).toBe('31. Dezember');
    expect(dayLabel(new Date(2027, 9, 31), today)).toBe('31. Oktober');
  });
  it('ein Jahr oder weiter weg mit Jahr', () => {
    expect(dayLabel(new Date(2027, 10, 24), today)).toBe('24. November 2027');
  });
});

describe('Kachel: die nächste offene Aufgabe als ein Satz mit Betrag und Termin', () => {
  it('keine Frage beantwortet: keine Aufgabe (Start-Ansicht)', () => {
    expect(nextTaskText(kontoState(DATA, ACTIVE, settings({ setupDone: false })), 'am 1.')).toBeNull();
  });

  it('mit Konto, Dauerauftrag läuft noch nicht: „Dauerauftrag einrichten: € X am 25.“', () => {
    const st = kontoState(DATA, ACTIVE, settings({ orderRuns: false }), 25);
    expect(nextTaskText(st, 'am 25.')).toBe(`Dauerauftrag einrichten: ${formatEUR(st.order)} am 25.`);
  });

  it('mit Konto, Dauerauftrag läuft: „Dauerauftrag prüfen: € X am 1.“', () => {
    const st = kontoState(DATA, ACTIVE, settings());
    expect(nextTaskText(st, 'am 1.')).toBe(`Dauerauftrag prüfen: ${formatEUR(st.order)} am 1.`);
  });

  it('ohne Konto: „Leg monatlich am 1. € X zur Seite.“', () => {
    const st = kontoState(DATA, ACTIVE, settings({ hasAccount: false, orderRuns: null }));
    expect(nextTaskText(st, 'am 1.')).toBe(`Leg monatlich am 1. ${formatEUR(st.order)} zur Seite.`);
  });

  it('Monatsbetrag erledigt, Lücke offen: „Leg bis 28. Februar einmalig € Y zur Seite.“', () => {
    const st = kontoState(DATA, ACTIVE, settings({ plan: { accountDone: false, orderDone: true, gapDone: false } }));
    expect(st.status).toBe('gap');
    expect(nextTaskText(st, 'am 1.')).toBe(`Leg bis 28. Februar einmalig ${formatEUR(st.gap)} zur Seite.`);
  });

  it('beide offen: zuerst der Monatsbetrag', () => {
    const st = kontoState(DATA, ACTIVE, settings({ orderRuns: false }));
    expect(st.gap).toBeGreaterThan(0);
    expect(nextTaskText(st, 'am 1.')).toMatch(/^Dauerauftrag einrichten/);
  });

  it('alles eingeplant: keine Aufgabe (Ansicht „Alles eingeplant bis …“)', () => {
    const st = kontoState(
      DATA,
      ACTIVE,
      settings({ plan: { accountDone: false, orderDone: true, gapDone: false }, anchor: { amount: 5000, at: '2026-11-03T10:00:00.000Z' } }),
    );
    expect(st.status).toBe('covered');
    expect(nextTaskText(st, 'am 1.')).toBeNull();
  });
});
