// „Ein Betrag pro Monat“: the base amount, the gap and how it is closed (spread / lump), the special
// case without a deposit before the gap, the plan never below 0, the monthly recalculation, the
// milestone. Numbers: your data of November 2026 rebuilt (base € 2.920, gap € 1.087,43, first month
// below 0 February → € 362,48 extra for December, January, February).
import { describe, expect, it } from 'vitest';
import { toKontoSettings, type KontoSettings } from '../db/settings';
import { kontoState, newMilestones, reachedMilestones } from './kontoBalance';
import type { Category, Dataset, Payment, Position } from './types';

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
const ds = (positions: Position[], payments: Payment[] = []): Dataset => ({ categories: CATS, positions, payments, oneOffs: [], monthClose: [], reminders: [], changeLog: [] });

const NOV = '2026-11';
const SETUP_AT = '2026-11-08T09:00:00.000Z';
/** Miete 2.500 monthly; Kfz-Versicherung 3.200 and Haushaltsversicherung 1.840 in `month` → base exactly 2.920 */
const data = (month = 2) => ds([pos('miete', 'Miete', 2500), pos('kfz', 'Kfz-Versicherung', 3200, [month]), pos('haushalt', 'Haushaltsversicherung', 1840, [month])]);
/** set up on 8 November with `balance` set aside (this month's deposit in it) */
const setUp = (balance: number, patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance,
    rounding: 5,
    setupDone: true,
    hasAccount: false,
    receivedFor: NOV,
    anchor: { amount: balance, at: SETUP_AT },
    ...patch,
  });

describe('Grundbetrag und Lücke (deine Daten nachgebaut)', () => {
  const st = kontoState(data(), NOV, setUp(5192.57));

  it('Grundbetrag € 2.920, Lücke € 1.087,43, erster Minus-Monat Februar', () => {
    expect(st.order).toBe(2920);
    expect(st.gap).toBe(1087.43);
    expect(st.gapFrom).toBe('2027-02');
    expect(st.gapBills.map((b) => b.name)).toEqual(['Kfz-Versicherung', 'Haushaltsversicherung']);
  });

  it('verteilt: 3 Einzahlungen (Dez, Jän, Feb), je € 362,48 extra (auf den Cent aufgerundet), danach der Grundbetrag', () => {
    expect(st.mode).toBe('spread');
    expect(st.deposits).toBe(3);
    expect(st.extra).toBe(362.48);
    expect(st.months.slice(0, 5).map((m) => [m.period, m.amount, m.extra])).toEqual([
      ['2026-11', 2920, 0], // this month: already in the amount set aside
      ['2026-12', 3282.48, 362.48],
      ['2027-01', 3282.48, 362.48],
      ['2027-02', 3282.48, 362.48],
      ['2027-03', 2920, 0],
    ]);
    // this month came with the setup: next is December
    expect(st.monthDone).toBe(true);
    expect(st.next).toEqual({ period: '2026-12', amount: 3282.48, extra: 362.48 });
  });

  it('mit dem Plan: 12 Monate nie unter 0 (verteilt und auf einmal)', () => {
    for (const gapMode of ['spread', 'lump'] as const) {
      const s = kontoState(data(), NOV, setUp(5192.57, { gapMode }));
      expect(s.mode).toBe(gapMode);
      expect(s.planSimulation.months).toHaveLength(12);
      for (const m of s.planSimulation.months) expect(Math.round(m.end * 100), `${gapMode} ${m.period}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('auf einmal: € 1.087,43 bis zum Tag vor Februar, jeden Monat der Grundbetrag', () => {
    const s = kontoState(data(), NOV, setUp(5192.57, { gapMode: 'lump' }));
    expect(s.lump).toBe(1087.43);
    expect(s.extra).toBe(0);
    expect(s.gapBy).toEqual(new Date(2027, 0, 31));
    expect(new Set(s.months.map((m) => m.amount))).toEqual(new Set([2920]));
  });

  it('die bisherigen Kennzahlen bleiben gleich: Grundbetrag, Lücke und Simulation ohne Plan', () => {
    const sim = st.overview.simulation;
    expect(sim.months.map((m) => Math.round(m.end * 100) / 100).slice(0, 4)).toEqual([2692.57, 3112.57, 3532.57, -1087.43]);
    expect(sim.gap).toBe(1087.43);
  });
});

describe('Anzahl der Einzahlungen bis einschließlich des ersten Minus-Monats', () => {
  // the bills in December / January / February; the balance so that exactly € 600 are missing there
  const cases = [
    { month: 12, deposits: 1, balance: 2500 + 5040 - 420 - 600 },
    { month: 1, deposits: 2, balance: 2500 + 5040 - 840 - 600 },
    { month: 2, deposits: 3, balance: 2500 + 5040 - 1260 - 600 },
  ];
  for (const c of cases) {
    it(`${c.deposits} Einzahlung(en): Extra = Lücke ÷ ${c.deposits}`, () => {
      const s = kontoState(data(c.month), NOV, setUp(c.balance));
      expect(s.gap).toBe(600);
      expect(s.deposits).toBe(c.deposits);
      expect(s.extra).toBe(Math.ceil(60000 / c.deposits) / 100);
      expect(s.months.filter((m) => m.extra > 0)).toHaveLength(c.deposits);
      for (const m of s.planSimulation.months) expect(Math.round(m.end * 100)).toBeGreaterThanOrEqual(0);
    });
  }

  it('der Monat ist noch offen (neuer Monat, nicht bestätigt): seine Einzahlung zählt mit', () => {
    // € 2.920 less set aside, but this month's deposit still to come: the same gap, spread over 4 deposits
    const s = kontoState(data(2), NOV, setUp(5192.57 - 2920, { receivedFor: null }));
    expect(s.gap).toBe(1087.43);
    expect(s.monthDone).toBe(false);
    expect(s.deposits).toBe(4);
    expect(s.next.period).toBe(NOV);
    expect(s.next.extra).toBe(s.extra);
  });
});

describe('Sonderfall: keine Einzahlung mehr bis zum Minus-Monat', () => {
  it('die Rechnungen kommen diesen Monat: automatisch auf einmal, auch wenn verteilt gewählt ist', () => {
    const s = kontoState(data(11), NOV, setUp(4000, { gapMode: 'spread' }));
    expect(s.gapFrom).toBe(NOV);
    expect(s.deposits).toBe(0);
    expect(s.canSpread).toBe(false);
    expect(s.mode).toBe('lump');
    expect(s.lump).toBe(s.gap);
    for (const m of s.planSimulation.months) expect(Math.round(m.end * 100)).toBeGreaterThanOrEqual(0);
  });
});

describe('Jeden Monat neu berechnet', () => {
  it('Dezember bestätigt mit € 3.282,48: im Dezember bleiben 2 Einzahlungen, Extra wieder € 362,48', () => {
    const paidNov: Payment = { id: 'p1', positionId: 'miete', period: NOV, status: 'paid', plannedAmount: 2500, actualAmount: 2500, paidAt: '2026-11-10T09:00:00.000Z' };
    const s = kontoState(
      ds(data().positions, [paidNov]),
      '2026-12',
      setUp(5192.57, { receivedFor: '2026-12', checks: [{ period: '2026-12', deposited: true, answeredAt: '2026-12-01T08:00:00.000Z', amount: 3282.48 }] }),
    );
    expect(s.balance).toBeCloseTo(5975.05, 2);
    expect(s.gap).toBe(724.95);
    expect(s.deposits).toBe(2);
    expect(s.extra).toBe(362.48);
  });
});

describe('Ohne Lücke', () => {
  it('genug zur Seite gelegt: gedeckt, ein Betrag, kein Extra', () => {
    const s = kontoState(data(), NOV, setUp(7000));
    expect(s.status).toBe('covered');
    expect(s.mode).toBeNull();
    expect(s.extra).toBe(0);
    expect(s.lump).toBe(0);
    expect(s.planSimulation).toBe(s.overview.simulation);
  });
});

describe('Meilenstein „Zum ersten Mal alles eingeplant“', () => {
  // a month confirmed before the setup's anchor: it counts for the milestone, not for the amount
  const check = { period: '2026-10' as const, deposited: true, answeredAt: '2026-10-01T08:00:00.000Z' };
  it('Lücke offen (verteilt): nicht, auch nicht mit bestätigtem Monat', () => {
    const s = setUp(5192.57, { checks: [check] });
    const st = kontoState(data(), NOV, s);
    expect(st.status).toBe('spread');
    expect(reachedMilestones(s, st.status, st.streak)).not.toContain('firstPod');
    expect(newMilestones(s, st.status, st.streak)).not.toContain('firstPod');
  });
  it('Lücke offen (auf einmal): nicht', () => {
    const s = setUp(5192.57, { gapMode: 'lump', checks: [check] });
    const st = kontoState(data(), NOV, s);
    expect(reachedMilestones(s, st.status, st.streak)).not.toContain('firstPod');
  });
  it('gedeckt, aber noch kein Monat bestätigt: nicht', () => {
    const s = setUp(7000);
    const st = kontoState(data(), NOV, s);
    expect(reachedMilestones(s, st.status, st.streak)).not.toContain('firstPod');
  });
  it('gedeckt und ein Monat bestätigt: ja', () => {
    const s = setUp(7000, { checks: [check] });
    const st = kontoState(data(), NOV, s);
    expect(reachedMilestones(s, st.status, st.streak)).toContain('firstPod');
  });
});

describe('Einstellungen: gapMode und der bestätigte Betrag sind additiv', () => {
  it('ohne die neuen Felder: gapMode null (verteilt, wo möglich), Checks ohne Betrag', () => {
    const s = toKontoSettings({ enabled: true, balance: 10, receivedFor: null, rounding: 5 });
    expect(s.gapMode).toBeNull();
    expect(toKontoSettings({ gapMode: 'quatsch' }).gapMode).toBeNull();
  });
  it('Export → Import: gapMode und Betrag bleiben', () => {
    const s = setUp(100, { gapMode: 'lump', checks: [{ period: '2026-12', deposited: true, answeredAt: '2026-12-01T08:00:00.000Z', amount: 3282.48 }] });
    expect(toKontoSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
