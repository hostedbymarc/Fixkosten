import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import v1 from '../../tests/fixtures/v1-2776e95.json';
import {
  dueItems,
  periodProgress,
  plannedForPeriod,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
} from '../lib/calc';
import type { MetaEntry, Payment } from '../lib/types';
import { needsSetup } from './backup';
import { FixkostenDB } from './db';
import { loadDataset } from './repo';

// The live site still runs commit 2776e95 (schema v1). On the next publish the
// real data jumps from v1 straight to v3 in a single open. This test replays
// exactly that with the data format the phase-1 app wrote.

const OCT = '2026-10';
const name = `v1-to-v4-${crypto.randomUUID()}`;

afterEach(async () => {
  await new FixkostenDB(name).delete();
});

/** v1 database as the phase-1 app left it after a few days of use. */
async function createLiveV1(): Promise<Payment[]> {
  const old = new FixkostenDB(name, { maxVersion: 1 });
  const data = structuredClone(v1);
  // user activity in phase 1: Strom actual changed with a note, a note on Miete, Depotentgelt still open
  const strom = data.payments.find((p) => p.positionId === 'pos-strom')! as Record<string, unknown>;
  strom.actualAmount = 71.4;
  strom.note = 'Nachzahlung';
  const miete = data.payments.find((p) => p.positionId === 'pos-miete')! as Record<string, unknown>;
  miete.note = 'per Dauerauftrag';
  await old.transaction('rw', old.tables, async () => {
    await old.categories.bulkAdd(data.categories as never[]);
    // phase 1 stored optional fields as explicit undefined properties
    await old.positions.bulkAdd(data.positions.map((p) => ({ dueDay: undefined, note: undefined, ...p })) as never[]);
    await old.payments.bulkAdd(data.payments as never[]);
    await old.reminders.bulkAdd(data.reminders as never[]);
    await old.meta.bulkPut(data.meta as MetaEntry[]);
  });
  const payments = (await old.payments.toArray()) as unknown as Payment[];
  old.close();
  return payments;
}

describe('live data: schema v1 (2776e95) → v4 in one step', () => {
  it('keeps every payment, actual and note; migrates categories, history and status', async () => {
    const before = await createLiveV1();
    expect(before.some((p) => p.positionId === 'pos-depotentgelt')).toBe(false);

    const db = new FixkostenDB(name);
    expect(db.verno).toBe(4);
    const ds = await loadDataset(db);

    // payments, actuals and notes identical; status 'paid' added
    expect(ds.payments.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      before.map((p) => ({ ...p, status: 'paid' })).sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(ds.payments.find((p) => p.positionId === 'pos-strom')).toMatchObject({ actualAmount: 71.4, note: 'Nachzahlung' });
    expect(ds.payments.find((p) => p.positionId === 'pos-miete')).toMatchObject({ note: 'per Dauerauftrag' });

    // "Meine Immos" first with the four property positions
    const categories = [...ds.categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name);
    expect(categories).toEqual(['Meine Immos', 'Wohnen & Leben', 'Abos & Freizeit', 'Banking & Finanzen', 'Mobilität', 'Investing']);
    expect(ds.positions.filter((p) => p.categoryId === 'cat-immos').map((p) => p.name).sort()).toEqual(
      ['BK 1160', 'BK 1220', 'Baurechtszins', 'Kredit 1220'],
    );

    // no isVariable, no legacy plan fields, history filled
    for (const p of ds.positions) {
      for (const legacy of ['isVariable', 'amountHistory', 'frequency', 'dueMonths', 'dueDay']) expect(p).not.toHaveProperty(legacy);
      expect(p.history.length).toBe(1);
    }
    const old = (id: string) => v1.positions.find((p) => p.id === id)!;
    for (const p of ds.positions) {
      const o = old(p.id) as { frequency: string; dueMonths: number[]; dueDay?: number; amountHistory: { validFrom: string; amount: number }[] };
      expect(p.history[0]).toEqual({
        validFrom: o.amountHistory[0]!.validFrom,
        amount: o.amountHistory[0]!.amount,
        frequency: o.frequency,
        dueMonths: o.dueMonths,
        ...(o.dueDay !== undefined ? { dueDay: o.dueDay } : {}),
      });
    }

    // no import dialog on the live device
    expect(await needsSetup(db)).toBe(false);
    expect((await db.meta.get('schemaVersion'))?.value).toBe(4);

    // control values exact
    expect(sumMonthlyEquivalent(ds, OCT, { kind: 'expense', frequency: 'monthly' })).toBe(2664);
    expect(Math.round(trueMonthlyBurden(ds, OCT) * 100)).toBe(295217);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(plannedForPeriod(ds, '2027-02')).toBe(4610);
    expect(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos', frequency: 'monthly' })).toBe(991);
    expect(Math.round(sumMonthlyEquivalent(ds, OCT, { categoryId: 'cat-immos' }) * 100)).toBe(103467);

    // Depotentgelt still open, everything else ticked
    const progress = periodProgress(ds, OCT);
    expect(progress).toMatchObject({ planned: 3403, openCount: 1, openPlanned: 35 });
    expect(progress.paidActual).toBe(3368 + 7.4);
    expect(dueItems(ds, OCT).find((i) => i.position.id === 'pos-depotentgelt')?.status).toBe('open');
    db.close();
  });
});
