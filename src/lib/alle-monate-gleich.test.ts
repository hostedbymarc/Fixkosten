// alle-monate-gleich: one-time payments by period (point 3) and the celebration rules (point 4).
import { describe, expect, it } from 'vitest';
import { goldenDataset } from '../../tests/fixtures/golden-month';
import { dueItems, monthFigures, oncePeriod } from './calc';
import { celebratedUpTo, celebrateLive } from './celebration';
import type { Dataset, PlanEntry } from './types';

const once = (dueDate: string): PlanEntry => ({ validFrom: dueDate.slice(0, 7), amount: 10, frequency: 'once', dueMonths: [Number(dueDate.slice(5, 7))], dueDay: Number(dueDate.slice(8)), dueDate });

describe('Einmalzahlungen gehören zum Zeitraum ihres Datums („Neuer Monat beginnt am“)', () => {
  it('Monatsbeginn 25: 24. bleibt, 25. und 31. zählen zum nächsten Monat', () => {
    expect(oncePeriod(once('2026-11-24'), 25)).toBe('2026-11');
    expect(oncePeriod(once('2026-11-25'), 25)).toBe('2026-12');
    expect(oncePeriod(once('2026-10-31'), 25)).toBe('2026-11');
    expect(oncePeriod(once('2026-11-27'), 25)).toBe('2026-12');
  });

  it('Jahreswechsel: 27. Dezember zählt zum Jänner des neuen Jahres', () => {
    expect(oncePeriod(once('2026-12-27'), 25)).toBe('2027-01');
    expect(oncePeriod(once('2026-12-24'), 25)).toBe('2026-12');
  });

  it('Monatsbeginn 1: der Kalendermonat (wie bisher); Monatsletzter: erst ab dem letzten Tag', () => {
    expect(oncePeriod(once('2026-11-27'), 1)).toBe('2026-11');
    expect(oncePeriod(once('2026-12-31'), 1)).toBe('2026-12');
    expect(oncePeriod(once('2026-11-29'), 'last')).toBe('2026-11');
    expect(oncePeriod(once('2026-11-30'), 'last')).toBe('2026-12');
  });

  it('wiederkehrende Fixkosten bleiben bei ihrer Zuordnung (Lebensmittel am 28. im November)', () => {
    const ds = goldenDataset();
    expect(dueItems(ds, '2026-11', 25).some((i) => i.position.id === 'g-essen')).toBe(true);
    expect(dueItems(ds, '2026-12', 25).filter((i) => i.position.id === 'g-essen')).toHaveLength(1);
  });

  it('ein Haken unter dem alten Monat wandert mit: die Zahlung steht nur im Dezember, abgehakt', () => {
    const ds: Dataset = goldenDataset();
    ds.payments.push({ id: 'p-jacke', positionId: 'g-jacke', period: '2026-11', status: 'paid', plannedAmount: 80, actualAmount: 75, paidAt: '2026-11-27T10:00:00.000Z' });
    expect(dueItems(ds, '2026-11', 25).some((i) => i.position.id === 'g-jacke')).toBe(false);
    const dec = dueItems(ds, '2026-12', 25).find((i) => i.position.id === 'g-jacke')!;
    expect(dec).toMatchObject({ status: 'paid', due: true });
    expect(dec.payment!.actualAmount).toBe(75);
    // with start 1 it stays where it was
    expect(dueItems(ds, '2026-11', 1).find((i) => i.position.id === 'g-jacke')?.status).toBe('paid');
  });

  it('eingeplante Einmalzahlung am 27. zählt in den Summen des Dezembers', () => {
    const ds: Dataset = goldenDataset();
    ds.positions.push({ id: 'g-tv', name: 'Fernseher', categoryId: 'g-wohnen', history: [once('2026-11-27')], createdAt: '2026-11-01T08:00:00.000Z', sortOrder: 99, account: 'girokonto' });
    expect(monthFigures(ds, '2026-12', 25).total - monthFigures(goldenDataset(), '2026-12', 25).total).toBe(10);
    expect(monthFigures(ds, '2026-11', 25).total).toBe(monthFigures(goldenDataset(), '2026-11', 25).total);
  });
});

describe('Feier nur, wenn sie zählt', () => {
  const before = (period: string) => ({ period, done: false });

  it('künftiger Monat: keine Live-Feier, auch nicht beim letzten Haken', () => {
    expect(celebrateLive(before('2027-01'), '2027-01', true, false, '2026-12')).toBe(false);
  });

  it('aktiver und vergangener Monat: einmal live', () => {
    expect(celebrateLive(before('2026-12'), '2026-12', true, false, '2026-12')).toBe(true);
    expect(celebrateLive(before('2026-11'), '2026-11', true, false, '2026-12')).toBe(true);
    expect(celebrateLive(before('2026-12'), '2026-12', true, true, '2026-12')).toBe(false);
  });

  it('Bereinigung beim Start: Monate nach dem aktiven fallen weg', () => {
    expect(celebratedUpTo(['2026-10', '2026-12', '2027-01', '2027-03'], '2026-12')).toEqual(['2026-10', '2026-12']);
    expect(celebratedUpTo([], '2026-12')).toEqual([]);
  });
});
