// spielgeld-pille-rechenfehler: ①–④, „Vor Spielgeld frei“ and the Überschuss do not depend on what is ticked;
// every amount keeps its cents. Golden scenario with cents (tests/fixtures/golden-month.ts, invented data):
// start 25, today 10 December 2026 → November past, December active, January future; € 500 saved already.
import { describe, expect, it } from 'vitest';
import { goldenCentDataset, goldenCentSettings, P1, P2, P3, SALARY } from '../../tests/fixtures/golden-month';
import type { KontoSettings } from '../db/settings';
import { dueItems } from './calc';
import { monthCard, type CardRow, type MonthCard } from './monthCard';
import { monthPlan } from './monthPlan';
import type { Dataset, Payment, Period } from './types';

const TODAY = new Date(2026, 11, 10);
const PERIODS = [P1, P2, P3] as const;
/** every tick of the tests is after the anchor (20 October): it is off the expected balance */
const PAID_AT = '2026-12-05T10:00:00.000Z';

const cents = (v: number) => Math.round(v * 100);
const listCents = (r: CardRow) => r.items.filter((i) => !i.muted).reduce((a, i) => a + cents(i.amount), 0);

/** the numbers of a card that must not move with a tick */
const numbers = (c: MonthCard) => ({
  reserve: c.reserve.total,
  direct: c.direct.total,
  wealth: c.wealth.total,
  unplanned: c.unplanned.total,
  spent: c.unplanned.spent,
  before: c.beforeSpielgeld,
  left: c.left,
});

function cards(ds: Dataset, s: KontoSettings) {
  const plan = monthPlan(ds, P2, s, 25);
  return Object.fromEntries(PERIODS.map((p) => [p, monthCard(ds, p, plan, 25, TODAY)])) as Record<Period, MonthCard>;
}

/** everything that can be ticked in a period (due, not skipped), with the amount it is ticked with */
function tickable(ds: Dataset, period: Period) {
  return dueItems(ds, period, 25)
    .filter((i) => i.due && i.status === 'open')
    .map((i) => ({ positionId: i.position.id, period, amount: i.planned }));
}

function tick(ds: Dataset, items: { positionId: string; period: Period; amount: number }[]): Dataset {
  const payments: Payment[] = items.map((i, n) => ({
    id: `t-${n}-${i.positionId}-${i.period}`,
    positionId: i.positionId,
    period: i.period,
    status: 'paid',
    plannedAmount: i.amount,
    actualAmount: i.amount,
    paidAt: PAID_AT,
  }));
  return { ...ds, payments: [...ds.payments, ...payments] };
}

/** a small seeded PRNG (mulberry32): the same 200 states on every run */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// worked out by hand (see SPIELGELD-PILLE-RECHENFEHLER.md, „Rechenweg“)
const EXPECTED = {
  // ① Rundfunk 18,36 (the bill of the account, nothing transferred) · ② 2.318 + Parkplatz 8,03
  // ④ Konzert 120 + Kino 12,49 = 132,49 of 300
  [P1]: { reserve: 18.36, direct: 2326.03, wealth: 350, unplanned: 300, spent: 132.49, before: 1305.61, left: 1005.61 },
  // ① Rundfunk 18,36 + Kfz 360 − 360 saved · ② 2.333 + 8,03 · ④ Fahrrad 450 + Jacke 80 + Kaffee 4,51 = 534,51
  [P2]: { reserve: 18.36, direct: 2341.03, wealth: 350, unplanned: 534.51, spent: 534.51, before: 1290.61, left: 756.1 },
  // saved: 500 − Rundfunk of November 18,36 = 481,64 → Kfz 360, Steuerberater 121,64, Kammerbeitrag 0
  // ① Rundfunk 18,36 + Steuerberater 600 − 121,64 + Kammerbeitrag 123,45 = 620,17 · ④ Buch 23,99 of 300
  [P3]: { reserve: 620.17, direct: 2326.03, wealth: 350, unplanned: 300, spent: 23.99, before: 703.8, left: 403.8 },
} as const;

describe('Golden Test mit Cent: jeder Monat, drei Abhak-Zustände', () => {
  const base = goldenCentDataset();
  const s = goldenCentSettings();

  it('nichts abgehakt: die Zahlen von Hand, mit Cent', () => {
    const c = cards(base, s);
    for (const p of PERIODS) {
      expect(numbers(c[p]!)).toEqual(EXPECTED[p]);
      expect(c[p]!.left).toBe(Math.round((SALARY - EXPECTED[p].reserve - EXPECTED[p].direct - EXPECTED[p].wealth - EXPECTED[p].unplanned) * 100) / 100);
    }
  });

  for (const p of PERIODS) {
    describe(`${p}: nichts / teilweise / alles abgehakt`, () => {
      const items = tickable(base, p);
      const states = {
        nichts: [],
        teilweise: items.filter((_, i) => i % 2 === 0),
        alles: items,
      };
      for (const [name, ticked] of Object.entries(states)) {
        it(`${name} abgehakt (${ticked.length} von ${items.length}): ①–④, „Vor Spielgeld frei“ und Überschuss in allen drei Monaten gleich`, () => {
          const c = cards(tick(base, ticked), s);
          for (const q of PERIODS) expect(numbers(c[q]!)).toEqual(EXPECTED[q]);
        });
      }
    });
  }

  it('jede aufgeklappte Liste ergibt ihren Zeilenbetrag auf den Cent, in allen drei Monaten', () => {
    for (const ds of [base, tick(base, PERIODS.flatMap((p) => tickable(base, p)))]) {
      const c = cards(ds, s);
      for (const p of PERIODS) {
        for (const r of [c[p]!.reserve, c[p]!.direct, c[p]!.wealth, c[p]!.unplanned]) expect(listCents(r)).toBe(cents(r.total));
      }
    }
  });
});

describe('Bug: Abhaken im künftigen Monat änderte ① und den Überschuss', () => {
  // künftiger Monat (Jänner), „Bei Fälligkeit“, Steuerberater und Kammerbeitrag fällig, € 121,64 angespart
  const base = goldenCentDataset();
  const s = goldenCentSettings();
  const jan = tickable(base, P3).filter((i) => ['c-kammer', 'g-steuer'].includes(i.positionId));

  it('nichts abgehakt: ① = fällig − angespart', () => {
    const plan = monthPlan(base, P2, s, 25);
    const steuer = plan.payments.find((x) => x.positionId === 'g-steuer')!;
    expect([steuer.saved, steuer.rest]).toEqual([121.64, 478.36]);
    expect(plan.payments.find((x) => x.positionId === 'c-kammer')!.saved).toBe(0);
  });

  it('beide abgehakt: ① bleibt 620,17, der Überschuss 403,80', () => {
    const c = cards(tick(base, jan), s);
    expect(c[P3]!.reserve.total).toBe(620.17);
    expect(c[P3]!.left).toBe(403.8);
    // the active month keeps what is saved for the Kfz-Versicherung as well
    expect(c[P2]!.reserve.total).toBe(18.36);
  });

  it('„Dein Plan“ zeigt dasselbe wie vorher (angespart, Rest, Überweisung)', () => {
    const before = monthPlan(base, P2, s, 25);
    const after = monthPlan(tick(base, jan), P2, s, 25);
    expect(after.months.map((m) => [m.period, m.transfer, m.free, m.bills])).toEqual(before.months.map((m) => [m.period, m.transfer, m.free, m.bills]));
    expect(after.payments.map((p) => [p.key, p.saved, p.rest])).toEqual(before.payments.map((p) => [p.key, p.saved, p.rest]));
    // the balance shown stays the real one: € 500 − 723,45 ticked
    expect(after.balance).toBe(-223.45);
  });
});

describe('Property: 200 zufällige Abhak-Zustände pro Monat ändern keine Zahl', () => {
  const base = goldenCentDataset();
  const all = PERIODS.flatMap((p) => tickable(base, p));
  const settings: [string, KontoSettings, number][] = [
    ['Bei Fälligkeit', goldenCentSettings(), 200],
    ['Bei Fälligkeit, Überweisung des Monats schon da', goldenCentSettings({ checks: [{ period: P2, deposited: true, answeredAt: '2026-11-26T08:00:00.000Z', amount: 400 }] }), 200],
    ['Gleichmäßig', goldenCentSettings({ planMode: 'even' }), 60],
    ['Eigener Plan', goldenCentSettings({ planMode: 'custom' }), 60],
    ['Bei Fälligkeit, gerundet', goldenCentSettings({ roundingOn: true }), 60],
  ];
  for (const [name, s, n] of settings) {
    it(`${name}: ${n} Zustände je Monat`, () => {
      const expected = cards(base, s);
      for (const [k, p] of PERIODS.entries()) {
        const random = rng(1000 * (k + 1) + n);
        const own = all.filter((i) => i.period === p);
        const others = all.filter((i) => i.period !== p);
        for (let run = 0; run < n; run++) {
          // this month at random, the other months at random as well (less often)
          const ticked = [...own.filter(() => random() < 0.5), ...others.filter(() => random() < 0.2)];
          const c = cards(tick(base, ticked), s);
          for (const q of PERIODS) {
            expect(numbers(c[q]!), `${p} · Lauf ${run} · ${q}`).toEqual(numbers(expected[q]!));
            for (const r of [c[q]!.reserve, c[q]!.direct, c[q]!.wealth, c[q]!.unplanned]) expect(listCents(r)).toBe(cents(r.total));
          }
        }
      }
    });
  }
});
