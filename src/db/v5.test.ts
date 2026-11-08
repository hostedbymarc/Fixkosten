import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureBackup } from '../../tests/fixtures/dataset';
import { accountOf, standingOrder } from '../lib/fixkostenkonto';
import type { Dataset, Position } from '../lib/types';
import { exportBackup, importBackup, importIntoEmpty, parseBackup, undoLastImport } from './backup';
import { FixkostenDB } from './db';
import { completeOnboarding } from './onboarding';
import { loadDataset, setPositionAccount } from './repo';
import { readCountryRaw, readKonto, readKontoRaw, writeCountry, writeKonto } from './settings';
import { templatesFor } from '../lib/templates';

let name: string;
const opened: FixkostenDB[] = [];

function openDb(maxVersion?: number): FixkostenDB {
  const db = new FixkostenDB(name, { maxVersion });
  opened.push(db);
  return db;
}

beforeEach(() => {
  name = `v5-${crypto.randomUUID()}`;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
  await new FixkostenDB(name).delete();
});

const raw = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const withoutAccount = (positions: Position[]) => positions.map(({ account: _a, ...p }) => p);
const savingsIds = (ds: Pick<Dataset, 'categories'>) => new Set(ds.categories.filter((c) => c.kind === 'savings').map((c) => c.id));

describe('Migration v4 → v5', () => {
  it('account vorbelegt (Vermögensaufbau → Girokonto, sonst Fixkostenkonto), keine Daten verloren', async () => {
    const live = parseBackup(raw('tests/fixtures/beispiel-2026-10-29.json')).data;
    const v4 = openDb(4);
    await v4.transaction('rw', v4.tables, async () => {
      await v4.categories.bulkAdd(live.categories);
      await v4.positions.bulkAdd(withoutAccount(live.positions) as Position[]);
      await v4.payments.bulkAdd(live.payments);
      await v4.oneOffs.bulkAdd(live.oneOffs);
      await v4.monthClose.bulkAdd(live.monthClose);
      await v4.changeLog.bulkAdd(live.changeLog);
      await v4.reminders.bulkAdd(live.reminders);
      await v4.meta.bulkPut([{ key: 'schemaVersion', value: 4 }, { key: 'setupCompletedAt', value: '2026-10-01T00:00:00.000Z' }, { key: 'monthStartDay', value: 25 }]);
    });
    const before = await loadDataset(v4);
    const metaBefore = await v4.meta.toArray();
    v4.close();

    const db = openDb();
    expect(db.verno).toBe(5);
    const after = await loadDataset(db);
    // every table identical, positions apart from the new field
    expect(after.categories).toEqual(before.categories);
    expect(after.payments).toEqual(before.payments);
    expect(after.oneOffs).toEqual(before.oneOffs);
    expect(after.monthClose).toEqual(before.monthClose);
    expect(after.changeLog).toEqual(before.changeLog);
    expect(after.reminders).toEqual(before.reminders);
    expect(withoutAccount(after.positions)).toEqual(before.positions);
    const savings = savingsIds(after);
    expect(after.positions.length).toBeGreaterThan(20);
    for (const p of after.positions) expect(p.account).toBe(savings.has(p.categoryId) ? 'girokonto' : 'fixkostenkonto');
    expect(after.positions.filter((p) => p.account === 'girokonto').map((p) => p.name).sort()).toEqual(['Cash', 'ETF Sparplan', 'Extra', 'Miete Nord', 'Miete Nord & Süd'].sort());
    // meta kept; only schemaVersion moved on; the Fixkostenkonto is untouched (→ invitation card)
    const metaAfter = await db.meta.toArray();
    expect(metaAfter.filter((m) => m.key !== 'schemaVersion')).toEqual(metaBefore.filter((m) => m.key !== 'schemaVersion'));
    expect((await db.meta.get('schemaVersion'))?.value).toBe(5);
    expect(await readKontoRaw(db)).toBeNull();
  });

  it('v1 → v5 in einem Schritt: account an jeder Position', async () => {
    const v1 = openDb(1);
    const seed = fixtureBackup().data;
    await v1.transaction('rw', v1.tables, async () => {
      await v1.categories.bulkAdd(seed.categories.filter((c) => c.id !== 'cat-immos'));
      await v1.positions.bulkAdd(
        (raw('tests/fixtures/seed.json').data.positions as Record<string, unknown>[]).map((p) => ({ ...p, categoryId: p.categoryId === 'cat-immos' ? 'cat-wohnen' : p.categoryId })) as unknown as Position[],
      );
      await v1.meta.put({ key: 'schemaVersion', value: 1 });
    });
    v1.close();
    const db = openDb();
    const ds = await loadDataset(db);
    const savings = savingsIds(ds);
    for (const p of ds.positions) expect(p.account).toBe(savings.has(p.categoryId) ? 'girokonto' : 'fixkostenkonto');
  });
});

describe('Import', () => {
  it('alte fixkosten-*.json (v2, ohne neue Felder): account vorbelegt, keine Einstellungen → Einladung', async () => {
    const file = parseBackup(raw('tests/fixtures/seed.json'));
    expect(file.schemaVersion).toBe(5);
    const savings = savingsIds(file.data);
    for (const p of file.data.positions) expect(p.account).toBe(savings.has(p.categoryId) ? 'girokonto' : 'fixkostenkonto');
    const db = openDb();
    await importIntoEmpty(db, file);
    expect((await loadDataset(db)).positions).toHaveLength(file.data.positions.length);
    expect(await readKontoRaw(db)).toBeNull();
    expect(await readCountryRaw(db)).toBeNull();
  });

  it('erbse-*.json (v4, ohne neue Felder): gleiche Daten, account vorbelegt', async () => {
    const r = raw('tests/fixtures/beispiel-2026-10-29.json');
    const file = parseBackup(structuredClone(r));
    expect(withoutAccount(file.data.positions)).toEqual(parseBackup(structuredClone(r)).data.positions.map(({ account: _a, ...p }) => p));
    const db = openDb();
    await importIntoEmpty(db, file);
    const ds = await loadDataset(db);
    expect(ds.positions.every((p) => p.account === accountOf(ds, { ...p, account: undefined }))).toBe(true);
  });

  it('neuer Export → Import ergibt identische Daten (inkl. Konto, Fixkostenkonto-Einstellungen, Land)', async () => {
    const source = openDb();
    await importIntoEmpty(source, parseBackup(raw('tests/fixtures/beispiel-2026-10-29.json')));
    await setPositionAccount(source, (await source.positions.toArray()).find((p) => p.name === 'Strom')!.id, 'girokonto');
    await writeKonto(source, { enabled: true, balance: 1234.56, receivedFor: '2026-10', rounding: 10 });
    await writeCountry(source, 'CH');
    const exported = JSON.parse(JSON.stringify(await exportBackup(source)));
    expect(exported.schemaVersion).toBe(5);
    expect(exported.settings.fixkostenkonto).toEqual({ enabled: true, inviteDismissed: false, balance: 1234.56, receivedFor: '2026-10', rounding: 10 });
    expect(exported.settings.country).toBe('CH');

    name = `v5-target-${crypto.randomUUID()}`;
    const target = openDb();
    await importIntoEmpty(target, parseBackup(structuredClone(exported)));
    expect(await loadDataset(target)).toEqual(await loadDataset(source));
    expect(await readKonto(target)).toEqual(await readKonto(source));
    expect(await readCountryRaw(target)).toBe('CH');
    const again = JSON.parse(JSON.stringify(await exportBackup(target)));
    expect({ ...again, exportedAt: null }).toEqual({ ...exported, exportedAt: null });
    await target.delete();
  });

  it('Import ohne Konto-Einstellungen behält die des Geräts; Rückgängig stellt den Stand exakt wieder her', async () => {
    const db = openDb();
    await importIntoEmpty(db, parseBackup(raw('tests/fixtures/beispiel-2026-10-29.json')));
    await importBackup(db, { ...parseBackup(raw('tests/fixtures/beispiel-2026-10-29.json')), settings: { fixkostenkonto: { enabled: true, inviteDismissed: false, balance: 50, receivedFor: null, rounding: 1 }, country: 'DE' } }, 'merge');
    expect((await readKonto(db)).balance).toBe(50);
    expect(await readCountryRaw(db)).toBe('DE');
    await importBackup(db, parseBackup(raw('tests/fixtures/beispiel-2026-10-29.json')), 'replace');
    expect((await readKonto(db)).balance).toBe(50);
    await undoLastImport(db);
    expect((await readKonto(db)).balance).toBe(50);
    await undoLastImport(db); // nothing more to undo
    expect(await readCountryRaw(db)).toBe('DE');
  });

  it('ungültige Einstellungen in der Datei → Standardwerte', () => {
    const file = parseBackup({ ...raw('tests/fixtures/beispiel-2026-10-29.json'), settings: { fixkostenkonto: { enabled: 'ja', balance: 'x', rounding: 7, receivedFor: '2026-13' }, country: 'FR' } });
    expect(file.settings).toEqual({ fixkostenkonto: { enabled: false, inviteDismissed: false, balance: 0, receivedFor: null, rounding: 5 } });
  });
});

describe('Onboarding (F5)', () => {
  it('Vorlagen ohne Betrag gibt es nicht: Beträge aus der Eingabe, Kategorien angelegt, Modus an, Land gespeichert', async () => {
    const db = openDb();
    const [rundfunk, kfz] = templatesFor('DE');
    await completeOnboarding(db, {
      country: 'DE',
      startPeriod: '2026-10',
      templates: [
        { template: rundfunk!, amount: 55.08, dueMonth: 1 },
        { template: kfz!, amount: 120, dueMonth: 3 },
      ],
    });
    const ds = await loadDataset(db);
    expect([...ds.positions].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => [p.name, p.history[0]!.amount, p.history[0]!.frequency, p.history[0]!.dueMonths, p.account])).toEqual([
      ['Rundfunkbeitrag', 55.08, 'quarterly', [1, 4, 7, 10], 'fixkostenkonto'],
      ['Kfz-Steuer', 120, 'annual', [3], 'fixkostenkonto'],
    ]);
    expect(ds.categories.map((c) => c.name).sort()).toEqual(['Gebühren & Abgaben', 'Mobilität']);
    expect((await readKonto(db)).enabled).toBe(true);
    expect(await readCountryRaw(db)).toBe('DE');
    expect(standingOrder(ds, '2026-10', 1).exact).toBeCloseTo(55.08 / 3 + 10, 6);
  });

  it('Vorlagen je Land: Rhythmus und Kategorie vorbelegt, Betrag nie', () => {
    expect(templatesFor('AT').map((t) => t.name)).toEqual(['ORF-Beitrag', 'Öffi-Jahreskarte', 'Kfz-Versicherung', 'Haushaltsversicherung', 'Strom-Jahresabrechnung', 'Kontoführung']);
    expect(templatesFor('DE').map((t) => [t.name, t.frequency]).slice(0, 2)).toEqual([['Rundfunkbeitrag', 'quarterly'], ['Kfz-Steuer', 'annual']]);
    expect(templatesFor('CH').map((t) => t.name).slice(0, 2)).toEqual(['Serafe-Abgabe', 'Krankenkassen-Franchise']);
    expect(templatesFor('CH').find((t) => t.name === 'Kontoführung')!.frequency).toBe('quarterly');
    for (const c of ['AT', 'DE', 'CH'] as const) for (const t of templatesFor(c)) expect(t).not.toHaveProperty('amount');
  });

  it('„Leer starten“: keine Daten, Modus sofort an', async () => {
    const db = openDb();
    await completeOnboarding(db, { country: null, templates: [], startPeriod: '2026-10' });
    expect((await loadDataset(db)).positions).toHaveLength(0);
    expect((await readKonto(db)).enabled).toBe(true);
    expect(await readCountryRaw(db)).toBeNull();
  });
});
