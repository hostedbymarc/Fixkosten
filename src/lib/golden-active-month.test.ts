// Golden „aktiver Monat“ from the live export of 29.10.2026: today 26.10.2026, new month from the 25th.
// The targets are fixed in the sprint document; a deviation is a finding.
import { describe, expect, it } from 'vitest';
import { live29Dataset, liveDataset } from '../../tests/fixtures/live';
import { activeMonth } from './activeMonth';
import { forecastRange, savingsCard, yearForecast } from './analytics';
import { monthFigures, monthStatus, openFromPrevious } from './calc';
import { formatEUR, formatPercent } from './format';

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const TODAY = new Date(2026, 9, 26, 10, 0);

describe('Golden aktiver Monat (Live-Export 29.10.2026, heute 26.10.2026, Monatsbeginn 25.)', () => {
  const ds = live29Dataset();
  const active = activeMonth(TODAY, 25);

  it('aktiver Monat ist November 2026', () => {
    expect(active).toBe('2026-11');
  });

  it('Sparquote November 2026 · 10,2 % · € 800, + € 860 aus anderen Quellen', () => {
    const s = savingsCard(ds, active)!;
    expect(s.period).toBe('2026-11');
    expect(plain(formatPercent(s.rate))).toBe('10,2 %');
    expect(plain(formatEUR(s.wealthFromNet))).toBe('€ 800');
    expect(plain(formatEUR(s.wealthNotFromNet))).toBe('€ 860');
  });

  it('Jahresvorschau Nov 2026 – Okt 2027, Okt 2027 € 3.905,80, Summe € 43.182,25, davon einmalig € 3.158,45', () => {
    const f = yearForecast(ds, active);
    expect(forecastRange(f)).toBe('Nov 2026 – Okt 2027');
    expect(f.months[0]!.period).toBe('2026-11');
    expect(f.months.at(-1)!.period).toBe('2027-10');
    expect(Math.round(f.months.at(-1)!.due * 100)).toBe(390580);
    expect(Math.round(f.total * 100)).toBe(4318225);
    expect(Math.round(f.onceTotal * 100)).toBe(315845);
  });

  it('kein Banner im November; Monatsraster: Oktober ✓, November 5 offen', () => {
    expect(openFromPrevious(ds, '2026-11', active)).toEqual([]);
    expect(monthStatus(ds, '2026-10', active)).toEqual({ kind: 'paid' });
    expect(monthStatus(ds, '2026-11', active)).toEqual({ kind: 'open', count: 5 });
    expect(monthFigures(ds, '2026-11').openCount).toBe(5);
  });

  it('mit Monatsbeginn 1. bleibt der Kalendermonat: Oktober, alle bisherigen Goldwerte unverändert', () => {
    expect(activeMonth(TODAY, 1)).toBe('2026-10');
    // the golden tests of the export of 25.10. run with the calendar month (golden-live.test.ts)
    const old = liveDataset();
    expect(yearForecast(old, activeMonth(new Date(2026, 9, 25), 1)).months[0]!.period).toBe('2026-10');
  });
});
