// Golden fixture „November 2026“ (your real data): seed + the November entries.
// Lebensmittel & Co: plan 480, ticked with „tatsächlich abgebucht“ 450 and a note.
import type { BackupFile } from '../../src/db/backup';
import type { Position } from '../../src/lib/types';

export const NOV = '2026-11';

function once(id: string, name: string, categoryId: string, amount: number, dueDate: string): Position {
  return {
    id,
    name,
    categoryId,
    history: [{ validFrom: dueDate.slice(0, 7), amount, frequency: 'once', dueMonths: [Number(dueDate.slice(5, 7))], dueDay: Number(dueDate.slice(8)), dueDate }],
    createdAt: '2026-10-20T08:00:00.000Z',
    sortOrder: 30,
  };
}

export function withNovember(backup: BackupFile): BackupFile {
  const data = structuredClone(backup.data);
  data.categories.push({ id: 'cat-sonstiges', name: 'Sonstiges', kind: 'expense', color: '#B08968', sortOrder: 6 });
  data.positions.push(
    once('pos-hotel-cph', 'Hotel Copenhagen', 'cat-sonstiges', 504, '2026-11-03'),
    once('pos-iphones', 'iPhones + Zubehör', 'cat-sonstiges', 2511, '2026-11-03'),
  );
  data.payments.push(
    { id: 'pay-lebensmittel-nov', positionId: 'pos-lebensmittel', period: NOV, status: 'paid', plannedAmount: 480, actualAmount: 450, paidAt: '2026-11-02T09:00:00.000Z', note: '€30 vom Vormonat abgehoben' },
    { id: 'pay-cash-nov', positionId: 'pos-cash', period: NOV, status: 'paid', plannedAmount: 400, actualAmount: 400, paidAt: '2026-11-02T09:00:00.000Z' },
  );
  data.monthClose.push({ period: NOV, netSalary: 7819, updatedAt: '2026-11-02T09:00:00.000Z' });
  return { ...backup, data };
}
