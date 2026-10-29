import { useCallback, useRef, useState } from 'react';
import type { Period } from './types';

// Einklappen nach Status: when a month opens, fully paid categories are collapsed and categories
// with something open are expanded. What you open or close by hand is kept per month while the
// app runs (in memory, not across a reload).
const overrides = new Map<Period, Map<string, boolean>>();

/** For tests and a fresh start: forget every manual choice. */
export function resetCollapseOverrides() {
  overrides.clear();
}

/**
 * Collapsed state of the month's categories. `isPaid(id)` gives the default when the month opens:
 * everything ticked → collapsed. Manual toggles and „Alle ein-/ausklappen“ override it for that month only.
 */
export function useMonthCollapse(period: Period, isPaid: (id: string) => boolean) {
  const [, setVersion] = useState(0);
  // the status counts when the month opens: ticking the last open row does not fold the card away
  const opened = useRef<{ period: Period; paid: Map<string, boolean> }>({ period, paid: new Map() });
  if (opened.current.period !== period) opened.current = { period, paid: new Map() };
  const atOpen = (id: string) => {
    const seen = opened.current.paid;
    if (!seen.has(id)) seen.set(id, isPaid(id));
    return seen.get(id)!;
  };
  const month = overrides.get(period);
  const isCollapsed = (id: string) => month?.get(id) ?? atOpen(id);

  const set = useCallback(
    (ids: string[], value: boolean) => {
      const m = overrides.get(period) ?? new Map<string, boolean>();
      for (const id of ids) m.set(id, value);
      overrides.set(period, m);
      setVersion((v) => v + 1);
    },
    [period],
  );

  return {
    isCollapsed,
    toggle: (id: string) => set([id], !isCollapsed(id)),
    setAll: set,
  };
}
