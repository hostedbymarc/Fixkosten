import { describe, expect, it } from 'vitest';
import { activeMonth, isMonthStart, MONTH_START_CHOICES, toMonthStart, type MonthStart } from './activeMonth';

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0); // local noon
};

describe('activeMonth(today, startDay)', () => {
  const table: [string, MonthStart, string][] = [
    ['2026-10-24', 25, '2026-10'],
    ['2026-10-25', 25, '2026-11'],
    ['2026-11-24', 25, '2026-11'],
    ['2026-12-25', 25, '2027-01'], // year change
    ['2027-02-28', 'last', '2027-03'],
    ['2027-02-27', 'last', '2027-02'],
    ['2026-10-26', 1, '2026-10'],
  ];
  it.each(table)('%s, Start %s → %s', (today, start, expected) => {
    expect(activeMonth(day(today), start)).toBe(expected);
  });

  it('local time: just after midnight and just before midnight count to that local day', () => {
    expect(activeMonth(new Date(2026, 9, 25, 0, 0, 1), 25)).toBe('2026-11');
    expect(activeMonth(new Date(2026, 9, 24, 23, 59, 59), 25)).toBe('2026-10');
  });

  it('Monatsletzter: 30-, 31-day months and leap February', () => {
    expect(activeMonth(day('2026-11-30'), 'last')).toBe('2026-12');
    expect(activeMonth(day('2026-11-29'), 'last')).toBe('2026-11');
    expect(activeMonth(day('2026-12-31'), 'last')).toBe('2027-01');
    expect(activeMonth(day('2028-02-28'), 'last')).toBe('2028-02');
    expect(activeMonth(day('2028-02-29'), 'last')).toBe('2028-03');
  });

  it('start day 28 in February 2027 (28 days) begins on the 28th', () => {
    expect(activeMonth(day('2027-02-27'), 28)).toBe('2027-02');
    expect(activeMonth(day('2027-02-28'), 28)).toBe('2027-03');
  });

  it('start 1 is always the calendar month', () => {
    for (let d = 1; d <= 31; d++) expect(activeMonth(new Date(2026, 9, d, 12), 1)).toBe('2026-10');
  });

  it('choices: 1, 15–28, Monatsletzter; anything else (old files) → 1', () => {
    expect(MONTH_START_CHOICES).toEqual([1, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 'last']);
    expect(MONTH_START_CHOICES.every(isMonthStart)).toBe(true);
    for (const bad of [undefined, null, 0, 2, 14, 29, 31, '25', 'x', 25.5]) expect(toMonthStart(bad)).toBe(1);
    expect(toMonthStart(25)).toBe(25);
    expect(toMonthStart('last')).toBe('last');
  });
});
