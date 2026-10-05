import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { periodProgress } from '../lib/calc';
import { FixkostenDB } from './db';
import { ensureSeeded, loadDataset, markPaid, removePayment, restorePayment, updatePayment } from './repo';

let db: FixkostenDB;

beforeEach(() => {
  db = new FixkostenDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('seed import', () => {
  it('imports once, idempotent on second start', async () => {
    expect(await ensureSeeded(db)).toBe(true);
    expect(await ensureSeeded(db)).toBe(false);
    expect(await db.positions.count()).toBe(23);
    expect(await db.categories.count()).toBe(5);
    expect(await db.reminders.count()).toBe(2);
    expect(await db.income.count()).toBe(0);
    expect((await db.meta.get('schemaVersion'))?.value).toBe(1);
  });

  it('seeded state matches hero control value', async () => {
    await ensureSeeded(db);
    const progress = periodProgress(await loadDataset(db), '2026-10');
    expect(progress.paidActual).toBe(3368);
    expect(progress.planned).toBe(3403);
  });
});

describe('ticking', () => {
  it('mark paid → edit actual → remove → undo', async () => {
    await ensureSeeded(db);
    const paid = await markPaid(db, 'pos-depotentgelt', '2026-10', 35);
    expect(periodProgress(await loadDataset(db), '2026-10').paidActual).toBe(3403);

    await updatePayment(db, paid.id, { actualAmount: 36.9, note: '  Erhöhung  ' });
    const updated = await db.payments.get(paid.id);
    expect(updated?.actualAmount).toBe(36.9);
    expect(updated?.note).toBe('Erhöhung');

    const removed = await removePayment(db, paid.id);
    expect(periodProgress(await loadDataset(db), '2026-10').openCount).toBe(1);
    await restorePayment(db, removed!);
    expect((await db.payments.get(paid.id))?.actualAmount).toBe(36.9);
  });

  it('double tap creates only one payment', async () => {
    await ensureSeeded(db);
    const [a, b] = await Promise.all([
      markPaid(db, 'pos-depotentgelt', '2026-10', 35),
      markPaid(db, 'pos-depotentgelt', '2026-10', 35),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.payments.where({ positionId: 'pos-depotentgelt', period: '2026-10' }).count()).toBe(1);
  });
});
