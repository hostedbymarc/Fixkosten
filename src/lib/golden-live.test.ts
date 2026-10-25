// Golden fixtures from the live export (25.10.2026): every figure against the target values
// of the sprint document, to the cent. The targets are fixed here; a deviation is a finding.
import { describe, expect, it } from 'vitest';
import { liveDataset, NOV, OKT, withMieteNotFromNet } from '../../tests/fixtures/live';
import { categoryDistribution, forecastSummary, planVsActual, historyPeriods, savingsCard, yearForecast } from './analytics';
import {
  categoryFigures,
  fixedCostsAvg,
  freeAfterFixed,
  freeAfterFixedAvg,
  monthFigures,
  plannedForPeriod,
  progressPercent,
  reserveNeeded,
  savingsRate,
  shownOpen,
  sumMonthlyEquivalent,
  wealthBuilding,
  wealthBuildingAvg,
  wealthFromNet,
  type MonthFigures,
} from './calc';
import { deductionsExplanation } from './explain';
import { formatAvg, formatEUR, formatPercent } from './format';
import type { Dataset } from './types';

const plain = (s: string) => s.replace(/ /g, ' ');
const cents = (v: number) => Math.round(v * 100);
const id = (ds: Dataset, name: string) => ds.categories.find((c) => c.name === name)!.id;

/** [Summe, bezahlt/fällig, Ø] of a category header */
function header(ds: Dataset, f: MonthFigures, period: string, name: string) {
  const t = categoryFigures(f, id(ds, name));
  return [t.total, `${t.paidCount}/${t.count}`, Math.round(sumMonthlyEquivalent(ds, period, { categoryId: id(ds, name) }) * 100) / 100];
}

describe('Golden November 2026 (Live-Export)', () => {
  const ds = liveDataset();
  const f = monthFigures(ds, NOV);

  it('Hero, Kacheln, Sparquote', () => {
    expect(f.netSalary).toBe(7819);
    expect([f.total, f.paid, shownOpen(f)]).toEqual([5649, 450, 5199]);
    expect([f.openCount, progressPercent(f)]).toEqual([14, 8]);
    expect([f.wealth, f.wealthFromNet, f.wealthNotFromNet]).toEqual([800, 800, 0]);
    expect(f.deductions).toBe(6449);
    expect(f.free).toBe(1370);
    expect(cents(fixedCostsAvg(ds, NOV))).toBe(295217);
    expect(cents(reserveNeeded(ds, NOV))).toBe(28817);
    expect(wealthBuildingAvg(ds, NOV)).toBe(800);
    expect(freeAfterFixedAvg(ds, NOV)).toBe(4066.83);
    expect(plain(formatPercent(f.savingsRate!))).toBe('10,2 %');
    expect(plain(deductionsExplanation(f).breakdown)).toBe('€ 5.649 Fixkosten + € 800 Vermögensaufbau');
  });

  it('Kategorien: Summe · bezahlt · Ø', () => {
    expect(header(ds, f, NOV, 'Wohnen & Leben')).toEqual([1572, '1/6', 1675.5]);
    expect(header(ds, f, NOV, 'Immo')).toEqual([991, '0/3', 1034.67]);
    expect(header(ds, f, NOV, 'Abos')).toEqual([71, '0/4', 137]);
    expect(header(ds, f, NOV, 'Investieren')).toEqual([800, '1/2', 800]);
    expect(header(ds, f, NOV, 'Sonstiges')).toEqual([3015, '0/2', 105]);
  });
});

describe('Golden Oktober 2026, „Miete 1220“ auf Default (abziehen)', () => {
  const ds = liveDataset();
  const f = monthFigures(ds, OKT);

  it('Hero, Kacheln, Sparquote', () => {
    expect(f.netSalary).toBe(4788);
    expect([f.total, plannedForPeriod(ds, OKT)]).toEqual([3488.5, 3488]);
    expect([f.paid, shownOpen(f), f.openCount, progressPercent(f)]).toEqual([3488.5, 0, 0, 100]);
    expect([f.wealth, f.wealthFromNet, f.wealthNotFromNet]).toEqual([1860, 1860, 0]);
    expect(f.deductions).toBe(5348.5);
    expect(f.free).toBe(-560.5);
    expect(plain(formatEUR(f.free!))).toBe('−€ 560,50');
    expect(freeAfterFixedAvg(ds, OKT)).toBe(1035.83); // 4.788 − 2.952,17 − 800,00
    expect(plain(formatPercent(f.savingsRate!))).toBe('38,8 %');
  });

  it('Kategorien', () => {
    const sums = ['Wohnen & Leben', 'Immo', 'Abos', 'Investieren', 'Sonstiges'].map((n) => header(ds, f, OKT, n)[0]);
    expect(sums).toEqual([1651.5, 991, 776, 1860, 70]);
  });
});

describe('Golden Oktober 2026, „Miete 1220“ auf „nicht abziehen“ (nur im Test)', () => {
  const ds = withMieteNotFromNet(liveDataset());
  const f = monthFigures(ds, OKT);
  const before = monthFigures(liveDataset(), OKT);

  it('Vermögensaufbau 1.860 = 800 vom Netto + 1.060 nicht vom Netto; Abzüge, Frei, Sparquote', () => {
    expect([f.wealth, f.wealthFromNet, f.wealthNotFromNet]).toEqual([1860, 800, 1060]);
    expect(f.deductions).toBe(4288.5);
    expect(f.free).toBe(499.5);
    expect(plain(formatPercent(f.savingsRate!))).toBe('16,7 %');
    expect(plain(deductionsExplanation(f).breakdown)).toBe('€ 3.488,50 Fixkosten + € 800 Vermögensaufbau');
    expect(plain(deductionsExplanation(f).notFromNet!)).toBe('€ 1.060 Vermögensaufbau nicht vom Netto, nicht abgezogen');
    // the older API follows
    expect([wealthBuilding(ds, OKT), wealthFromNet(ds, OKT), freeAfterFixed(ds, OKT)]).toEqual([1860, 800, 499.5]);
    expect(savingsRate(ds, OKT)).toBe(f.savingsRate);
  });

  it('unverändert: Fixkosten 3.488,50, im Ø-Monat 1.035,83, Investieren-Header 1.860, Ø Vermögensaufbau 800,00', () => {
    expect(f.total).toBe(3488.5);
    expect(f.total).toBe(before.total);
    expect(freeAfterFixedAvg(ds, OKT)).toBe(1035.83);
    expect(header(ds, f, OKT, 'Investieren')[0]).toBe(1860);
    expect(plain(formatAvg(wealthBuildingAvg(ds, OKT)))).toBe('€ 800,00');
    expect(f.categories.map((c) => [c.category.name, c.total, c.paidCount, c.count])).toEqual(
      before.categories.map((c) => [c.category.name, c.total, c.paidCount, c.count]),
    );
  });

  it('Sparquote-Karte: Prozent und Balken vom Netto, „+ € 1.060 aus anderen Quellen“, Zusammensetzung getrennt', () => {
    const card = savingsCard(ds, OKT)!;
    expect([card.wealth, card.wealthFromNet, card.wealthNotFromNet, plain(formatPercent(card.rate))]).toEqual([1860, 800, 1060, '16,7 %']);
    expect(card.parts.map((p) => [p.name, p.amount])).toEqual([
      ['ETF Sparplan', 400],
      ['Cash', 400],
    ]);
    expect(card.otherParts.map((p) => [p.name, p.amount])).toEqual([['Miete 1220', 1060]]);
  });
});

describe('Analyse (heute = Oktober 2026, Live-Export)', () => {
  const ds = liveDataset();

  it('Verteilung: 1.675,50 (56,8 %) · 1.034,67 (35,0 %) · 137,00 (4,6 %) · 105,00 (3,6 %), Summe 2.952,17 = 100,0 %', () => {
    const d = categoryDistribution(ds, OKT);
    expect(d.rows.map((r) => [r.category.name, plain(formatAvg(r.monthly)), plain(formatPercent(r.share))])).toEqual([
      ['Wohnen & Leben', '€ 1.675,50', '56,8 %'],
      ['Immo', '€ 1.034,67', '35,0 %'],
      ['Abos', '€ 137,00', '4,6 %'],
      ['Sonstiges', '€ 105,00', '3,6 %'],
    ]);
    expect(plain(formatAvg(d.total))).toBe('€ 2.952,17');
    expect(plain(formatPercent(d.rows.reduce((a, r) => a + r.share, 0)))).toBe('100,0 %');
  });

  it('Teuerster Monat Nov 2026 · 5.649 · 2.697 über Ø', () => {
    const s = forecastSummary(yearForecast(ds, OKT));
    expect([s.label, plain(s.value), plain(s.sub)]).toEqual(['Teuerster Monat', 'Nov 2026 · € 5.649', '€ 2.697 über Ø']);
  });

  it('Sparquote-Karte Oktober 2026: 38,8 % · € 1.860', () => {
    const card = savingsCard(ds, OKT)!;
    expect([card.period, plain(formatPercent(card.rate)), card.wealthFromNet, card.wealthNotFromNet]).toEqual([OKT, '38,8 %', 1860, 0]);
  });

  it('Plan vs. Ist Oktober: Ist 3.488,50 · Plan 3.488,00', () => {
    const p = planVsActual(ds, historyPeriods(ds, OKT, '12m'), OKT);
    const okt = p.rows.find((r) => r.period === OKT)!;
    expect([okt.actual, okt.planned, okt.running]).toEqual([3488.5, 3488, true]);
  });
});

describe('Jahresvorschau mit dem Live-Export (Okt 2026 – Sep 2027)', () => {
  const ds = liveDataset();
  const f = yearForecast(ds, OKT);

  it('der erste Balken = Fixkosten gesamt des Monats', () => {
    expect(f.months[0]!.period).toBe(OKT);
    expect(f.months[0]!.due).toBe(monthFigures(ds, OKT).total);
  });

  it('Jänner-Aufschlag: „Kredit 1160“ (Immo, € 460 monatlich ab Jänner 2027) in jedem Monat ab Jänner', () => {
    const kredit = ds.positions.find((p) => p.name === 'Kredit 1160')!;
    expect(kredit.categoryId).toBe(id(ds, 'Immo'));
    expect(kredit.history).toEqual([expect.objectContaining({ validFrom: '2027-01', amount: 460, frequency: 'monthly' })]);
    const monthlyToday = 2664; // monthly expense positions today (Oct 2026)
    const nonMonthly: Record<string, number> = {
      '2026-10': 14 + 35 + 690 + 15, // Entgelt Konto, Entgelt Depot, Amex, Amex Turbopunkte (Ist incl. € 0,50 more for Depot)
      '2026-12': 262 + 87, // Baurechtszins, Parqet
      '2027-01': 14 + 35,
      '2027-02': 1260 + 686,
      '2027-04': 14 + 35,
      '2027-06': 262,
      '2027-07': 14 + 35,
    };
    const once: Record<string, number> = { '2026-10': 70, '2026-11': 504 + 2511, '2026-12': 130 };
    for (const m of f.months) {
      const kredit1160 = m.period >= '2027-01' ? 460 : 0;
      // ticked months count the Ist: Entgelt Depot Okt € 35,50 (+0,50), Lebensmittel Nov € 450 (−30)
      const actual = m.period === OKT ? 0.5 : m.period === NOV ? -30 : 0;
      expect(m.regular, m.period).toBeCloseTo(monthlyToday + kredit1160 + (nonMonthly[m.period] ?? 0) + actual, 2);
      expect(m.once, m.period).toBe(once[m.period] ?? 0);
    }
  });
});
