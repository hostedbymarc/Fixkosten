import { describe, expect, it } from 'vitest';
import { amountToInput, formatDate, formatDelta, formatEUR, parseAmount } from './format';
import { addPeriods, periodLabel, periodRange } from './period';

// Intl separates '€' and the number with a no-break space
const nb = (s: string) => s.replace(/ /g, ' ');

describe('format (de-AT)', () => {
  it('formats euros', () => {
    expect(formatEUR(1234.56)).toBe(nb('€ 1.234,56'));
    expect(formatEUR(3368)).toBe(nb('€ 3.368'));
    expect(formatEUR(3368, { fixed: true })).toBe(nb('€ 3.368,00'));
    expect(formatEUR(288.1666)).toBe(nb('€ 288,17'));
    expect(formatEUR(-0)).toBe(nb('€ 0'));
  });

  it('formats deltas', () => {
    expect(formatDelta(12)).toBe(nb('+€ 12'));
    expect(formatDelta(-5)).toBe(nb('−€ 5'));
  });

  it('formats dates', () => {
    expect(formatDate('2026-10-05T08:00:00')).toBe('05.10.2026');
  });

  it('parses amounts', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1.260')).toBe(1260);
    expect(parseAmount('€ 76')).toBe(76);
    expect(parseAmount('-40,5')).toBe(-40.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(amountToInput(262.02)).toBe('262,02');
    expect(amountToInput(735)).toBe('735');
  });
});

describe('period', () => {
  it('labels and arithmetic', () => {
    expect(periodLabel('2026-10')).toBe('Oktober 2026');
    expect(addPeriods('2026-12', 1)).toBe('2027-01');
    expect(addPeriods('2026-01', -1)).toBe('2025-12');
    expect(periodRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
