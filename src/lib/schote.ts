// The pea pod („Schote“): 12 slots = the next 12 months of the Fixkostenkonto. It fills like a
// battery: from the left up to the first month whose month-end balance is below 0. That month and
// everything after it stay empty, even when a later month is back in the plus – no gaps in the row. Everything here is derived from the month-end balances of
// simulateKonto (src/lib/fixkostenkonto.ts); nothing is stored.

import type { MonthStart } from './activeMonth';
import { periodLabel } from './period';
import { t } from './schoteTexts';
import type { Period } from './types';

export interface PodSlot {
  period: Period;
  covered: boolean;
}

export interface Pod {
  slots: PodSlot[];
  /** number of covered months (= index of the first short month) */
  covered: number;
  /** first month whose month-end balance is below 0, or null */
  shortFrom: Period | null;
  /** every slot covered */
  full: boolean;
  /** last month of the pod when every slot is covered, else null */
  coveredUntil: Period | null;
}

const cents = (v: number) => Math.round(v * 100);

/** Pod from the month-end balances (one per month, in order). */
export function podFromMonths(months: { period: Period; end: number }[]): Pod {
  const first = months.findIndex((m) => cents(m.end) < 0);
  const covered = first === -1 ? months.length : first;
  const slots = months.map((m, i) => ({ period: m.period, covered: i < covered }));
  const full = slots.length > 0 && covered === slots.length;
  return {
    slots,
    covered,
    shortFrom: first === -1 ? null : months[first]!.period,
    full,
    coveredUntil: full ? (slots.at(-1)?.period ?? null) : null,
  };
}

/** The answer above every pod: „Alles gedeckt bis Oktober 2027.“ / „Ab Februar 2027 fehlt Geld.“ */
export function podText(pod: Pod): string {
  if (pod.shortFrom) return t('pod.short', { monat: periodLabel(pod.shortFrom) });
  return t('pod.until', { monat: periodLabel(pod.coveredUntil ?? pod.slots.at(-1)?.period ?? '') });
}

/**
 * Polster in months: how far the lowest month-end balance stays above 0, in standing orders.
 * Only shown above one standing order (else null).
 */
export function cushionMonths(lowest: number, deposit: number): number | null {
  if (cents(deposit) <= 0 || cents(lowest) <= cents(deposit)) return null;
  return Math.floor((lowest / deposit) * 10) / 10;
}

export type TileState = 'setup' | 'gap' | 'covered' | 'cushion';

/** The four states of the tile on the month screen. */
export function tileState(input: { setupDone: boolean; gap: number; cushion: number | null }): TileState {
  if (!input.setupDone) return 'setup';
  if (cents(input.gap) > 0) return 'gap';
  return input.cushion !== null ? 'cushion' : 'covered';
}

/**
 * Day of the standing order, from „Neuer Monat beginnt am“ – so the text matches the simulation
 * (the deposit arrives when the active month begins): „am 1.“, „am 25.“, „am Monatsletzten“.
 */
export function orderDay(start: MonthStart): string {
  return start === 'last' ? 'am Monatsletzten' : `am ${start}.`;
}
