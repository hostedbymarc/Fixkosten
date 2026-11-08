import { format as formatDateFns, parseISO } from 'date-fns';
import { COUNTRY_FORMAT, DEFAULT_COUNTRY, type Country } from './country';

// The one place money is formatted. The country (Einstellungen → Land) picks locale and currency:
// AT de-AT € (the default, as always), DE de-DE €, CH de-CH CHF. Every function below reads the
// formatters of the current country; nothing else in the app writes a currency sign.

/** The euro sign, for glyph metrics only (src/components/fitText.ts). */
export const EURO_SIGN = '€';

interface Formatters {
  country: Country;
  money2: Intl.NumberFormat;
  money0: Intl.NumberFormat;
  pct1: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  symbol: string;
  /** symbol before the number ('€ 12', 'CHF 12') or after it ('12 €') */
  prefix: boolean;
}

function buildFormatters(country: Country): Formatters {
  const { locale, currency } = COUNTRY_FORMAT[country];
  const money = (digits: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money2 = money(2);
  const parts = money2.formatToParts(1);
  const symbolIndex = parts.findIndex((p) => p.type === 'currency');
  const integerIndex = parts.findIndex((p) => p.type === 'integer');
  return {
    country,
    money2,
    money0: money(0),
    pct1: new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    compact: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    symbol: parts[symbolIndex]?.value ?? currency,
    prefix: symbolIndex < integerIndex,
  };
}

let fmt = buildFormatters(DEFAULT_COUNTRY);

/** Switches every formatter to the country's locale and currency (App, on start and on change). */
export function setFormatCountry(country: Country): void {
  if (fmt.country !== country) fmt = buildFormatters(country);
}

export function formatCountry(): Country {
  return fmt.country;
}

/** '€' / 'CHF': the sign in front of an amount input. */
export function currencySymbol(): string {
  return fmt.symbol;
}

/** '€ 2.952' → '2.952' (also '2.952 €', 'CHF 2'952'): an amount without its currency sign. */
export function withoutCurrency(text: string): string {
  const sym = fmt.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^${sym}\\s|\\s${sym}$`), '');
}

/**
 * The one minus sign of the app (U+2212 MINUS SIGN): every negative amount, delta and
 * percentage uses it, never the hyphen-minus '-' or a dash.
 */
export const MINUS = '\u2212';

/** Replaces a leading hyphen-minus from Intl with MINUS. */
const withMinus = (s: string) => s.replace(/^-/, MINUS);

/**
 * '€ 1.234,56'. Whole-euro amounts drop the cents ('€ 3.368') unless
 * `fixed` is set, matching how the old notes were written.
 */
export function formatEUR(value: number, opts: { fixed?: boolean } = {}): string {
  const cents = Math.round(value * 100);
  // negative: typographic minus, no space before '€' ('−€ 490', never '-€ 490')
  if (cents < 0) return `${MINUS}${formatEUR(-cents / 100, opts)}`;
  const normalized = cents / 100 || 0; // avoid '-0'
  if (!opts.fixed && cents % 100 === 0) return fmt.money0.format(normalized);
  return fmt.money2.format(normalized);
}

/**
 * Spread amounts („Ø pro Monat“, ÷12 etc.) always with cents: '€ 1.602,00', '€ 2.952,17'.
 * Amounts of a month keep formatEUR ('€ 991').
 */
export function formatAvg(value: number): string {
  return formatEUR(value, { fixed: true });
}

/** Signed delta: '+€ 12' / '−€ 5' (typographic minus). */
export function formatDelta(value: number, opts: { fixed?: boolean } = {}): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return formatEUR(0, opts);
  const sign = cents > 0 ? '+' : MINUS;
  return `${sign}${formatEUR(Math.abs(cents) / 100, opts)}`;
}

/** True when any of the amounts has cents: amounts compared side by side then all show cents. */
export function needsCents(...values: number[]): boolean {
  return values.some((v) => Math.round(v * 100) % 100 !== 0);
}

/**
 * Amounts compared directly („€ 3.488,50 von € 3.488,00“, Plan | Ist): one precision for all.
 * With cents in any of them, every one shows cents; otherwise none does.
 */
export function formatEURSet(...values: number[]): string[] {
  const fixed = needsCents(...values);
  return values.map((v) => formatEUR(v, { fixed }));
}

/** '05.10.2026' */
export function formatDate(iso: string): string {
  return formatDateFns(parseISO(iso), 'dd.MM.yyyy');
}

/** '3.10.' — day.month. as in the old notes */
export function formatDayMonth(day: number, month: number): string {
  return `${day}.${month}.`;
}

/**
 * Parses user input in de-AT style: '1.234,56', '12,5', '12.50', '€ 12'.
 * Returns null for anything that is not a finite number.
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/CHF|Fr\./gi, '').replace(/[€\s  '’]/g, '').replace(/^[\u2212\u2010-\u2014]/, '-'); // any minus or dash counts as minus
  if (s === '' || s === '-') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // '1.234' = thousands, not decimals
  }
  // at most 2 decimals: cents, nothing finer ('1,234' is no amount)
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Value for an <input>: '12,50' / '735' */
export function amountToInput(value: number): string {
  const cents = Math.round(value * 100);
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** 0.16 → '16,0 %' */
export function formatPercent(ratio: number): string {
  return withMinus(fmt.pct1.format(ratio));
}

/** Axis label without the currency: '3,4k', '850', '−1,2k' */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 && Math.round(abs) !== 0 ? MINUS : '';
  return `${sign}${abs >= 1000 ? `${fmt.compact.format(abs / 1000)}k` : String(Math.round(abs))}`;
}

/** Axis label: '€ 3,4k', '€ 850', '−€ 1,2k' (DE '3,4k €', CH 'CHF 3.4k') */
export function formatCompactEUR(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 && Math.round(abs) !== 0 ? MINUS : '';
  const body = formatCompactNumber(abs);
  return fmt.prefix ? `${sign}${fmt.symbol} ${body}` : `${sign}${body} ${fmt.symbol}`;
}

/** Axis label for ratios: 0.16 → '16 %' */
export function formatPercentShort(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
