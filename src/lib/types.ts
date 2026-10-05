// Domain model. Amounts are euros as plain numbers (e.g. 262.02);
// calc.ts sums them in integer cents to avoid floating point drift.

export type Period = string; // 'YYYY-MM'

export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type Kind = 'expense' | 'savings';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  color: string;
  sortOrder: number;
}

export interface AmountEntry {
  validFrom: Period;
  amount: number;
}

export interface Position {
  id: string;
  name: string;
  categoryId: string;
  frequency: Frequency;
  dueMonths: number[]; // 1–12; for monthly all twelve
  dueDay?: number;
  isVariable: boolean;
  note?: string;
  amountHistory: AmountEntry[];
  createdAt: string;
  archivedAt?: string;
  sortOrder: number;
}

export interface Payment {
  id: string;
  positionId: string;
  period: Period;
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
}

export interface IncomeEntry {
  validFrom: Period;
  netMonthly: number;
}

export type ChangeType = 'created' | 'amount' | 'archived' | 'restored' | 'edited';

export interface ChangeLog {
  id: string;
  at: string;
  positionId: string;
  type: ChangeType;
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
  income: IncomeEntry[];
  reminders: Reminder[];
}
