// Sicherheitspuffer and „Monatsbetrag runden“ (feinschliff-puffer). Numbers: your data of November 2026
// rebuilt (base € 2.920, gap € 1.087,43 against 0, first month below February).
import { describe, expect, it } from 'vitest';
import { BUFFERS, DEFAULT_KONTO, storedKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { standingOrder } from './fixkostenkonto';
import { kontoState } from './kontoBalance';
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
const ds = (positions: Position[]): Dataset => ({ categories: CATS, positions, payments: [], oneOffs: [], monthClose: [], reminders: [], changeLog: [] });
const DATA = ds([pos('miete', 'Miete', 2500), pos('kfz', 'Kfz-Versicherung', 3200, [2]), pos('haushalt', 'Haushaltsversicherung', 1840, [2])]);
const NOV = '2026-11';
const setUp = (patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance: 5192.57,
    rounding: 5,
    setupDone: true,
    hasAccount: false,
    receivedFor: NOV,
    anchor: { amount: 5192.57, at: '2026-11-08T09:00:00.000Z' },
    ...patch,
  });
const lowest = (st: ReturnType<typeof kontoState>) => Math.min(...st.planSimulation.months.map((m) => Math.round(m.end * 100))) / 100;

describe('Sicherheitspuffer', () => {
  it('Standard € 100, auch für bestehende Einrichtungen', () => {
    expect(DEFAULT_KONTO.buffer).toBe(100);
    expect(toKontoSettings({ enabled: true, balance: 300, receivedFor: null, rounding: 5 }).buffer).toBe(100);
    expect(toKontoSettings({ buffer: 250 }).buffer).toBe(250);
    expect(toKontoSettings({ buffer: 70 }).buffer).toBe(100);
  });

  it('Puffer 0 ergibt die bisherigen Werte: Lücke € 1.087,43, Extra € 362,48', () => {
    const st = kontoState(DATA, NOV, setUp({ buffer: 0 }));
    expect(st.order).toBe(2920);
    expect(st.gap).toBe(1087.43);
    expect(st.extra).toBe(362.48);
    expect(st.gapFrom).toBe('2027-02');
  });

  it('Puffer € 100: Lücke € 1.187,43, Extra € 395,81 für Dez, Jän, Feb', () => {
    const st = kontoState(DATA, NOV, setUp({ buffer: 100 }));
    expect(st.buffer).toBe(100);
    expect(st.gap).toBe(1187.43);
    expect(st.deposits).toBe(3);
    expect(st.extra).toBe(395.81);
    expect(st.months.slice(1, 5).map((m) => m.amount)).toEqual([3315.81, 3315.81, 3315.81, 2920]);
    const lump = kontoState(DATA, NOV, setUp({ buffer: 100, gapMode: 'lump' }));
    expect(lump.lump).toBe(1187.43);
  });

  for (const buffer of BUFFERS)
    for (const gapMode of ['spread', 'lump'] as const)
      it(`Plan nie unter dem Puffer (€ ${buffer}, ${gapMode})`, () => {
        for (const balance of [0, 1000, 5192.57, 20_000]) {
          const st = kontoState(DATA, NOV, setUp({ buffer, gapMode, balance, anchor: { amount: balance, at: '2026-11-08T09:00:00.000Z' } }));
          // the special case (already short this month) has no month to set aside in before: from December on
          const months = st.gapFrom === NOV ? st.planSimulation.months.slice(1) : st.planSimulation.months;
          expect(Math.min(...months.map((m) => Math.round(m.end * 100)))).toBeGreaterThanOrEqual(buffer * 100);
          if (st.gapFrom !== NOV) expect(lowest(st)).toBeGreaterThanOrEqual(buffer);
        }
      });

  it('genug zur Seite gelegt: keine Lücke, solange der tiefste Stand ≥ Puffer', () => {
    const st = kontoState(DATA, NOV, setUp({ buffer: 500, balance: 20_000, anchor: { amount: 20_000, at: '2026-11-08T09:00:00.000Z' } }));
    expect(st.gap).toBe(0);
    expect(st.status).toBe('covered');
  });
});

describe('Monatsbetrag runden (nur auf Wunsch)', () => {
  // 2.500 + (3.200,01 + 1.840) / 12 = 2.920,000833… → cent-exact 2.920,01
  const CENT = ds([pos('miete', 'Miete', 2500), pos('kfz', 'Kfz', 3200.01, [2]), pos('haushalt', 'Haushalt', 1840, [2])]);

  it('aus: auf den Cent genau', () => {
    expect(standingOrder(CENT, NOV, 0).amount).toBe(2920.01);
    expect(kontoState(CENT, NOV, setUp({ roundingOn: false })).order).toBe(2920.01);
  });

  it('an: auf € 1 / 5 / 10 aufgerundet', () => {
    expect(kontoState(CENT, NOV, setUp({ roundingOn: true, rounding: 1 })).order).toBe(2921);
    expect(kontoState(CENT, NOV, setUp({ roundingOn: true, rounding: 5 })).order).toBe(2925);
    expect(kontoState(CENT, NOV, setUp({ roundingOn: true, rounding: 10 })).order).toBe(2930);
  });

  it('neue Einrichtung: aus; beim Einschalten € 5', () => {
    expect(DEFAULT_KONTO.roundingOn).toBe(false);
    expect(toKontoSettings({}).roundingOn).toBe(false);
    expect(toKontoSettings({}).rounding).toBe(5);
  });

  it('Migration: ein gespeicherter Rundungswert bleibt und zählt als an', () => {
    for (const rounding of [1, 5, 10] as const) {
      const s = toKontoSettings({ enabled: true, inviteDismissed: false, balance: 0, receivedFor: null, rounding });
      expect(s.roundingOn).toBe(true);
      expect(s.rounding).toBe(rounding);
    }
    // an unusable value: off, the choice starts at € 5
    expect(toKontoSettings({ rounding: 7 }).roundingOn).toBe(false);
  });

  it('gespeichert und wieder gelesen: gleich (aus wird ausdrücklich gespeichert)', () => {
    for (const roundingOn of [true, false]) {
      const s = { ...setUp(), roundingOn, buffer: 250 as const };
      const stored = storedKonto(s);
      expect(stored.roundingOn).toBe(roundingOn ? undefined : false);
      expect(toKontoSettings(JSON.parse(JSON.stringify(stored)))).toEqual(s);
    }
  });
});
