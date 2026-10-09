// Data series for the analysis screen. Pure functions on top of calc.ts:
// charts never sum or spread anything themselves, they render these rows.

import {
  actualForPeriod,
  dueItems,
  freeAfterFixed,
  freeGap,
  isActiveInPeriod,
  kindOf,
  monthCloseFor,
  monthlyEquivalent,
  planChanges,
  plannedForPeriod,
  savingsRate,
  sortedCategories,
  sumMoney,
  sumMonthlyEquivalent,
  fixedCostsAvg,
} from './calc';
import { formatDelta, formatEUR, formatPercent } from './format';
import { addPeriods, periodLabel, periodRange, shortMonthName, monthOf, yearOf } from './period';
import type { Category, Dataset, Period, PlanEntry, Position } from './types';

export type Range = '6m' | '12m' | 'all';

const cents = (euros: number): number => Math.round(euros * 100);

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
  /** what is actually debited: due expenses of the month plus its one-offs */
  due: number;
  /** part of `due` from one-time payments (frequency 'once') */
  once: number;
  aboveAverage: boolean;
  /** non-monthly positions and one-offs of the month (the reason it is above average) */
  items: ForecastItem[];
}

export interface YearForecast {
  months: ForecastMonth[];
  /** spread monthly burden, averaged over the window */
  average: number;
  total: number;
  /** one-time payments in the window; total = count × average + onceTotal */
  onceTotal: number;
  peak: ForecastMonth | null;
  /** peak.due − average */
  peakAboveAverage: number;
}

/** The `count` months after `today` (Oct 2026 → Nov 2026 … Okt 2027). Expenses only. */
export function yearForecast(ds: Dataset, today: Period, count = 12): YearForecast {
  const periods = periodRange(addPeriods(today, 1), addPeriods(today, count));
  const average = periods.reduce((acc, p) => acc + fixedCostsAvg(ds, p), 0) / periods.length;
  const months = periods.map((period): ForecastMonth => {
    const oneOffs = expenseOneOffs(ds, period);
    const due = sumMoney([plannedForPeriod(ds, period), ...oneOffs.map((o) => o.amount)]);
    const nonMonthly = dueItems(ds, period).filter(
      (i) => i.due && i.status !== 'skipped' && i.kind === 'expense' && i.plan?.frequency !== 'monthly',
    );
    const items: ForecastItem[] = [
      ...nonMonthly.map((i) =>
        i.plan?.frequency === 'once' ? { name: i.position.name, amount: i.planned, once: true } : { name: i.position.name, amount: i.planned },
      ),
      ...oneOffs.map((o) => ({ name: positionName(ds, o.positionId) ? `${positionName(ds, o.positionId)}: ${o.label}` : o.label, amount: o.amount })),
    ];
    const once = sumMoney(nonMonthly.filter((i) => i.plan?.frequency === 'once').map((i) => i.planned));
    return { period, due, once, aboveAverage: cents(due) > cents(average), items };
  });
  const peak = months.reduce<ForecastMonth | null>((best, m) => (!best || m.due > best.due ? m : best), null);
  return {
    months,
    average,
    total: sumMoney(months.map((m) => m.due)),
    onceTotal: sumMoney(months.map((m) => m.once)),
    peak,
    peakAboveAverage: peak ? peak.due - average : 0,
  };
}

export function forecastHeadline(f: YearForecast): string {
  if (!f.peak || f.peakAboveAverage < 0.5) {
    return `Gleichmäßig: jeden Monat rund ${formatEUR(Math.round(f.average))} fällig.`;
  }
  return `Teuerster Monat: ${periodLabel(f.peak.period)} · ${formatEUR(f.peak.due)} · ${formatEUR(Math.round(f.peakAboveAverage))} über Schnitt`;
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
// 3 · Month close: free money calculated vs. actual, savings rate
// ---------------------------------------------------------------------------

export interface MonthCloseRow {
  period: Period;
  /** null = no month close / no salary → gap in the chart, never 0 */
  calculated: number | null;
  actual: number | null;
  gap: number | null;
  savingsRate: number | null;
}

export function monthCloseSeries(ds: Dataset, periods: Period[]): MonthCloseRow[] {
  return periods.map((period) => {
    const close = monthCloseFor(ds, period);
    if (!close) return { period, calculated: null, actual: null, gap: null, savingsRate: null };
    return {
      period,
      calculated: freeAfterFixed(ds, period),
      actual: close.freeActual ?? null,
      gap: freeGap(ds, period),
      savingsRate: savingsRate(ds, period),
    };
  });
}

export function monthCloseHeadline(rows: MonthCloseRow[]): string | null {
  const closed = rows.filter((r) => r.calculated !== null || r.actual !== null);
  if (closed.length === 0) return null;
  const withGap = closed.filter((r) => r.gap !== null);
  const lastRate = [...closed].reverse().find((r) => r.savingsRate !== null)?.savingsRate ?? null;
  const rate = lastRate === null ? '' : ` · Sparquote ${withGap.length > 1 ? 'zuletzt ' : ''}${formatPercent(lastRate)}`;
  if (withGap.length === 0) return `Noch keine tatsächlichen Werte erfasst${rate}`;
  const describe = (v: number) => `${formatEUR(Math.abs(v))} ${v < 0 ? 'weniger' : 'mehr'} frei als rechnerisch`;
  if (withGap.length === 1) {
    const r = withGap[0]!;
    return cents(r.gap!) === 0
      ? `${periodLabel(r.period)}: genau wie rechnerisch${rate}`
      : `${periodLabel(r.period)}: ${describe(r.gap!)}${rate}`;
  }
  const avg = Math.round(withGap.reduce((acc, r) => acc + r.gap!, 0) / withGap.length);
  return avg === 0
    ? `Im Schnitt genau wie rechnerisch (${withGap.length} Monate)${rate}`
    : `Im Schnitt ${describe(avg)} (${withGap.length} Monate)${rate}`;
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
