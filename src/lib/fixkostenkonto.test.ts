import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBackup } from '../db/backup';
import { fixedCostsAvg } from './calc';
import { accountOf, kontoOverview, simulateKonto, standingOrder } from './fixkostenkonto';
import type { Account, Category, Dataset, Frequency, Payment, PlanEntry, Position } from './types';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Investieren', kind: 'savings', color: '#0F766E', sortOrder: 1 },
];

let n = 0;
function pos(
  name: string,
  amount: number,
  frequency: Frequency,
  dueMonths: number[] = ALL,
  opts: { categoryId?: string; validFrom?: string; account?: Account; fromNet?: false; history?: PlanEntry[]; dueDate?: string } = {},
): Position {
  const entry: PlanEntry = {
    validFrom: opts.validFrom ?? '2026-01',
    amount,
    frequency,
    dueMonths: frequency === 'monthly' ? ALL : dueMonths,
    ...(opts.dueDate ? { dueDate: opts.dueDate } : {}),
  };
  return {
    id: `p${++n}`,
    name,
    categoryId: opts.categoryId ?? 'fix',
    history: opts.history ?? [entry],
    createdAt: '2026-01-01T00:00:00.000Z',
    sortOrder: n,
    ...(opts.account ? { account: opts.account } : {}),
    ...(opts.fromNet === false ? { fromNet: false } : {}),
  };
}

function ds(positions: Position[], payments: Payment[] = []): Dataset {
  return { categories: CATS, positions, payments, oneOffs: [], monthClose: [], reminders: [], changeLog: [] };
}

function paid(p: Position, period: string, amount: number): Payment {
  return {
    id: `pay-${p.id}-${period}`,
    positionId: p.id,
    period,
    status: 'paid',
    plannedAmount: amount,
    actualAmount: amount,
    paidAt: `${period}-02T08:00:00.000Z`,
  };
}

const sim = (d: Dataset, active: string, balance = 0, received = false, rounding: 1 | 5 | 10 = 5) => {
  const order = standingOrder(d, active, rounding);
  return { order, s: simulateKonto(d, active, { balance, receivedThisMonth: received, deposit: order.amount }) };
};

describe('Dauerauftrag (F1)', () => {
  it('Monatsanteil: monatlich voll, Quartal ÷3, halbjährlich ÷6, jährlich ÷12', () => {
    const d = ds([
      pos('Miete', 1000, 'monthly'),
      pos('Konto', 30, 'quarterly', [1, 4, 7, 10]),
      pos('Zins', 60, 'semiannual', [6, 12]),
      pos('Vers', 120, 'annual', [3]),
    ]);
    const o = standingOrder(d, '2026-11', 1);
    expect(o.exact).toBe(1000 + 10 + 10 + 10);
    expect(o.amount).toBe(1030);
    expect(o.positions).toHaveLength(4);
  });

  it('Rundung nach oben auf 1 / 5 / 10 € (Standard 5 €)', () => {
    const d = ds([pos('A', 1001.2, 'monthly'), pos('B', 14, 'quarterly', [1, 4, 7, 10])]); // 1001,20 + 4,666… = 1005,8666…
    expect(standingOrder(d, '2026-11', 1).amount).toBe(1006);
    expect(standingOrder(d, '2026-11', 5).amount).toBe(1010);
    expect(standingOrder(d, '2026-11', 10).amount).toBe(1010);
    expect(standingOrder(d, '2026-11').amount).toBe(1010);
    expect(standingOrder(ds([pos('A', 1000, 'monthly')]), '2026-11', 10).amount).toBe(1000); // exakt: keine Rundung
  });

  it('Vermögensaufbau (Girokonto) und „nicht vom Netto“ zählen nicht; einmalige Zahlungen im Zeitraum anteilig', () => {
    const d = ds([
      pos('Miete', 1000, 'monthly'),
      pos('ETF', 400, 'monthly', ALL, { categoryId: 'va' }),
      pos('Mieteinnahme', 860, 'once', [11], { categoryId: 'va', fromNet: false, validFrom: '2026-11', dueDate: '2026-11-05' }),
      pos('Hotel', 600, 'once', [12], { validFrom: '2026-12', dueDate: '2026-12-10' }),
    ]);
    const o = standingOrder(d, '2026-11', 1);
    expect(o.exact).toBe(1000 + 600 / 12);
    expect(o.amount).toBe(1050);
    expect(o.cause).toEqual({ kind: 'once', name: 'Hotel', period: '2026-12', amount: 600, monthly: 50 });
  });

  it('Position auf Girokonto: Dauerauftrag sinkt um ihren Monatsanteil', () => {
    const vers = pos('Vers', 240, 'annual', [2]);
    const before = standingOrder(ds([pos('Miete', 1000, 'monthly'), vers]), '2026-11', 1).exact;
    const after = standingOrder(ds([pos('Miete', 1000, 'monthly'), { ...vers, account: 'girokonto' }]), '2026-11', 1).exact;
    expect(before - after).toBe(20);
  });

  it('VA-Position explizit aufs Fixkostenkonto gestellt zählt mit', () => {
    const d = ds([pos('ETF', 400, 'monthly', ALL, { categoryId: 'va', account: 'fixkostenkonto' })]);
    expect(standingOrder(d, '2026-11', 1).amount).toBe(400);
  });

  it('accountOf: ohne Feld Vermögensaufbau → Girokonto, sonst Fixkostenkonto', () => {
    const d = ds([]);
    expect(accountOf(d, pos('X', 1, 'monthly'))).toBe('fixkostenkonto');
    expect(accountOf(d, pos('Y', 1, 'monthly', ALL, { categoryId: 'va' }))).toBe('girokonto');
  });
});

describe('Simulation und Startlücke (F2, F3)', () => {
  it('leere Datenbank: Dauerauftrag 0, gedeckt, 12 Monate mit Stand 0', () => {
    const { order, s } = sim(ds([]), '2026-11');
    expect(order.amount).toBe(0);
    expect(s.months).toHaveLength(12);
    expect(s.months.every((m) => m.end === 0)).toBe(true);
    expect(s.gap).toBe(0);
    expect(s.rising).toBe(false);
  });

  it('nur monatliche Positionen: Startlücke 0', () => {
    const { s } = sim(ds([pos('Miete', 1000, 'monthly'), pos('Strom', 65, 'monthly')]), '2026-11');
    expect(s.gap).toBe(0);
    expect(s.months[0]!.deposit).toBe(1065);
    expect(s.months[0]!.debits).toBe(1065);
  });

  it('Jahreszahlung diesen Monat offen: volle Lücke = Betrag − ein Monatsanteil', () => {
    const { order, s } = sim(ds([pos('Vers', 1200, 'annual', [11])]), '2026-11', 0, false, 1);
    expect(order.amount).toBe(100);
    expect(s.months[0]!.end).toBe(-1100);
    expect(s.lowestPeriod).toBe('2026-11');
    expect(s.gap).toBe(1100);
  });

  it('Jahreszahlung diesen Monat schon abgehakt: zählt nicht mehr, Konto gedeckt', () => {
    const vers = pos('Vers', 1200, 'annual', [11]);
    const { s } = sim(ds([vers], [paid(vers, '2026-11', 1200)]), '2026-11', 0, false, 1);
    expect(s.months[0]!.debits).toBe(0);
    expect(s.gap).toBe(0);
  });

  it('Jahreszahlung nächsten Monat: zwei Einzahlungen vorher, Lücke = Betrag − 2 Monatsanteile', () => {
    const { s } = sim(ds([pos('Vers', 1200, 'annual', [12])]), '2026-11', 0, false, 1);
    expect(s.months[0]!.end).toBe(100);
    expect(s.months[1]!.end).toBe(-1000);
    expect(s.gap).toBe(1000);
  });

  it('Start im Dezember: Jahreswechsel, Februar-Zahlung nach 3 Einzahlungen', () => {
    const { s } = sim(ds([pos('Öffis', 1200, 'annual', [2])]), '2026-12', 0, false, 1);
    expect(s.months.map((m) => m.period).slice(0, 3)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(s.months[2]!.debits).toBe(1200);
    expect(s.months[2]!.end).toBe(-900);
    expect(s.months[11]!.period).toBe('2027-11');
    expect(s.gap).toBe(900);
  });

  it('gemischte Rhythmen: Monatsende-Stände Schritt für Schritt', () => {
    const d = ds([
      pos('Miete', 1000, 'monthly'),
      pos('Konto', 30, 'quarterly', [1, 4, 7, 10]),
      pos('Zins', 600, 'semiannual', [6, 12]),
      pos('Vers', 240, 'annual', [2]),
    ]);
    const { order, s } = sim(d, '2026-11', 0, false, 1);
    expect(order.amount).toBe(1000 + 10 + 100 + 20);
    // Nov +130 · Dez +130 − 600 · Jan +130 − 30 · Feb +130 − 240
    expect(s.months.slice(0, 4).map((m) => m.end)).toEqual([130, -340, -240, -350]);
    expect(s.gap).toBe(Math.max(0, -Math.min(...s.months.map((m) => m.end))));
    expect(s.months[1]!.items.map((i) => i.name)).toEqual(['Miete', 'Zins']);
  });

  it('Kontostand heute > 0 verkleinert die Lücke', () => {
    const d = ds([pos('Vers', 1200, 'annual', [12])]);
    expect(sim(d, '2026-11', 400, false, 1).s.gap).toBe(600);
    expect(sim(d, '2026-11', 1500, false, 1).s.gap).toBe(0);
  });

  it('Dauerauftrag diesen Monat schon eingegangen: keine zweite Einzahlung im aktiven Monat', () => {
    const d = ds([pos('Miete', 1000, 'monthly')]);
    const { s } = sim(d, '2026-11', 1000, true, 1);
    expect(s.months[0]!.deposit).toBe(0);
    expect(s.months[0]!.end).toBe(0);
    expect(s.months[1]!.deposit).toBe(1000);
    expect(s.gap).toBe(0);
    // nicht eingegangen, aber Stand schon drauf: doppelt gezählt → steigt
    expect(sim(d, '2026-11', 1000, false, 1).s.months[0]!.end).toBe(1000);
  });

  it('diesen Monat zählen nur offene Positionen', () => {
    const miete = pos('Miete', 1000, 'monthly');
    const strom = pos('Strom', 65, 'monthly');
    const { s } = sim(ds([miete, strom], [paid(miete, '2026-11', 1000)]), '2026-11', 0, true, 1);
    expect(s.months[0]!.debits).toBe(65);
    expect(s.months[0]!.items.map((i) => i.name)).toEqual(['Strom']);
    expect(s.months[1]!.debits).toBe(1065);
  });

  it('geplante Preiserhöhung im Zeitraum: Simulation rechnet ab dem Monat mit dem neuen Betrag', () => {
    const miete = pos('Miete', 1000, 'monthly', ALL, {
      history: [
        { validFrom: '2026-01', amount: 1000, frequency: 'monthly', dueMonths: ALL },
        { validFrom: '2027-03', amount: 1100, frequency: 'monthly', dueMonths: ALL, changedOn: '2027-03-01' },
      ],
    });
    const { order, s } = sim(ds([miete]), '2026-11', 0, false, 5);
    // Dezember 2026 – November 2027: 3 × 1.000 + 9 × 1.100 = 12.900 ÷ 12 = 1.075
    expect(order.exact).toBe(1075);
    expect(order.amount).toBe(1075);
    expect(order.cause).toEqual({ kind: 'change', name: 'Miete', period: '2027-03', amount: 1100, monthly: 75 });
    expect(s.months.find((m) => m.period === '2027-02')!.debits).toBe(1000);
    expect(s.months.find((m) => m.period === '2027-03')!.debits).toBe(1100);
    // bis Februar ein Polster (4 × 75 €), das März–Oktober (8 × −25 €) trägt: keine Startlücke
    expect(s.gap).toBe(0);
    expect(s.months.at(-1)!.end).toBe(100);
  });

  it('Vermögensaufbau- und „nicht vom Netto“-Positionen werden in der Simulation ignoriert', () => {
    const d = ds([
      pos('Miete', 1000, 'monthly'),
      pos('ETF', 400, 'monthly', ALL, { categoryId: 'va' }),
      pos('Mieteinnahme', 860, 'once', [11], { categoryId: 'va', fromNet: false, validFrom: '2026-11', dueDate: '2026-11-05', account: 'fixkostenkonto' }),
    ]);
    const { s } = sim(d, '2026-11', 0, false, 1);
    expect(s.months.every((m) => m.debits === 1000)).toBe(true);
    expect(s.gap).toBe(0);
  });

  it('einmalige Zahlung auf dem Fixkostenkonto erzeugt eine Startlücke', () => {
    const d = ds([pos('Miete', 1000, 'monthly'), pos('Hotel', 500, 'once', [12], { validFrom: '2026-12', dueDate: '2026-12-10' })]);
    const { s } = sim(d, '2026-11', 0, false, 1);
    expect(s.months[1]!.items.some((i) => i.once)).toBe(true);
    // Dauerauftrag 1.000 + 500 ÷ 12 → 1.042: zwei Einzahlungen à 42 € vor dem Dezember tragen einen Teil
    expect(s.gap).toBe(500 - 2 * 42);
  });

  it('Hinweis „steigt stark“: Dauerauftrag höher als nötig (Rundung bei kleinem Betrag)', () => {
    const { s } = sim(ds([pos('Gebühr', 1, 'monthly')]), '2026-11', 0, false, 10);
    expect(s.rising).toBe(true);
    expect(s.surplus).toBe(12 * 10 - 12);
    // Rundung allein (10 € bei 1.001 €) bleibt unter einer Monatseinzahlung pro Jahr: kein Hinweis
    expect(sim(ds([pos('Miete', 1001, 'monthly')]), '2026-11', 0, false, 10).s.rising).toBe(false);
  });

  it('auslaufende Position: zählt nur bis zu ihrem Ende, Konto steigt nicht mehr stark', () => {
    // Kredit bis Februar 2027 (archiviert ab März): im Zeitraum Dez–Feb, 3 × 500 €
    const kredit = { ...pos('Kredit', 500, 'monthly'), archivedAt: '2027-03-01T00:00:00.000Z' };
    const { order, s } = sim(ds([pos('Miete', 1000, 'monthly'), kredit]), '2026-11', 0, false, 1);
    expect(order.exact).toBe(1000 + (3 * 500) / 12);
    expect(order.amount).toBe(1125);
    expect(order.cause).toEqual({ kind: 'end', name: 'Kredit', period: '2027-02', amount: 0, monthly: -375 });
    expect(s.rising).toBe(false);
  });

  it('kontoOverview: „schon eingegangen“ gilt nur für den gespeicherten Monat', () => {
    const d = ds([pos('Miete', 1000, 'monthly')]);
    expect(kontoOverview(d, '2026-11', { balance: 0, receivedFor: '2026-11', rounding: 5 }).simulation.months[0]!.deposit).toBe(0);
    expect(kontoOverview(d, '2026-12', { balance: 0, receivedFor: '2026-11', rounding: 5 }).simulation.months[0]!.deposit).toBe(1000);
  });
});

describe('Dauerauftrag über die nächsten 12 Monate (Prompt A, F1)', () => {
  it('Zeitraum: die 12 Monate ab dem Folgemonat', () => {
    const o = standingOrder(ds([pos('Miete', 1000, 'monthly')]), '2026-11');
    expect([o.from, o.to]).toEqual(['2026-12', '2027-11']);
    expect(o.cause).toBeNull();
  });

  it('ohne Änderungen = Summe der heutigen Monatsanteile', () => {
    const d = ds([pos('Miete', 1000, 'monthly'), pos('Konto', 30, 'quarterly', [1, 4, 7, 10]), pos('Vers', 120, 'annual', [11])]);
    // die Jahreszahlung im November 2026 (aktiver Monat) fällt erst im November 2027 wieder in den Zeitraum
    expect(standingOrder(d, '2026-11', 1).exact).toBe(1000 + 10 + 10);
    expect(standingOrder(d, '2026-11', 1).cause).toBeNull();
  });

  it('startende Position: zählt ab ihrem ersten Monat', () => {
    const neu = pos('Fitness', 60, 'monthly', ALL, { validFrom: '2027-06' });
    const o = standingOrder(ds([pos('Miete', 1000, 'monthly'), neu]), '2026-11', 1);
    // Juni–November 2027: 6 × 60 €
    expect(o.exact).toBe(1000 + 30);
    expect(o.cause).toEqual({ kind: 'start', name: 'Fitness', period: '2027-06', amount: 0, monthly: 30 });
  });

  it('geplante Senkung: Dauerauftrag sinkt anteilig, Hinweis „Weniger“', () => {
    const strom = pos('Strom', 120, 'monthly', ALL, {
      history: [
        { validFrom: '2026-01', amount: 120, frequency: 'monthly', dueMonths: ALL },
        { validFrom: '2027-06', amount: 96, frequency: 'monthly', dueMonths: ALL, changedOn: '2027-06-01' },
      ],
    });
    const o = standingOrder(ds([strom]), '2026-11', 1);
    expect(o.exact).toBe((6 * 120 + 6 * 96) / 12);
    expect(o.cause).toMatchObject({ kind: 'change', period: '2027-06', amount: 96, monthly: -12 });
  });

  it('größte Ursache gewinnt, wenn mehrere Änderungen anstehen', () => {
    const miete = pos('Miete', 1000, 'monthly', ALL, {
      history: [
        { validFrom: '2026-01', amount: 1000, frequency: 'monthly', dueMonths: ALL },
        { validFrom: '2027-01', amount: 1060, frequency: 'monthly', dueMonths: ALL, changedOn: '2027-01-01' },
      ],
    });
    const neu = pos('Fitness', 60, 'monthly', ALL, { validFrom: '2027-06' });
    // Miete +55/Monat (11 × 60 ÷ 12), Fitness +30/Monat
    expect(standingOrder(ds([miete, neu]), '2026-11', 1).cause).toMatchObject({ kind: 'change', name: 'Miete' });
  });

  it('übersprungener Monat zählt nicht', () => {
    const miete = pos('Miete', 1000, 'monthly');
    const skip: Payment = {
      id: 'skip',
      positionId: miete.id,
      period: '2027-01',
      status: 'skipped',
      plannedAmount: 1000,
      actualAmount: 0,
      paidAt: '2027-01-02T08:00:00.000Z',
    };
    expect(standingOrder(ds([miete], [skip]), '2026-11', 1).exact).toBe((11 * 1000) / 12);
  });
});

describe('echte Daten (beispiel-2026-10-29.json)', () => {
  const live = parseBackup(JSON.parse(readFileSync('tests/fixtures/beispiel-2026-10-29.json', 'utf8')));
  const d: Dataset = { ...live.data };

  it('Dauerauftrag = Abbuchungen Dezember 2026 – November 2027 ÷ 12 (alle Positionen standardmäßig auf dem Fixkostenkonto)', () => {
    const o = standingOrder(d, '2026-11', 1);
    const sum = kontoOverview(d, '2026-11', { balance: 0, receivedFor: null, rounding: 1 }).simulation;
    // dieselben Abbuchungen wie die Simulation, nur um einen Monat verschoben (Dezember – Oktober + November 2027)
    const nov27 = simulateKonto(d, '2027-11', { balance: 0, receivedThisMonth: false, deposit: 0 }, 1).months[0]!;
    const total = sum.months.slice(1).reduce((a, m) => a + m.debits, 0) + nov27.debits;
    expect(o.exact).toBeCloseTo(total / 12, 6);
    // ohne Änderungen im Zeitraum wäre es der Ø pro Monat; die Fixture hat welche (Kredit + € 25 ab Jänner 2027)
    expect(o.exact).not.toBeCloseTo(fixedCostsAvg(d, '2026-11'), 2);
  });

  it('Abbuchungsmonate: Dezember (Baurechtszins, Parqet) und Februar (Öffis, Steuerberater)', () => {
    const s = kontoOverview(d, '2026-11', { balance: 0, receivedFor: null, rounding: 5 }).simulation;
    const names = (p: string) => s.months.find((m) => m.period === p)!.items.map((i) => i.name);
    expect(names('2026-12')).toEqual(expect.arrayContaining(['Baurechtszins Nord', 'Parqet']));
    expect(names('2027-02')).toEqual(expect.arrayContaining(['Öffis', 'Steuerberater']));
  });
});
