// Every existing figure of the app on fixed datasets – the same code path the UI uses.
// Run against main before the Fixkostenkonto sprint (golden file) and against the current code.
import { readFileSync } from 'node:fs';
import { parseBackup } from '../db/backup';
import {
  annualizedSavingsFromChanges,
  fixedCosts,
  fixedCostsAvg,
  freeAfterFixed,
  freeAfterFixedAvg,
  monthFigures,
  openFromPrevious,
  plannedForPeriod,
  actualForPeriod,
  reserveNeeded,
  savingsRate,
  wealthBuilding,
  wealthBuildingAvg,
  wealthFromNet,
} from '../lib/calc';
import { categoryDistribution, yearForecast } from '../lib/analytics';
import { formatAvg, formatCompactEUR, formatDelta, formatEUR, formatPercent } from '../lib/format';
import { addPeriods } from '../lib/period';
import type { Dataset } from '../lib/types';

export const FIXTURES = ['tests/fixtures/seed.json', 'tests/fixtures/live-2026-10-25.json', 'tests/fixtures/live-2026-10-29.json', 'tests/fixtures/history-24m.json'];

function load(file: string): Dataset {
  // only figures are compared, never records: the new optional `account` (schema v5) is not part of them
  return parseBackup(JSON.parse(readFileSync(file, 'utf8'))).data;
}

export function kennzahlen(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const file of FIXTURES) {
    const ds = load(file);
    const months: Record<string, unknown> = {};
    for (let i = -14; i <= 13; i++) {
      const p = addPeriods('2026-10', i);
      const f = monthFigures(ds, p);
      months[p] = {
        figures: { ...f, categories: f.categories.map((c) => ({ ...c, category: c.category.id })) },
        fixedCosts: fixedCosts(ds, p),
        fixedCostsAvg: fixedCostsAvg(ds, p),
        reserveNeeded: reserveNeeded(ds, p),
        wealthBuilding: wealthBuilding(ds, p),
        wealthBuildingAvg: wealthBuildingAvg(ds, p),
        wealthFromNet: wealthFromNet(ds, p),
        freeAfterFixed: freeAfterFixed(ds, p),
        freeAfterFixedAvg: freeAfterFixedAvg(ds, p),
        savingsRate: savingsRate(ds, p),
        planned: plannedForPeriod(ds, p),
        actual: actualForPeriod(ds, p),
        openFromPrevious: openFromPrevious(ds, p, '2026-10').map((g) => ({ period: g.period, count: g.count, planned: g.planned })),
      };
    }
    const forecast = yearForecast(ds, '2026-10');
    const dist = categoryDistribution(ds, '2026-10');
    out[file] = {
      months,
      forecast: { ...forecast, months: forecast.months, peak: forecast.peak?.period ?? null },
      distribution: { total: dist.total, rows: dist.rows.map((r) => ({ category: r.category.id, monthly: r.monthly, share: r.share, positions: r.positions.map((p) => [p.position.id, p.monthly]) })) },
      savings: (({ total, changes }) => ({ total, changes: changes.map((c) => [c.position.id, c.validFrom, c.annualDelta]) }))(annualizedSavingsFromChanges(ds, { from: '2020-01', to: '2030-12' })),
    };
  }
  out.format = [0, 3368, 1234.5, -490, 0.004, 2952.1666].map((v) => [formatEUR(v), formatAvg(v), formatDelta(v), formatCompactEUR(v), formatPercent(v / 10000)]);
  return out;
}
