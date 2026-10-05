import { ALL_MONTHS } from '../lib/calc';
import type { Category, Dataset, Frequency, Payment, Position, Reminder } from '../lib/types';

/** Month the app was set up in; seed amounts are valid from here on. */
export const SEED_PERIOD = '2026-10';
const SEED_CREATED_AT = '2026-10-01T08:00:00.000Z';

export const CATEGORY_IDS = {
  wohnen: 'cat-wohnen',
  abos: 'cat-abos',
  banking: 'cat-banking',
  mobilitaet: 'cat-mobilitaet',
  investing: 'cat-investing',
} as const;

const categories: Category[] = [
  { id: CATEGORY_IDS.wohnen, name: 'Wohnen & Leben', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: CATEGORY_IDS.abos, name: 'Abos & Freizeit', kind: 'expense', color: '#9494E8', sortOrder: 1 },
  { id: CATEGORY_IDS.banking, name: 'Banking & Finanzen', kind: 'expense', color: '#52525B', sortOrder: 2 },
  { id: CATEGORY_IDS.mobilitaet, name: 'Mobilität', kind: 'expense', color: '#A1A1AA', sortOrder: 3 },
  { id: CATEGORY_IDS.investing, name: 'Investing', kind: 'savings', color: '#27272A', sortOrder: 4 },
];

interface SeedRow {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  frequency: Frequency;
  dueMonths?: number[];
  dueDay?: number;
  isVariable?: boolean;
  note?: string;
  /** status in October 2026: true = paid, false = open, undefined = not due */
  paidOct?: boolean;
  paidDay?: number;
}

const W = CATEGORY_IDS.wohnen;
const A = CATEGORY_IDS.abos;
const B = CATEGORY_IDS.banking;
const M = CATEGORY_IDS.mobilitaet;
const I = CATEGORY_IDS.investing;

const rows: SeedRow[] = [
  { id: 'pos-kredit-1220', name: 'Kredit 1220', categoryId: W, amount: 735, frequency: 'monthly', paidOct: true },
  { id: 'pos-bk-1220', name: 'BK 1220', categoryId: W, amount: 169, frequency: 'monthly', paidOct: true },
  { id: 'pos-miete', name: 'Miete', categoryId: W, amount: 1008, frequency: 'monthly', paidOct: true },
  { id: 'pos-strom', name: 'Strom', categoryId: W, amount: 64, frequency: 'monthly', isVariable: true, paidOct: true },
  { id: 'pos-haushaltsversicherung', name: 'Haushaltsversicherung', categoryId: W, amount: 17, frequency: 'monthly', paidOct: true },
  { id: 'pos-internet', name: 'Internet', categoryId: W, amount: 23, frequency: 'monthly', paidOct: true },
  { id: 'pos-handy', name: 'Handy', categoryId: W, amount: 10, frequency: 'monthly', paidOct: true },
  { id: 'pos-lebensmittel', name: 'Lebensmittel & Co', categoryId: W, amount: 480, frequency: 'monthly', isVariable: true, paidOct: true },
  { id: 'pos-bk-1160', name: 'BK 1160', categoryId: W, amount: 87, frequency: 'monthly', paidOct: true },
  { id: 'pos-baurechtszins', name: 'Baurechtszins', categoryId: W, amount: 262.02, frequency: 'semiannual', dueMonths: [6, 12] },
  { id: 'pos-icloud', name: 'iCloud', categoryId: A, amount: 3, frequency: 'monthly', paidOct: true },
  { id: 'pos-gym', name: 'Gym', categoryId: A, amount: 35, frequency: 'monthly', paidOct: true },
  { id: 'pos-spotify', name: 'Spotify', categoryId: A, amount: 11, frequency: 'monthly', paidOct: true },
  { id: 'pos-claude', name: 'Claude', categoryId: A, amount: 22, frequency: 'monthly', paidOct: true },
  { id: 'pos-parqet', name: 'Parqet', categoryId: A, amount: 87, frequency: 'annual', dueMonths: [12], dueDay: 1 },
  { id: 'pos-depotentgelt', name: 'Depotentgelt', categoryId: B, amount: 35, frequency: 'quarterly', dueMonths: [1, 4, 7, 10], paidOct: false },
  { id: 'pos-kontofuehrung', name: 'Entgelt Kontoführung', categoryId: B, amount: 14, frequency: 'quarterly', dueMonths: [1, 4, 7, 10], paidOct: true },
  { id: 'pos-amex-gebuehr', name: 'Amex Gebühr', categoryId: B, amount: 690, frequency: 'annual', dueMonths: [10], dueDay: 3, paidOct: true, paidDay: 3 },
  { id: 'pos-amex-mr-turbo', name: 'Amex Membership Rewards Turbo', categoryId: B, amount: 15, frequency: 'annual', dueMonths: [9], dueDay: 28 },
  { id: 'pos-steuerberater', name: 'Steuerberater', categoryId: B, amount: 1260, frequency: 'annual', dueMonths: [2], dueDay: 14, isVariable: true, note: 'ca. 1.260' },
  { id: 'pos-offi', name: 'Offi (Jahreskarte)', categoryId: M, amount: 686, frequency: 'annual', dueMonths: [2] },
  { id: 'pos-cash', name: 'Cash', categoryId: I, amount: 400, frequency: 'monthly', paidOct: true },
  { id: 'pos-tr-sparplaene', name: 'TR Sparpläne', categoryId: I, amount: 400, frequency: 'monthly', paidOct: true },
];

const reminders: Reminder[] = [
  { id: 'rem-strom-gas', month: 11, text: 'Jahresabrechnung Strom/Gas/Wiener Netze' },
  { id: 'rem-bk-1220', month: 6, text: 'Jahresabrechnung BK 1220' },
];

/** Builds the initial dataset (Oct 2026 state of the old Apple Notes note). */
export function buildSeed(): Dataset {
  const positions: Position[] = rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    frequency: row.frequency,
    dueMonths: row.frequency === 'monthly' ? [...ALL_MONTHS] : row.dueMonths ?? [],
    dueDay: row.dueDay,
    isVariable: row.isVariable ?? false,
    note: row.note,
    amountHistory: [{ validFrom: SEED_PERIOD, amount: row.amount }],
    createdAt: SEED_CREATED_AT,
    sortOrder: index,
  }));

  const payments: Payment[] = rows
    .filter((row) => row.paidOct)
    .map((row) => ({
      id: `pay-${row.id}-${SEED_PERIOD}`,
      positionId: row.id,
      period: SEED_PERIOD,
      plannedAmount: row.amount,
      actualAmount: row.amount,
      paidAt: `${SEED_PERIOD}-${String(row.paidDay ?? 1).padStart(2, '0')}T08:00:00.000Z`,
    }));

  return {
    categories: categories.map((c) => ({ ...c })),
    positions,
    payments,
    oneOffs: [],
    income: [],
    reminders: reminders.map((r) => ({ ...r })),
  };
}
