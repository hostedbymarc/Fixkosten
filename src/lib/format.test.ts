import { describe, expect, it } from 'vitest';
import { amountToInput, groupAmountInput, formatDate, formatDelta, formatEUR, formatEURSet, needsCents, parseAmount } from './format';
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
    expect(formatEUR(-0.004)).toBe(nb('€ 0'));
  });

  it('negative amounts: typographic minus (U+2212) and no-break space', () => {
    expect(formatEUR(-490)).toBe('\u2212€\u00a0490');
    expect(formatEUR(-1234.5)).toBe('\u2212€\u00a01.234,50');
    expect(formatEUR(-490)).not.toContain('-');
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

  it('Cent-Beträge: bis zu 2 Nachkommastellen, Komma als Trenner, eingefügt mit und ohne Tausenderpunkt', () => {
    expect(parseAmount('1.087,43')).toBe(1087.43);
    expect(parseAmount('1087,43')).toBe(1087.43);
    expect(parseAmount(' € 1.087,43 ')).toBe(1087.43);
    expect(parseAmount('1087.43')).toBe(1087.43);
    expect(parseAmount('0,5')).toBe(0.5);
    expect(parseAmount('3.282,48')).toBe(3282.48);
    // finer than a cent: no amount
    expect(parseAmount('1,234')).toBeNull();
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    // shown with a comma, always
    expect(amountToInput(1087.43)).toBe('1.087,43');
    expect(amountToInput(0.5)).toBe('0,50');
    expect(amountToInput(parseAmount('1.087,43')!)).toBe('1.087,43');
    expect(amountToInput(1200)).toBe('1.200');
    expect(amountToInput(1234567.5)).toBe('1.234.567,50');
    expect(formatEUR(1087.43).replace(/\s/g, ' ')).toBe('€ 1.087,43');
    expect(formatEUR(362.48).replace(/\s/g, ' ')).toBe('€ 362,48');
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

describe('gleiche Genauigkeit für direkt verglichene Beträge', () => {
  const plain = (xs: string[]) => xs.map((x) => x.replace(/\u00a0/g, ' '));
  it('Cent in einem Betrag → beide mit Cent („€ 3.488,50 von € 3.488,00“)', () => {
    expect(plain(formatEURSet(3488.5, 3488))).toEqual(['€ 3.488,50', '€ 3.488,00']);
    expect(plain(formatEURSet(3488, 3488.5))).toEqual(['€ 3.488,00', '€ 3.488,50']);
  });
  it('ohne Cent → beide ohne', () => {
    expect(plain(formatEURSet(3368, 3403))).toEqual(['€ 3.368', '€ 3.403']);
  });
  it('Differenz folgt derselben Genauigkeit', () => {
    expect(needsCents(3488.5, 3488)).toBe(true);
    expect(formatDelta(0.5, { fixed: true }).replace(/\u00a0/g, ' ')).toBe('+€ 0,50');
    expect(formatDelta(12, { fixed: true }).replace(/\u00a0/g, ' ')).toBe('+€ 12,00');
    expect(formatDelta(12).replace(/\u00a0/g, ' ')).toBe('+€ 12');
  });
});

// spielgeld-planer: every amount field shows the thousands dot, also while typing
describe('groupAmountInput: Tausenderpunkt beim Tippen und Einfügen', () => {
  it('Tippen Ziffer für Ziffer', () => {
    const typed = ['1', '12', '120', '1200', '12000', '120000', '1200000'].map(groupAmountInput);
    expect(typed).toEqual(['1', '12', '120', '1.200', '12.000', '120.000', '1.200.000']);
    expect(['1.200,', '1.200,5', '1.200,50'].map(groupAmountInput)).toEqual(['1.200,', '1.200,5', '1.200,50']);
  });
  it('Einfügen: „1.200“, „1200“, „1.200,50“, „1200.50“, „€ 1 200“', () => {
    expect(groupAmountInput('1.200')).toBe('1.200');
    expect(groupAmountInput('1200')).toBe('1.200');
    expect(groupAmountInput('1.200,50')).toBe('1.200,50');
    expect(groupAmountInput('1200.50')).toBe('1.200,50');
    expect(groupAmountInput('1200.5')).toBe('1.200,5');
    expect(groupAmountInput('€ 1 200')).toBe('1.200');
    expect(groupAmountInput('12.345.678')).toBe('12.345.678');
    expect(['1.200', '1200', '1.200,50', '1200.50'].map((v) => parseAmount(groupAmountInput(v)))).toEqual([1200, 1200, 1200.5, 1200.5]);
  });
  it('Löschen: ein Punkt zu wenig wird neu gesetzt', () => {
    expect(groupAmountInput('1.20')).toBe('1,20');
    expect(groupAmountInput('120')).toBe('120');
    expect(groupAmountInput('1.2000')).toBe('12.000');
  });
  it('Komma und Punkt am Ende, führende Nullen, höchstens zwei Dezimalen', () => {
    expect(groupAmountInput('12,')).toBe('12,');
    expect(groupAmountInput('12.')).toBe('12,');
    expect(groupAmountInput(',5')).toBe('0,5');
    expect(groupAmountInput('007')).toBe('7');
    expect(groupAmountInput('1,234')).toBe('1,23');
    expect(groupAmountInput('')).toBe('');
    expect(groupAmountInput('-1200')).toBe('-1.200');
    expect(groupAmountInput('−50')).toBe('-50');
  });
  it('jeder gruppierte Wert ist ein gültiger Betrag', () => {
    for (const v of [0.5, 12, 1200, 1200.5, 3282.48, 1234567.89]) expect(parseAmount(amountToInput(v))).toBe(v);
  });
});
