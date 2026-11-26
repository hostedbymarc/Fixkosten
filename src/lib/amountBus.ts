// polster-feinschliff: „Betrag für {Monat}“ / „Spielgeld für {Monat}“ open from the lines of „Dein Monat“ (① – ④) and
// from the categories; they call openAmount(), the one host (src/components/konto/MonthAmountSheet.tsx) shows it.
import type { Period } from './types';

export type AmountTarget =
  | { kind: 'position'; positionId: string; period: Period }
  | { kind: 'oneOff'; oneOffId: string; period: Period }
  | { kind: 'spielgeld'; period: Period };

export interface OpenAmount {
  target: AmountTarget;
  /** focus goes back here when the sheet closes */
  returnFocusTo?: HTMLElement | null;
}

type Listener = (open: OpenAmount) => void;
const listeners = new Set<Listener>();

export function openAmount(open: OpenAmount): void {
  for (const l of listeners) l(open);
}

export function onOpenAmount(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** A line of the card („{id}@{YYYY-MM}“) → what it edits: a position or a one-off of `ds`; null for any other line. */
export function amountTargetOf(key: string, positions: { id: string }[], oneOffs: { id: string }[]): AmountTarget | null {
  const m = /^([^@>]+)@(\d{4}-\d{2})$/.exec(key);
  if (!m) return null;
  const [, id, period] = m as unknown as [string, string, Period];
  if (positions.some((p) => p.id === id)) return { kind: 'position', positionId: id, period };
  if (oneOffs.some((o) => o.id === id)) return { kind: 'oneOff', oneOffId: id, period };
  return null;
}
