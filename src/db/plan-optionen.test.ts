// plan-optionen: „Aufteilen: vom {Monat}- bis {Monat}-Gehalt“ (saving mode 'range', equal rates, the cent rest
// on the first rate), the preview of the editor (= the values after „Übernehmen“), the table „Deine nächsten
// Gehälter“ (= the month cards), the message in two steps and the Polster. Invented data only (tests/fixtures).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P2, P3 } from '../../tests/fixtures/golden-month';
import { monthCard, monthLevel, planRows, planStatus, type PlanRow } from '../lib/monthCard';
import { monthPlan, storedSavings } from '../lib/monthPlan';
import type { Dataset, Position, SavingSetting } from '../lib/types';
import { exportBackup, importIntoEmpty, parseBackup, type BackupFile } from './backup';
import { FixkostenDB } from './db';
import { setCushion, setSaving } from './kontoActions';
import { loadDataset } from './repo';
import { readKonto, toKontoSettings, storedKonto } from './settings';

const TODAY = new Date(2026, 11, 10);
const FEB = '2027-02';
const MAR = '2027-03';
const cents = (v: number) => Math.round(v * 100);

function steuer(amount: number, saving?: SavingSetting): Position {
  return {
    id: 'k-steuer',
    name: 'Kfz-Steuer',
    categoryId: 'g-ruecklage',
    history: [{ validFrom: '2026-01', amount, frequency: 'annual', dueMonths: [3], dueDay: 10 }],
    createdAt: '2026-01-01T08:00:00.000Z',
    sortOrder: 50,
    account: 'fixkostenkonto',
    ...(saving ? { saving } : {}),
  };
}
const withSteuer = (saving?: SavingSetting, amount = 240): Dataset => {
  const ds = goldenDataset();
  return { ...ds, positions: [...ds.positions, steuer(amount, saving)] };
};
const custom = goldenSettings({ planMode: 'custom' });
const planOf = (ds: Dataset, s = custom) => monthPlan(ds, P2, s, 25);
const month = (ds: Dataset, p: string) => planOf(ds).months.find((m) => m.period === p)!;
const pay = (ds: Dataset) => planOf(ds).payments.find((p) => p.name === 'Kfz-Steuer')!;

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`plan-optionen-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe("mode 'range': gleiche Raten, Cent-Rest auf die erste", () => {
  it('€ 240 vom Dezember- bis Jänner-Zeitraum: 2 × € 120, März ohne Betrag', () => {
    const ds = withSteuer({ mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 });
    const p = pay(ds);
    expect([p.mode, p.start, p.end, p.rates, p.firstRate, p.rate, p.atDue]).toEqual(['range', P2, P3, 2, 120, 120, 0]);
    expect(month(ds, P2).transfer).toBe(360 + 120);
    expect(month(ds, P3).transfer).toBe(600 + 120);
    expect(month(ds, MAR).transfer).toBe(0);
    expect(month(ds, MAR).fromReserve).toBe(240);
    expect(month(ds, P2).lines!.at(-1)).toEqual({ key: `k-steuer@${MAR}>${P2}`, name: 'Kfz-Steuer', kind: 'for', period: MAR, amount: 120, saved: 0 });
  });

  it('€ 100 auf 3 Gehälter: € 33,34 + € 33,33 + € 33,33', () => {
    const ds = withSteuer({ mode: 'range', fromSalaryMonth: P2, toSalaryMonth: FEB }, 100);
    const p = pay(ds);
    expect([p.rates, p.firstRate, p.rate]).toEqual([3, 33.34, 33.33]);
    const before = withSteuer(undefined, 100);
    expect(cents(month(ds, P2).transfer) - cents(month(before, P2).transfer)).toBe(3334);
    expect(cents(month(ds, P3).transfer) - cents(month(before, P3).transfer)).toBe(3333);
    expect(cents(month(ds, FEB).transfer) - cents(month(before, FEB).transfer)).toBe(3333);
    // the three rates are the payment, to the cent
    expect(cents(p.firstRate) + 2 * cents(p.rate)).toBe(10000);
  });

  it('bis zum Fälligkeitsmonat: die letzte Rate kommt im März, der Rest „aus Rücklage“', () => {
    const ds = withSteuer({ mode: 'range', fromSalaryMonth: FEB, toSalaryMonth: MAR });
    const p = pay(ds);
    expect([p.rates, p.atDue]).toEqual([2, 120]);
    expect(month(ds, MAR).lines).toEqual([{ key: `k-steuer@${MAR}`, name: 'Kfz-Steuer', kind: 'due', period: MAR, amount: 120, saved: 120 }]);
  });

  it('Bis-Gehalt nach der Fälligkeit: höchstens bis zum Fälligkeitsmonat; Von-Gehalt vor dem Plan: ab dem ersten', () => {
    const ds = withSteuer({ mode: 'range', fromSalaryMonth: '2026-09', toSalaryMonth: '2027-06' });
    const p = pay(ds);
    expect([p.start, p.end, p.rates, p.firstRate]).toEqual([P2, MAR, 4, 60]);
  });

  it('Wechsel der Modi: range → once → spread → due, jeweils dieselbe Summe über den Plan', () => {
    const total = (ds: Dataset) => planOf(ds).months.reduce((a, m) => a + cents(m.transfer), 0);
    const base = total(withSteuer({ mode: 'due' }));
    for (const s of [
      { mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 },
      { mode: 'once', salaryMonth: P3 },
      { mode: 'spread', startMonth: P2 },
      { mode: 'due' },
    ] as SavingSetting[]) {
      const ds = withSteuer(s);
      expect(pay(ds).mode).toBe(s.mode);
      expect(total(ds)).toBe(base);
    }
  });

  it('mit „Bei Fälligkeit“ als Plan-Art zählt range nicht', () => {
    const ds = withSteuer({ mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 });
    expect(monthPlan(ds, P2, goldenSettings({ planMode: 'due' }), 25).payments.find((p) => p.name === 'Kfz-Steuer')!.mode).toBe('due');
  });
});

describe('Tabelle = Karte', () => {
  for (const [name, saving] of [
    ['bei Fälligkeit', undefined],
    ['aufgeteilt', { mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 }],
    ['komplett', { mode: 'once', salaryMonth: P2 }],
  ] as [string, SavingSetting | undefined][])
    it(`${name}: jede der 12 Zeilen = ① und Überschuss ihrer Monatskarte`, () => {
      const ds = withSteuer(saving);
      const plan = planOf(ds);
      const rows = planRows(ds, plan, 25, TODAY);
      expect(rows).toHaveLength(12);
      let sum = 0;
      for (const r of rows) {
        const card = monthCard(ds, r.period, plan, 25, TODAY);
        expect([r.transfer, r.left, r.before]).toEqual([card.reserve.total, card.left, card.beforeSpielgeld]);
        sum += cents(card.left!);
        expect(cents(r.cushion!)).toBe(sum);
      }
    });
});

describe('Vorschau = Werte nach Übernehmen', () => {
  for (const [name, choice] of [
    ['aufgeteilt', { mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 }],
    ['komplett', { mode: 'once', salaryMonth: P3 }],
    ['Teilbetrag', { mode: 'once', salaryMonth: P2, amount: 5000 }],
    ['ansparen', { mode: 'spread', startMonth: P3 }],
    ['bei Fälligkeit', { mode: 'due' }],
  ] as [string, SavingSetting][])
    it(`${name}: die Vorschau rechnet mit der Auswahl; nach dem Speichern sind Tabelle und Karte gleich`, async () => {
      const db = newDb();
      const ds = withSteuer();
      await db.categories.bulkPut(ds.categories);
      await db.positions.bulkPut(ds.positions);
      await db.monthClose.bulkPut(ds.monthClose);
      // preview: the stored plan with this one payment changed, as „Eigener Plan“
      const preview = monthPlan(ds, P2, goldenSettings({ planMode: 'due' }), 25, { mode: 'custom', savings: { ...storedSavings(ds), 'k-steuer': choice } });
      const previewRows = planRows(ds, preview, 25, TODAY);
      await setSaving(db, { 'k-steuer': choice });
      const after = await loadDataset(db);
      expect((await readKonto(db)).planMode).toBe('custom');
      const plan = monthPlan(after, P2, custom, 25);
      expect(planRows(after, plan, 25, TODAY)).toEqual(previewRows);
    });

  it('aufgeteilt Dezember–Jänner: Dezember ① + € 120, Überschuss − € 120', () => {
    const ds = withSteuer();
    const was = planRows(ds, planOf(ds), 25, TODAY)[0]!;
    const preview = monthPlan(ds, P2, custom, 25, { mode: 'custom', savings: { 'k-steuer': { mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 } } });
    const now = planRows(ds, preview, 25, TODAY)[0]!;
    expect(cents(now.transfer) - cents(was.transfer)).toBe(12000);
    expect(cents(was.left!) - cents(now.left!)).toBe(12000);
  });
});

const row = (period: string, before: number, spielgeld: number, cushion = 0): PlanRow => ({ period, estimated: false, transfer: 0, before, left: before - spielgeld, spielgeld, cushion });
function rows(...xs: [number, number][]): PlanRow[] {
  let sum = 0;
  return xs.map(([before, sg], i) => {
    sum += cents(before - sg);
    return { ...row(`2027-${String(i + 1).padStart(2, '0')}`, before, sg), cushion: sum / 100 };
  });
}

describe('Meldung oben: zwei Stufen', () => {
  it('Rot nur bei „Vor Spielgeld“ < 0: der erste solche Monat und sein Fehlbetrag', () => {
    expect(planStatus(rows([500, 300], [200, 300], [-50, 300], [-400, 300]), false)).toEqual({ kind: 'short', period: '2027-03', amount: 50 });
  });
  it('nur Spielgeld nicht gedeckt: ab dem ersten Monat, kein Rot', () => {
    expect(planStatus(rows([500, 300], [200, 300], [100, 300]), false)).toEqual({ kind: 'spielgeld', period: '2027-02' });
  });
  it('alles gedeckt: ok', () => {
    expect(planStatus(rows([500, 300], [300, 300]), false)).toEqual({ kind: 'ok' });
  });
  it('ohne Gehalt: keine Meldung', () => {
    expect(planStatus([{ ...row(P2, 0, 0), before: null, left: null, cushion: null }], false)).toBeNull();
  });
  it('ein Monat allein (Nächster großer Monat)', () => {
    expect(monthLevel({ before: -20, left: -320 })).toEqual({ kind: 'short', amount: 20 });
    expect(monthLevel({ before: 100, left: -200 })).toEqual({ kind: 'spielgeld' });
    expect(monthLevel({ before: 300, left: 0 })).toEqual({ kind: 'ok' });
  });
});

describe('Polster: laufende Summe und „reicht bis“', () => {
  it('laufende Summe der Überschüsse', () => {
    expect(rows([500, 300], [200, 300], [100, 300]).map((r) => r.cushion)).toEqual([200, 100, -100]);
  });
  it('„Dein Polster reicht bis {Monat}“: der Monat vor dem ersten negativen Polster', () => {
    expect(planStatus(rows([500, 300], [200, 300], [100, 300]), true)).toEqual({ kind: 'cushion', until: '2027-02', level: 'spielgeld' });
    // im März fehlen auch ohne Spielgeld € 50 → rot
    expect(planStatus(rows([500, 300], [200, 300], [-150, 300]), true)).toEqual({ kind: 'cushion', until: '2027-02', level: 'short' });
  });
  it('„Reicht für alle 12 Monate“, auch wenn einzelne Monate unter dem Spielgeld liegen', () => {
    expect(planStatus(rows([800, 300], [200, 300], [300, 300]), true)).toEqual({ kind: 'cushionAll' });
    expect(planStatus(rows([800, 300], [200, 300], [300, 300]), false)).toEqual({ kind: 'spielgeld', period: '2027-02' });
  });
  it('schon der erste Monat negativ: die zwei Stufen wie ohne Polster', () => {
    expect(planStatus(rows([100, 300], [900, 300]), true)).toEqual({ kind: 'spielgeld', period: '2027-01' });
  });
  it('am Golden-Datensatz: Polster = laufende Summe der Karten', () => {
    const ds = withSteuer();
    const r = planRows(ds, planOf(ds), 25, TODAY);
    expect(r[1]!.cushion).toBe((cents(r[0]!.left!) + cents(r[1]!.left!)) / 100);
  });
});

describe('Export und Import mit und ohne neue Felder', () => {
  it('saving range und Polster reisen mit; ohne Felder: bei Fälligkeit und Polster aus', async () => {
    const source = newDb();
    const ds = withSteuer();
    await source.categories.bulkPut(ds.categories);
    await source.positions.bulkPut(ds.positions);
    await source.monthClose.bulkPut(ds.monthClose);
    await setSaving(source, { 'k-steuer': { mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 } });
    await setCushion(source, true);
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    expect(file.data.positions.find((p) => p.id === 'k-steuer')!.saving).toEqual({ mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 });
    expect(file.settings?.fixkostenkonto?.cushion).toBe(true);

    const withFields = newDb();
    await importIntoEmpty(withFields, file);
    expect((await withFields.positions.get('k-steuer'))!.saving).toEqual({ mode: 'range', fromSalaryMonth: P2, toSalaryMonth: P3 });
    expect((await readKonto(withFields)).cushion).toBe(true);
    expect(month(await loadDataset(withFields), MAR).transfer).toBe(0);

    const { cushion: _c, ...konto } = file.settings!.fixkostenkonto!;
    const without: BackupFile = {
      ...file,
      settings: { ...file.settings, fixkostenkonto: konto },
      data: { ...file.data, positions: file.data.positions.map(({ saving: _s, ...p }) => p as Position) },
    };
    const withoutFields = newDb();
    await importIntoEmpty(withoutFields, parseBackup(JSON.parse(JSON.stringify(without))));
    expect((await withoutFields.positions.get('k-steuer'))!.saving).toBeUndefined();
    expect((await readKonto(withoutFields)).cushion).toBe(false);
    expect(month(await loadDataset(withoutFields), MAR).transfer).toBe(240);
  });

  it('cushion: nur gespeichert, wenn an; Rundreise', () => {
    expect(storedKonto(toKontoSettings({ enabled: true })).cushion).toBeUndefined();
    const on = toKontoSettings({ enabled: true, cushion: true });
    expect(on.cushion).toBe(true);
    expect(toKontoSettings(storedKonto(on))).toEqual(on);
  });
});
