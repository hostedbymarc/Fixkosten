// monat-feinschliff: a salary is named after the calendar month it is paid in (payday = „Neuer Monat beginnt am“).
import { describe, expect, it } from 'vitest';
import { KONTO_TEXTS } from './kontoTexts';
import { paidOut, payday, salaryMonth, salaryName, salaryWhen } from './salaryMonth';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('Gehalt nach Auszahlungsmonat', () => {
  it('Monatsbeginn 1: nichts ändert sich (Oktober-Screen = Oktober-Gehalt)', () => {
    expect(salaryMonth('2026-10', 1)).toBe('2026-10');
    expect(salaryName('2026-10', 1)).toBe('Oktober-Gehalt');
    expect(payday('2026-10', 1)).toEqual(new Date(2026, 9, 1));
  });

  it('Monatsbeginn 25: das Gehalt vom 25. Oktober steht im November-Screen und heißt Oktober-Gehalt', () => {
    expect(salaryMonth('2026-11', 25)).toBe('2026-10');
    expect(salaryName('2026-11', 25)).toBe('Oktober-Gehalt');
    expect(payday('2026-11', 25)).toEqual(new Date(2026, 9, 25));
    // the one of 25 November: the December screen, „November-Gehalt“
    expect(salaryName('2026-12', 25)).toBe('November-Gehalt');
  });

  it('Monatsbeginn 15: Zeitraum 15.10.–14.11. → Oktober-Gehalt', () => {
    expect(salaryName('2026-11', 15)).toBe('Oktober-Gehalt');
    expect(payday('2026-11', 15)).toEqual(new Date(2026, 9, 15));
  });

  it('Jahreswechsel: Dezember-Gehalt am 25.12. steht im Jänner-Screen', () => {
    expect(salaryMonth('2027-01', 25)).toBe('2026-12');
    expect(salaryName('2027-01', 25)).toBe('Dezember-Gehalt');
    expect(payday('2027-01', 25)).toEqual(new Date(2026, 11, 25));
  });

  it('Monatsletzter: Gehalt am letzten Tag des Vormonats', () => {
    expect(salaryName('2027-03', 'last')).toBe('Februar-Gehalt');
    expect(payday('2027-03', 'last')).toEqual(new Date(2027, 1, 28));
  });
});

describe('Kachel-Titel je Monat (monat-feinschliff-2)', () => {
  it('Monatsbeginn 1: Oktober-Screen „Oktober-Gehalt“, Dezember-Screen „Dezember-Gehalt“', () => {
    expect(salaryName('2026-10', 1)).toBe('Oktober-Gehalt');
    expect(salaryName('2026-12', 1)).toBe('Dezember-Gehalt');
  });
  it('Monatsbeginn 25: Oktober-Screen „September-Gehalt“, Dezember-Screen „November-Gehalt“', () => {
    expect(salaryName('2026-10', 25)).toBe('September-Gehalt');
    expect(salaryName('2026-12', 25)).toBe('November-Gehalt');
  });
  it('Jahreswechsel: Jänner-Screen „Dezember-Gehalt“ (25.), „Jänner-Gehalt“ (1.)', () => {
    expect(salaryName('2027-01', 25)).toBe('Dezember-Gehalt');
    expect(salaryName('2027-01', 1)).toBe('Jänner-Gehalt');
  });
});

describe('Zeile unter dem Betrag: nur das Datum', () => {
  const nov10 = new Date(2026, 10, 10);
  it('vergangen: „ausgezahlt am …“, ab dem Tag selbst', () => {
    expect(plain(salaryWhen('2026-11', 25, nov10))).toBe('ausgezahlt am 25. Oktober');
    expect(plain(salaryWhen('2026-12', 25, new Date(2026, 10, 25)))).toBe('ausgezahlt am 25. November');
  });
  it('künftig: „kommt am …“', () => {
    expect(plain(salaryWhen('2026-12', 25, nov10))).toBe('kommt am 25. November');
    expect(plain(salaryWhen('2027-01', 1, nov10))).toBe('kommt am 1. Jänner');
  });
  it('kein „Nicht markiert“, kein „Überwiesen ✓“', () => {
    for (const p of ['2026-09', '2026-10', '2026-12']) expect(salaryWhen(p, 25, nov10)).not.toMatch(/markiert|Überwiesen|ausbezahlt|geschätzt/);
  });
  it('paidOut: Tag genau', () => {
    expect(paidOut('2026-12', 25, new Date(2026, 10, 24, 23))).toBe(false);
    expect(paidOut('2026-12', 25, new Date(2026, 10, 25, 0, 1))).toBe(true);
  });
});

describe('Texte', () => {
  it('kein „geschätzt“, „nicht ausbezahlt“, „Netto-Gehalt“, „Nicht markiert“ in den Texten', () => {
    for (const text of Object.values(KONTO_TEXTS)) expect(text).not.toMatch(/geschätzt|ausbezahlt|Netto-Gehalt|Nicht markiert/);
  });
});
