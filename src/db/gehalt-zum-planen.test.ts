// gehalt-zum-planen: „Gehalt zum Planen“ – the salary of every month without an entry. Order: the month's own
// entry (€ 0 included) > „Gehalt zum Planen“ > the last one entered. Deleting an entry brings the fallback back
// at once. „Dir fehlen € X“: the largest amount missing in the plan (monthPlan.shortfall). Backups carry the field;
// a backup without it imports as „not set“. Invented data only (tests/fixtures).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P1, P2, P3, SALARY } from '../../tests/fixtures/golden-month';
import { t } from '../lib/kontoTexts';
import { monthCard } from '../lib/monthCard';
import { monthPlan, shortfallOf, type PlanMonth } from '../lib/monthPlan';
import { monthName } from '../lib/period';
import { plannedSalary, salaryView } from '../lib/salaryMonth';
import { formatEUR } from '../lib/format';
import type { Dataset } from '../lib/types';
import { exportBackup, importIntoEmpty, parseBackup, type BackupFile } from './backup';
import { FixkostenDB } from './db';
import { setPlanSalary } from './kontoActions';
import { loadDataset, saveMonthClose } from './repo';
import { DEFAULT_KONTO, kontoUntouched, readKonto, storedKonto, toKontoSettings, writeKonto } from './settings';

const TODAY = new Date(2026, 11, 10);
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const money = (v: number) => formatEUR(v, { fixed: true });
const withSalary = (ds: Dataset, period: string, netSalary: number | undefined): Dataset => ({
  ...ds,
  monthClose: [...ds.monthClose.filter((c) => c.period !== period), ...(netSalary === undefined ? [] : [{ period, netSalary, updatedAt: '2026-12-01T08:00:00.000Z' }])],
});

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`gehalt-zum-planen-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('Fallback-Reihenfolge: eigener Eintrag > Gehalt zum Planen > zuletzt eingetragen', () => {
  const ds = goldenDataset(); // salaries in November and December (€ 4.000), none in January

  it('eigener Eintrag zählt, auch wenn „Gehalt zum Planen“ gesetzt ist', () => {
    expect(plannedSalary(ds, P2, 3500)).toEqual({ value: SALARY, source: 'own' });
    expect(plannedSalary(ds, P2, null)).toEqual({ value: SALARY, source: 'own' });
  });

  it('ohne Eintrag: „Gehalt zum Planen“, sonst das zuletzt eingetragene', () => {
    expect(plannedSalary(ds, P3, 3500)).toEqual({ value: 3500, source: 'plan' });
    expect(plannedSalary(ds, P3, null)).toEqual({ value: SALARY, source: 'last' });
  });

  it('gar kein Gehalt: nichts', () => {
    const none = { ...ds, monthClose: [] };
    expect(plannedSalary(none, P3, null)).toEqual({ value: null, source: null });
    expect(plannedSalary(none, P3, 2800)).toEqual({ value: 2800, source: 'plan' });
  });

  it('€ 0 ist ein bewusster Eintrag: er gilt, kein Fallback', () => {
    const zero = withSalary(ds, P3, 0);
    expect(plannedSalary(zero, P3, 3500)).toEqual({ value: 0, source: 'own' });
    const view = salaryView(zero, P3, 25, TODAY, 3500);
    expect([view.value, view.fallback]).toEqual([0, false]);
  });

  it('Eintrag gelöscht: der Fallback greift sofort', () => {
    const entered = withSalary(ds, P3, 4100);
    expect(plannedSalary(entered, P3, 3500).value).toBe(4100);
    const removed = withSalary(entered, P3, undefined);
    expect(plannedSalary(removed, P3, 3500)).toEqual({ value: 3500, source: 'plan' });
    expect(plannedSalary(removed, P3, null)).toEqual({ value: SALARY, source: 'last' });
  });

  it('Karte und „Dein Plan“ rechnen mit demselben Gehalt; geplante Monate sind markiert', () => {
    const plan = monthPlan(ds, P2, goldenSettings({ planSalary: 3500 }), 25);
    expect(plan.planSalary).toBe(3500);
    const jan = plan.months.find((m) => m.period === P3)!;
    expect([jan.salary, jan.estimated]).toEqual([3500, true]);
    expect(plan.months.find((m) => m.period === P2)!.estimated).toBe(false);
    expect(plan.months.slice(1).every((m) => m.estimated && m.salary === 3500)).toBe(true);
    const card = monthCard(ds, P3, plan, 25, TODAY);
    expect([card.salary.value, card.salary.fallback, card.salary.source]).toEqual([3500, true, 'plan']);
    // past and active month keep their entry
    expect(monthCard(ds, P1, plan, 25, TODAY).salary.source).toBe('own');
  });
});

describe('Fehlbetrag: „Dir fehlen € X“ aus monthPlan()', () => {
  const month = (period: string, free: number | null): PlanMonth => ({ period, free }) as PlanMonth;

  it('größter Fehlbetrag gegen das Spielgeld, der erste von gleich großen', () => {
    expect(shortfallOf([month('2027-01', 232), month('2027-02', 802), month('2027-06', 442)], 300)).toEqual({ period: '2027-01', amount: 68 });
    expect(shortfallOf([month('2027-01', -10), month('2027-02', -10.5), month('2027-03', -10.5)], 0)).toEqual({ period: '2027-02', amount: 10.5 });
  });

  it('nichts fehlt oder ein Gehalt fehlt: null', () => {
    expect(shortfallOf([month('2027-01', 300), month('2027-02', 900)], 300)).toBeNull();
    expect(shortfallOf([month('2027-01', -50), month('2027-02', null)], 0)).toBeNull();
  });

  it('Golden: Gehalt zum Planen € 3.500 → Jänner fehlen € 68,00 (232 statt 300 Spielgeld)', () => {
    const plan = monthPlan(goldenDataset(), P2, goldenSettings({ planSalary: 3500 }), 25);
    expect(plan.shortfall).toEqual({ period: P3, amount: 68 });
    expect(plan.answer?.kind).toBe('save');
    expect(plain(t('big.short', { betrag: money(plan.shortfall!.amount) }))).toBe('Geht sich nicht aus. Dir fehlen € 68,00.');
  });

  it('Golden: Gehalt zum Planen € 2.000 → höchstens € 0 Spielgeld; „Jänner geht sich nicht aus. Dir fehlen € 1.568,00.“', () => {
    const plan = monthPlan(goldenDataset(), P2, goldenSettings({ planSalary: 2000 }), 25);
    expect(plan.answer).toMatchObject({ kind: 'max', max: 0 });
    // Jänner: 2.000 − 600 − 2.318 − 350 = −1.268 frei; dazu € 300 Spielgeld = 1.568
    expect(plan.shortfall).toEqual({ period: P3, amount: 1568 });
    expect(plain(t('plan2.short', { monat: monthName(plan.shortfall!.period), betrag: money(plan.shortfall!.amount) }))).toBe('Jänner geht sich nicht aus. Dir fehlen € 1.568,00.');
  });

  it('ohne Spielgeld: gegen € 0', () => {
    const plan = monthPlan(goldenDataset(), P2, goldenSettings({ planSalary: 2000, spielgeld: null }), 25);
    expect(plan.shortfall).toEqual({ period: P3, amount: 1268 });
  });

  it('alles geht sich aus: kein Fehlbetrag', () => {
    expect(monthPlan(goldenDataset(), P2, goldenSettings(), 25).shortfall).toBeNull();
  });
});

describe('Einstellung: additiv, im Export, Import ohne Feld', () => {
  it('ohne Feld: nicht gesetzt; gespeichert nur, wenn gesetzt; Rundreise gleich', () => {
    expect(toKontoSettings({ enabled: true, balance: 0, receivedFor: null, rounding: 5 }).planSalary).toBeNull();
    expect(storedKonto(DEFAULT_KONTO)).not.toHaveProperty('planSalary');
    const s = toKontoSettings({ ...storedKonto(DEFAULT_KONTO), planSalary: 2850.5 });
    expect(s.planSalary).toBe(2850.5);
    expect(storedKonto(s).planSalary).toBe(2850.5);
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
    // € 0 or garbage: not set
    expect(toKontoSettings({ planSalary: 0 }).planSalary).toBeNull();
    expect(toKontoSettings({ planSalary: 'viel' }).planSalary).toBeNull();
  });

  it('„Gehalt zum Planen“ allein lässt die Einladung zu „Fixkosten einplanen“ stehen', () => {
    expect(kontoUntouched(toKontoSettings({ ...storedKonto(DEFAULT_KONTO), planSalary: 3000, planSalaryHintSeen: true }))).toBe(true);
  });

  it('Export enthält das Feld; Import mit und ohne Feld', async () => {
    const source = newDb();
    await setPlanSalary(source, 3200);
    const file = parseBackup(JSON.parse(JSON.stringify(await exportBackup(source))));
    expect(file.settings?.fixkostenkonto?.planSalary).toBe(3200);

    const withField = newDb();
    await importIntoEmpty(withField, file);
    expect((await readKonto(withField)).planSalary).toBe(3200);

    const { planSalary: _drop, ...older } = file.settings!.fixkostenkonto!;
    const without: BackupFile = { ...file, settings: { ...file.settings, fixkostenkonto: older } };
    const withoutField = newDb();
    await importIntoEmpty(withoutField, parseBackup(JSON.parse(JSON.stringify(without))));
    expect((await readKonto(withoutField)).planSalary).toBeNull();
  });

  it('Gehalt eintragen und wieder entfernen (leer bestätigt): der Eintrag ist weg, € 0 bleibt ein Eintrag', async () => {
    const db = newDb();
    await writeKonto(db, { planSalary: 3000 });
    await saveMonthClose(db, P3, { netSalary: 4100 });
    expect(plannedSalary(await loadDataset(db), P3, 3000)).toEqual({ value: 4100, source: 'own' });
    await saveMonthClose(db, P3, { netSalary: undefined });
    expect(await db.monthClose.get(P3)).toBeUndefined();
    expect(plannedSalary(await loadDataset(db), P3, 3000)).toEqual({ value: 3000, source: 'plan' });
    await saveMonthClose(db, P3, { netSalary: 0 });
    expect(plannedSalary(await loadDataset(db), P3, 3000)).toEqual({ value: 0, source: 'own' });
  });
});
