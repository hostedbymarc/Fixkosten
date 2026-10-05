import { toPeriod } from './period';
import type { Period } from './types';

/** Current calendar month ('YYYY-MM'). */
export function useToday(): Period {
  return toPeriod(new Date());
}
