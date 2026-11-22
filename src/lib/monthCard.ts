// monat-ist-monat: „Dein Monat“ shows the ACTIVE period (start 25: November = 25.10.–24.11.), paid by the salary
// that came at its start. It no longer plans the next salary; that stays in „Dein Plan“.
//
//   Netto      the salary of the active period (salaryView: own entry, else the last one entered)
//   ①          what goes to the Rücklage in this period with the chosen plan (monthPlan.current.transfer)
//   ②          Direkt bezahlt: the direct bills due in this period (no Vermögensaufbau, nothing that starts later)
//   ③          Vermögensaufbau from the net salary, this month's real amount; „nicht vom Netto“ only shown
//   ④          Nicht eingeplant: positions „nicht eingeplant“ (and their one-offs) due in this period;
//              „aus anderer Quelle“ (fromNet false) is listed muted and does not count
//   Übrig      Netto − ① − ② − ③ − ④ · „Vor Spielgeld frei“ = Netto − ① − ② − ③
//   Spielgeld  ④ against the limit: „€ ④ von € Limit · € Rest übrig“ / „… € Überschuss drüber“
//
// Every row has its items (name · amount · date); the sum of a row's counted items is the row's amount.
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
  /** ① only: the line that brings the bills to the transfer (saved for later / taken from what is saved) */
  balance?: 'save' | 'take';
}

export interface CardRow {
  /** the row's amount (the sum of its counted items) */
  total: number;
  /** counted items */
  count: number;
  items: CardItem[];
}

export interface SpielgeldPill {
  limit: number;
  used: number;
  /** limit − used, ≥ 0: „übrig“ */
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
  unplanned: CardRow & { other: number };
  /** Netto − ① − ② − ③; null without a salary */
  beforeSpielgeld: number | null;
  /** „Übrig in diesem Monat“ = beforeSpielgeld − ④; null without a salary */
  left: number | null;
  /** null: no Spielgeld set */
  pill: SpielgeldPill | null;
  /** the next salary (the line under the card) */
  next: { period: Period; title: string; when: string };
}

const byDate = (a: CardItem, b: CardItem) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.amount - a.amount || a.name.localeCompare(b.name);

function row(items: CardItem[]): CardRow {
  const counted = items.filter((i) => !i.muted);
  return { total: euros(counted.reduce((a, i) => a + cents(i.amount), 0)), count: counted.length, items: [...items].sort(byDate) };
}

const fromSource = (i: SourceItem, muted = false, note?: CardItem['note']): CardItem => ({ key: i.key, name: i.name, amount: i.amount, date: i.date, muted, ...(note ? { note } : {}) });

/** ① its bills: every bill of the account in the period, plus the line that brings them to the transfer. */
function reserveItems(ds: Dataset, period: Period, transfer: number): CardItem[] {
  const bills = monthItems(ds, period).filter((i) => i.account === 'fixkostenkonto' && i.fromNet);
  const items = bills.map((i) => fromSource(i));
  const diff = cents(transfer) - bills.reduce((a, i) => a + cents(i.amount), 0);
  if (diff !== 0) items.push({ key: `balance@${period}`, name: '', amount: euros(diff), date: null, muted: false, balance: diff > 0 ? 'save' : 'take' });
  return items;
}

/** ④: positions „nicht eingeplant“ due in the period and their one-offs; „aus anderer Quelle“ muted. */
function unplannedItems(ds: Dataset, period: Period): CardItem[] {
  const out: CardItem[] = [];
  for (const i of dueItems(ds, period)) {
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

export function monthCard(ds: Dataset, active: Period, plan: MonthPlan, start: MonthStart = 1, today: Date = localToday()): MonthCard {
  const salary = salaryView(ds, active, start, today);
  const transfer = plan.current.transfer;
  const reserve = row(reserveItems(ds, active, transfer));
  const items = monthItems(ds, active);
  const direct = row(items.filter((i) => i.kind === 'expense' && i.account === 'girokonto' && i.fromNet).map((i) => fromSource(i)));
  const wealthItems = items.filter((i) => i.kind === 'savings' && i.account === 'girokonto');
  const wealth = {
    ...row(wealthItems.map((i) => (i.fromNet ? fromSource(i) : fromSource(i, true, 'notFromNet')))),
    notFromNet: euros(wealthItems.filter((i) => !i.fromNet).reduce((a, i) => a + cents(i.amount), 0)),
  };
  const unplannedList = unplannedItems(ds, active);
  const unplanned = { ...row(unplannedList), other: euros(unplannedList.filter((i) => i.muted).reduce((a, i) => a + cents(i.amount), 0)) };
  const net = salary.value;
  const before = net === null ? null : cents(net) - cents(reserve.total) - cents(direct.total) - cents(wealth.total);
  const limit = plan.spielgeld;
  const used = cents(unplanned.total);
  const pill = limit === null ? null : { limit, used: euros(used), rest: euros(Math.max(cents(limit) - used, 0)), over: euros(Math.max(used - cents(limit), 0)) };
  const nextPeriod = addPeriods(active, 1);
  return {
    period: active,
    salary,
    reserve,
    direct,
    wealth,
    unplanned,
    beforeSpielgeld: before === null ? null : euros(before),
    left: before === null ? null : euros(before - used),
    pill,
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
