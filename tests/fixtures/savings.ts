// Sparquote test data on top of the seed fixture (unit tests and E2E share it).
// October 2026: Netto € 4.788, Vermögensaufbau € 1.860 → 38,8 %.
import type { BackupFile } from '../../src/db/backup';
import type { MonthClose, Position } from '../../src/lib/types';

export const SAVINGS_NET = 4788;
export const SAVINGS_WEALTH = 1860;

function monthly(id: string, name: string, categoryId: string, amount: number, from: string, sortOrder: number): Position {
  return {
    id,
    name,
    categoryId,
    history: [{ validFrom: from, amount, frequency: 'monthly', dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
    createdAt: '2026-06-20T08:00:00.000Z',
    sortOrder,
  };
}

function close(period: string, netSalary: number): MonthClose {
  return { period, netSalary, updatedAt: `${period}-28T18:00:00.000Z` };
}

export type SavingsScenario =
  /** Jul, Sep, Okt 2026 with Netto (Aug: gap), a one-off Sondereinzahlung in July */
  | 'history'
  /** only October 2026 has a Netto */
  | 'one-month'
  /** Netto only in September: October falls back to it */
  | 'fallback'
  /** no Netto at all */
  | 'empty';

/**
 * Investing (Cash 400, TR Sparpläne 400, ETF Welt 760) from July 2026 plus a second
 * savings category „Altersvorsorge“ (Pensionsvorsorge 300): € 1.860 per month.
 */
export function withSavings(backup: BackupFile, scenario: SavingsScenario = 'history'): BackupFile {
  const data = structuredClone(backup.data);
  for (const p of data.positions) {
    if (p.categoryId === 'cat-investing') p.history = p.history.map((e) => ({ ...e, validFrom: '2026-07' }));
  }
  data.categories.push({ id: 'cat-vorsorge', name: 'Altersvorsorge', kind: 'savings', color: '#0F766E', sortOrder: 6 });
  data.positions.push(
    monthly('pos-etf-welt', 'ETF Welt', 'cat-investing', 760, '2026-07', 23),
    monthly('pos-pension', 'Pensionsvorsorge', 'cat-vorsorge', 300, '2026-07', 24),
  );
  if (scenario === 'history') {
    data.monthClose.push(close('2026-07', 4650), close('2026-09', SAVINGS_NET), close('2026-10', SAVINGS_NET));
    data.oneOffs.push({ id: 'oo-sonder', positionId: 'pos-etf-welt', period: '2026-07', amount: 500, label: 'Sondereinzahlung' });
  }
  if (scenario === 'one-month') data.monthClose.push(close('2026-10', SAVINGS_NET));
  if (scenario === 'fallback') data.monthClose.push(close('2026-09', SAVINGS_NET));
  return { ...backup, data };
}
