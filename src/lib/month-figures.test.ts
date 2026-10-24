import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fixtureBackup, fixtureDataset } from '../../tests/fixtures/dataset';
import { NOV, withNovember } from '../../tests/fixtures/november';
import { exportBackup, importIntoEmpty, parseBackup } from '../db/backup';
import { FixkostenDB } from '../db/db';
import { loadDataset } from '../db/repo';
import { savingsCard, yearForecast } from './analytics';
import {
  categoryFigures,
  dueInPeriod,
  dueItems,
  fixedCosts,
  freeAfterFixed,
  monthFigures,
  plannedForPeriod,
  progressPercent,
  savingsRate,
  shownOpen,
  wealthBuilding,
  type MonthFigures,
} from './calc';
import { formatPercent } from './format';
import { addPeriods, periodRange, toPeriod } from './period';
import type { Category, Dataset, Frequency, OneOff, Payment, Position } from './types';

const cents = (v: number) => Math.round(v * 100);

function november(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = withNovember(fixtureBackup()).data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

describe('Golden Fixture November 2026 (deine Daten)', () => {
  // Lebensmittel & Co: Plan 480, „tatsächlich abgebucht“ 450 → counted with 450 (audit decision C)
  it('Hero, Kacheln, Sparquote', () => {
    const f = monthFigures(november(), NOV);
    expect(f.total).toBe(5649);
    expect(f.paid).toBe(450);
    expect(f.open).toBe(5199);
    expect(f.openCount).toBe(14);
    expect(f.paidCount).toBe(1);
    expect(f.count).toBe(15);
    expect(progressPercent(f)).toBe(8);
    expect(f.wealth).toBe(800);
    expect(f.netSalary).toBe(7819);
    expect(f.free).toBe(1370); // 7.819 − 5.649 − 800 (Frei verfügbar = Netto − Fixkosten − Vermögensaufbau)
    expect(formatPercent(f.savingsRate!).replace(/\s/g, ' ')).toBe('10,2 %');
  });

  it('Kategorie-Header: x/y bezahlt · Summe, Summe der Ausgaben-Kategorien = Gesamt', () => {
    const f = monthFigures(november(), NOV);
    const row = (id: string) => {
      const t = categoryFigures(f, id);
      return [t.paidCount, t.count, t.total];
    };
    expect(row('cat-wohnen')).toEqual([1, 6, 1572]); // 1.008 + 64 + 17 + 23 + 10 + 450
    expect(row('cat-immos')).toEqual([0, 3, 991]);
    expect(row('cat-abos')).toEqual([0, 4, 71]);
    expect(row('cat-sonstiges')).toEqual([0, 2, 3015]);
    expect(row('cat-investing')).toEqual([1, 2, 800]);
    const expenseSum = f.categories.filter((c) => c.category.kind === 'expense').reduce((a, c) => a + cents(c.total), 0);
    expect(expenseSum).toBe(cents(f.total));
  });

  it('Bug: Abgebucht + Offen = Gesamt (vorher 450 + 5.199 ≠ 5.679); der Plan bleibt erhalten', () => {
    const ds = november();
    const f = monthFigures(ds, NOV);
    expect(cents(f.paid) + cents(f.open)).toBe(cents(f.total));
    expect(plannedForPeriod(ds, NOV)).toBe(5679); // plan sum, used only by „Plan vs. Ist“
  });

  it('die Notiz ändert keine Zahl', () => {
    const ds = november();
    const before = monthFigures(ds, NOV);
    ds.payments.find((p) => p.id === 'pay-lebensmittel-nov')!.note = 'ganz anderer Text, € 999';
    expect(monthFigures(ds, NOV)).toEqual(before);
    delete ds.payments.find((p) => p.id === 'pay-lebensmittel-nov')!.note;
    expect(monthFigures(ds, NOV)).toEqual(before);
  });

  it('Analyse = Monat: Jahresvorschau-Balken, Sparquote-Karte', () => {
    const ds = november();
    const nov = yearForecast(ds, '2026-10').months.find((m) => m.period === NOV)!;
    expect(nov.due).toBe(monthFigures(ds, NOV).total);
    expect(savingsCard(ds, NOV)!.wealth).toBe(monthFigures(ds, NOV).wealth);
  });

  it('Oktober und Dezember: kein Haken wird übertragen', () => {
    const ds = november();
    expect(monthFigures(ds, '2026-12').paidCount).toBe(0);
    expect(dueItems(ds, '2026-12').every((i) => i.status === 'open')).toBe(true);
    // October keeps its own ticks from the seed
    expect(monthFigures(ds, '2026-10').paid).toBe(monthFigures(fixtureDataset(), '2026-10').paid);
  });

  it('Vermögensaufbau-Flag umschalten rechnet sofort neu', () => {
    const ds = november();
    ds.categories.find((c) => c.id === 'cat-immos')!.kind = 'savings';
    const f = monthFigures(ds, NOV);
    expect(f.total).toBe(5649 - 991);
    expect(f.wealth).toBe(800 + 991);
    expect(f.free).toBe(7819 - (5649 - 991) - (800 + 991));
  });
});

describe('Gutschriften (negative Einmalausgaben)', () => {
  /** Only Handy (10) due in a fresh month, ticked; plus one-offs. */
  function tiny(oneOffs: Omit<OneOff, 'id' | 'period'>[]): Dataset {
    const ds = fixtureDataset();
    ds.positions = ds.positions.filter((p) => p.id === 'pos-handy');
    ds.payments = [{ id: 'pay', positionId: 'pos-handy', period: NOV, status: 'paid', plannedAmount: 10, actualAmount: 10, paidAt: '2026-11-02T08:00:00.000Z' }];
    ds.oneOffs = oneOffs.map((o, i) => ({ ...o, id: `o${i}`, period: NOV }));
    return ds;
  }

  it('offene Gutschrift: exaktes Offen negativ, angezeigt nie unter € 0; Ring 99 % statt über 100 %', () => {
    const f = monthFigures(tiny([{ positionId: 'pos-handy', amount: -25, label: 'Gutschrift' }]), NOV);
    expect([f.total, f.paid, f.open, f.openCount]).toEqual([-15, 10, -25, 1]);
    expect(shownOpen(f)).toBe(0);
    expect(f.ratio).toBeGreaterThanOrEqual(0);
    expect(f.ratio).toBeLessThanOrEqual(1);
    expect(progressPercent(f)).toBe(0); // Gesamt ≤ 0: nothing to progress against
  });

  it('Abgebucht > Gesamt (offene Gutschrift kleiner als das Bezahlte): Ring bleibt ≤ 99 % solange etwas offen ist', () => {
    const ds = tiny([{ positionId: 'pos-handy', amount: -4, label: 'Gutschrift' }]);
    const f = monthFigures(ds, NOV);
    expect([f.total, f.paid, f.open]).toEqual([6, 10, -4]);
    expect(f.paid).toBeGreaterThan(f.total);
    expect(f.ratio).toBe(1);
    expect(progressPercent(f)).toBe(99);
    expect(shownOpen(f)).toBe(0);
    // ticking the credit closes the month at exactly 100 %
    ds.oneOffs[0]!.paidAt = '2026-11-20T08:00:00.000Z';
    const done = monthFigures(ds, NOV);
    expect([done.total, done.paid, done.open, done.openCount]).toEqual([6, 6, 0, 0]);
    expect(progressPercent(done)).toBe(100);
  });

  it('Kategorie unter null: Summe darf negativ sein, Invarianten halten', () => {
    const f = monthFigures(tiny([{ positionId: 'pos-handy', amount: -40, label: 'Gutschrift', paidAt: '2026-11-20T08:00:00.000Z' }]), NOV);
    const wohnen = categoryFigures(f, 'cat-wohnen');
    expect(wohnen.total).toBe(-30);
    expect(cents(wohnen.paid) + cents(wohnen.open)).toBe(cents(wohnen.total));
    expect(f.free).toBe(f.netSalary === null ? null : f.netSalary + 30);
    expect(progressPercent(f)).toBeGreaterThanOrEqual(0);
    expect(progressPercent(f)).toBeLessThanOrEqual(100);
  });

  it('zufällig: angezeigtes Offen ≥ 0, Ring 0–100 %, 100 % nur ohne Offenes', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ds = randomDataset(seed, true);
      for (const period of MONTHS) {
        const f = monthFigures(ds, period);
        expect(shownOpen(f)).toBeGreaterThanOrEqual(0);
        for (const c of f.categories) expect(shownOpen(c)).toBeGreaterThanOrEqual(0);
        expect(f.ratio).toBeGreaterThanOrEqual(0);
        expect(f.ratio).toBeLessThanOrEqual(1);
        const pct = progressPercent(f);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
        if (pct === 100) expect(f.openCount).toBe(0);
      }
    }
  });
});

describe('Datum, Zeitzone, Rhythmen', () => {
  it('Fälligkeit am 1. und am Letzten landet im richtigen Monat (Text-Datum, keine Zeitzonen-Umrechnung)', () => {
    process.env.TZ = 'Europe/Vienna';
    const ds = fixtureDataset();
    const mk = (id: string, dueDate: string): Position => ({
      id,
      name: id,
      categoryId: 'cat-wohnen',
      history: [{ validFrom: dueDate.slice(0, 7), amount: 10, frequency: 'once', dueMonths: [Number(dueDate.slice(5, 7))], dueDay: Number(dueDate.slice(8)), dueDate }],
      createdAt: '2026-10-01T00:00:00.000Z',
      sortOrder: 90,
    });
    // Hotel MUC 1.12., end of November, the days of the clock changes (29.3. / 25.10.)
    const cases: [string, string][] = [['2026-12-01', '2026-12'], ['2026-11-30', '2026-11'], ['2027-03-28', '2027-03'], ['2027-03-29', '2027-03'], ['2026-10-25', '2026-10'], ['2027-01-01', '2027-01'], ['2026-12-31', '2026-12']];
    for (const [date, month] of cases) {
      const p = mk(`p-${date}`, date);
      ds.positions.push(p);
      for (const period of periodRange('2026-09', '2027-04')) expect(dueInPeriod(p, period), `${date} in ${period}`).toBe(period === month);
    }
  });

  it('„heute“ in Wien: 1. um 00:30 ist schon der neue Monat, auch bei Sommer-/Winterzeit', () => {
    process.env.TZ = 'Europe/Vienna';
    expect(toPeriod(new Date('2026-10-31T23:30:00+01:00'))).toBe('2026-10');
    expect(toPeriod(new Date('2026-11-01T00:30:00+01:00'))).toBe('2026-11');
    expect(toPeriod(new Date('2027-03-31T23:30:00+02:00'))).toBe('2027-03');
    expect(toPeriod(new Date('2027-04-01T00:30:00+02:00'))).toBe('2027-04');
    expect(toPeriod(new Date('2026-10-25T02:30:00+01:00'))).toBe('2026-10'); // night of the clock change
  });

  it('Rhythmen: monatlich, quartal, halbjährlich (Jun/Dez), jährlich, einmalig', () => {
    const ds = fixtureDataset();
    const due = (id: string) => periodRange('2026-10', '2027-12').filter((p) => dueInPeriod(ds.positions.find((x) => x.id === id)!, p));
    expect(due('pos-miete')).toHaveLength(15);
    expect(due('pos-depotentgelt')).toEqual(['2026-10', '2027-01', '2027-04', '2027-07', '2027-10']);
    expect(due('pos-baurechtszins')).toEqual(['2026-12', '2027-06', '2027-12']);
    expect(due('pos-parqet')).toEqual(['2026-12', '2027-12']);
    const nov = november();
    expect(periodRange('2026-10', '2027-12').filter((p) => dueInPeriod(nov.positions.find((x) => x.id === 'pos-hotel-cph')!, p))).toEqual([NOV]);
  });
});

// ---------------------------------------------------------------------------
// Property tests: random datasets, random months
// ---------------------------------------------------------------------------

/** Small seeded PRNG (mulberry32): reproducible runs without an extra dependency. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    money: () => Math.round(next() * 200000) / 100,
    chance: (p: number) => next() < p,
  };
}

const MONTHS = periodRange('2026-01', '2027-12');
const FREQS: Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual', 'once'];
const DUE: Record<Exclude<Frequency, 'once'>, number[]> = {
  monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  quarterly: [2, 5, 8, 11],
  semiannual: [6, 12],
  annual: [3],
};

function randomDataset(seed: number, heavyCredits = false): Dataset {
  const r = rng(seed);
  const categories: Category[] = Array.from({ length: r.int(1, 5) }, (_, i) => ({
    id: `c${i}`,
    name: `Kategorie ${i}`,
    kind: r.chance(0.25) ? 'savings' : 'expense',
    color: '#5B5BD6',
    sortOrder: i,
  }));
  const positions: Position[] = Array.from({ length: r.int(1, 14) }, (_, i) => {
    const frequency = r.pick(FREQS);
    const start = r.pick(MONTHS.slice(0, 12));
    if (frequency === 'once') {
      const dueDate = `${r.pick(MONTHS)}-${String(r.int(1, 28)).padStart(2, '0')}`;
      return { id: `p${i}`, name: `P${i}`, categoryId: r.pick(categories).id, history: [{ validFrom: dueDate.slice(0, 7), amount: r.money(), frequency, dueMonths: [Number(dueDate.slice(5, 7))], dueDate }], createdAt: '2026-01-01T00:00:00.000Z', sortOrder: i };
    }
    const history = [{ validFrom: start, amount: r.money(), frequency, dueMonths: DUE[frequency] }];
    if (r.chance(0.3)) history.push({ validFrom: addPeriods(start, r.int(1, 10)), amount: r.money(), frequency, dueMonths: DUE[frequency] });
    return { id: `p${i}`, name: `P${i}`, categoryId: r.pick(categories).id, history, createdAt: '2026-01-01T00:00:00.000Z', sortOrder: i };
  });
  const ds: Dataset = { categories, positions, payments: [], oneOffs: [], monthClose: [], reminders: [], changeLog: [] };
  for (const period of MONTHS) {
    for (const item of dueItems(ds, period)) {
      if (!item.due || !r.chance(0.5)) continue;
      const skipped = r.chance(0.15);
      ds.payments.push({
        id: `pay-${item.position.id}-${period}`,
        positionId: item.position.id,
        period,
        status: skipped ? 'skipped' : 'paid',
        plannedAmount: item.planned,
        actualAmount: skipped ? 0 : r.chance(0.5) ? item.planned : r.money(),
        paidAt: `${period}-15T10:00:00.000Z`,
        ...(r.chance(0.3) ? { note: `€${r.int(1, 99)} vom Vormonat abgehoben` } : {}),
      } satisfies Payment);
    }
    if (r.chance(heavyCredits ? 0.8 : 0.4)) {
      // heavyCredits: mostly large Gutschriften, often bigger than the month itself
      const amount = heavyCredits && r.chance(0.7) ? -r.money() * 4 : r.money() * (r.chance(0.3) ? -1 : 1);
      ds.oneOffs.push({ id: `o-${period}`, positionId: r.pick(positions).id, period, amount, label: 'Nachzahlung', ...(r.chance(0.5) ? { paidAt: `${period}-20T10:00:00.000Z` } : {}) } satisfies OneOff);
    }
    if (r.chance(0.6)) ds.monthClose.push({ period, netSalary: r.money() * 5, updatedAt: '', ...(r.chance(0.3) ? { note: 'Notiz', freeActual: r.money() } : {}) });
  }
  return ds;
}

function check(ds: Dataset, period: string, f: MonthFigures) {
  const tag = `${period}`;
  expect(cents(f.paid) + cents(f.open), `Abgebucht + Offen = Gesamt ${tag}`).toBe(cents(f.total));
  const expenseCats = f.categories.filter((c) => c.category.kind === 'expense');
  expect(expenseCats.reduce((a, c) => a + cents(c.total), 0) + cents(f.unassigned), `Σ Kategorien = Gesamt ${tag}`).toBe(cents(f.total));
  expect(f.paidCount + f.openCount, `bezahlt + offen = fällig ${tag}`).toBe(f.count);
  const dueExpense = dueItems(ds, period).filter((i) => i.kind === 'expense' && i.due && i.status !== 'skipped').length;
  const oneOffs = ds.oneOffs.filter((o) => o.period === period && ds.categories.find((c) => c.id === ds.positions.find((p) => p.id === o.positionId)?.categoryId)?.kind !== 'savings').length;
  expect(f.count, `Anzahl fällig ${tag}`).toBe(dueExpense + oneOffs);
  for (const c of f.categories) {
    expect(cents(c.paid) + cents(c.open)).toBe(cents(c.total));
    expect(c.paidCount + c.openCount).toBe(c.count);
  }
  const savingsSum = f.categories.filter((c) => c.category.kind === 'savings').reduce((a, c) => a + cents(c.total), 0);
  expect(savingsSum, `Vermögensaufbau ${tag}`).toBe(cents(f.wealth));
  if (f.netSalary !== null) {
    expect(cents(f.free!), `Frei = Netto − Gesamt − Vermögensaufbau ${tag}`).toBe(cents(f.netSalary) - cents(f.total) - cents(f.wealth));
    if (f.netSalary > 0) expect(f.savingsRate).toBeCloseTo(f.wealth / f.netSalary, 12);
  }
  // the older API returns the same numbers
  expect(fixedCosts(ds, period)).toBe(f.total);
  expect(wealthBuilding(ds, period)).toBe(f.wealth);
  expect(freeAfterFixed(ds, period)).toBe(f.free);
  expect(savingsRate(ds, period)).toBe(f.savingsRate);
}

describe('Invarianten (Property-Tests, 300 zufällige Datensätze × 24 Monate)', () => {
  it('Abgebucht + Offen = Gesamt · Σ Kategorien = Gesamt · bezahlt + offen = fällig · Frei = Netto − Gesamt − Vermögensaufbau', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ds = randomDataset(seed);
      for (const period of MONTHS) check(ds, period, monthFigures(ds, period));
    }
  });

  it('Notizen und Altfelder (Notiz, freeActual) ändern keine Kennzahl', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const ds = randomDataset(seed);
      const before = MONTHS.map((p) => monthFigures(ds, p));
      const r = rng(seed * 7);
      for (const p of ds.payments) p.note = r.chance(0.5) ? `€${r.int(1, 500)} vom Vormonat abgehoben` : undefined;
      for (const m of ds.monthClose) {
        m.note = `Notiz ${r.int(1, 9)}`;
        m.freeActual = r.money();
      }
      expect(MONTHS.map((p) => monthFigures(ds, p)), `seed ${seed}`).toEqual(before);
    }
  });

  it('Analyse = Monat: Jahresvorschau-Balken = Gesamt des Monats', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const ds = randomDataset(seed);
      for (const m of yearForecast(ds, '2026-06').months) expect(m.due, `seed ${seed} ${m.period}`).toBe(monthFigures(ds, m.period).total);
    }
  });

  it('Export → Import → identische Kennzahlen', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const ds = randomDataset(seed);
      const src = new FixkostenDB(`figures-src-${seed}`);
      const dst = new FixkostenDB(`figures-dst-${seed}`);
      const base = fixtureBackup();
      await importIntoEmpty(src, { ...base, data: { ...ds } });
      const file = JSON.parse(JSON.stringify(await exportBackup(src)));
      await importIntoEmpty(dst, parseBackup(file));
      const back = await loadDataset(dst);
      for (const period of MONTHS) expect(monthFigures(back, period), `seed ${seed} ${period}`).toEqual(monthFigures(ds, period));
      await src.delete();
      await dst.delete();
    }
  });
});
