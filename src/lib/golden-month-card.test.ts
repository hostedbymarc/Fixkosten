// Golden Test „Dein Monat“ (invented data, tests/fixtures/golden-month.ts).
// monat-ist-monat: the card shows the period of a month (start 25: November = 25.10.–24.11.).
// alle-monate-gleich: EVERY month shows the card – seen from December (active), November is past and January
// future; ④ is the Spielgeld = max(limit, spent); a purchase on 27 November belongs to December. Every number
// that is shown in two places is the same: ①–④, item counts, „Überschuss“, the Spielgeld pill, the salary,
// the hero sums of the month, „Dein Plan“ and the Positionen-Ø.
import { describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P1, P2, P3, SALARY, SPIELGELD } from '../../tests/fixtures/golden-month';
import { dueItems, fixedCostsAvg, monthFigures, monthItems } from './calc';
import { monthCard, type CardRow } from './monthCard';
import { monthPlan } from './monthPlan';
import { salaryView, salaryWhen } from './salaryMonth';
import { salaryParts } from './salarySplit';
import type { Period } from './types';

const plain = (s: string) => s.replace(/[  ]/g, ' ');
const sum = (r: CardRow) => Math.round(r.items.filter((i) => !i.muted).reduce((a, i) => a + i.amount * 100, 0)) / 100;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** today: 10 December – with start 25 December (25.11.–24.12.) is the active month */
const TODAY = new Date(2026, 11, 10);
const ACTIVE = P2;

// worked out by hand (see the report, ALLE-MONATE-GLEICH.md)
const EXPECTED = {
  // past: nothing transferred for November (no bill of the account in it) · Konzert € 120 of € 300
  [P1]: { when: 'past', title: 'Oktober-Gehalt', salaryWhen: 'ausgezahlt am 25. Oktober', reserve: 0, direct: 2318, directCount: 14, wealth: 350, spent: 120, spielgeld: 300, other: 0, before: 1332, left: 1032, rest: 180, over: 0, fallback: false },
  // active: Kfz-Versicherung € 360 · Fahrrad € 450 + Jacke € 80 (27.11.) = € 530, € 230 over · Geschenk € 200 muted
  [P2]: { when: 'active', title: 'November-Gehalt', salaryWhen: 'ausgezahlt am 25. November', reserve: 360, direct: 2333, directCount: 14, wealth: 350, spent: 530, spielgeld: 530, other: 200, before: 957, left: 427, rest: 0, over: 230, fallback: false },
  // future: Steuerberater € 600 as in „Dein Plan“ · nothing spent: the € 300 stay booked · salary: the last one
  [P3]: { when: 'future', title: 'Dezember-Gehalt', salaryWhen: 'kommt am 25. Dezember', reserve: 600, direct: 2318, directCount: 14, wealth: 350, spent: 0, spielgeld: 300, other: 0, before: 732, left: 432, rest: 300, over: 0, fallback: true },
} as const;

describe('Golden Test „Dein Monat“ in jedem Monat (Monatsbeginn 25, heute 10. Dezember)', () => {
  const ds = goldenDataset();
  const plan = monthPlan(ds, ACTIVE, goldenSettings(), 25);

  for (const period of [P1, P2, P3] as const) {
    const e = EXPECTED[period];
    describe(`${period} (${e.when})`, () => {
      const card = monthCard(ds, period, plan, 25, TODAY);

      it('Kopf: Gehalt am Zeitraum-Anfang, „ausgezahlt am“ / „kommt am“, ein Eintrag', () => {
        expect(card.salary.title).toBe(e.title);
        expect(plain(salaryWhen(period, 25, TODAY))).toBe(e.salaryWhen);
        expect(card.salary.value).toBe(SALARY);
        expect(card.salary.fallback).toBe(e.fallback);
        // the same entry as the salary of the month (monthClose of the period)
        expect(salaryView(ds, period, 25, TODAY)).toEqual(card.salary);
      });

      it('① – ④ und die Anzahl Posten', () => {
        expect(card.reserve.total).toBe(e.reserve);
        expect(card.direct.total).toBe(e.direct);
        expect(card.direct.count).toBe(e.directCount);
        expect(card.wealth.total).toBe(e.wealth);
        expect(card.unplanned.spent).toBe(e.spent);
        expect(card.unplanned.total).toBe(e.spielgeld);
        expect(card.unplanned.other).toBe(e.other);
      });

      it('jede Liste ergibt ihre Zeile', () => {
        for (const r of [card.reserve, card.direct, card.wealth, card.unplanned]) expect(sum(r)).toBe(r.total);
      });

      it('Überschuss = Netto − ① − ② − ③ − ④; „Vor Spielgeld frei“ = Netto − ① − ② − ③', () => {
        expect(card.beforeSpielgeld).toBe(e.before);
        expect(card.left).toBe(e.left);
        expect(card.left).toBe(r2(SALARY - e.reserve - e.direct - e.wealth - e.spielgeld));
      });

      it('Spielgeld: ausgegeben gegen das Limit', () => {
        expect(card.spielgeld).toEqual({ limit: SPIELGELD, used: e.spent, rest: e.rest, over: e.over });
      });

      it('Summen des Monats: ② = Direkt, ③ = Vermögensaufbau vom Netto, Abzüge = ① + ② + ③; ④ in keiner', () => {
        const f = monthFigures(ds, period, 25);
        expect(f.wealthFromNet).toBe(card.wealth.total);
        expect(salaryParts(ds, period, 25).direct).toBe(card.direct.total);
        expect(f.deductions).toBe(r2(card.reserve.total + card.direct.total + card.wealth.total));
        expect(r2(SALARY - f.deductions)).toBe(card.beforeSpielgeld);
        expect(monthItems(ds, period, 25).some((i) => ['Konzert', 'Fahrrad', 'Jacke'].includes(i.name))).toBe(false);
      });
    });
  }

  it('„Dein Plan“: ① ② ③ des aktiven und des künftigen Monats wie im Plan', () => {
    expect(plan.first.period).toBe(P2);
    for (const period of [P2, P3]) {
      const card = monthCard(ds, period, plan, 25, TODAY);
      const month = plan.months.find((m) => m.period === period)!;
      expect(month.transfer).toBe(card.reserve.total);
      expect(month.direct).toBe(card.direct.total);
      expect(month.wealth).toBe(card.wealth.total);
    }
  });

  it('Kauf am 27. November zählt zum Dezember (Monatsbeginn 25), mit Monatsbeginn 1 zum November', () => {
    const jacke = (period: Period, start: 1 | 25) => dueItems(ds, period, start).some((i) => i.position.id === 'g-jacke');
    expect([jacke(P1, 25), jacke(P2, 25)]).toEqual([false, true]);
    expect([jacke(P1, 1), jacke(P2, 1)]).toEqual([true, false]);
    const list = monthCard(ds, P2, plan, 25, TODAY).unplanned.items.find((i) => i.name === 'Jacke');
    expect(list).toMatchObject({ amount: 80, date: '2026-11-27', muted: false });
  });

  it('ohne Spielgeld-Limit: ④ = ausgegeben, kein Spielgeld-Status', () => {
    const free = monthPlan(ds, ACTIVE, goldenSettings({ spielgeld: null }), 25);
    const nov = monthCard(ds, P1, free, 25, TODAY);
    expect(nov.unplanned.total).toBe(120);
    expect(nov.spielgeld).toBeNull();
    expect(nov.left).toBe(1212);
    expect(nov.unplanned.items.some((i) => i.balance === 'rest')).toBe(false);
    expect(monthCard(ds, P3, free, 25, TODAY).unplanned.total).toBe(0);
  });

  it('unter dem Limit: „Noch nicht ausgegeben“ bringt die Liste auf das Spielgeld', () => {
    const nov = monthCard(ds, P1, plan, 25, TODAY);
    expect(nov.unplanned.items.find((i) => i.balance === 'rest')).toMatchObject({ amount: 180, muted: false });
    expect(nov.unplanned.count).toBe(1);
  });

  it('vergangener Monat mit Überweisung: ① ist der überwiesene Betrag', () => {
    const s = goldenSettings({ checks: [{ period: P1, deposited: true, answeredAt: '2026-10-26T08:00:00.000Z', amount: 50 }] });
    const nov = monthCard(ds, P1, monthPlan(ds, ACTIVE, s, 25), 25, TODAY);
    expect(nov.reserve.total).toBe(50);
    expect(nov.reserve.items).toEqual([expect.objectContaining({ balance: 'save', amount: 50 })]);
  });

  it('Monatsbeginn 1: November = November-Gehalt, die Jacke zählt im November', () => {
    const p1 = monthPlan(ds, P1, goldenSettings(), 1);
    const card = monthCard(ds, P1, p1, 1, new Date(2026, 10, 10));
    expect(card.salary.title).toBe('November-Gehalt');
    expect(card.next.title).toBe('Dezember-Gehalt');
    expect(card.direct.total).toBe(2318);
    expect(card.unplanned.spent).toBe(200);
    expect(card.unplanned.total).toBe(300);
  });

  // gehalt-zum-planen: January has no entry. With „Gehalt zum Planen“ € 3.500 it counts with 3.500 instead of the
  // last salary entered (4.000): Netto 3.500 − ① 600 − ② 2.318 − ③ 350 = 232 vor Spielgeld; − ④ 300 = −68.
  // „Dein Plan“: the same 3.500, marked „geplant“; January is € 68 short of the Spielgeld.
  it('künftiger Monat ohne Eintrag mit „Gehalt zum Planen“ € 3.500', () => {
    const planned = monthPlan(ds, ACTIVE, goldenSettings({ planSalary: 3500 }), 25);
    const jan = monthCard(ds, P3, planned, 25, TODAY);
    expect([jan.salary.title, jan.salary.value, jan.salary.fallback, jan.salary.source]).toEqual(['Dezember-Gehalt', 3500, true, 'plan']);
    expect([jan.reserve.total, jan.direct.total, jan.wealth.total, jan.unplanned.total]).toEqual([600, 2318, 350, 300]);
    expect(jan.beforeSpielgeld).toBe(232);
    expect(jan.left).toBe(-68);
    const month = planned.months.find((m) => m.period === P3)!;
    expect([month.salary, month.estimated, month.free, month.short]).toEqual([3500, true, 232, true]);
    expect(planned.shortfall).toEqual({ period: P3, amount: 68 });
    // the months with an entry keep it: December stays at 4.000 and its numbers
    const dec = monthCard(ds, P2, planned, 25, TODAY);
    expect([dec.salary.value, dec.salary.fallback, dec.left]).toEqual([SALARY, false, 427]);
  });

  it('Positionen-Ø: monatliche + halbjährlich/12 + jährlich/12, ohne Einmalzahlungen und späteren Start', () => {
    // 2.318 direct + 360·2/12 + 600/12 = 2.428 (November); December has Strom € 95
    expect(fixedCostsAvg(ds, P1)).toBe(2428);
    expect(fixedCostsAvg(ds, P2)).toBe(2443);
  });
});
