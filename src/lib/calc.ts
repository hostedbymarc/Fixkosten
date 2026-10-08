// Single source of truth for every number shown in the UI.
// All functions are pure: (dataset, period) -> value. UI never sums by itself.
//
// Plans are versioned: every month reads the position's history entry valid in
// that month, never a top-level amount or frequency.
//
// Money handling: amounts are summed as integer cents. Monthly equivalents are
// carried as integer "cents × due months per year" numerators and divided by 12
// only once at the end, so category sums and totals stay exactly consistent.

import { addPeriods, monthOf } from './period';
import type {
  Category,
  Dataset,
  Frequency,
  Kind,
  MonthClose,
  OneOff,
  Payment,
  Period,
  PlanEntry,
  Position,
  Reminder,
} from './types';

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  once: 1,
};

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const toCents = (euros: number): number => Math.round(euros * 100);
const fromCents = (cents: number): number => cents / 100;
/** cents × due-months numerator → euros per month */
const fromEquivalentNumerator = (n: number): number => n / 1200;

export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Position level: every month reads the plan entry valid in that month
// ---------------------------------------------------------------------------

/**
 * Order of the history: by month, then by change date. A change dated in the
 * first month (01.10.2026) therefore wins over the entry the position started with.
 */
export function compareEntries(a: PlanEntry, b: PlanEntry): number {
  return a.validFrom.localeCompare(b.validFrom) || (a.changedOn ?? '').localeCompare(b.changedOn ?? '');
}

/** The history in chronological order (first entry = start of the position). */
export function planHistory(position: Position): PlanEntry[] {
  return [...position.history].sort(compareEntries);
}

/** Stable identity of a history entry (validFrom alone is not unique). */
export function entryKey(entry: Pick<PlanEntry, 'validFrom' | 'changedOn'>): string {
  return `${entry.validFrom}|${entry.changedOn ?? ''}`;
}

/** Plan entry valid in `period` (latest entry with validFrom ≤ period), or null if not yet valid. */
export function planForPeriod(position: Position, period: Period): PlanEntry | null {
  let match: PlanEntry | null = null;
  for (const entry of position.history) {
    if (entry.validFrom <= period && (!match || compareEntries(entry, match) > 0)) match = entry;
  }
  return match;
}

/** Plan that applies in `period`, or the first future one for positions that start later. */
export function currentPlan(position: Position, period: Period): PlanEntry | null {
  return planForPeriod(position, period) ?? planHistory(position)[0] ?? null;
}

/** First change that takes effect after `period` (for the badge „Ab 01.04.2027: € 1.050“). */
export function nextPlannedChange(position: Position, period: Period): PlanEntry | null {
  const current = planForPeriod(position, period);
  if (!current || current.frequency === 'once') return null;
  return planHistory(position).find((e) => e.validFrom > period) ?? null;
}

/** Date a change applies from: its change date, else the first of its month. */
export function effectiveDate(entry: PlanEntry): string {
  return entry.changedOn ?? `${entry.validFrom}-01`;
}

/** 'once' entries: the month of the due date. */
export function oncePeriod(plan: PlanEntry): Period | null {
  return plan.frequency === 'once' && plan.dueDate ? plan.dueDate.slice(0, 7) : null;
}

export function amountForPeriod(position: Position, period: Period): number | null {
  return planForPeriod(position, period)?.amount ?? null;
}

export function archivedPeriod(position: Position): Period | undefined {
  return position.archivedAt ? position.archivedAt.slice(0, 7) : undefined;
}

function isPaused(position: Position, period: Period): boolean {
  return (position.pauses ?? []).some((p) => p.from <= period && period <= p.to);
}

/**
 * A position exists in a period once its first plan is valid, outside of
 * archive pauses, and until the month it was archived (exclusive).
 */
export function isActiveInPeriod(position: Position, period: Period): boolean {
  if (planForPeriod(position, period) === null || isPaused(position, period)) return false;
  const archived = archivedPeriod(position);
  return archived === undefined || period < archived;
}

export function dueMonthsOfPlan(plan: PlanEntry): number[] {
  return plan.frequency === 'monthly' ? ALL_MONTHS : plan.dueMonths;
}

/** Is the position debited in this month? 'once' only in the month of its due date. */
export function dueInPeriod(position: Position, period: Period): boolean {
  const plan = planForPeriod(position, period);
  if (plan === null || !isActiveInPeriod(position, period)) return false;
  if (plan.frequency === 'once') return oncePeriod(plan) === period;
  return dueMonthsOfPlan(plan).includes(monthOf(period));
}

/**
 * cents × number of due months per year; ÷1200 gives the monthly equivalent.
 * One-time payments are no fixed costs: they are never spread.
 */
function planNumerator(plan: PlanEntry): number {
  if (plan.frequency === 'once') return 0;
  return toCents(plan.amount) * dueMonthsOfPlan(plan).length;
}

function equivalentNumerator(position: Position, period: Period): number {
  const plan = planForPeriod(position, period);
  return plan && isActiveInPeriod(position, period) ? planNumerator(plan) : 0;
}

/** Amount spread over 12 months (e.g. quarterly ÷3, annual ÷12). */
export function monthlyEquivalent(position: Position, period: Period): number {
  return fromEquivalentNumerator(equivalentNumerator(position, period));
}

export function monthlyEquivalentOfPlan(plan: PlanEntry): number {
  return fromEquivalentNumerator(planNumerator(plan));
}

export function annualCostOfPlan(plan: PlanEntry): number {
  return fromCents(planNumerator(plan));
}

/** Same amount and schedule? (name/category/note are not part of the plan) */
export function samePlan(a: Omit<PlanEntry, 'validFrom'>, b: Omit<PlanEntry, 'validFrom'>): boolean {
  const months = (p: Omit<PlanEntry, 'validFrom'>) =>
    (p.frequency === 'monthly' ? ALL_MONTHS : [...p.dueMonths].sort((x, y) => x - y)).join(',');
  return (
    toCents(a.amount) === toCents(b.amount) &&
    a.frequency === b.frequency &&
    months(a) === months(b) &&
    (a.dueDay ?? null) === (b.dueDay ?? null) &&
    (a.dueDate ?? null) === (b.dueDate ?? null)
  );
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

/** Calendar day of the due date in `period`; 31 means the last day of the month. */
export function dueDayInPeriod(dueDay: number | undefined, period: Period): number | undefined {
  if (dueDay === undefined) return undefined;
  const year = Number(period.slice(0, 4));
  const daysInMonth = new Date(year, monthOf(period), 0).getDate();
  return Math.min(dueDay, daysInMonth);
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

export function sortedCategories(ds: Dataset): Category[] {
  return [...ds.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortedPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function paymentFor(ds: Dataset, positionId: string, period: Period): Payment | undefined {
  return ds.payments.find((p) => p.positionId === positionId && p.period === period);
}

function kindOfPositionId(ds: Dataset, id: string | undefined): Kind {
  const position = id ? ds.positions.find((p) => p.id === id) : undefined;
  return position ? kindOf(ds, position) : 'expense';
}

// ---------------------------------------------------------------------------
// Month view: what is due in a period
// ---------------------------------------------------------------------------

export type ItemStatus = 'open' | 'paid' | 'skipped';

export interface DueItem {
  position: Position;
  category: Category;
  kind: Kind;
  period: Period;
  /** plan valid in the period (null only for carriers of one-offs outside the plan) */
  plan: PlanEntry | null;
  /** false = only shown because it carries one-offs this month; never counted */
  due: boolean;
  status: ItemStatus;
  /** planned amount; ticked months use the payment snapshot */
  planned: number;
  payment?: Payment;
  /** actual − planned when paid, otherwise null */
  delta: number | null;
  /** one-offs of this position in the period (Nachzahlung / Gutschrift) */
  oneOffs: OneOff[];
}

/**
 * Everything due in `period`, ordered by category and position sortOrder.
 * A position archived later in the month still shows up if it was paid.
 * Positions with one-offs but no due payment are included with `due: false`.
 */
export function dueItems(ds: Dataset, period: Period): DueItem[] {
  const cats = categoryMap(ds);
  const items: DueItem[] = [];
  for (const position of sortedPositions(ds.positions)) {
    const category = cats.get(position.categoryId);
    if (!category) continue;
    const payment = paymentFor(ds, position.id, period);
    const oneOffs = ds.oneOffs.filter((o) => o.positionId === position.id && o.period === period);
    const due = dueInPeriod(position, period) || payment !== undefined;
    if (!due && oneOffs.length === 0) continue;
    const plan = planForPeriod(position, period);
    const planned = due ? plannedAmount(plan, payment) : 0;
    const status: ItemStatus = payment ? payment.status : 'open';
    items.push({
      position,
      category,
      kind: category.kind,
      period,
      plan,
      due,
      status,
      planned,
      payment,
      delta: payment && status === 'paid' ? fromCents(toCents(payment.actualAmount) - toCents(planned)) : null,
      oneOffs,
    });
  }
  const order = new Map(sortedCategories(ds).map((c, i) => [c.id, i]));
  return items.sort((a, b) => (order.get(a.category.id) ?? 0) - (order.get(b.category.id) ?? 0));
}

/**
 * Planned amount of a month. A tick keeps its snapshot – unless it was set
 * before a dated change for that month was entered: then the month was
 * ticked against an outdated plan and shows the new one (e.g. Miete ab
 * 01.10. € 1.050, October already ticked with € 1.008 → plan € 1.050, Ist € 1.008).
 */
function plannedAmount(plan: PlanEntry | null, payment: Payment | undefined): number {
  if (!payment) return plan?.amount ?? 0;
  if (plan?.recordedAt && payment.paidAt < plan.recordedAt) return plan.amount;
  return payment.plannedAmount;
}

/** Items that count towards the plan: due and not skipped. */
function counted(items: DueItem[]): DueItem[] {
  return items.filter((i) => i.due && i.status !== 'skipped');
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
    const c = counted(group.items);
    group.planned = sumMoney(c.map((i) => i.planned));
    group.actual = sumMoney(c.filter((i) => i.status === 'paid').map((i) => i.payment!.actualAmount));
    group.openCount = c.filter((i) => i.status === 'open').length;
  }
  return groups;
}

/** Plan: sum of everything due in `period` (no one-offs, no skipped). Expenses by default. */
export function plannedForPeriod(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  return sumMoney(counted(dueItems(ds, period)).filter((i) => i.kind === kind).map((i) => i.planned));
}

/** Actually debited: ticked payments plus ticked one-offs (credits negative). */
export function actualForPeriod(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  const payments = ds.payments
    .filter((p) => p.period === period && p.status === 'paid' && kindOfPositionId(ds, p.positionId) === kind)
    .map((p) => p.actualAmount);
  const oneOffs = ds.oneOffs
    .filter((o) => o.period === period && o.paidAt && kindOfPositionId(ds, o.positionId) === kind)
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

/** Hero card: '€ 3.368 von € 3.403 abgebucht'. Expenses only, skipped items excluded. */
export function periodProgress(ds: Dataset, period: Period): PeriodProgress {
  const items = counted(dueItems(ds, period)).filter((i) => i.kind === 'expense');
  const paid = items.filter((i) => i.status === 'paid');
  const open = items.filter((i) => i.status === 'open');
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

/** First month with any tick – "open from previous months" never looks further back. */
export function firstDataPeriod(ds: Dataset): Period | null {
  let first: Period | null = null;
  for (const p of ds.payments) if (!first || p.period < first) first = p.period;
  return first;
}

export interface OpenGroup {
  period: Period;
  items: DueItem[];
  planned: number;
}

/** Unticked items of earlier months (since the first month with data), newest first. */
export function openFromPrevious(ds: Dataset, period: Period): OpenGroup[] {
  const first = firstDataPeriod(ds);
  if (!first) return [];
  const groups: OpenGroup[] = [];
  for (let p = addPeriods(period, -1); p >= first; p = addPeriods(p, -1)) {
    const items = dueItems(ds, p).filter((i) => i.due && i.status === 'open');
    if (items.length) groups.push({ period: p, items, planned: sumMoney(items.map((i) => i.planned)) });
  }
  return groups;
}

/** What a permanent delete would remove besides the position itself. */
export function positionUsage(ds: Dataset, positionId: string): { payments: number; oneOffs: number } {
  return {
    payments: ds.payments.filter((p) => p.positionId === positionId).length,
    oneOffs: ds.oneOffs.filter((o) => o.positionId === positionId).length,
  };
}

/** Positions per category (archived ones included – they move along on delete). */
export function categoryUsage(ds: Dataset, categoryId: string): number {
  return ds.positions.filter((p) => p.categoryId === categoryId).length;
}

/** Positions shown in lists: not archived, ordered by sortOrder. */
export function activePositions(ds: Dataset, categoryId?: string): Position[] {
  return sortedPositions(ds.positions).filter((p) => !p.archivedAt && (!categoryId || p.categoryId === categoryId));
}

export function archivedPositions(ds: Dataset): Position[] {
  return ds.positions.filter((p) => p.archivedAt).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
}

/** actual − planned of one payment (0 for skipped). */
export function paymentDelta(payment: Payment): number {
  return payment.status === 'paid' ? fromCents(toCents(payment.actualAmount) - toCents(payment.plannedAmount)) : 0;
}

export function sumOpen(groups: OpenGroup[]): number {
  return sumMoney(groups.map((g) => g.planned));
}

/** Last `limit` payments of a position, newest first. */
export function paymentsOf(ds: Dataset, positionId: string, limit = 12): Payment[] {
  return ds.payments
    .filter((p) => p.positionId === positionId)
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Spread view: true monthly burden
// ---------------------------------------------------------------------------

export interface EquivalentFilter {
  kind?: Kind;
  /** only positions whose plan in the period is not monthly */
  nonMonthlyOnly?: boolean;
  frequency?: Frequency;
  categoryId?: string;
}

function matchingPositions(ds: Dataset, period: Period, filter: EquivalentFilter): Position[] {
  const cats = categoryMap(ds);
  return ds.positions.filter((p) => {
    const category = cats.get(p.categoryId);
    const plan = planForPeriod(p, period);
    if (!category || !plan || !isActiveInPeriod(p, period)) return false;
    if (filter.kind && category.kind !== filter.kind) return false;
    if (filter.nonMonthlyOnly && plan.frequency === 'monthly') return false;
    if (filter.frequency && plan.frequency !== filter.frequency) return false;
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

/** Yearly cost of the matching positions (amount × due months per year). */
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
 * plan for open ones, nothing for skipped ones, plus all one-offs of the month
 * (credits negative). Expenses by default.
 */
export function expectedSpend(ds: Dataset, period: Period, kind: Kind = 'expense'): number {
  const items = counted(dueItems(ds, period))
    .filter((i) => i.kind === kind)
    .map((i) => (i.status === 'paid' ? i.payment!.actualAmount : i.planned));
  const oneOffs = ds.oneOffs
    .filter((o) => o.period === period && kindOfPositionId(ds, o.positionId) === kind)
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

/**
 * Free money of an average month: salary − Ø pro Monat (all fixed costs spread
 * over the year) − planned savings. One-time payments and one-offs do not
 * distort it. Null without salary.
 */
export function freeAverage(ds: Dataset, period: Period): number | null {
  const salary = netSalaryForPeriod(ds, period);
  return salary === null ? null : freeAverageWith(ds, period, salary);
}

/** freeAverage for a given salary (live preview in the month close). */
export function freeAverageWith(ds: Dataset, period: Period, netSalary: number): number {
  return fromCents(
    toCents(netSalary) - Math.round(trueMonthlyBurden(ds, period) * 100) - Math.round(savingsForPeriod(ds, period) * 100),
  );
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
    out.push(...dueItems(ds, p).filter((i) => i.due && i.plan !== null && i.plan.frequency !== 'monthly'));
  }
  return out;
}

export function remindersForPeriod(ds: Dataset, period: Period): Reminder[] {
  return ds.reminders.filter((r) => r.month === monthOf(period));
}

// ---------------------------------------------------------------------------
// Optimisations
// ---------------------------------------------------------------------------

export interface PlanChange {
  position: Position;
  validFrom: Period;
  /** change date ('YYYY-MM-DD'), first of the month for older entries */
  changedOn: string;
  reason?: string;
  from: PlanEntry;
  to: PlanEntry;
  /** change of the yearly cost: negative = cheaper (optimisation), positive = increase */
  annualDelta: number;
  /** positive = saved per year */
  annualSavings: number;
  /** change of the spread monthly amount */
  monthlyDelta: number;
}

/** Every dated change of every expense position, from consecutive history entries. */
export function planChanges(ds: Dataset): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const position of ds.positions) {
    if (kindOf(ds, position) !== 'expense') continue;
    const history = planHistory(position);
    for (let i = 1; i < history.length; i++) {
      const from = history[i - 1]!;
      const to = history[i]!;
      if (from.frequency === 'once' || to.frequency === 'once') continue;
      const annualDelta = fromCents(planNumerator(to) - planNumerator(from));
      changes.push({
        position,
        validFrom: to.validFrom,
        changedOn: effectiveDate(to),
        reason: to.reason,
        from,
        to,
        annualDelta,
        annualSavings: -annualDelta || 0,
        monthlyDelta: fromEquivalentNumerator(planNumerator(to) - planNumerator(from)),
      });
    }
  }
  return changes.sort((a, b) => b.changedOn.localeCompare(a.changedOn) || a.position.sortOrder - b.position.sortOrder);
}

/**
 * Plan changes ("Ab wann gilt das?" / "Betrag ändern") whose validFrom lies in
 * [from, to], taken from the history itself – editing or deleting an entry
 * recalculates them. Typo corrections overwrite an entry and never count.
 * Only expense positions count; one-offs and one-time payments are never optimisations.
 */
export function annualizedSavingsFromChanges(
  ds: Dataset,
  range: { from: Period; to: Period },
): { changes: PlanChange[]; total: number } {
  const changes = planChanges(ds).filter((c) => c.validFrom >= range.from && c.validFrom <= range.to);
  return { changes, total: sumMoney(changes.map((c) => c.annualSavings)) };
}

/** One-time payments whose month has passed or that are ticked (shown under „Einmalige Zahlungen“). */
export function isOnceDone(ds: Dataset, position: Position, today: Period): boolean {
  const plan = planHistory(position)[0];
  const period = plan ? oncePeriod(plan) : null;
  if (!period) return false;
  return period < today || ds.payments.some((p) => p.positionId === position.id && p.period === period);
}

export function isOncePosition(position: Position): boolean {
  return position.history.some((e) => e.frequency === 'once');
}
