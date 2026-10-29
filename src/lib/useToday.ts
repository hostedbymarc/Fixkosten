import { createContext, useContext } from 'react';
import { activeMonth, DEFAULT_MONTH_START, localToday, type MonthStart } from './activeMonth';
import type { Period } from './types';

/** Provided by App: the setting „Neuer Monat beginnt am“ and the active month it gives today. */
export const ActiveMonthContext = createContext<{ start: MonthStart; active: Period }>({
  start: DEFAULT_MONTH_START,
  active: activeMonth(localToday(), DEFAULT_MONTH_START),
});

/** The active month (src/lib/activeMonth.ts) – what „heute“ means for every month logic. */
export function useActiveMonth(): Period {
  return useContext(ActiveMonthContext).active;
}

export function useMonthStart(): MonthStart {
  return useContext(ActiveMonthContext).start;
}
