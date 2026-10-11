import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { fixedCosts, freeAfterFixed, freeGap, netSalaryForPeriod, savingsRate } from '../lib/calc';
import { exportBackup, importIntoEmpty, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { loadDataset, NOTE_MAX, RepoError, saveMonthClose, saveMonthNote } from './repo';

const opened: FixkostenDB[] = [];
async function seeded(): Promise<FixkostenDB> {
  const db = new FixkostenDB(`note-${crypto.randomUUID()}`);
  opened.push(db);
  await importIntoEmpty(db, fixtureBackup());
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('Monatsnotiz (MonthClose.note)', () => {
  it('one note per month: save, switch month, back', async () => {
    const db = await seeded();
    await saveMonthNote(db, '2026-10', 'Bonus im November');
    await saveMonthNote(db, '2026-11', 'Urlaub');
    const ds = await loadDataset(db);
    expect(ds.monthClose.find((m) => m.period === '2026-10')!.note).toBe('Bonus im November');
    expect(ds.monthClose.find((m) => m.period === '2026-11')!.note).toBe('Urlaub');
    expect(ds.monthClose.find((m) => m.period === '2026-12')).toBeUndefined();
  });

  it('a note alone never creates a salary and changes no figure', async () => {
    const db = await seeded();
    const before = await loadDataset(db);
    await saveMonthNote(db, '2026-10', 'nur Text');
    const ds = await loadDataset(db);
    expect(netSalaryForPeriod(ds, '2026-10')).toBeNull();
    expect(freeAfterFixed(ds, '2026-10')).toBeNull();
    expect(savingsRate(ds, '2026-10')).toBeNull();
    expect(freeGap(ds, '2026-10')).toBeNull();
    expect(fixedCosts(ds, '2026-10')).toBe(fixedCosts(before, '2026-10'));
  });

  it('salary and note are independent; empty text removes only the note', async () => {
    const db = await seeded();
    await saveMonthClose(db, '2026-10', { netSalary: 4788 });
    await saveMonthNote(db, '2026-10', 'Notiz');
    await saveMonthClose(db, '2026-10', { netSalary: 4800, freeActual: 900 }); // month close keeps the note
    expect(await db.monthClose.get('2026-10')).toMatchObject({ netSalary: 4800, freeActual: 900, note: 'Notiz' });
    await saveMonthNote(db, '2026-10', '   ');
    expect(await db.monthClose.get('2026-10')).toMatchObject({ netSalary: 4800, freeActual: 900, note: undefined });
    await saveMonthClose(db, '2026-10', {});
    expect(await db.monthClose.get('2026-10')).toBeUndefined();
    await saveMonthNote(db, '2026-11', 'x');
    await saveMonthNote(db, '2026-11', '');
    expect(await db.monthClose.get('2026-11')).toBeUndefined(); // nothing left: no empty record
  });

  it('line breaks stay, at most 2.000 characters', async () => {
    const db = await seeded();
    await saveMonthNote(db, '2026-10', 'Zeile 1\nZeile 2\n');
    expect((await db.monthClose.get('2026-10'))!.note).toBe('Zeile 1\nZeile 2');
    await expect(saveMonthNote(db, '2026-10', 'x'.repeat(NOTE_MAX + 1))).rejects.toThrow(RepoError);
  });
});

describe('Export → Import', () => {
  it('notes and reminder data come back unchanged', async () => {
    const db = await seeded();
    await saveMonthNote(db, '2026-10', 'Bonus\nim November');
    await saveMonthClose(db, '2026-11', { netSalary: 5000 });
    await saveMonthNote(db, '2026-11', 'Urlaub');
    const exported = await exportBackup(db);
    const reminders = await db.reminders.toArray();
    expect(reminders.length).toBeGreaterThan(0);

    const target = new FixkostenDB(`note-target-${crypto.randomUUID()}`);
    opened.push(target);
    await importIntoEmpty(target, parseBackup(JSON.parse(JSON.stringify(exported))));
    const sort = <T extends { period?: string; id?: string }>(xs: T[]) => [...xs].sort((a, b) => String(a.period ?? a.id).localeCompare(String(b.period ?? b.id)));
    expect(sort(await target.monthClose.toArray())).toEqual(sort(await db.monthClose.toArray()));
    expect((await target.monthClose.get('2026-10'))!.note).toBe('Bonus\nim November');
    expect(sort(await target.reminders.toArray())).toEqual(sort(reminders));
  });
});
