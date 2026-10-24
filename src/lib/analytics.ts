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
  groupByCategory,
  netSalaryForPeriod,
  savingsRate,
  wealthBuilding,
} from './calc';
import { formatAvg, formatDelta, formatEUR, formatPercent, MINUS } from './format';
import { addPeriods, periodRange, shortMonthName, monthOf, yearOf } from './period';
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
  /** fixed costs of the month (expense categories only) incl. one-time payments and one-offs */
  due: number;
  /** part of `due` from one-time payments (frequency 'once') */
  once: number;
  /** regular fixed costs of the month: `due` without one-time payments and one-offs (dark bar part) */
  regular: number;
  /** due − regular: one-time payments and one-offs (light bar part on top) */
  extra: number;
  aboveAverage: boolean;
  /** non-monthly positions and one-offs of the month, largest first */
  items: ForecastItem[];
}

export interface YearForecast {
  months: ForecastMonth[];
  /** Ø line: today's „Ø pro Monat“ (fixedCostsAvg) – the same value as the sum of the distribution */
  average: number;
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
    return { period, due, once, regular, extra: sumMoney([due, -regular]), items };
  });
  const average = fixedCostsAvg(ds, today);
  const months = raw.map((m): ForecastMonth => ({ ...m, aboveAverage: cents(m.due) > cents(average) }));
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

/** Period of the forecast, shown under its title: „Nov 2026 – Okt 2027“. */
export function forecastRange(f: YearForecast): string {
  const first = f.months[0];
  const last = f.months[f.months.length - 1];
  return first && last ? `${shortPeriodLabel(first.period)} – ${shortPeriodLabel(last.period)}` : '';
}

export interface ForecastSummary {
  label: string;
  value: string;
  sub: string;
}

/** Heading of the forecast in two levels: „Teuerster Monat“ / „Nov 2026 · € 6.110“ / „€ 3.158 über Ø“. */
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
  if (cents(last.total) === cents(first.total)) return `Unverändert ${formatAvg(last.total)} Ø pro Monat ${since}.`;
  const sign = change > 0 ? '+' : MINUS;
  return `${formatAvg(first.total)} → ${formatAvg(last.total)} Ø pro Monat ${since} (${sign}${formatPercent(Math.abs(change))}).`;
}

/** Empty state below 3 months of data. */
export function trendTooShortText(ds: Dataset, today: Period): string {
  const start = dataStart(ds, today);
  return `Ab 3 Monaten siehst du hier die Entwicklung. Bisher: ${formatAvg(fixedCostsAvg(ds, today))} Ø pro Monat seit ${shortPeriodLabel(start)}.`;
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
// 6 · Sparquote: share of the net salary that goes into Vermögensaufbau
// ---------------------------------------------------------------------------

export interface SavingsPart {
  id: string;
  name: string;
  /** stored category colour (key) */
  color: string;
  amount: number;
  /** share of the month's Vermögensaufbau, 0–1 */
  share: number;
}

export interface SavingsCard {
  period: Period;
  netSalary: number;
  /** wealthBuilding() of the month */
  wealth: number;
  /** savingsRate() of the month (may exceed 1) */
  rate: number;
  /** split of `wealth`: savings categories, or the positions when there is only one category */
  parts: SavingsPart[];
  partsBy: 'category' | 'position';
}

/** Month the card shows: `today` when it has a net salary, else the latest month before it with one. */
export function savingsPeriod(ds: Dataset, today: Period): Period | null {
  if (savingsRate(ds, today) !== null) return today;
  const earlier = ds.monthClose
    .map((m) => m.period)
    .filter((p) => p < today && savingsRate(ds, p) !== null)
    .sort();
  return earlier[earlier.length - 1] ?? null;
}

/**
 * Split of wealthBuilding() by the same rule (counted items: actual when ticked, plan
 * when open, nothing when skipped, plus their one-offs). The parts add up to it exactly.
 */
function savingsParts(ds: Dataset, period: Period, wealth: number): Pick<SavingsCard, 'parts' | 'partsBy'> {
  const groups = groupByCategory(dueItems(ds, period).filter((i) => i.kind === 'savings'));
  const amountOf = (items: typeof groups[number]['items']) =>
    sumMoney(
      items.flatMap((i) => [
        ...(i.due && i.status !== 'skipped' ? [i.status === 'paid' ? i.payment!.actualAmount : i.planned] : []),
        ...i.oneOffs.map((o) => o.amount),
      ]),
    );
  const share = (v: number) => (wealth > 0 ? v / wealth : 0);
  const byAmount = (a: SavingsPart, b: SavingsPart) => b.amount - a.amount;
  const categories = groups
    .map((g): SavingsPart => {
      const amount = amountOf(g.items);
      return { id: g.category.id, name: g.category.name, color: g.category.color, amount, share: share(amount) };
    })
    .filter((p) => cents(p.amount) !== 0);
  if (categories.length !== 1) return { parts: categories.sort(byAmount), partsBy: 'category' };
  const group = groups.find((g) => g.category.id === categories[0]!.id)!;
  const positions = group.items
    .map((i): SavingsPart => {
      const amount = amountOf([i]);
      return { id: i.position.id, name: i.position.name, color: group.category.color, amount, share: share(amount) };
    })
    .filter((p) => cents(p.amount) !== 0)
    .sort(byAmount);
  return { parts: positions, partsBy: 'position' };
}

/** Everything the Sparquote card shows; null without any net salary. Values come from calc.ts. */
export function savingsCard(ds: Dataset, today: Period): SavingsCard | null {
  const period = savingsPeriod(ds, today);
  if (!period) return null;
  const netSalary = netSalaryForPeriod(ds, period)!;
  const wealth = wealthBuilding(ds, period);
  return { period, netSalary, wealth, rate: savingsRate(ds, period)!, ...savingsParts(ds, period, wealth) };
}

export interface SavingsPoint {
  period: Period;
  /** null: no net salary that month (a gap in the chart, never 0 %) */
  rate: number | null;
  wealth: number | null;
  netSalary: number | null;
}

/**
 * The last `count` months up to `today` for the Sparquote chart, starting with the
 * first month that has a net salary. Empty without any.
 */
export function savingsHistory(ds: Dataset, today: Period, count = 12): SavingsPoint[] {
  const first = ds.monthClose
    .map((m) => m.period)
    .filter((p) => p <= today && savingsRate(ds, p) !== null)
    .sort()[0];
  if (!first) return [];
  const from = addPeriods(today, -(count - 1));
  return periodRange(first > from ? first : from, today).map((period) => {
    const rate = savingsRate(ds, period);
    return rate === null
      ? { period, rate: null, wealth: null, netSalary: null }
      : { period, rate, wealth: wealthBuilding(ds, period), netSalary: netSalaryForPeriod(ds, period) };
  });
}

/** Mean Sparquote of the months with a net salary; null when there is none. */
export function savingsAverage(points: SavingsPoint[]): { average: number; months: number } | null {
  const rates = points.flatMap((p) => (p.rate === null ? [] : [p.rate]));
  return rates.length ? { average: rates.reduce((a, b) => a + b, 0) / rates.length, months: rates.length } : null;
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
    sub: `${formatAvg(top.monthly)} von ${formatAvg(d.total)} pro Monat`,
  };
}

/** „Ø pro Monat“ / „€ 3.050“ / „+3,2 % seit Okt 2025 (€ 2.952)“ */
export function trendSummary(t: BurdenTrend): CardSummary {
  const first = t.points[0];
  const last = t.points[t.points.length - 1];
  if (!first || !last) return { label: 'Ø pro Monat', value: '–' };
  const since = `seit ${shortPeriodLabel(first.period)}`;
  if (cents(last.total) === cents(first.total)) return { label: 'Ø pro Monat', value: formatAvg(last.total), sub: `unverändert ${since}` };
  const change = first.total > 0 ? last.total / first.total - 1 : 0;
  return {
    label: 'Ø pro Monat',
    value: formatAvg(last.total),
    sub: `${change > 0 ? '+' : MINUS}${formatPercent(Math.abs(change))} ${since} (${formatAvg(first.total)})`,
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
