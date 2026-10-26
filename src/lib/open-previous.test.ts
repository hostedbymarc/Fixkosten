// Banner „Offen aus <Monat>“: only months that are over (before today's month), the figure is the
// hero's „offen“ (Fixkosten without Vermögensaufbau), open Vermögensaufbau apart.
import { describe, expect, it } from 'vitest';
import { liveDataset, NOV, OKT } from '../../tests/fixtures/live';
import { countOpen, monthFigures, openFromPrevious, openSavings, shownOpen, sumOpen } from './calc';
import { addPeriods } from './period';

const DEZ = '2026-12';

describe('Banner „Offen aus …“ (Live-Export)', () => {
  it('heute = Okt 2026: Dezember und November zeigen kein Banner (November hat noch nicht begonnen)', () => {
    const ds = liveDataset();
    expect(openFromPrevious(ds, DEZ, OKT)).toEqual([]);
    expect(openFromPrevious(ds, NOV, OKT)).toEqual([]);
    expect(openFromPrevious(ds, OKT, OKT)).toEqual([]);
  });

  it('heute = Dez 2026, November offen: Banner 14 · € 5.199, Detail „+ 1 Vermögensaufbau · € 400“', () => {
    const ds = liveDataset();
    const groups = openFromPrevious(ds, DEZ, DEZ);
    expect(groups.map((g) => g.period)).toEqual([NOV]);
    expect(countOpen(groups)).toBe(14);
    expect(sumOpen(groups)).toBe(5199);
    expect(openSavings(groups)).toEqual({ count: 1, planned: 400 });
    expect(groups[0]!.savingsItems.map((i) => i.position.name)).toEqual(['ETF Sparplan']);
    // the banner figure is the November hero
    const nov = monthFigures(ds, NOV);
    expect([nov.openCount, shownOpen(nov)]).toEqual([14, 5199]);
  });

  it('heute = Nov 2026: Oktober ist abgebucht → kein Banner; der angezeigte Monat begrenzt zusätzlich', () => {
    const ds = liveDataset();
    expect(openFromPrevious(ds, NOV, NOV)).toEqual([]);
    expect(openFromPrevious(ds, DEZ, NOV)).toEqual([]);
    // looking back at November from January: only months before November
    expect(openFromPrevious(ds, NOV, '2027-01')).toEqual([]);
  });

  it('Invariante: Banner-Summe = Σ „offen“ (Hero) der betroffenen Monate, für jeden heutigen und angezeigten Monat', () => {
    const ds = liveDataset();
    for (let today = OKT; today <= '2027-12'; today = addPeriods(today, 1)) {
      for (let shown = OKT; shown <= '2027-12'; shown = addPeriods(shown, 1)) {
        const groups = openFromPrevious(ds, shown, today);
        for (const g of groups) {
          expect(g.period < today && g.period < shown, `${g.period} before ${today} and ${shown}`).toBe(true);
          const f = monthFigures(ds, g.period);
          expect([g.count, g.planned]).toEqual([f.openCount, shownOpen(f)]);
          expect(g.items.every((i) => i.kind === 'expense')).toBe(true);
          expect(g.savingsItems.every((i) => i.kind === 'savings')).toBe(true);
        }
        const heroSum = groups.reduce((cents, g) => cents + Math.round(shownOpen(monthFigures(ds, g.period)) * 100), 0) / 100;
        expect(sumOpen(groups)).toBe(heroSum);
        expect(countOpen(groups)).toBe(groups.reduce((n, g) => n + monthFigures(ds, g.period).openCount, 0));
      }
    }
  });
});
