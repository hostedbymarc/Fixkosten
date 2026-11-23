// „Dein Monat“ for EVERY month (alle-monate-gleich; monat-ist-monat: the period of a month, start 25: November
// = 25.10.–24.11.), paid by the salary that came at its start. The next salary is planned in „Dein Plan“.
//
//   Netto      the salary of the period (salaryView: own entry, else „Gehalt zum Planen“, else the last one entered)
//   ①          what goes to the Rücklage in the period (transferOf): the active period with the chosen plan
//              (monthPlan.current), a later one as in „Dein Plan“, an earlier one what was transferred
//   ②          Direkt bezahlt: the direct bills due in this period (no Vermögensaufbau, nothing that starts later)
//   ③          Vermögensaufbau from the net salary, this month's real amount; „nicht vom Netto“ only shown
//   ④          Spielgeld: max(limit, spent); spent = positions „nicht eingeplant“ (and their one-offs) in the
//              period; „aus anderer Quelle“ (fromNet false) is listed muted and does not count. No limit: spent
//   Überschuss Netto − ① − ② − ③ − ④ · „Vor Spielgeld frei“ = Netto − ① − ② − ③
//   Spielgeld  spent against the limit (the subline of ④; over it: „Spielgeld € X drüber“ under the Überschuss)
//
// spielgeld-pille-rechenfehler: ①–④, „Vor Spielgeld frei“ and the Überschuss do not depend on what is ticked.
// A tick only changes the bills row and the confetti (monthPlan plans with every bill, see there).
//
// Every row has its items (name · amount · date); the sum of a row's counted items is the row's amount (①: a
// line „Für später zur Seite“ / „Aus dem Angesparten“, ④: „Noch nicht ausgegeben“ bring the items to it).
// One-time payments belong to the period of their date (calc.oncePeriod, „Neuer Monat beginnt am“).
// Money in integer cents; pure functions over monthPlan, monthItems and dueItems.
import type { MonthStart } from './activeMonth';
import { localToday } from './activeMonth';
import { dueDateIn, dueItems, monthItems, planForPeriod, type DueItem, type SourceItem } from './calc';
import type { MonthPlan } from './monthPlan';
import { addPeriods } from './period';
import { salaryName, salaryView, salaryWhen, type SalaryView } from './salaryMonth';
import type { Dataset, Period, Position } from './types';

const cents = (v: number) => Math.round(v * 100);
const euros = (c: number) => c / 100;

/** One line under a row: name · amount · date. `muted`: listed, but not part of the row's amount. */
export interface CardItem {
  key: string;
  name: string;
  amount: number;
  /** YYYY-MM-DD in the period; null when unknown (one-offs, the balancing line of ①) */
  date: string | null;
  muted: boolean;
  /** what a muted line is: not from the net salary (③) or from another source (④) */
  note?: 'notFromNet' | 'other';
  /** the line that brings the items to the row: ① saved for later / taken from what is saved, ④ not spent yet */
  balance?: 'save' | 'take' | 'rest';
}

export interface CardRow {
  /** the row's amount (the sum of its counted items) */
  total: number;
  /** counted items */
  count: number;
  items: CardItem[];
}

/** ④ against the Spielgeld limit: the subline of ④ and the line „Spielgeld € X drüber“. */
export interface SpielgeldStatus {
  limit: number;
  used: number;
  /** limit − used, ≥ 0: not spent yet */
  rest: number;
  /** used − limit, > 0: „drüber“ */
  over: number;
}

export interface MonthCard {
  period: Period;
  salary: SalaryView;
  reserve: CardRow;
  direct: CardRow;
  wealth: CardRow & { notFromNet: number };
  /** ④ Spielgeld: total = max(limit, spent); spent = the counted items „nicht eingeplant“ */
  unplanned: CardRow & { other: number; spent: number };
  /** Netto − ① − ② − ③; null without a salary */
  beforeSpielgeld: number | null;
  /** „Überschuss in diesem Monat“ = beforeSpielgeld − ④; null without a salary */
  left: number | null;
  /** null: no Spielgeld set */
  spielgeld: SpielgeldStatus | null;
  /** the next salary (the line under the card) */
  next: { period: Period; title: string; when: string };
}

const byDate = (a: CardItem, b: CardItem) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.amount - a.amount || a.name.localeCompare(b.name);

function row(items: CardItem[]): CardRow {
  const counted = items.filter((i) => !i.muted);
  return { total: euros(counted.reduce((a, i) => a + cents(i.amount), 0)), count: counted.length, items: [...items].sort(byDate) };
}

const fromSource = (i: SourceItem, muted = false, note?: CardItem['note']): CardItem => ({ key: i.key, name: i.name, amount: i.amount, date: i.date, muted, ...(note ? { note } : {}) });

const accountBills = (ds: Dataset, period: Period, start: MonthStart) => monthItems(ds, period, start).filter((i) => i.account === 'fixkostenkonto' && i.fromNet);

/**
 * ① of a period: the active one with the chosen plan from its start (monthPlan.current), a later one as in
 * „Dein Plan“; an earlier one what was transferred (the monthly check), else its bills of the account (paid
 * from the account when due). Beyond the plan: its bills of the account as well.
 */
export function transferOf(ds: Dataset, period: Period, plan: MonthPlan, start: MonthStart = 1): number {
  const active = plan.current.period;
  if (period === active) return plan.current.transfer;
  if (period > active) {
    const month = plan.months.find((m) => m.period === period);
    if (month) return month.transfer;
  } else {
    const check = plan.checks.find((c) => c.period === period && c.deposited);
    if (check?.amount !== undefined) return check.amount;
  }
  return euros(accountBills(ds, period, start).reduce((a, i) => a + cents(i.amount), 0));
}

/** ① its bills: every bill of the account in the period, plus the line that brings them to the transfer. */
function reserveItems(ds: Dataset, period: Period, transfer: number, start: MonthStart): CardItem[] {
  const bills = accountBills(ds, period, start);
  const items = bills.map((i) => fromSource(i));
  const diff = cents(transfer) - bills.reduce((a, i) => a + cents(i.amount), 0);
  if (diff !== 0) items.push({ key: `balance@${period}`, name: '', amount: euros(diff), date: null, muted: false, balance: diff > 0 ? 'save' : 'take' });
  return items;
}

/** ④: positions „nicht eingeplant“ due in the period and their one-offs; „aus anderer Quelle“ muted. */
function unplannedItems(ds: Dataset, period: Period, start: MonthStart): CardItem[] {
  const out: CardItem[] = [];
  for (const i of dueItems(ds, period, start)) {
    if (!i.unplanned) continue;
    const other = i.position.fromNet === false;
    if (i.due && i.status !== 'skipped') {
      out.push({
        key: `${i.position.id}@${period}`,
        name: i.position.name,
        amount: i.status === 'paid' ? i.payment!.actualAmount : i.planned,
        date: dueDateIn(i.plan, period),
        muted: other,
        ...(other ? { note: 'other' as const } : {}),
      });
    }
    for (const o of i.oneOffs) {
      out.push({ key: `${o.id}@${period}`, name: `${i.position.name}: ${o.label}`, amount: o.amount, date: null, muted: other, ...(other ? { note: 'other' as const } : {}) });
    }
  }
  return out.filter((i) => cents(i.amount) !== 0);
}

/**
 * The card of `period` (any month: past, active, future). `plan`: monthPlan of the ACTIVE month – the same
 * plan for every card, so ① of a later month is the one of „Dein Plan“.
 */
export function monthCard(ds: Dataset, period: Period, plan: MonthPlan, start: MonthStart = 1, today: Date = localToday()): MonthCard {
  const active = period;
  const salary = salaryView(ds, active, start, today, plan.planSalary);
  const transfer = transferOf(ds, active, plan, start);
  const reserve = row(reserveItems(ds, active, transfer, start));
  const items = monthItems(ds, active, start);
  const direct = row(items.filter((i) => i.kind === 'expense' && i.account === 'girokonto' && i.fromNet).map((i) => fromSource(i)));
  const wealthItems = items.filter((i) => i.kind === 'savings' && i.account === 'girokonto');
  const wealth = {
    ...row(wealthItems.map((i) => (i.fromNet ? fromSource(i) : fromSource(i, true, 'notFromNet')))),
    notFromNet: euros(wealthItems.filter((i) => !i.fromNet).reduce((a, i) => a + cents(i.amount), 0)),
  };
  const unplannedList = unplannedItems(ds, active, start);
  const limit = plan.spielgeld;
  const used = unplannedList.filter((i) => !i.muted).reduce((a, i) => a + cents(i.amount), 0);
  // ④ = max(limit, spent): what is not spent yet stays booked for the Spielgeld („Noch nicht ausgegeben“)
  const notSpent = limit === null ? 0 : Math.max(cents(limit) - used, 0);
  if (notSpent > 0) unplannedList.push({ key: `rest@${active}`, name: '', amount: euros(notSpent), date: null, muted: false, balance: 'rest' });
  const unplanned = {
    ...row(unplannedList),
    other: euros(unplannedList.filter((i) => i.muted).reduce((a, i) => a + cents(i.amount), 0)),
    spent: euros(used),
  };
  if (notSpent > 0) unplanned.count -= 1;
  const net = salary.value;
  const before = net === null ? null : cents(net) - cents(reserve.total) - cents(direct.total) - cents(wealth.total);
  const spielgeld = limit === null ? null : { limit, used: euros(used), rest: euros(notSpent), over: euros(Math.max(used - cents(limit), 0)) };
  const nextPeriod = addPeriods(active, 1);
  return {
    period: active,
    salary,
    reserve,
    direct,
    wealth,
    unplanned,
    beforeSpielgeld: before === null ? null : euros(before),
    left: before === null ? null : euros(before - cents(unplanned.total)),
    spielgeld,
    next: { period: nextPeriod, title: salaryName(nextPeriod, start), when: salaryWhen(nextPeriod, start, today) },
  };
}

/**
 * Point 5: „in diesem Monat € X statt € Y“ under a position of a category. X is what counts this month (ticked:
 * what was debited, else the plan of the month); Y the usual amount: the plan of the month, or – when the month
 * has its own amount between two equal ones – that amount. One-offs have their own rows and are not part of X.
 */
export function monthDeviation(item: DueItem): { x: number; y: number } | null {
  if (!item.due || item.status === 'skipped' || item.unplanned || !item.plan) return null;
  const y = usualAmount(item.position, item.period);
  if (y === null) return null;
  const x = item.status === 'paid' ? item.payment!.actualAmount : item.planned;
  return cents(x) === cents(y) ? null : { x, y };
}

/**
 * The usual amount of a position in a month: its plan of that month – unless a monthly position has its own
 * amount for this month only (the month before and after have the same other amount): then that one.
 */
export function usualAmount(position: Position, period: Period): number | null {
  const plan = planForPeriod(position, period);
  if (!plan) return null;
  if (plan.frequency !== 'monthly') return plan.amount;
  const before = planForPeriod(position, addPeriods(period, -1));
  const after = planForPeriod(position, addPeriods(period, 1));
  if (before && after && cents(before.amount) === cents(after.amount) && cents(before.amount) !== cents(plan.amount)) return before.amount;
  return plan.amount;
}
