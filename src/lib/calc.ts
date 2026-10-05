// Single source of truth for every number shown in the UI.
// All functions are pure: (dataset, period) -> value. UI never sums by itself.
//
// Money handling: amounts are summed as integer cents. Monthly equivalents are
// carried as integer "cents × periods-per-year" numerators and divided by 12
// only once at the end, so category sums and totals stay exactly consistent.

import { addPeriods, monthOf } from './period';
import type {
  Category,
  Dataset,
  Frequency,
  Kind,
  MonthClose,
  Payment,
  Period,
  Position,
  Reminder,
} from './types';

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const toCents = (euros: number): number => Math.round(euros * 100);
const fromCents = (cents: number): number => cents / 100;
/** cents × periods-per-year numerator → euros per month */
const fromEquivalentNumerator = (n: number): number => n / 1200;

export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Position level
// ---------------------------------------------------------------------------

/** Amount valid in `period` according to amountHistory, or null if not yet valid. */
export function amountForPeriod(position: Position, period: Period): number | null {
  let match: { validFrom: Period; amount: number } | null = null;
  for (const entry of position.amountHistory) {
    if (entry.validFrom <= period && (!match || entry.validFrom > match.validFrom)) {
      match = entry;
    }
  }
  return match ? match.amount : null;
}

export function archivedPeriod(position: Position): Period | undefined {
  return position.archivedAt ? position.archivedAt.slice(0, 7) : undefined;
}

/**
 * A position exists in a period once its first amount is valid and until the
 * month it was archived (exclusive). History stays intact for charts.
 */
export function isActiveInPeriod(position: Position, period: Period): boolean {
  if (amountForPeriod(position, period) === null) return false;
  const archived = archivedPeriod(position);
  return archived === undefined || period < archived;
}

export function dueMonthsOf(position: Position): number[] {
  return position.frequency === 'monthly' ? ALL_MONTHS : position.dueMonths;
}

/** Is the position debited in this month? */
export function dueInPeriod(position: Position, period: Period): boolean {
  return isActiveInPeriod(position, period) && dueMonthsOf(position).includes(monthOf(period));
}

function equivalentNumerator(position: Position, period: Period): number {
  if (!isActiveInPeriod(position, period)) return 0;
  const amount = amountForPeriod(position, period) ?? 0;
  return toCents(amount) * PERIODS_PER_YEAR[position.frequency];
}

/** Amount spread over 12 months (quarterly ÷3, semiannual ÷6, annual ÷12). */
export function monthlyEquivalent(position: Position, period: Period): number {
  return fromEquivalentNumerator(equivalentNumerator(position, period));
}

/** Default due months for a frequency, anchored at `startMonth`. */
export function defaultDueMonths(frequency: Frequency, startMonth: number): number[] {
  const step = 12 / PERIODS_PER_YEAR[frequency];
  const months: number[] = [];
  for (let i = 0; i < PERIODS_PER_YEAR[frequency]; i++) {
    months.push(((startMonth - 1 + i * step) % 12) + 1);
  }
  return months.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Dataset helpers
// ---------------------------------------------------------------------------

function categoryMap(ds: Dataset): Map<string, Category> {
  return new Map(ds.categories.map((c) => [c.id, c]));
}

export function kindOf(ds: Dataset, position: Position): Kind {
  return categoryMap(ds).get(position.categoryId)?.kind ?? 'expense';
}

function sortedCategories(ds: Dataset): Category[] {
  return [...ds.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortedPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function paymentFor(ds: Dataset, positionId: string, period: Period): Payment | undefined {
  return ds.payments.find((p) => p.positionId === positionId && p.period === period);
}

// ---------------------------------------------------------------------------
// Month view: what is due in a period
// ---------------------------------------------------------------------------

export interface DueItem {
  position: Position;
  category: Category;
  kind: Kind;
  period: Period;
  planned: number;
  payment?: Payment;
  /** actual − planned when paid, otherwise null */
  delta: number | null;
}

/**
 * Everything due in `period`, ordered by category and position sortOrder.
 * A position archived later in the month still shows up if it was paid.
 */
export function dueItems(ds: Dataset, period: Period): DueItem[] {
  const cats = categoryMap(ds);
  const items: DueItem[] = [];
  for (const position of sortedPositions(ds.positions)) {
    const category = cats.get(position.categoryId);
    if (!category) continue;
    const payment = paymentFor(ds, position.id, period);
    const isDue = dueInPeriod(position, period);
    if (!isDue && !payment) continue;
    const planned = amountForPeriod(position, period) ?? payment?.plannedAmount ?? 0;
    items.push({
      position,
      category,
      kind: category.kind,
      period,
      planned,
      payment,
      delta: payment ? fromCents(toCents(payment.actualAmount) - toCents(planned)) : null,
    });
  }
  const order = new Map(sortedCategories(ds).map((c, i) => [c.id, i]));
  return items.sort(
    (a, b) => (order.get(a.category.id) ?? 0) - (order.get(b.category.id) ?? 0),
  );
}

export interface CategoryGroup {
  category: Category;
  items: DueItem[];
  planned: number;
  actual: number;
  openCount: number;
}

export function groupByCategory(items: DueItem[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.category.id === item.category.id);
    if (!group) {
      group = { category: item.category, items: [], planned: 0, actual: 0, openCount: 0 };
      groups.push(group);
    }
    group.items.push(item);
  }
  for (const group of groups) {
    group.planned = sumMoney(group.items.map((i) => i.planned));
    group.actual = sumMoney(group.items.map((i) => i.payment?.actualAmount ?? 0));
    group.openCount = group.items.filter((i) => !i.payment).length;
  }
  return groups;
}

/** Sum of everything actually debited in `period` (plan). Expenses by default. */
export function plannedForPeriod(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  return sumMoney(dueItems(ds, period).filter((i) => i.kind === kind).map((i) => i.planned));
}

/** Sum of actual amounts of ticked payments plus one-offs (credits negative). */
export function actualForPeriod(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  const positions = new Map(ds.positions.map((p) => [p.id, p]));
  const kindOfPositionId = (id: string | undefined): Kind => {
    const position = id ? positions.get(id) : undefined;
    return position ? kindOf(ds, position) : 'expense';
  };
  const payments = ds.payments
    .filter((p) => p.period === period && kindOfPositionId(p.positionId) === kind)
    .map((p) => p.actualAmount);
  const oneOffs = ds.oneOffs
    .filter((o) => o.period === period && kindOfPositionId(o.positionId) === kind)
    .map((o) => o.amount);
  return sumMoney([...payments, ...oneOffs]);
}

export interface PeriodProgress {
  planned: number;
  paidPlanned: number;
  paidActual: number;
  openPlanned: number;
  openCount: number;
  totalCount: number;
  /** 0–1, share of planned amount already ticked */
  ratio: number;
}

/** Hero card: '€ 3.368 von € 3.403 abgebucht'. Expenses only. */
export function periodProgress(ds: Dataset, period: Period): PeriodProgress {
  const items = dueItems(ds, period).filter((i) => i.kind === 'expense');
  const paid = items.filter((i) => i.payment);
  const open = items.filter((i) => !i.payment);
  const planned = sumMoney(items.map((i) => i.planned));
  const paidPlanned = sumMoney(paid.map((i) => i.planned));
  return {
    planned,
    paidPlanned,
    paidActual: sumMoney(paid.map((i) => i.payment!.actualAmount)),
    openPlanned: sumMoney(open.map((i) => i.planned)),
    openCount: open.length,
    totalCount: items.length,
    ratio: planned > 0 ? paidPlanned / planned : items.length === 0 ? 0 : 1,
  };
}

// ---------------------------------------------------------------------------
// Spread view: true monthly burden
// ---------------------------------------------------------------------------

export interface EquivalentFilter {
  kind?: Kind;
  /** only positions with frequency !== 'monthly' */
  nonMonthlyOnly?: boolean;
  frequency?: Frequency;
  categoryId?: string;
}

function matchingPositions(ds: Dataset, period: Period, filter: EquivalentFilter): Position[] {
  const cats = categoryMap(ds);
  return ds.positions.filter((p) => {
    const category = cats.get(p.categoryId);
    if (!category || !isActiveInPeriod(p, period)) return false;
    if (filter.kind && category.kind !== filter.kind) return false;
    if (filter.nonMonthlyOnly && p.frequency === 'monthly') return false;
    if (filter.frequency && p.frequency !== filter.frequency) return false;
    if (filter.categoryId && p.categoryId !== filter.categoryId) return false;
    return true;
  });
}

export function sumMonthlyEquivalent(ds: Dataset, period: Period, filter: EquivalentFilter): number {
  const numerator = matchingPositions(ds, period, filter).reduce(
    (acc, p) => acc + equivalentNumerator(p, period),
    0,
  );
  return fromEquivalentNumerator(numerator);
}

/** All expenses spread over the year = real monthly burden. */
export function trueMonthlyBurden(ds: Dataset, period: Period): number {
  return sumMonthlyEquivalent(ds, period, { kind: 'expense' });
}

/** Monthly reserve needed for non-monthly expenses. */
export function reserveNeeded(ds: Dataset, period: Period): number {
  return sumMonthlyEquivalent(ds, period, { kind: 'expense', nonMonthlyOnly: true });
}

/** Planned savings per month (monthly equivalent of savings positions). */
export function savingsForPeriod(ds: Dataset, period: Period): number {
  return sumMonthlyEquivalent(ds, period, { kind: 'savings' });
}

/** Yearly cost of the matching positions (amount × periods per year). */
export function annualCost(ds: Dataset, period: Period, filter: EquivalentFilter): number {
  const numerator = matchingPositions(ds, period, filter).reduce(
    (acc, p) => acc + equivalentNumerator(p, period),
    0,
  );
  return fromCents(numerator);
}

export interface CategoryEquivalent {
  category: Category;
  monthly: number;
}

/** Monthly equivalent per category (for donut / stacked charts). */
export function equivalentByCategory(ds: Dataset, period: Period, kind: Kind = 'expense'): CategoryEquivalent[] {
  return sortedCategories(ds)
    .filter((c) => c.kind === kind)
    .map((category) => ({
      category,
      monthly: sumMonthlyEquivalent(ds, period, { categoryId: category.id }),
    }));
}

// ---------------------------------------------------------------------------
// Month close: net salary is captured per month
// ---------------------------------------------------------------------------

export function monthCloseFor(ds: Dataset, period: Period): MonthClose | undefined {
  return ds.monthClose.find((m) => m.period === period);
}

/** Net salary entered for exactly this month, or null (never 0 by default). */
export function netSalaryForPeriod(ds: Dataset, period: Period): number | null {
  return monthCloseFor(ds, period)?.netSalary ?? null;
}

/**
 * What leaves the account this month: actual amount for ticked positions,
 * plan for open ones, plus one-offs (credits negative). Expenses by default.
 */
export function expectedSpend(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  const positions = new Map(ds.positions.map((p) => [p.id, p]));
  const items = dueItems(ds, period)
    .filter((i) => i.kind === kind)
    .map((i) => (i.payment ? i.payment.actualAmount : i.planned));
  const oneOffs = ds.oneOffs
    .filter((o) => {
      const position = o.positionId ? positions.get(o.positionId) : undefined;
      return o.period === period && (position ? kindOf(ds, position) : 'expense') === kind;
    })
    .map((o) => o.amount);
  return sumMoney([...items, ...oneOffs]);
}

/** Savings of the month, same rule as expectedSpend (actual if ticked, else plan). */
export function expectedSavings(ds: Dataset, period: Period): number {
  return expectedSpend(ds, period, 'savings');
}

/** salary − expectedSpend − savings for a given salary (used for live previews). */
export function freeCalculatedWith(ds: Dataset, period: Period, netSalary: number): number {
  return fromCents(
    toCents(netSalary) - toCents(expectedSpend(ds, period)) - toCents(expectedSavings(ds, period)),
  );
}

/** Calculated free money of the month. Null without salary. */
export function freeCalculated(ds: Dataset, period: Period): number | null {
  const salary = netSalaryForPeriod(ds, period);
  return salary === null ? null : freeCalculatedWith(ds, period, salary);
}

/** actual − calculated; negative = less left than calculated. */
export function gap(actual: number | null | undefined, calculated: number | null | undefined): number | null {
  if (actual === null || actual === undefined || calculated === null || calculated === undefined) return null;
  return fromCents(toCents(actual) - toCents(calculated));
}

/** freeActual − freeCalculated. Null unless both are known. */
export function freeGap(ds: Dataset, period: Period): number | null {
  return gap(monthCloseFor(ds, period)?.freeActual, freeCalculated(ds, period));
}

/** Savings ÷ net salary, 0–1. Null without salary. */
export function savingsRate(ds: Dataset, period: Period): number | null {
  const salary = netSalaryForPeriod(ds, period);
  if (salary === null || salary <= 0) return null;
  return expectedSavings(ds, period) / salary;
}

// ---------------------------------------------------------------------------
// Upcoming & reminders
// ---------------------------------------------------------------------------

/** Non-monthly expenses and savings due in the next `months` periods after `period`. */
export function upcomingDue(ds: Dataset, period: Period, months = 2): DueItem[] {
  const out: DueItem[] = [];
  for (let i = 1; i <= months; i++) {
    const p = addPeriods(period, i);
    out.push(...dueItems(ds, p).filter((item) => item.position.frequency !== 'monthly'));
  }
  return out;
}

export function remindersForPeriod(ds: Dataset, period: Period): Reminder[] {
  return ds.reminders.filter((r) => r.month === monthOf(period));
}

// ---------------------------------------------------------------------------
// Optimisations
// ---------------------------------------------------------------------------

export interface AmountChange {
  position: Position;
  validFrom: Period;
  from: number;
  to: number;
  /** positive = saved per year, negative = more expensive */
  annualSavings: number;
}

/**
 * Yearly savings from amount changes whose validFrom lies in [from, to].
 * Derived from amountHistory; only expense positions count.
 */
export function annualizedSavingsFromChanges(
  ds: Dataset,
  range: { from: Period; to: Period },
): { changes: AmountChange[]; total: number } {
  const changes: AmountChange[] = [];
  for (const position of ds.positions) {
    if (kindOf(ds, position) !== 'expense') continue;
    const history = [...position.amountHistory].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]!;
      const next = history[i]!;
      if (next.validFrom < range.from || next.validFrom > range.to) continue;
      const perYear = PERIODS_PER_YEAR[position.frequency];
      changes.push({
        position,
        validFrom: next.validFrom,
        from: prev.amount,
        to: next.amount,
        annualSavings: fromCents((toCents(prev.amount) - toCents(next.amount)) * perYear),
      });
    }
  }
  changes.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return { changes, total: sumMoney(changes.map((c) => c.annualSavings)) };
}
