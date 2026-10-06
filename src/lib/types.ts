// Domain model. Amounts are euros as plain numbers (e.g. 262.02);
// calc.ts sums them in integer cents to avoid floating point drift.

export type Period = string; // 'YYYY-MM'

/** 'once': a single payment on `dueDate` – never spread, never part of the fixed costs */
export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'once';
export type Kind = 'expense' | 'savings';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  color: string;
  sortOrder: number;
}

/** One version of a position's payment plan, valid from `validFrom` until the next entry. */
export interface PlanEntry {
  validFrom: Period;
  amount: number;
  frequency: Frequency;
  dueMonths: number[]; // 1–12; for monthly all twelve
  dueDay?: number; // 1–31, 31 = last day of the month
  /** 'once' only: 'YYYY-MM-DD'; validFrom, dueMonths and dueDay follow from it */
  dueDate?: string;
  /** dated change ('YYYY-MM-DD'); validFrom is its month. Empty for the first entry. */
  changedOn?: string;
  /** optional reason of a change, e.g. 'Indexanpassung' */
  reason?: string;
  /**
   * When a dated change was entered (ISO). Ticks set before that moment were
   * made against the old plan and show the new plan; later ticks keep their snapshot.
   */
  recordedAt?: string;
}

/** Closed gap between an archive and a restore (inclusive months). */
export interface Pause {
  from: Period;
  to: Period;
}

export interface Position {
  id: string;
  name: string;
  categoryId: string;
  note?: string;
  history: PlanEntry[];
  createdAt: string;
  /** archived from this month on (exclusive of earlier months) */
  archivedAt?: string;
  pauses?: Pause[];
  sortOrder: number;
}

export type PaymentStatus = 'paid' | 'skipped';

export interface Payment {
  id: string;
  positionId: string;
  period: Period;
  status: PaymentStatus;
  /** plan snapshot at the time of ticking; ticked months never change afterwards */
  plannedAmount: number;
  actualAmount: number;
  paidAt: string;
  note?: string;
}

export interface OneOff {
  id: string;
  positionId?: string;
  period: Period;
  amount: number; // negative = credit
  label: string;
  /** set when ticked off */
  paidAt?: string;
}

/** Per-month close: salary varies, so it is captured per period. */
export interface MonthClose {
  period: Period; // primary key
  netSalary?: number;
  /** actually free money at month end (entered by the user) */
  freeActual?: number;
  note?: string;
  updatedAt: string;
}

export type ChangeType = 'created' | 'amount' | 'corrected' | 'archived' | 'restored' | 'edited';

export interface ChangeLog {
  id: string;
  at: string;
  positionId: string;
  type: ChangeType;
  /** 'amount': month the new plan applies from */
  validFrom?: Period;
  from?: unknown;
  to?: unknown;
}

export interface Reminder {
  id: string;
  month: number; // 1–12
  text: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Read-only snapshot of everything calc.ts needs. */
export interface Dataset {
  categories: Category[];
  positions: Position[];
  payments: Payment[];
  oneOffs: OneOff[];
  monthClose: MonthClose[];
  reminders: Reminder[];
  changeLog: ChangeLog[];
}
