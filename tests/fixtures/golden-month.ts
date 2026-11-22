// monat-ist-monat: golden scenario „Dein Monat“. Invented names and amounts only.
//   6 monthly + 3 Immo + 5 Abo positions paid directly; 1 direct position that starts 3 months later;
//   2 Vermögensaufbau positions; a semiannual and an annual Rücklage position; 2 one-time payments „nicht
//   eingeplant“, 1 one-time payment „nicht eingeplant“ from another source; 1 month with its own amount.
// The three periods: November 2026, December 2026, January 2027 (Neuer Monat beginnt am 25).
import { toKontoSettings, type KontoSettings } from '../../src/db/settings';
import type { Account, Dataset, PlanEntry, Position } from '../../src/lib/types';

export const P1 = '2026-11';
export const P2 = '2026-12';
export const P3 = '2027-01';
export const SPIELGELD = 300;
export const SALARY = 4000;

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
let order = 0;

function monthly(id: string, name: string, categoryId: string, amount: number, dueDay: number, account: Account = 'girokonto', validFrom = '2026-01'): Position {
  return { id, name, categoryId, history: [{ validFrom, amount, frequency: 'monthly', dueMonths: ALL, dueDay }], createdAt: '2026-01-01T08:00:00.000Z', sortOrder: order++, account };
}

function every(id: string, name: string, amount: number, frequency: PlanEntry['frequency'], dueMonths: number[], dueDay: number): Position {
  return { id, name, categoryId: 'g-ruecklage', history: [{ validFrom: '2026-01', amount, frequency, dueMonths, dueDay }], createdAt: '2026-01-01T08:00:00.000Z', sortOrder: order++, account: 'fixkostenkonto' };
}

function once(id: string, name: string, amount: number, dueDate: string, fromNet = true): Position {
  return {
    id,
    name,
    categoryId: 'g-freizeit',
    history: [{ validFrom: dueDate.slice(0, 7), amount, frequency: 'once', dueMonths: [Number(dueDate.slice(5, 7))], dueDay: Number(dueDate.slice(8)), dueDate }],
    createdAt: '2026-10-01T08:00:00.000Z',
    sortOrder: order++,
    account: 'spielgeld',
    ...(fromNet ? {} : { fromNet: false }),
  };
}

export function goldenDataset(): Dataset {
  order = 0;
  const strom = monthly('g-strom', 'Strom', 'g-wohnen', 80, 5);
  // the month with its own amount: December € 95, before and after € 80
  strom.history.push({ validFrom: P2, amount: 95, frequency: 'monthly', dueMonths: ALL, dueDay: 5, changedOn: '2026-12-01' }, { validFrom: P3, amount: 80, frequency: 'monthly', dueMonths: ALL, dueDay: 5, changedOn: '2027-01-01' });
  return {
    categories: [
      { id: 'g-wohnen', name: 'Wohnen', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
      { id: 'g-immo', name: 'Immobilie', kind: 'expense', color: '#2E2E8A', sortOrder: 1 },
      { id: 'g-abos', name: 'Abos', kind: 'expense', color: '#9494E8', sortOrder: 2 },
      { id: 'g-ruecklage', name: 'Versicherung & Steuer', kind: 'expense', color: '#52525B', sortOrder: 3 },
      { id: 'g-sparen', name: 'Sparen', kind: 'savings', color: '#27272A', sortOrder: 4 },
      { id: 'g-freizeit', name: 'Freizeit', kind: 'expense', color: '#A1A1AA', sortOrder: 5 },
    ],
    positions: [
      monthly('g-miete', 'Miete', 'g-wohnen', 900, 1),
      strom,
      monthly('g-internet', 'Internet', 'g-wohnen', 40, 10),
      monthly('g-handy', 'Handy', 'g-wohnen', 25, 15),
      monthly('g-haftpflicht', 'Haftpflicht', 'g-wohnen', 12, 20),
      monthly('g-essen', 'Lebensmittel', 'g-wohnen', 350, 28),
      monthly('g-kredit', 'Kredit', 'g-immo', 650, 1),
      monthly('g-betrieb', 'Betriebskosten', 'g-immo', 180, 3),
      monthly('g-verwaltung', 'Hausverwaltung', 'g-immo', 30, 10),
      monthly('g-stream', 'Streaming', 'g-abos', 13, 2),
      monthly('g-musik', 'Musik', 'g-abos', 11, 4),
      monthly('g-cloud', 'Cloud', 'g-abos', 3, 8),
      monthly('g-zeitung', 'Zeitung', 'g-abos', 15, 12),
      monthly('g-software', 'Software', 'g-abos', 9, 22),
      // starts three months after November: in none of the three periods
      monthly('g-fitness', 'Fitness', 'g-abos', 30, 6, 'girokonto', '2027-02'),
      monthly('g-etf', 'ETF-Sparplan', 'g-sparen', 300, 3),
      monthly('g-bauspar', 'Bausparen', 'g-sparen', 50, 15),
      every('g-kfz', 'Kfz-Versicherung', 360, 'semiannual', [6, 12], 1),
      every('g-steuer', 'Steuerberater', 600, 'annual', [1], 15),
      once('g-konzert', 'Konzert', 120, '2026-11-14'),
      once('g-fahrrad', 'Fahrrad', 450, '2026-12-05'),
      once('g-geschenk', 'Geschenk von Oma', 200, '2026-12-20', false),
    ],
    payments: [],
    oneOffs: [],
    monthClose: [
      { period: P1, netSalary: SALARY, updatedAt: '2026-10-25T08:00:00.000Z' },
      { period: P2, netSalary: SALARY, updatedAt: '2026-11-25T08:00:00.000Z' },
    ],
    reminders: [],
    changeLog: [],
  };
}

/** Set up, „Bei Fälligkeit“, nothing saved yet, this period's deposit not in yet, Spielgeld € 300. */
export function goldenSettings(extra: Partial<KontoSettings> = {}): KontoSettings {
  return toKontoSettings({
    enabled: true,
    setupDone: true,
    hasAccount: true,
    balance: 0,
    anchor: { amount: 0, at: '2026-10-20T08:00:00.000Z' },
    roundingOn: false,
    buffer: 0,
    planMode: 'due',
    spielgeld: SPIELGELD,
    ...extra,
  });
}
