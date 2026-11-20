// monat-feinschliff: a salary is named after the calendar month it is paid in (payday = „Neuer Monat beginnt am“).
import { describe, expect, it } from 'vitest';
import { KONTO_TEXTS } from './kontoTexts';
import { payday, salaryMonth, salaryName, salaryStatus, monthKind } from './salaryMonth';

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

describe('Status der Netto-Kachel je Monatsart', () => {
  const checks = [{ period: '2026-10', deposited: true }];
  it('Monatsart', () => {
    expect(monthKind('2026-10', '2026-11')).toBe('past');
    expect(monthKind('2026-11', '2026-11')).toBe('active');
    expect(monthKind('2026-12', '2026-11')).toBe('future');
  });
  it('vergangen und markiert: „Überwiesen ✓“ (ohne eigenes Konto „Zur Seite gelegt ✓“)', () => {
    expect(salaryStatus('2026-10', '2026-11', 25, checks, true)).toEqual({ kind: 'marked', text: 'Überwiesen ✓' });
    expect(salaryStatus('2026-10', '2026-11', 25, checks, false)).toEqual({ kind: 'marked', text: 'Zur Seite gelegt ✓' });
  });
  it('vergangen, nicht markiert: „Nicht markiert“', () => {
    expect(salaryStatus('2026-09', '2026-11', 25, checks, true)).toEqual({ kind: 'unmarked', text: 'Nicht markiert' });
  });
  it('künftig: „Kommt am {Auszahlungstag}“', () => {
    const s = salaryStatus('2026-12', '2026-11', 25, checks, true, new Date(2026, 10, 10))!;
    expect(s.kind).toBe('comes');
    expect(plain(s.text)).toBe('Kommt am 25. November');
    expect(plain(salaryStatus('2026-12', '2026-11', 1, checks, true, new Date(2026, 10, 10))!.text)).toBe('Kommt am 1. Dezember');
  });
  it('aktiver Monat: kein Status (die Karte hat den Knopf)', () => {
    expect(salaryStatus('2026-11', '2026-11', 25, checks, true)).toBeNull();
  });
  it('kein Text „nicht ausbezahlt“ und kein „geschätzt“', () => {
    for (const p of ['2026-09', '2026-10', '2026-12'])
      expect(salaryStatus(p, '2026-11', 25, checks, true)!.text).not.toMatch(/ausbezahlt|geschätzt/);
  });
});

describe('Texte', () => {
  it('kein „geschätzt“ und kein „nicht ausbezahlt“ in den Texten', () => {
    for (const text of Object.values(KONTO_TEXTS)) expect(text).not.toMatch(/geschätzt|ausbezahlt/);
  });
});
