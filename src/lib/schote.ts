// The pea pod („Schote“): 12 slots = the next 12 months of the Fixkostenkonto. A month is covered
// when its month-end balance is ≥ 0. Everything here is derived from the month-end balances of
// simulateKonto (src/lib/fixkostenkonto.ts); nothing is stored.

import { periodLabel } from './period';
import type { Period } from './types';

export interface PodSlot {
  period: Period;
  covered: boolean;
}

export interface Pod {
  slots: PodSlot[];
  /** number of covered months */
  covered: number;
  /** every slot covered */
  full: boolean;
  /** last month of the pod when every slot is covered, else null */
  coveredUntil: Period | null;
}

const cents = (v: number) => Math.round(v * 100);

/** Pod from the month-end balances (one per month, in order). */
export function podFromMonths(months: { period: Period; end: number }[]): Pod {
  const slots = months.map((m) => ({
    period: m.period,
    covered: cents(m.end) >= 0,
  }));
  const covered = slots.filter((s) => s.covered).length;
  const full = slots.length > 0 && covered === slots.length;
  return {
    slots,
    covered,
    full,
    coveredUntil: full ? (slots.at(-1)?.period ?? null) : null,
  };
}

/** The sentence next to the pod; the screen reader reads the same. */
export function podText(pod: Pod): string {
  if (pod.coveredUntil) return `Gedeckt bis ${periodLabel(pod.coveredUntil)}`;
  return `${pod.covered} von ${pod.slots.length} Monaten gedeckt`;
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
