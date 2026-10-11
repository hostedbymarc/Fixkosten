// Data series for the analysis screen. Pure functions on top of calc.ts:
// charts never sum or spread anything themselves, they render these rows.

import {
  actualForPeriod,
  dueItems,
  fixedCosts,
  isActiveInPeriod,
  kindOf,
  monthlyEquivalent,
  planChanges,
  plannedForPeriod,
  sortedCategories,
  sumMoney,
  sumMonthlyEquivalent,
  fixedCostsAvg,
} from './calc';
import { formatDelta, formatEUR, formatPercent } from './format';
import { addPeriods, periodRange, shortMonthName, monthOf, yearOf } from './period';
import type { Category, Dataset, Period, PlanEntry, Position } from './types';

export type Range = '6m' | '12m' | 'all';

const cents = (euros: number): number => Math.round(euros * 100);
const fromCents = (c: number): number => c / 100;

/** 'Okt 2026' */
export function shortPeriodLabel(period: Period): string {
  return `${shortMonthName(monthOf(period))} ${yearOf(period)}`;
}

/** 'Okt 26' – compact axis label */
export function axisPeriodLabel(period: Period): string {
  return `${shortMonthName(monthOf(period))} ${String(yearOf(period)).slice(2)}`;
}

function expenseOneOffs(ds: Dataset, period: Period) {
  return ds.oneOffs.filter((o) => {
    if (o.period !== period) return false;
    const position = o.positionId ? ds.positions.find((p) => p.id === o.positionId) : undefined;
    return !position || kindOf(ds, position) === 'expense';
  });
}

function positionName(ds: Dataset, id: string | undefined): string | undefined {
  return id ? ds.positions.find((p) => p.id === id)?.name : undefined;
}

// ---------------------------------------------------------------------------
// 1 · Year forecast
// ---------------------------------------------------------------------------

export interface ForecastItem {
  name: string;
  amount: number;
  /** one-time payment (frequency 'once') – not part of the fixed costs */
  once?: boolean;
}

export interface ForecastMonth {
  period: Period;
  /** fixed costs of the month (expense categories only) incl. one-time payments and one-offs */
  due: number;
  /** part of `due` from one-time payments (frequency 'once') */
  once: number;
  /** regular fixed costs of the month: `due` without one-time payments and one-offs (dark bar part) */
  regular: number;
  aboveAverage: boolean;
  /** non-monthly positions and one-offs of the month, largest first */
  items: ForecastItem[];
}

export interface YearForecast {
  months: ForecastMonth[];
  /** Ø line: mean of the 12 regular bar parts (without one-time payments and one-offs) */
  average: number;
  /** „Ø pro Monat“ tile of today (fixedCostsAvg); equals `average` unless plans change inside the window */
  todayAverage: number;
  total: number;
  /** one-time payments in the window */
  onceTotal: number;
  peak: ForecastMonth | null;
  /** peak.due − average */
  peakAboveAverage: number;
}

/**
 * The `count` months after `today` (Oct 2026 → Nov 2026 … Okt 2027). Fixed costs only:
 * Vermögensaufbau (kind 'savings') never shows up, one-time payments do.
 */
export function yearForecast(ds: Dataset, today: Period, count = 12): YearForecast {
  const periods = periodRange(addPeriods(today, 1), addPeriods(today, count));
  const raw = periods.map((period) => {
    const oneOffs = expenseOneOffs(ds, period);
    const nonMonthly = dueItems(ds, period).filter(
      (i) => i.due && i.status !== 'skipped' && i.kind === 'expense' && i.plan?.frequency !== 'monthly',
    );
    const items: ForecastItem[] = [
      ...nonMonthly.map((i) =>
        i.plan?.frequency === 'once' ? { name: i.position.name, amount: i.planned, once: true } : { name: i.position.name, amount: i.planned },
      ),
      ...oneOffs.map((o) => ({ name: positionName(ds, o.positionId) ? `${positionName(ds, o.positionId)}: ${o.label}` : o.label, amount: o.amount })),
    ].sort((x, y) => y.amount - x.amount);
    const due = fixedCosts(ds, period);
    const once = sumMoney(nonMonthly.filter((i) => i.plan?.frequency === 'once').map((i) => i.planned));
    const regular = sumMoney([due, -once, ...oneOffs.map((o) => -o.amount)]);
    return { period, due, once, regular, items };
  });
  // same basis as the dark bar parts: same positions, same categories, same 12 months
  const average = fromCents(Math.round(raw.reduce((acc, m) => acc + cents(m.regular), 0) / raw.length));
  const months = raw.map((m): ForecastMonth => ({ ...m, aboveAverage: cents(m.due) > cents(average) }));
  const peak = months.reduce<ForecastMonth | null>((best, m) => (!best || m.due > best.due ? m : best), null);
  return {
    months,
    average,
    todayAverage: fixedCostsAvg(ds, today),
    total: sumMoney(months.map((m) => m.due)),
    onceTotal: sumMoney(months.map((m) => m.once)),
    peak,
    peakAboveAverage: peak ? peak.due - average : 0,
  };
}

export interface ForecastGapRow {
  position: Position;
  category: Category;
  /** monthly equivalent in today's „Ø pro Monat“ */
  today: number;
  /** mean of its regular amounts over the 12 forecast months */
  window: number;
  diff: number;
  /** first month it is due in the window when it does not run today */
  startsIn?: Period;
}

/**
 * Why the Ø line of the forecast differs from today's „Ø pro Monat“: positions that start
 * later, end, or change their amount inside the window. Empty when both are equal.
 */
export function forecastAverageGap(ds: Dataset, today: Period, count = 12): ForecastGapRow[] {
  const periods = periodRange(addPeriods(today, 1), addPeriods(today, count));
  const items = periods.flatMap((p) => dueItems(ds, p));
  const rows: ForecastGapRow[] = [];
  for (const position of ds.positions) {
    if (kindOf(ds, position) !== 'expense') continue;
    const mine = items.filter((i) => i.position.id === position.id && i.due && i.status !== 'skipped' && i.plan?.frequency !== 'once');
    const window = fromCents(Math.round(mine.reduce((acc, i) => acc + cents(i.planned), 0) / periods.length));
    const now = isActiveInPeriod(position, today) ? monthlyEquivalent(position, today) : 0;
    const diff = fromCents(cents(window) - cents(now));
    if (diff === 0) continue;
    rows.push({
      position,
      category: ds.categories.find((c) => c.id === position.categoryId)!,
      today: now,
      window,
      diff,
      startsIn: now === 0 && mine.length > 0 ? mine[0]!.period : undefined,
    });
  }
  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export interface ForecastSummary {
  label: string;
  value: string;
  sub: string;
}

/** Heading of the forecast in two levels: „Teuerster Monat“ / „Nov 2026 · € 6.110“ / „€ 2.774 über Ø“. */
export function forecastSummary(f: YearForecast): ForecastSummary {
  if (!f.peak || f.peakAboveAverage < 0.5) {
    return { label: 'Gleichmäßig', value: `rund ${formatEUR(Math.round(f.average))}`, sub: 'jeden Monat fällig' };
  }
  return {
    label: 'Teuerster Monat',
    value: `${shortPeriodLabel(f.peak.period)} · ${formatEUR(f.peak.due)}`,
    sub: `${formatEUR(Math.round(f.peakAboveAverage))} über Ø`,
  };
}

// ---------------------------------------------------------------------------
// 2 · Distribution by category (spread)
// ---------------------------------------------------------------------------

export interface PositionShare {
  position: Position;
  monthly: number;
  /** share of the total burden, 0–1 */
  share: number;
}

export interface CategoryShare {
  category: Category;
  monthly: number;
  share: number;
  positions: PositionShare[];
}

export interface Distribution {
  total: number;
  rows: CategoryShare[];
}

/** Expense categories by spread monthly amount, largest first; each with its positions, largest first. */
export function categoryDistribution(ds: Dataset, period: Period): Distribution {
  const total = fixedCostsAvg(ds, period);
  const share = (v: number) => (total > 0 ? v / total : 0);
  const rows = sortedCategories(ds)
    .filter((c) => c.kind === 'expense')
    .map((category): CategoryShare => {
      const monthly = sumMonthlyEquivalent(ds, period, { categoryId: category.id });
      const positions = ds.positions
        .filter((p) => p.categoryId === category.id && isActiveInPeriod(p, period))
        .map((position) => {
          const m = monthlyEquivalent(position, period);
          return { position, monthly: m, share: share(m) };
        })
        .filter((p) => p.monthly > 0)
        .sort((a, b) => b.monthly - a.monthly || a.position.sortOrder - b.position.sortOrder);
      return { category, monthly, share: share(monthly), positions };
    })
    .filter((r) => r.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly || a.category.sortOrder - b.category.sortOrder);
  return { total, rows };
}

export function distributionHeadline(d: Distribution): string {
  const top = d.rows[0];
  if (!top) return 'Noch keine Ausgaben erfasst.';
  return `${top.category.name} ist der größte Block: ${formatPercent(top.share)} deiner Fixkosten.`;
}

// ---------------------------------------------------------------------------
// History window (sections 3–5)
// ---------------------------------------------------------------------------

/** First month with user data (tick, month close or one-off), never after `today`. */
export function dataStart(ds: Dataset, today: Period): Period {
  let first = today;
  for (const p of ds.payments) if (p.period < first) first = p.period;
  for (const m of ds.monthClose) if (m.period < first) first = m.period;
  for (const o of ds.oneOffs) if (o.period < first) first = o.period;
  return first;
}

/** Months with data up to and including `today`. */
export function dataMonths(ds: Dataset, today: Period): number {
  return periodRange(dataStart(ds, today), today).length;
}

const RANGE_MONTHS: Record<Exclude<Range, 'all'>, number> = { '6m': 6, '12m': 12 };

/** Months shown for a range, ending with the current month, never before the first data. */
export function historyPeriods(ds: Dataset, today: Period, range: Range): Period[] {
  const start = dataStart(ds, today);
  if (range === 'all') return periodRange(start, today);
  const from = addPeriods(today, -(RANGE_MONTHS[range] - 1));
  return periodRange(from > start ? from : start, today);
}

// ---------------------------------------------------------------------------
// 4 · Trend of the spread monthly burden by category
// ---------------------------------------------------------------------------

export interface TrendPoint {
  period: Period;
  total: number;
  /** categoryId → spread monthly amount */
  byCategory: Record<string, number>;
}

export interface TrendChange {
  positionName: string;
  /** change of the spread monthly amount */
  monthlyDelta: number;
  reason?: string;
}

export interface BurdenTrend {
  /** expense categories that appear in the window, in their sort order (stack order) */
  categories: Category[];
  points: TrendPoint[];
  /** period → plan changes taking effect in that month (markers on the time axis) */
  changes: Record<Period, TrendChange[]>;
}

export function burdenTrend(ds: Dataset, periods: Period[]): BurdenTrend {
  const expense = sortedCategories(ds).filter((c) => c.kind === 'expense');
  const points = periods.map((period) => ({
    period,
    total: fixedCostsAvg(ds, period),
    byCategory: Object.fromEntries(
      expense.map((c) => [c.id, sumMonthlyEquivalent(ds, period, { categoryId: c.id })]),
    ),
  }));
  const categories = expense.filter((c) => points.some((p) => p.byCategory[c.id]! > 0));
  const inWindow = new Set(periods);
  const changes: Record<Period, TrendChange[]> = {};
  for (const c of [...planChanges(ds)].reverse()) {
    if (!inWindow.has(c.validFrom) || cents(c.monthlyDelta) === 0) continue;
    (changes[c.validFrom] ??= []).push({ positionName: c.position.name, monthlyDelta: c.monthlyDelta, reason: c.reason });
  }
  return { categories, points, changes };
}

export function trendHeadline(t: BurdenTrend): string {
  const first = t.points[0];
  const last = t.points[t.points.length - 1];
  if (!first || !last) return '';
  const change = first.total > 0 ? last.total / first.total - 1 : 0;
  const since = `seit ${shortPeriodLabel(first.period)}`;
  if (cents(last.total) === cents(first.total)) return `Unverändert ${formatEUR(last.total)} Ø pro Monat ${since}.`;
  const sign = change > 0 ? '+' : '−';
  return `${formatEUR(first.total)} → ${formatEUR(last.total)} Ø pro Monat ${since} (${sign}${formatPercent(Math.abs(change))}).`;
}

/** Empty state below 3 months of data. */
export function trendTooShortText(ds: Dataset, today: Period): string {
  const start = dataStart(ds, today);
  return `Ab 3 Monaten siehst du hier die Entwicklung. Bisher: ${formatEUR(fixedCostsAvg(ds, today))} Ø pro Monat seit ${shortPeriodLabel(start)}.`;
}

// ---------------------------------------------------------------------------
// 5 · Plan vs. actual
// ---------------------------------------------------------------------------

export interface PlanActualRow {
  period: Period;
  planned: number;
  /** ticked payments + ticked one-offs */
  actual: number;
  /** actual − planned; null for the running month */
  delta: number | null;
  running: boolean;
}

export interface Deviation {
  positionName: string;
  /** one-off label, if the deviation is a one-off */
  label?: string;
  period: Period;
  delta: number;
}

export interface PlanVsActual {
  rows: PlanActualRow[];
  /** largest deviations in closed months, by absolute amount */
  topDeviations: Deviation[];
  /** sum of the deltas of closed months */
  totalDelta: number;
  closedMonths: number;
}

export function planVsActual(ds: Dataset, periods: Period[], today: Period, top = 5): PlanVsActual {
  const rows = periods.map((period): PlanActualRow => {
    const planned = plannedForPeriod(ds, period);
    const actual = actualForPeriod(ds, period);
    const running = period >= today;
    return { period, planned, actual, running, delta: running ? null : sumMoney([actual, -planned]) };
  });
  const closed = new Set(rows.filter((r) => !r.running).map((r) => r.period));
  const isExpense = (id: string | undefined) => {
    const position = id ? ds.positions.find((p) => p.id === id) : undefined;
    return !position || kindOf(ds, position) === 'expense';
  };
  const deviations: Deviation[] = [
    // per item, so a plan change entered after the tick shows as a deviation too
    ...[...closed].flatMap((period) =>
      dueItems(ds, period)
        .filter((i) => i.kind === 'expense' && i.delta !== null)
        .map((i) => ({ positionName: i.position.name, period, delta: i.delta! })),
    ),
    ...ds.oneOffs
      .filter((o) => closed.has(o.period) && o.paidAt && isExpense(o.positionId))
      .map((o) => ({ positionName: positionName(ds, o.positionId) ?? o.label, label: o.label, period: o.period, delta: o.amount })),
  ].filter((d) => cents(d.delta) !== 0);
  deviations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.period.localeCompare(a.period));
  return {
    rows,
    topDeviations: deviations.slice(0, top),
    totalDelta: sumMoney(rows.map((r) => r.delta ?? 0)),
    closedMonths: closed.size,
  };
}

export function planVsActualHeadline(p: PlanVsActual): string {
  if (p.closedMonths === 0) return '';
  const months = p.closedMonths === 1 ? '1 abgeschlossener Monat' : `${p.closedMonths} abgeschlossene Monate`;
  if (cents(p.totalDelta) === 0) return `Genau im Plan (${months}).`;
  return `${formatEUR(Math.abs(p.totalDelta))} ${p.totalDelta > 0 ? 'teurer' : 'günstiger'} als geplant (${months}).`;
}

// ---------------------------------------------------------------------------
// 6 · Optimisations
// ---------------------------------------------------------------------------

export interface OptimizationEntry {
  id: string;
  position: Position;
  validFrom: Period;
  /** 'YYYY-MM-DD' */
  changedOn: string;
  reason?: string;
  from: PlanEntry;
  to: PlanEntry;
  /** change of the yearly cost: negative = saves money */
  annualDelta: number;
  /** takes effect after the current month */
  planned: boolean;
}

export interface OptimizationTimeline {
  /** future changes first, then the implemented ones; newest first within each */
  entries: OptimizationEntry[];
  /** net effect of all changes per year: negative = saves money */
  netAnnual: number;
  implementedAnnual: number;
  plannedAnnual: number;
}

/** Plan changes from the history. Typo corrections and one-time payments never appear. */
export function optimizationTimeline(ds: Dataset, today: Period): OptimizationTimeline {
  const all = planChanges(ds).map((c, i) => ({
    id: `${c.position.id}-${c.changedOn}-${i}`,
    position: c.position,
    validFrom: c.validFrom,
    changedOn: c.changedOn,
    reason: c.reason,
    from: c.from,
    to: c.to,
    annualDelta: c.annualDelta,
    planned: c.validFrom > today,
  }));
  const planned = all.filter((e) => e.planned);
  const implemented = all.filter((e) => !e.planned);
  return {
    entries: [...planned, ...implemented],
    netAnnual: sumMoney(all.map((e) => e.annualDelta)),
    implementedAnnual: sumMoney(implemented.map((e) => e.annualDelta)),
    plannedAnnual: sumMoney(planned.map((e) => e.annualDelta)),
  };
}

/** „Umgesetzt: −€ 24 / Jahr · Geplant: +€ 504 / Jahr“ (only the parts that exist) */
export function optimizationHeadline(t: OptimizationTimeline): string {
  const parts: string[] = [];
  if (t.entries.some((e) => !e.planned)) parts.push(`Umgesetzt: ${formatDelta(t.implementedAnnual)} / Jahr`);
  if (t.entries.some((e) => e.planned)) parts.push(`Geplant: ${formatDelta(t.plannedAnnual)} / Jahr`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Two-level headings of the analysis cards: label · value · sub
// ---------------------------------------------------------------------------

export interface CardSummary {
  label: string;
  value: string;
  sub?: string;
}

/** „Größter Block“ / „Wohnen & Leben · 54,3 %“ / „€ 1.602 von € 2.952,17 pro Monat“ */
export function distributionSummary(d: Distribution): CardSummary {
  const top = d.rows[0];
  if (!top) return { label: 'Größter Block', value: '–' };
  return {
    label: 'Größter Block',
    value: `${top.category.name} · ${formatPercent(top.share)}`,
    sub: `${formatEUR(top.monthly)} von ${formatEUR(d.total)} pro Monat`,
  };
}

/** „Ø pro Monat“ / „€ 3.050“ / „+3,2 % seit Okt 2025 (€ 2.952)“ */
export function trendSummary(t: BurdenTrend): CardSummary {
  const first = t.points[0];
  const last = t.points[t.points.length - 1];
  if (!first || !last) return { label: 'Ø pro Monat', value: '–' };
  const since = `seit ${shortPeriodLabel(first.period)}`;
  if (cents(last.total) === cents(first.total)) return { label: 'Ø pro Monat', value: formatEUR(last.total), sub: `unverändert ${since}` };
  const change = first.total > 0 ? last.total / first.total - 1 : 0;
  return {
    label: 'Ø pro Monat',
    value: formatEUR(last.total),
    sub: `${change > 0 ? '+' : '−'}${formatPercent(Math.abs(change))} ${since} (${formatEUR(first.total)})`,
  };
}

/** „Plan vs. Ist“ / „€ 120 teurer“ / „3 abgeschlossene Monate“ */
export function planActualSummary(p: PlanVsActual): CardSummary {
  const months = p.closedMonths === 1 ? '1 abgeschlossener Monat' : `${p.closedMonths} abgeschlossene Monate`;
  if (cents(p.totalDelta) === 0) return { label: 'Plan vs. Ist', value: 'genau im Plan', sub: months };
  return {
    label: 'Plan vs. Ist',
    value: `${formatEUR(Math.abs(p.totalDelta))} ${p.totalDelta > 0 ? 'teurer' : 'günstiger'}`,
    sub: months,
  };
}
