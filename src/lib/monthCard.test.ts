// monat-ist-monat: monthCard() and monthPlan.current – the special cases beside the golden test.
import { describe, expect, it } from 'vitest';
import { goldenDataset, goldenSettings, P1, P2, P3 } from '../../tests/fixtures/golden-month';
import { dueItems } from './calc';
import { monthCard, monthDeviation, usualAmount } from './monthCard';
import { monthPlan } from './monthPlan';
import { KONTO_TEXTS } from './kontoTexts';
import type { Dataset } from './types';

const NOV10 = new Date(2026, 10, 10);
const DEC10 = new Date(2026, 11, 10);

describe('① nach der Überweisung: weiter der aktive Zeitraum', () => {
  it('Bei Fälligkeit: Dezember überwiesen → ① bleibt die Kfz-Versicherung, „Dein Plan“ beginnt im Jänner', () => {
    const ds = goldenDataset();
    const s = goldenSettings({ checks: [{ period: P2, deposited: true, answeredAt: '2026-11-26T08:00:00.000Z', amount: 360 }] });
    const plan = monthPlan(ds, P2, s, 25);
    expect(plan.first.period).toBe(P3);
    expect(plan.current.period).toBe(P2);
    expect(plan.current.transfer).toBe(360);
    expect(monthCard(ds, P2, plan, 25, DEC10).reserve.total).toBe(360);
  });

  it('Gleichmäßig: ① ist der Monatsbetrag des Zeitraums, vor und nach der Überweisung gleich', () => {
    const ds = goldenDataset();
    const before = monthPlan(ds, P1, goldenSettings({ planMode: 'even' }), 25);
    const after = monthPlan(ds, P1, goldenSettings({ planMode: 'even', receivedFor: P1 }), 25);
    expect(before.current.period).toBe(P1);
    expect(after.current.period).toBe(P1);
    expect(after.first.period).toBe(P2);
    expect(before.current.transfer).toBe(before.state.months[0]!.amount);
    expect(after.current.transfer).toBe(after.state.months[0]!.amount);
  });
});

describe('Listen unter den Zeilen', () => {
  const ds = goldenDataset();
  const s = goldenSettings({ planMode: 'even' });

  it('①: die Rechnungen des Kontos plus die Zeile „Für später zur Seite“ ergeben den Betrag', () => {
    const card = monthCard(ds, P1, monthPlan(ds, P1, s, 25), 25, NOV10);
    const saveLine = card.reserve.items.find((i) => i.balance);
    expect(card.reserve.total).toBeGreaterThan(0);
    // November has no bill on the account: everything is saved for later
    expect(saveLine).toMatchObject({ balance: 'save', amount: card.reserve.total });
  });

  it('① im Dezember mit Gleichmäßig: Kfz € 360 und „Aus dem Angesparten“ wenn der Betrag kleiner ist', () => {
    const card = monthCard(ds, P2, monthPlan(ds, P2, s, 25), 25, DEC10);
    const kfz = card.reserve.items.find((i) => i.name === 'Kfz-Versicherung');
    expect(kfz).toMatchObject({ amount: 360, date: '2026-12-01' });
    const line = card.reserve.items.find((i) => i.balance);
    expect(line?.balance).toBe(card.reserve.total < 360 ? 'take' : 'save');
    expect(Math.round(card.reserve.items.reduce((a, i) => a + i.amount * 100, 0)) / 100).toBe(card.reserve.total);
  });

  it('②: Name · Betrag · Datum, nach Datum; der Posten mit späterem Start fehlt', () => {
    const card = monthCard(ds, P1, monthPlan(ds, P1, s, 25), 25, NOV10);
    expect(card.direct.items[0]).toMatchObject({ name: expect.any(String), date: '2026-11-01' });
    expect(card.direct.items.map((i) => i.date)).toEqual([...card.direct.items.map((i) => i.date)].sort());
    expect(card.direct.items.some((i) => i.name === 'Fitness')).toBe(false);
  });

  it('④: „aus anderer Quelle“ steht gedämpft in der Liste und zählt nicht', () => {
    const card = monthCard(ds, P2, monthPlan(ds, P2, s, 25), 25, DEC10);
    const gift = card.unplanned.items.find((i) => i.name === 'Geschenk von Oma');
    expect(gift).toMatchObject({ muted: true, note: 'other', amount: 200 });
    // Fahrrad € 450 and the Jacke of 27 November (start 25: December) – the gift does not count
    expect(card.unplanned.spent).toBe(530);
    expect(card.unplanned.total).toBe(530);
    expect(card.unplanned.count).toBe(2);
  });

  it('③: „nicht vom Netto“ gedämpft, nicht in der Summe', () => {
    const data: Dataset = goldenDataset();
    data.positions.push({
      id: 'g-mieteinnahme',
      name: 'Mieteinnahme',
      categoryId: 'g-sparen',
      history: [{ validFrom: P1, amount: 500, frequency: 'once', dueMonths: [11], dueDay: 2, dueDate: '2026-11-02' }],
      createdAt: '2026-10-01T08:00:00.000Z',
      sortOrder: 99,
      fromNet: false,
      account: 'girokonto',
    });
    const card = monthCard(data, P1, monthPlan(data, P1, s, 25), 25, NOV10);
    expect(card.wealth.total).toBe(350);
    expect(card.wealth.notFromNet).toBe(500);
    expect(card.wealth.items.find((i) => i.name === 'Mieteinnahme')).toMatchObject({ muted: true, note: 'notFromNet' });
  });

  it('④ mit Einmalbetrag an einer nicht eingeplanten Position und ohne Spielgeld: keine Pille', () => {
    const data = goldenDataset();
    data.oneOffs.push({ id: 'o-1', positionId: 'g-konzert', period: P1, amount: 30, label: 'Garderobe' });
    const card = monthCard(data, P1, monthPlan(data, P1, goldenSettings({ spielgeld: null }), 25), 25, NOV10);
    expect(card.unplanned.total).toBe(150);
    expect(card.pill).toBeNull();
  });
});

describe('Abweichung in der Kategorie (Punkt 5)', () => {
  const ds = goldenDataset();
  const item = (period: string, id: string, data: Dataset = ds) => dueItems(data, period).find((i) => i.position.id === id)!;

  it('eigener Monatsbetrag: Strom im Dezember € 95 statt € 80, sonst keine Zeile', () => {
    expect(usualAmount(item(P2, 'g-strom').position, P2)).toBe(80);
    expect(monthDeviation(item(P2, 'g-strom'))).toEqual({ x: 95, y: 80 });
    expect(monthDeviation(item(P1, 'g-strom'))).toBeNull();
    expect(monthDeviation(item(P3, 'g-strom'))).toBeNull();
  });

  it('anders abgebucht: Lebensmittel € 330 statt € 350', () => {
    const data = goldenDataset();
    data.payments.push({ id: 'pay-1', positionId: 'g-essen', period: P1, status: 'paid', plannedAmount: 350, actualAmount: 330, paidAt: '2026-11-02T09:00:00.000Z' });
    expect(monthDeviation(item(P1, 'g-essen', data))).toEqual({ x: 330, y: 350 });
  });

  it('keine Zeile für entfallen und nicht eingeplant', () => {
    const data = goldenDataset();
    data.payments.push({ id: 'pay-2', positionId: 'g-miete', period: P1, status: 'skipped', plannedAmount: 900, actualAmount: 0, paidAt: '2026-11-02T09:00:00.000Z' });
    expect(monthDeviation(item(P1, 'g-miete', data))).toBeNull();
    expect(monthDeviation(item(P1, 'g-konzert', data))).toBeNull();
  });
});

describe('Texte', () => {
  it('höchstens 12 Wörter, Du-Form, kein „Netto-Gehalt“', () => {
    const keys = Object.keys(KONTO_TEXTS).filter((k) => k.startsWith('month.') || k.startsWith('source.'));
    for (const k of keys) {
      const text = KONTO_TEXTS[k as keyof typeof KONTO_TEXTS];
      for (const sentence of text.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).filter((w) => /\w/.test(w)).length, k).toBeLessThanOrEqual(12);
      expect(text).not.toMatch(/\bSie\b|Netto-Gehalt/);
    }
  });
});
