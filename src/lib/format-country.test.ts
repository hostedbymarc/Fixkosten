import { afterEach, describe, expect, it } from 'vitest';
import { countryForCurrency, countryFromLanguage, CURRENCIES, CURRENCY_LABEL, currencyOf } from './country';
import { currencySymbol, formatAvg, formatCompactEUR, formatDelta, formatEUR, parseAmount, setFormatCountry, withoutCurrency } from './format';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

afterEach(() => setFormatCountry('AT'));

describe('Währung je Land (zentral in format.ts)', () => {
  it('AT (Standard): € vorne, de-AT', () => {
    expect(plain(formatEUR(1234.5))).toBe('€ 1.234,50');
    expect(currencySymbol()).toBe('€');
  });

  it('DE: de-DE, € hinten', () => {
    setFormatCountry('DE');
    expect(plain(formatEUR(1234.5))).toBe('1.234,50 €');
    expect(plain(formatEUR(-490))).toBe('−490 €');
    expect(plain(formatDelta(12))).toBe('+12 €');
    expect(plain(formatCompactEUR(3403))).toBe('3,4k €');
    expect(withoutCurrency(formatEUR(2952))).toBe('2.952');
  });

  it('CH: CHF mit de-CH-Formatierung', () => {
    setFormatCountry('CH');
    expect(currencySymbol()).toBe('CHF');
    expect(plain(formatEUR(1234.5)).replace('’', "'")).toBe("CHF 1'234.50");
    expect(plain(formatAvg(12))).toBe('CHF 12.00');
    expect(plain(formatEUR(-5))).toBe('−CHF 5');
    expect(plain(formatCompactEUR(3403))).toBe('CHF 3.4k');
    expect(parseAmount("1'234.50")).toBe(1234.5);
    expect(parseAmount('CHF 1’234.50')).toBe(1234.5);
  });

  it('Land aus navigator.language', () => {
    expect(countryFromLanguage(['de-DE'])).toBe('DE');
    expect(countryFromLanguage(['fr-CH', 'de'])).toBe('CH');
    expect(countryFromLanguage('de-AT')).toBe('AT');
    expect(countryFromLanguage(['en-US'])).toBe('AT');
    expect(countryFromLanguage(undefined)).toBe('AT');
  });
});

describe('Nur Währung sichtbar: das Land folgt aus Währung und Browsersprache', () => {
  it('genau zwei Optionen: Euro (€) und Schweizer Franken (CHF)', () => {
    expect(CURRENCIES.map((c) => CURRENCY_LABEL[c])).toEqual(['Euro (€)', 'Schweizer Franken (CHF)']);
  });
  it('CHF → CH, egal welche Sprache', () => {
    for (const lang of ['de-AT', 'de-DE', 'de-CH', 'en-US']) expect(countryForCurrency('CHF', lang)).toBe('CH');
  });
  it('Euro: de-AT → AT (AT-Vorlagen zuerst), de-DE → DE, sonst AT', () => {
    expect(countryForCurrency('EUR', 'de-AT')).toBe('AT');
    expect(countryForCurrency('EUR', ['de-DE', 'de'])).toBe('DE');
    expect(countryForCurrency('EUR', 'de-CH')).toBe('AT');
    expect(countryForCurrency('EUR', 'en-US')).toBe('AT');
    expect(countryForCurrency('EUR', [])).toBe('AT');
  });
  it('zurück zur Währung: AT und DE sind Euro, CH ist Franken', () => {
    expect([currencyOf('AT'), currencyOf('DE'), currencyOf('CH')]).toEqual(['EUR', 'EUR', 'CHF']);
  });
});
