import { format as formatDateFns, parseISO } from 'date-fns';

const eur2 = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const eur0 = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * '€ 1.234,56'. Whole-euro amounts drop the cents ('€ 3.368') unless
 * `fixed` is set, matching how the old notes were written.
 */
export function formatEUR(value: number, opts: { fixed?: boolean } = {}): string {
  const cents = Math.round(value * 100);
  const normalized = cents / 100 || 0; // avoid '-0'
  if (!opts.fixed && cents % 100 === 0) return eur0.format(normalized);
  return eur2.format(normalized);
}

/** Signed delta: '+€ 12' / '−€ 5' (typographic minus). */
export function formatDelta(value: number): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return formatEUR(0);
  const sign = cents > 0 ? '+' : '−';
  return `${sign}${formatEUR(Math.abs(cents) / 100)}`;
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
  let s = input.replace(/[€\s  ]/g, '').replace('−', '-');
  if (s === '' || s === '-') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // '1.234' = thousands, not decimals
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Value for an <input>: '12,50' / '735' */
export function amountToInput(value: number): string {
  const cents = Math.round(value * 100);
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace('.', ',');
}

const pct1 = new Intl.NumberFormat('de-AT', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 0.16 → '16,0 %' */
export function formatPercent(ratio: number): string {
  return pct1.format(ratio);
}
