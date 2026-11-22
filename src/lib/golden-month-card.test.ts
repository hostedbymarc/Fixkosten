// monat-ist-monat · Golden Test (invented data, tests/fixtures/golden-month.ts): „Dein Monat“ shows the ACTIVE
// period. Three periods in a row (start 25: November, December, January = year change). Every number that is
// shown in two places is the same: ①–④, item counts, „Übrig“, the Spielgeld pill, the salary tile, the hero of
// past and future months, „Dein Plan“ and the Positionen-Ø.
import { describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P1, P2, P3, SALARY, SPIELGELD } from '../../tests/fixtures/golden-month';
import { fixedCostsAvg, monthFigures, monthItems } from './calc';
import { monthCard, type CardRow } from './monthCard';
import { monthPlan } from './monthPlan';
import { salaryView, salaryWhen } from './salaryMonth';
import { salaryParts } from './salarySplit';
import type { Period } from './types';

const plain = (s: string) => s.replace(/ /g, ' ');
const sum = (r: CardRow) => Math.round(r.items.filter((i) => !i.muted).reduce((a, i) => a + i.amount * 100, 0)) / 100;

/** a day inside each period (start 25: November = 25.10.–24.11.) */
const TODAY: Record<Period, Date> = { [P1]: new Date(2026, 10, 10), [P2]: new Date(2026, 11, 10), [P3]: new Date(2027, 0, 10) };

// the expected values, worked out by hand (see the report, MONAT-IST-MONAT.md)
const EXPECTED = {
  [P1]: { title: 'Oktober-Gehalt', when: 'ausgezahlt am 25. Oktober', reserve: 0, direct: 2318, directCount: 14, wealth: 350, unplanned: 120, other: 0, before: 1332, left: 1212, rest: 180, over: 0, next: 'November-Gehalt' },
  [P2]: { title: 'November-Gehalt', when: 'ausgezahlt am 25. November', reserve: 360, direct: 2333, directCount: 14, wealth: 350, unplanned: 450, other: 200, before: 957, left: 507, rest: 0, over: 150, next: 'Dezember-Gehalt' },
  [P3]: { title: 'Dezember-Gehalt', when: 'ausgezahlt am 25. Dezember', reserve: 600, direct: 2318, directCount: 14, wealth: 350, unplanned: 0, other: 0, before: 732, left: 732, rest: 300, over: 0, next: 'Jänner-Gehalt' },
} as const;

describe('Golden Test „Dein Monat“ (Monatsbeginn 25)', () => {
  const ds = goldenDataset();
  const s = goldenSettings();
  for (const period of [P1, P2, P3] as const) {
    const e = EXPECTED[period];
    describe(period, () => {
      const plan = monthPlan(ds, period, s, 25);
      const card = monthCard(ds, period, plan, 25, TODAY[period]);

      it('Kopf: Gehalt am Zeitraum-Anfang, dieselbe Zahl wie die Netto-Kachel', () => {
        expect(card.salary.title).toBe(e.title);
        // the card: the long date; the tile (salaryView): the short one
        expect(plain(salaryWhen(period, 25, TODAY[period]))).toBe(e.when);
        expect(card.salary.when).toMatch(/^ausgezahlt am 25\.\d+\.$/);
        expect(card.salary.value).toBe(SALARY);
        expect(salaryView(ds, period, 25, TODAY[period])).toEqual(card.salary);
      });

      it('① – ④ und die Anzahl Posten', () => {
        expect(card.reserve.total).toBe(e.reserve);
        expect(card.direct.total).toBe(e.direct);
        expect(card.direct.count).toBe(e.directCount);
        expect(card.wealth.total).toBe(e.wealth);
        expect(card.unplanned.total).toBe(e.unplanned);
        expect(card.unplanned.other).toBe(e.other);
      });

      it('jede Liste ergibt ihre Zeile', () => {
        for (const r of [card.reserve, card.direct, card.wealth, card.unplanned]) expect(sum(r)).toBe(r.total);
      });

      it('Übrig und „Vor Spielgeld frei“', () => {
        expect(card.beforeSpielgeld).toBe(e.before);
        expect(card.left).toBe(e.left);
        expect(card.left).toBe(Math.round((SALARY - e.reserve - e.direct - e.wealth - e.unplanned) * 100) / 100);
      });

      it('Spielgeld-Pille: ④ gegen das Limit', () => {
        expect(card.pill).toEqual({ limit: SPIELGELD, used: e.unplanned, rest: e.rest, over: e.over });
      });

      it('nächstes Gehalt unter der Karte', () => {
        expect(card.next.title).toBe(e.next);
        expect(plain(card.next.when)).toMatch(/^kommt am 25\. /);
      });

      it('„Dein Plan“: vor der Überweisung ist ① der erste Plan-Monat; ② ③ wie im Plan', () => {
        expect(plan.first.period).toBe(period);
        expect(plan.current).toBe(plan.first);
        expect(plan.first.transfer).toBe(card.reserve.total);
        expect(plan.first.direct).toBe(card.direct.total);
        expect(plan.first.wealth).toBe(card.wealth.total);
      });

      it('Hero des Monats: ② = Direkt, ③ = Vermögensaufbau vom Netto, Abzüge = ① + ② + ③ (Bei Fälligkeit)', () => {
        const f = monthFigures(ds, period);
        expect(f.wealthFromNet).toBe(card.wealth.total);
        expect(salaryParts(ds, period).direct).toBe(card.direct.total);
        expect(f.deductions).toBe(Math.round((card.reserve.total + card.direct.total + card.wealth.total) * 100) / 100);
        // „Vor Spielgeld frei“ = the hero's Frei (January has no own salary: the hero shows none, the card the last one)
        expect(Math.round((SALARY - f.deductions) * 100) / 100).toBe(card.beforeSpielgeld);
        if (f.netSalary !== null) expect(f.free).toBe(card.beforeSpielgeld);
        // ④ counts in no sum of the hero
        expect(monthItems(ds, period).some((i) => i.name === 'Konzert' || i.name === 'Fahrrad')).toBe(false);
      });
    });
  }

  it('der Plan eines Monats zeigt die folgenden Zeiträume mit denselben ② und ③ wie ihre Karte', () => {
    const plan = monthPlan(ds, P1, s, 25);
    for (const [i, period] of [P1, P2, P3].entries()) {
      const card = monthCard(ds, period, monthPlan(ds, period, s, 25), 25, TODAY[period]);
      expect(plan.months[i]!.period).toBe(period);
      expect(plan.months[i]!.direct).toBe(card.direct.total);
      expect(plan.months[i]!.wealth).toBe(card.wealth.total);
      // nothing saved and „Bei Fälligkeit“: the plan's transfer is the bill of that month
      expect(plan.months[i]!.transfer).toBe(card.reserve.total);
    }
  });

  it('Hero vergangener und künftiger Monate: dieselben Summen wie die Karte dieses Monats', () => {
    // seen from December: November (past) and January (future)
    for (const period of [P1, P3]) {
      const card = monthCard(ds, period, monthPlan(ds, period, s, 25), 25, TODAY[period]);
      const f = monthFigures(ds, period);
      expect(Math.round((SALARY - f.deductions) * 100) / 100).toBe(card.beforeSpielgeld);
      expect(f.wealthFromNet).toBe(card.wealth.total);
    }
  });

  it('Positionen-Ø: monatliche + halbjährlich/12 + jährlich/12, ohne Einmalzahlungen und späteren Start', () => {
    // 2.318 direct + 360·2/12 + 600/12 = 2.428 (November); December has Strom € 95
    expect(fixedCostsAvg(ds, P1)).toBe(2428);
    expect(fixedCostsAvg(ds, P2)).toBe(2443);
  });

  it('Monatsbeginn 1: November = November-Gehalt, dieselben ② ③ ④', () => {
    const plan = monthPlan(ds, P1, s, 1);
    const card = monthCard(ds, P1, plan, 1, new Date(2026, 10, 10));
    expect(card.salary.title).toBe('November-Gehalt');
    expect(card.next.title).toBe('Dezember-Gehalt');
    expect(card.direct.total).toBe(2318);
    expect(card.unplanned.total).toBe(120);
  });

  it('Jänner ohne eigenes Gehalt: das zuletzt eingetragene in Karte und Kachel', () => {
    const card = monthCard(ds, P3, monthPlan(ds, P3, s, 25), 25, TODAY[P3]);
    expect(card.salary.fallback).toBe(true);
    expect(card.salary.value).toBe(SALARY);
  });
});
