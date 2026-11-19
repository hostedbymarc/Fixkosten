// „So funktioniert Erbse“ (walkthrough): the card texts from kontoState, with rebuilt data (no real
// data): Miete € 2.500 monthly, Kfz-Versicherung € 3.200 and Haushaltsversicherung € 1.840 in February.
import { describe, expect, it } from 'vitest';
import { DEFAULT_KONTO, storedKonto, toKontoSettings, type KontoSettings } from '../db/settings';
import { kontoState } from './kontoBalance';
import { KONTO_TEXTS, sentences, t, wordCount } from './kontoTexts';
import type { Category, Dataset, Position } from './types';
import { askDay, EXAMPLE, walkthrough, type Walkthrough } from './walkthrough';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CATS: Category[] = [{ id: 'fix', name: 'Fixkosten', kind: 'expense', color: '#5B5BD6', sortOrder: 0 }];
const pos = (id: string, name: string, amount: number, dueMonths = ALL): Position => ({
  id,
  name,
  categoryId: 'fix',
  history: [{ validFrom: '2026-01', amount, frequency: dueMonths.length === 12 ? 'monthly' : 'annual', dueMonths }],
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
});
const DATA: Dataset = {
  categories: CATS,
  positions: [pos('miete', 'Miete', 2500), pos('kfz', 'Kfz-Versicherung', 3200, [2]), pos('haushalt', 'Haushaltsversicherung', 1840, [2])],
  // the rent of November is already paid: the bars still count it (the whole month)
  payments: [{ id: 'p1', positionId: 'miete', period: '2026-11', status: 'paid', plannedAmount: 2500, actualAmount: 2500, paidAt: '2026-11-03T08:00:00.000Z' }],
  oneOffs: [],
  monthClose: [],
  reminders: [],
  changeLog: [],
};
const NOV = '2026-11';
const TODAY = new Date(2026, 10, 17);
const setUp = (patch: Partial<KontoSettings> = {}) =>
  toKontoSettings({
    enabled: true,
    balance: 5192.57,
    rounding: 5,
    setupDone: true,
    hasAccount: false,
    receivedFor: NOV,
    anchor: { amount: 5192.57, at: '2026-11-01T09:00:00.000Z' },
    ...patch,
  });
// amounts are formatted with a no-break space („€ 2.920“): compared with a plain one
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v).replace(/\u00a0/g, ' '));
const cards = (patch: Partial<KontoSettings> = {}, start: 1 | 25 | 'last' = 1) => plain(walkthrough(kontoState(DATA, NOV, setUp(patch), start), NOV, start, TODAY));
const allSentences = (w: Walkthrough) => [w.card1, w.card2, ...w.card4, w.card5].flatMap(sentences);

describe('Walkthrough: Karten 1 und 2 aus kontoState', () => {
  it('Balken: alle Abbuchungen der 12 Monate, auch schon bezahlte', () => {
    const w = cards();
    expect(w.example).toBe(false);
    expect(w.bars).toHaveLength(12);
    expect(w.bars[0]).toEqual({ period: '2026-11', amount: 2500 });
    expect(w.bars.map((b) => b.amount)).toEqual([2500, 2500, 2500, 7540, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]);
    // the simulation itself still counts only what is open this month
    expect(kontoState(DATA, NOV, setUp()).overview.simulation.months[0]!.debits).toBe(0);
  });

  it('teuerster und günstigster Monat (bei Gleichstand der erste)', () => {
    const w = cards();
    expect([w.maxIndex, w.minIndex]).toEqual([3, 0]);
    expect(w.card1).toBe('Im Februar zahlst du € 7.540, im November nur € 2.500.');
  });

  it('Karte 2: der Grundbetrag', () => {
    const w = cards();
    expect(w.base).toBe(2920);
    expect(w.card2).toBe('Das sind € 2.920 pro Monat. Teure Monate gleicht dein Topf aus.');
  });
});

describe('Walkthrough: Karte 4 je nach Lücke', () => {
  it('mit Lücke, verteilt', () => {
    expect(cards({ gapMode: 'spread' }).card4).toEqual([
      'Im Februar kommen Kfz-Versicherung und Haushaltsversicherung. Dein Topf ist bis dahin noch nicht voll.',
      'Darum bis dahin € 395,81 extra pro Monat. Das fällt nur einmal an.',
    ]);
  });

  it('mit Lücke, auf einmal', () => {
    expect(cards({ gapMode: 'lump' }).card4).toEqual([
      'Im Februar kommen Kfz-Versicherung und Haushaltsversicherung. Dein Topf ist bis dahin noch nicht voll.',
      'Darum einmalig € 1.187,43 bis 31. Jänner. Das fällt nur einmal an.',
    ]);
  });

  it('ohne Lücke', () => {
    expect(cards({ balance: 20000, anchor: { amount: 20000, at: '2026-11-01T09:00:00.000Z' } }).card4).toEqual(['Bei dir reicht es schon. Gut gemacht.']);
  });

  it('auf einmal, Frist vorbei: „jetzt“', () => {
    const st = kontoState(DATA, NOV, setUp({ gapMode: 'lump' }));
    const late = plain(walkthrough(st, NOV, 1, new Date(2027, 1, 5)));
    expect(late.card4[1]).toBe('Darum jetzt einmalig € 1.187,43. Das fällt nur einmal an.');
  });
});

describe('Walkthrough: Karte 5, Tag der Frage', () => {
  it('aus „Neuer Monat beginnt am“', () => {
    expect(cards({}, 1).card5).toBe('Am 1. fragt Erbse, ob du den Betrag zur Seite gelegt hast. Den Rest rechnet Erbse.');
    expect(cards({}, 25).card5.startsWith('Am 25. fragt Erbse')).toBe(true);
    expect(askDay('last')).toBe('Monatsletzten');
  });
});

describe('Walkthrough ohne Einrichtung: Beispielzahlen', () => {
  for (const [name, state] of [
    ['kein Zustand', null],
    ['nicht eingerichtet', kontoState(DATA, NOV, toKontoSettings({ enabled: true }))],
  ] as const) {
    it(name, () => {
      const w = plain(walkthrough(state, NOV, 1, TODAY));
      expect(w.example).toBe(true);
      expect(w.bars.map((b) => b.amount)).toEqual([...EXAMPLE.bills]);
      expect(w.card1).toBe('Im Jänner zahlst du € 900, im November nur € 180.');
      expect(w.card2).toBe('Das sind € 298,34 pro Monat. Teure Monate gleicht dein Topf aus.');
      expect(w.card4).toEqual([
        'Im Jänner kommen Kfz-Versicherung und Haushaltsversicherung. Dein Topf ist bis dahin noch nicht voll.',
        'Darum bis dahin € 121,66 extra pro Monat. Das fällt nur einmal an.',
      ]);
    });
  }

  it('die Beispielzahlen passen zusammen: Grundbetrag = Summe ÷ 12, Lücke auf 3 Einzahlungen', () => {
    const sum = EXAMPLE.bills.reduce((a, b) => a + b, 0);
    expect(EXAMPLE.base).toBe(Math.ceil((sum / 12) * 100) / 100);
    let balance = 0;
    let lowest = 0;
    for (const bill of EXAMPLE.bills) lowest = Math.min(lowest, (balance += EXAMPLE.base - bill));
    expect(Math.round(-lowest * 100) / 100).toBe(364.98);
    expect(EXAMPLE.extra).toBe(Math.ceil(36498 / 3) / 100);
  });
});

describe('Walkthrough: höchstens 12 Wörter pro Satz, Du-Form', () => {
  const cases: [string, Walkthrough][] = [
    ['verteilt', cards({ gapMode: 'spread' })],
    ['auf einmal', cards({ gapMode: 'lump' })],
    ['ohne Lücke', cards({ balance: 20000, anchor: { amount: 20000, at: '2026-11-17T09:00:00.000Z' } })],
    ['Beispiel', walkthrough(null, NOV, 1, TODAY)],
    ['Monatsletzter', cards({}, 'last')],
  ];
  for (const [name, w] of cases) {
    it(name, () => {
      for (const s of allSentences(w)) {
        expect(wordCount(s), s).toBeLessThanOrEqual(12);
        expect(s).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
      }
    });
  }
  it('alle festen Texte der Karten', () => {
    const ids = Object.keys(KONTO_TEXTS).filter((id) => id.startsWith('walk.') || id.startsWith('hero.pot'));
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) for (const s of sentences(t(id as keyof typeof KONTO_TEXTS))) expect(wordCount(s), s).toBeLessThanOrEqual(12);
  });
});

describe('walkthroughSeen: nur additiv im Einstellungs-Eintrag', () => {
  it('Standard aus, gespeichert nur wenn gesehen, Roundtrip', () => {
    expect(DEFAULT_KONTO.walkthroughSeen).toBe(false);
    expect(toKontoSettings({ enabled: true, balance: 0, receivedFor: null, rounding: 5 }).walkthroughSeen).toBe(false);
    const seen = setUp({ walkthroughSeen: true });
    expect(storedKonto(seen).walkthroughSeen).toBe(true);
    expect('walkthroughSeen' in storedKonto(setUp())).toBe(false);
    expect(toKontoSettings(storedKonto(seen))).toEqual(seen);
  });
});
