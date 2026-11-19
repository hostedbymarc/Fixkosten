// spielgeld-planer, Punkt 3: „Nicht einplanen“ nimmt Positionen aus allen Summen. Ohne solche Positionen
// müssen alle Kennzahlen exakt gleich bleiben. Der Vergleichsstand wurde mit dem Code VOR dem Sprint
// erzeugt (UPDATE_KENNZAHLEN=1) und liegt in tests/fixtures/kennzahlen-vorher.json. Nur nachgebaute Daten.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { historyDataset } from '../../tests/fixtures/history';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { live29Dataset, liveDataset } from '../../tests/fixtures/live';
import { toKontoSettings } from '../db/settings';
import { burdenTrend, categoryDistribution, historyPeriods, optimizationTimeline, planVsActual, savingsCard, savingsHistory, yearForecast } from './analytics';
import {
  actualForPeriod,
  costSources,
  dueItems,
  equivalentByCategory,
  fixedCostsAvg,
  freeAfterFixedAvg,
  groupByCategory,
  monthFigures,
  monthStatus,
  openFromPrevious,
  plannedForPeriod,
  reserveNeeded,
  sumMonthlyEquivalent,
  upcomingDue,
  wealthBuildingAvg,
} from './calc';
import { standingOrder } from './fixkostenkonto';
import { kontoState } from './kontoBalance';
import { addPeriods } from './period';
import { nextSalarySplit, salarySplit } from './salarySplit';
import type { Account, Category, Dataset, Period, Position } from './types';

const FILE = fileURLToPath(new URL('../../tests/fixtures/kennzahlen-vorher.json', import.meta.url));

// the salarySplit data of #48, without the two Spielgeld payments
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Vermögensaufbau', kind: 'savings', color: '#5B5BD6', sortOrder: 1 },
];
const pos = (id: string, amount: number, opts: { months?: number[]; account?: Account; cat?: string } = {}): Position => ({
  id,
  name: id,
  categoryId: opts.cat ?? 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: (opts.months ?? ALL).length === 12 ? 'monthly' : 'annual', dueMonths: opts.months ?? ALL }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  ...(opts.account ? { account: opts.account } : {}),
});
const KONTO_DATA: Dataset = {
  categories: CATS,
  positions: [pos('Miete', 2500), pos('Versicherung', 4908, { months: [2] }), pos('Lebensmittel', 450, { account: 'girokonto' }), pos('ETF', 1283, { cat: 'va' })],
  payments: [],
  oneOffs: [],
  monthClose: [{ period: '2026-11', netSalary: 8302, updatedAt: '2026-11-01T00:00:00.000Z' }],
  reminders: [],
  changeLog: [],
};

const SETTINGS = toKontoSettings({
  enabled: true,
  balance: 1500,
  rounding: 5,
  roundingOn: true,
  setupDone: true,
  hasAccount: true,
  receivedFor: null,
  gapMode: 'spread',
  anchor: { amount: 1500, at: '2026-10-01T08:00:00.000Z' },
});

const CASES: { name: string; ds: () => Dataset; today: Period }[] = [
  { name: 'live 25.10.', ds: liveDataset, today: '2026-11' },
  { name: 'live 29.10.', ds: live29Dataset, today: '2026-10' },
  { name: 'Verlauf 24 Monate', ds: historyDataset, today: '2026-11' },
  { name: 'Seed', ds: fixtureDataset, today: '2026-11' },
  { name: 'Rücklage-Daten', ds: () => structuredClone(KONTO_DATA), today: '2026-11' },
];

const round = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

function figures(ds: Dataset, today: Period) {
  const months = Array.from({ length: 18 }, (_, i) => addPeriods(today, i - 6));
  const perMonth = months.map((p) => ({
    period: p,
    figures: monthFigures(ds, p),
    planned: [plannedForPeriod(ds, p), plannedForPeriod(ds, p, 'savings')],
    actual: [actualForPeriod(ds, p), actualForPeriod(ds, p, 'savings')],
    groups: groupByCategory(dueItems(ds, p)).map((g) => [g.category.id, g.planned, g.actual, g.openCount]),
    avg: [fixedCostsAvg(ds, p), reserveNeeded(ds, p), wealthBuildingAvg(ds, p), freeAfterFixedAvg(ds, p)],
    perCategory: ds.categories.map((c) => sumMonthlyEquivalent(ds, p, { categoryId: c.id })),
    byCategory: equivalentByCategory(ds, p).map((e) => [e.category.id, e.amount]),
    open: openFromPrevious(ds, p, today).map((g) => [g.period, g.count, g.planned, g.items.map((i) => i.position.id), g.savingsCount, g.savingsPlanned]),
    status: monthStatus(ds, p, today),
    upcoming: upcomingDue(ds, p).map((i) => [i.position.id, i.period, i.planned]),
    sources: (({ reserve, salary }) => ({ reserve, salary }))(costSources(ds, p)),
    distribution: categoryDistribution(ds, p),
  }));
  const state = kontoState(ds, today, SETTINGS);
  const split = salarySplit(ds, today, state, { spielgeld: null, spielgeldOverflow: {} });
  const next = nextSalarySplit(ds, today, state, { spielgeld: null });
  const pick = (s: typeof split) => ({ period: s.period, salary: s.salary, reserve: s.reserve, direct: s.direct, wealth: s.wealth, rest: s.rest, directItems: s.directItems.map((i) => [i.name, i.amount]) });
  return round({
    perMonth,
    forecast: yearForecast(ds, today),
    trend: burdenTrend(ds, historyPeriods(ds, today, '12m')),
    planVsActual: planVsActual(ds, historyPeriods(ds, today, '12m'), today),
    optimization: optimizationTimeline(ds, today),
    savingsCard: savingsCard(ds, today),
    savingsHistory: savingsHistory(ds, today),
    order: standingOrder(ds, today),
    konto: state,
    split: pick(split),
    next: pick(next),
  });
}

describe('Regression: ohne nicht eingeplante Positionen bleiben alle Kennzahlen gleich', () => {
  if (process.env.UPDATE_KENNZAHLEN === '1') {
    it('Vergleichsstand schreiben', () => {
      writeFileSync(FILE, JSON.stringify(Object.fromEntries(CASES.map((c) => [c.name, figures(c.ds(), c.today)]))) + '\n');
    });
    return;
  }
  const before = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>) : {};
  for (const c of CASES) {
    it(c.name, () => {
      const ds = c.ds();
      expect(ds.positions.some((p) => p.account === 'spielgeld')).toBe(false);
      expect(figures(ds, c.today)).toEqual(before[c.name]);
    });
  }
});
