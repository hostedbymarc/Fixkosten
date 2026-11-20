// monat-verdichtet: monthPlan() with data like yours (rebuilt, no real data): Netto € 8.302, Lebensmittel € 480
// direct, Vermögensaufbau € 800, Spielgeld € 1.200, bills of the Fixkostenkonto in December € 2.541,03 (with the
// Baurechtszins € 262) and in February € 4.602,70 (Steuerberater € 1.260, Öffis € 686), Rücklage € 142.
import { describe, expect, it } from 'vitest';
import { storedKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { kontoState } from './kontoBalance';
import { floor50, inclLine, monthPlan, planModeOf, setupAccount } from './monthPlan';
import type { Account, Category, Dataset, Position } from './types';

const DEC = '2026-12';
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [
  { id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 },
  { id: 'va', name: 'Vermögensaufbau', kind: 'savings', color: '#5B5BD6', sortOrder: 1 },
];
const pos = (id: string, amount: number, opts: { months?: number[]; account?: Account; cat?: string; saving?: Position['saving'] } = {}): Position => ({
  id,
  name: id,
  categoryId: opts.cat ?? 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: (opts.months ?? ALL).length === 12 ? 'monthly' : 'annual', dueMonths: opts.months ?? ALL }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
  ...(opts.account ? { account: opts.account } : {}),
  ...(opts.saving ? { saving: opts.saving } : {}),
});
// monthly bills of the account € 2.279,03; December + Baurechtszins = € 2.541,03; February + € 2.323,67 = € 4.602,70
const POSITIONS = [
  pos('Wohnen', 2279.03),
  pos('Baurechtszins', 262, { months: [12] }),
  pos('Steuerberater', 1260, { months: [2] }),
  pos('Öffis', 686, { months: [2] }),
  pos('Haushaltsversicherung', 377.67, { months: [2] }),
  pos('Lebensmittel', 480, { account: 'girokonto' }),
  pos('ETF', 800, { cat: 'va' }),
];
const data = (positions: Position[] = POSITIONS, salary: number | null = 8302): Dataset => ({
  categories: CATS,
  positions,
  payments: [],
  oneOffs: [],
  monthClose: salary === null ? [] : [{ period: DEC, netSalary: salary, updatedAt: '2026-12-01T00:00:00.000Z' }],
  reminders: [],
  changeLog: [],
});
const settings = (patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance: 142,
    rounding: 5,
    roundingOn: false,
    setupDone: true,
    hasAccount: true,
    receivedFor: null,
    anchor: { amount: 142, at: '2026-12-01T08:00:00.000Z' },
    spielgeld: 1200,
    planMode: 'due',
    ...patch,
  });
const month = (plan: ReturnType<typeof monthPlan>, period: string) => plan.months.find((m) => m.period === period)!;

describe('monthPlan: „Bei Fälligkeit“ mit deinen Zahlen', () => {
  const plan = monthPlan(data(), DEC, settings());

  it('das nächste Gehalt ist Dezember, 12 Gehälter bis November', () => {
    expect(plan.first.period).toBe(DEC);
    expect(plan.months.map((m) => m.period)).toEqual([
      '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11',
    ]);
    expect(plan.first.salary).toBe(8302);
    expect(plan.first.estimated).toBe(false);
  });

  it('Februar: aufs Konto € 4.602,70, frei € 2.419,30', () => {
    const feb = month(plan, '2027-02');
    expect(feb.transfer).toBe(4602.7);
    expect(feb.direct).toBe(480);
    expect(feb.wealth).toBe(800);
    expect(feb.free).toBe(2419.3);
    expect(feb.estimated).toBe(true);
  });

  it('Baurechtszins: € 142 schon angespart · Dezember noch € 120', () => {
    const bz = plan.payments.find((p) => p.name === 'Baurechtszins')!;
    expect(bz).toMatchObject({ period: DEC, amount: 262, saved: 142, rest: 120, mode: 'due' });
    // December: the monthly bills and the rest of the Baurechtszins
    expect(plan.first.transfer).toBe(2399.03);
    expect(plan.first.bills).toBe(2541.03);
    expect(plan.first.due.map((p) => p.name)).toEqual(['Baurechtszins']);
    expect(plan.first.free).toBe(4622.97);
  });

  it('ein normaler Monat: nur die monatlichen Rechnungen', () => {
    expect(month(plan, '2027-01').transfer).toBe(2279.03);
    expect(month(plan, '2027-01').free).toBe(4742.97);
  });

  it('Antwort „Passt so“, empfohlen „Bei Fälligkeit“', () => {
    expect(plan.lowestFree).toBe(2419.3);
    expect(plan.fits).toBe(true);
    expect(plan.answer).toEqual({ kind: 'ok' });
    expect(plan.recommended).toBe('due');
  });

  it('die großen Zahlungen nach Datum', () => {
    expect(plan.payments.map((p) => `${p.name} ${p.period}`)).toEqual([
      'Baurechtszins 2026-12',
      'Steuerberater 2027-02',
      'Öffis 2027-02',
      'Haushaltsversicherung 2027-02',
    ]);
  });

  it('Nächster großer Monat: Februar mit Steuerberater und Öffis, vorbereitet', () => {
    expect(plan.bigMonth).toMatchObject({ period: '2027-02', total: 4602.7, ready: true });
    expect(plan.bigMonth!.top.map((p) => p.name)).toEqual(['Steuerberater', 'Öffis']);
  });

  it('der Verlauf der Rücklage geht nie unter 0', () => {
    expect(plan.simulation.months.every((m) => m.end >= 0)).toBe(true);
    expect(plan.simulation.months[0]!.deposit).toBe(2399.03);
  });
});

describe('monthPlan: Spielgeld € 3.000 und mehr', () => {
  it('€ 3.000: „Passt, wenn du ansparst“ – Steuerberater ab Dezember mit € 420 im Monat', () => {
    const plan = monthPlan(data(), DEC, settings({ spielgeld: 3000 }));
    expect(plan.fits).toBe(false);
    expect(month(plan, '2027-02').short).toBe(true);
    expect(plan.answer).toEqual({
      kind: 'save',
      via: 'custom',
      proposals: [{ positionId: 'Steuerberater', name: 'Steuerberater', period: '2027-02', start: DEC, rates: 3, rate: 420 }],
    });
  });

  it('der Vorschlag übernommen: „Eigener Plan“ passt', () => {
    const plan = monthPlan(data(), DEC, settings({ spielgeld: 3000, planMode: 'custom' }), 1, {
      savings: { Steuerberater: { mode: 'spread', startMonth: DEC } },
    });
    expect(plan.answer).toEqual({ kind: 'ok' });
    const st = plan.payments.find((p) => p.name === 'Steuerberater')!;
    expect(st).toMatchObject({ mode: 'spread', start: DEC, rates: 3, rate: 420 });
    expect(month(plan, '2027-02').transfer).toBe(3762.7);
    expect(month(plan, '2027-02').free).toBe(3259.3);
    expect(plan.first.transfer).toBe(2819.03);
  });

  it('€ 4.500: „Geht nicht ganz“ mit dem höchsten Spielgeld, abgerundet auf € 50', () => {
    const plan = monthPlan(data(), DEC, settings({ spielgeld: 4500 }));
    expect(plan.answer?.kind).toBe('max');
    const answer = plan.answer as Extract<typeof plan.answer, { kind: 'max' }>;
    // the best plan: every big payment saved up from December (December then needs € 3.173,59 → frei € 3.848,41)
    const best = monthPlan(data(), DEC, settings({ spielgeld: 4500 }), 1, { mode: answer.via.mode, savings: answer.via.savings });
    expect(answer.max).toBe(floor50(best.lowestFree!));
    expect(answer.max).toBeGreaterThanOrEqual(3800);
    expect(answer.max % 50).toBe(0);
    // with the maximum as Spielgeld that plan keeps it
    const atMax = monthPlan(data(), DEC, settings({ spielgeld: answer.max }), 1, { mode: answer.via.mode, savings: answer.via.savings });
    expect(atMax.fits).toBe(true);
  });

  it('kein Spielgeld: keine Antwort, aber eine Empfehlung', () => {
    const plan = monthPlan(data(), DEC, settings({ spielgeld: null }));
    expect(plan.answer).toBeNull();
    expect(plan.fits).toBeNull();
    expect(plan.recommended).toBe('due');
  });
});

describe('monthPlan: „Gleichmäßig“ ist kontoState', () => {
  const s = settings({ planMode: 'even' });
  const plan = monthPlan(data(), DEC, s);
  const state = kontoState(data(), DEC, { ...s, gapMode: 'spread' });

  it('aufs Konto = Betrag von kontoState, frei = Netto − T − Direkt − Vermögensaufbau', () => {
    for (const m of plan.months.slice(0, state.months.length)) {
      expect(m.transfer).toBe(state.months.find((x) => x.period === m.period)!.amount);
      expect(m.free).toBe(Math.round((8302 - m.transfer - 480 - 800) * 100) / 100);
    }
    expect(plan.payments.every((p) => p.mode === 'even')).toBe(true);
  });

  it('der Verlauf ist der von kontoState', () => {
    expect(plan.simulation).toEqual(state.planSimulation);
  });
});

describe('monthPlan: „Gleichmäßig“, das Geld fehlt schon jetzt', () => {
  it('der Einmalbetrag kommt ins erste Gehalt des Plans („Leg jetzt … extra zur Seite“)', () => {
    // December is in already, nothing set aside: December's bills cannot be paid – at once
    const s = settings({ planMode: 'even', balance: 0, anchor: { amount: 0, at: '2026-12-01T08:00:00.000Z' }, receivedFor: DEC });
    const state = kontoState(data(), DEC, { ...s, gapMode: 'spread' });
    expect(state.mode).toBe('lump');
    const plan = monthPlan(data(), DEC, s);
    expect(plan.first.period).toBe('2027-01');
    const jan = state.months.find((m) => m.period === '2027-01')!.amount;
    expect(plan.first.transfer).toBe(Math.round((jan + state.lump) * 100) / 100);
    expect(month(plan, '2027-02').transfer).toBe(state.months.find((m) => m.period === '2027-02')!.amount);
  });
});

describe('monthPlan: „Eigener Plan“', () => {
  it('Startmonat wählbar: Öffis ab Jänner in 2 Raten', () => {
    const plan = monthPlan(data(), DEC, settings({ planMode: 'custom' }), 1, { savings: { Öffis: { mode: 'spread', startMonth: '2027-01' } } });
    const o = plan.payments.find((p) => p.name === 'Öffis')!;
    expect(o).toMatchObject({ mode: 'spread', start: '2027-01', rates: 2, rate: 343 });
    expect(month(plan, '2027-01').rates).toBe(343);
    expect(month(plan, '2027-01').transfer).toBe(2622.03);
    // 4.602,70 − 686 + 343
    expect(month(plan, '2027-02').transfer).toBe(4259.7);
  });

  it('gespeicherte Einstellung der Position zählt', () => {
    const positions = POSITIONS.map((p) => (p.id === 'Öffis' ? { ...p, saving: { mode: 'spread' as const } } : p));
    const plan = monthPlan(data(positions), DEC, settings({ planMode: 'custom' }));
    expect(plan.payments.find((p) => p.name === 'Öffis')).toMatchObject({ mode: 'spread', start: DEC, rates: 3, rate: 228.67 });
  });

  it('ohne Einstellung zahlt der Eigene Plan bei Fälligkeit', () => {
    const custom = monthPlan(data(), DEC, settings({ planMode: 'custom' }));
    const due = monthPlan(data(), DEC, settings({ planMode: 'due' }));
    expect(custom.months.map((m) => m.transfer)).toEqual(due.months.map((m) => m.transfer));
  });
});

describe('monthPlan: angespartes Geld in Datumsreihenfolge', () => {
  it('€ 1.000 angespart: Baurechtszins ganz, dann € 738 für den Steuerberater', () => {
    const plan = monthPlan(data(), DEC, settings({ balance: 1000, anchor: { amount: 1000, at: '2026-12-01T08:00:00.000Z' } }));
    const [bz, st, oe] = plan.payments;
    expect(bz).toMatchObject({ name: 'Baurechtszins', saved: 262, rest: 0 });
    expect(st).toMatchObject({ name: 'Steuerberater', saved: 738, rest: 522 });
    expect(oe).toMatchObject({ name: 'Öffis', saved: 0, rest: 686 });
    expect(plan.first.transfer).toBe(2279.03);
    // 2.279,03 + 522 + 686 + 377,67
    expect(month(plan, '2027-02').transfer).toBe(3864.7);
  });

  it('der Dezember ist schon überwiesen: erst die offenen Rechnungen des Dezembers', () => {
    // December's deposit is in: the balance pays December's open bills, the rest goes to the big payments
    const plan = monthPlan(data(), DEC, settings({ balance: 3000, anchor: { amount: 3000, at: '2026-12-01T08:00:00.000Z' }, receivedFor: DEC }));
    expect(plan.first.period).toBe('2027-01');
    // 3000 − 2541,03 (December, open) = 458,97 → Steuerberater
    expect(plan.payments[0]).toMatchObject({ name: 'Steuerberater', saved: 458.97 });
  });
});

describe('monthPlan: fehlendes Netto', () => {
  it('ohne Netto im Monat: das zuletzt eingetragene, ohne Hinweis (kein „geschätzt“ in der App)', () => {
    const ds = { ...data(), monthClose: [{ period: '2026-11', netSalary: 8000, updatedAt: '2026-11-01T00:00:00.000Z' }] };
    const plan = monthPlan(ds, DEC, settings());
    expect(plan.first).toMatchObject({ salary: 8000, estimated: true });
    expect(plan.noSalary).toBe(false);
  });

  it('ganz ohne Netto: keine Antwort, kein F', () => {
    const plan = monthPlan(data(POSITIONS, null), DEC, settings());
    expect(plan.noSalary).toBe(true);
    expect(plan.first.free).toBeNull();
    expect(plan.answer).toBeNull();
    expect(plan.recommended).toBeNull();
    // what goes to the account is still known
    expect(plan.first.transfer).toBe(2399.03);
  });
});

describe('Eigenes Konto ja / nein', () => {
  const kinds = (p: Position) => (p.categoryId === 'va' ? 'savings' : 'expense');
  it('ja: alles auf die Rücklage, Vermögensaufbau direkt', () => {
    const accounts = POSITIONS.map((p) => setupAccount({ ...p, account: undefined }, kinds(p), true));
    expect(accounts).toEqual(['fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'girokonto']);
  });
  it('nein: monatliche direkt, alle anderen auf die Rücklage', () => {
    const accounts = POSITIONS.map((p) => setupAccount({ ...p, account: undefined }, kinds(p), false));
    expect(accounts).toEqual(['girokonto', 'fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'fixkostenkonto', 'girokonto', 'girokonto']);
  });
  it('gespeicherte Zuordnungen bleiben', () => {
    expect(setupAccount(pos('x', 1, { account: 'fixkostenkonto' }), 'expense', false)).toBeNull();
  });
  it('„Zur Seite legen“ ohne eigenes Konto: dieselben Zahlen', () => {
    const yes = monthPlan(data(), DEC, settings());
    const no = monthPlan(data(), DEC, settings({ hasAccount: false }));
    expect(no.hasAccount).toBe(false);
    expect(yes.hasAccount).toBe(true);
    expect(no.months.map((m) => m.transfer)).toEqual(yes.months.map((m) => m.transfer));
  });
});

describe('Migration gapMode → planMode', () => {
  it('„auf einmal“ → due, „verteilt“ → even, nie gefragt → even', () => {
    expect(planModeOf(toKontoSettings({ gapMode: 'lump' }))).toBe('due');
    expect(planModeOf(toKontoSettings({ gapMode: 'spread' }))).toBe('even');
    expect(planModeOf(toKontoSettings({}))).toBe('even');
  });
  it('ein gespeicherter planMode gewinnt', () => {
    expect(planModeOf(toKontoSettings({ gapMode: 'lump', planMode: 'custom' }))).toBe('custom');
  });
  it('alte Einträge bleiben Byte für Byte gleich, planMode nur additiv', () => {
    const old = { enabled: true, inviteDismissed: false, balance: 142, receivedFor: null, rounding: 5, gapMode: 'lump' };
    expect(storedKonto(toKontoSettings(old))).toEqual(old);
    expect(storedKonto(toKontoSettings({ ...old, planMode: 'due' }))).toEqual({ ...old, planMode: 'due' });
    expect(toKontoSettings({ planMode: 'weird' }).planMode).toBeNull();
  });
});

describe('„inkl. …“ unter ① (monat-feinschliff)', () => {
  it('Gleichmäßig: das Extra für den knappen Monat und seine großen Zahlungen', () => {
    const plan = monthPlan(data(), DEC, settings({ planMode: 'even' }));
    expect(plan.first.extra).toBeGreaterThan(0);
    const line = inclLine(plan)!;
    expect(line.amount).toBe(plan.first.extra);
    expect(line.month).toBe('2027-02');
    expect(line.names).toEqual(['Steuerberater', 'Öffis', 'Haushaltsversicherung']);
  });
  it('Gleichmäßig: nicht die nächste fällige Zahlung (Baurechtszins im Dezember)', () => {
    const line = inclLine(monthPlan(data(), DEC, settings({ planMode: 'even' })))!;
    expect(line.names).not.toContain('Baurechtszins');
  });
  it('Bei Fälligkeit: nur wenn diesen Monat eine große Zahlung fällig ist – Baurechtszins mit dem Rest', () => {
    const line = inclLine(monthPlan(data(), DEC, settings({ planMode: 'due' })))!;
    expect(line).toEqual({ amount: 120, month: null, names: ['Baurechtszins'] });
  });
  it('Bei Fälligkeit: ohne große Zahlung im Monat keine Zeile', () => {
    // January: only the monthly bills (the card shows the next salary – here January, December is in)
    const plan = monthPlan(data(), DEC, settings({ planMode: 'due', balance: 3000, anchor: { amount: 3000, at: '2026-12-01T08:00:00.000Z' }, receivedFor: DEC }));
    expect(plan.first.period).toBe('2027-01');
    expect(inclLine(plan)).toBeNull();
  });
  it('Eigener Plan: die Raten dieses Monats, für den Monat der angesparten Zahlung', () => {
    const plan = monthPlan(data(), DEC, settings({ planMode: 'custom' }), 1, { savings: { Steuerberater: { mode: 'spread', startMonth: DEC } } });
    expect(inclLine(plan)).toEqual({ amount: 420, month: '2027-02', names: ['Steuerberater'] });
  });
});
