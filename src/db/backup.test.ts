import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { periodProgress, plannedForPeriod } from '../lib/calc';
import { exportBackup, importBackup, importIntoEmpty, lastImport, parseBackup, undoLastImport } from './backup';
import { FixkostenDB } from './db';
import { changePlan, createPosition, loadDataset, markPaid, saveMonthClose, updatePayment } from './repo';

const OCT = '2026-10';
const opened: FixkostenDB[] = [];

function newDb(): FixkostenDB {
  const db = new FixkostenDB(`backup-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

/** "Preview": fixture plus entries made there. */
async function previewWithEntries(): Promise<FixkostenDB> {
  const db = newDb();
  await importIntoEmpty(db, fixtureBackup());
  await changePlan(db, 'pos-handy', { amount: 8, frequency: 'monthly', dueMonths: [] }, { type: 'from', validFrom: '2026-11' }, OCT);
  await createPosition(db, { name: 'Netflix', categoryId: 'cat-abos', plan: { amount: 13.99, frequency: 'monthly', dueMonths: [] } }, OCT);
  await updatePayment(db, 'pay-pos-strom-2026-10', { actualAmount: 71.4, note: 'Abschlag erhöht' });
  return db;
}

/** "Live": fixture plus different entries made there. */
async function liveWithEntries(): Promise<FixkostenDB> {
  const db = newDb();
  await importIntoEmpty(db, fixtureBackup());
  const depot = await markPaid(db, 'pos-depotentgelt', OCT, 35); // only ticked live
  await updatePayment(db, depot.id, { actualAmount: 35, note: 'live' });
  await saveMonthClose(db, OCT, { netSalary: 4700, freeActual: 450 });
  await updatePayment(db, 'pay-pos-strom-2026-10', { actualAmount: 66 }); // conflicts with the preview
  return db;
}

describe('export', () => {
  it('round trip: export → parse → import into empty gives identical data', async () => {
    const source = await previewWithEntries();
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    const target = newDb();
    await importIntoEmpty(target, file);
    expect(await exportBackup(target).then((b) => b.data)).toEqual(file.data);
  });
});

describe('import into a database with data', () => {
  it('merge: file wins on conflicts, live-only entries stay', async () => {
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(await previewWithEntries()))));
    const live = await liveWithEntries();
    await importBackup(live, file, 'merge');
    const ds = await loadDataset(live);

    expect(ds.positions.some((p) => p.name === 'Netflix')).toBe(true);
    expect(ds.positions.find((p) => p.id === 'pos-handy')!.history).toHaveLength(2);
    expect(ds.payments.find((p) => p.positionId === 'pos-strom')).toMatchObject({ actualAmount: 71.4, note: 'Abschlag erhöht' });
    // live-only tick and month close survive
    expect(ds.payments.find((p) => p.positionId === 'pos-depotentgelt')).toMatchObject({ note: 'live' });
    expect(ds.monthClose).toEqual([expect.objectContaining({ period: OCT, netSalary: 4700 })]);
    expect(periodProgress(ds, OCT).openCount).toBe(1); // Netflix, created in the preview, not ticked yet
    // still one tick per position and month
    const keys = ds.payments.map((p) => `${p.positionId}|${p.period}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('merge: same position and month with a different payment id → file wins, no duplicate', async () => {
    const preview = await previewWithEntries();
    await markPaid(preview, 'pos-depotentgelt', OCT, 35);
    await updatePayment(preview, (await preview.payments.where({ positionId: 'pos-depotentgelt' }).first())!.id, { actualAmount: 36.9 });
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(preview))));
    const live = await liveWithEntries();
    await importBackup(live, file, 'merge');
    const depot = await live.payments.where({ positionId: 'pos-depotentgelt', period: OCT }).toArray();
    expect(depot).toHaveLength(1);
    expect(depot[0]!.actualAmount).toBe(36.9);
  });

  it('replace: afterwards exactly the file; undo restores the previous state', async () => {
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(await previewWithEntries()))));
    const live = await liveWithEntries();
    const before = await exportBackup(live);
    await importBackup(live, file, 'replace');
    expect((await exportBackup(live)).data).toEqual(file.data);
    expect(await lastImport(live)).toMatchObject({ mode: 'replace' });

    expect(await undoLastImport(live)).toBe(true);
    expect((await exportBackup(live)).data).toEqual(before.data);
    expect(await lastImport(live)).toBeNull();
    expect(await undoLastImport(live)).toBe(false);
  });

  it('a v2 file (seed.local.json) can be merged into a v3 database', async () => {
    const live = await liveWithEntries();
    await importBackup(live, fixtureBackup(), 'merge');
    const ds = await loadDataset(live);
    expect(plannedForPeriod(ds, OCT)).toBe(3403);
    expect(ds.monthClose).toHaveLength(1);
  });
});
