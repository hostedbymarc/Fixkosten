// „{Monat} erledigt“: when the hero celebrates, and the confetti's peas.
import { describe, expect, it } from 'vitest';
import { DEFAULT_KONTO, kontoUntouched, storedKonto, toKontoSettings } from '../db/settings';
import { CONFETTI, celebrateLive, celebrateOnOpen, confettiPeas, monthDone } from './celebration';

describe('Feier-Zustand nur, wenn alles bezahlt ist', () => {
  it('alle bezahlt', () => expect(monthDone({ count: 12, openCount: 0 })).toBe(true));
  it('eine offen', () => expect(monthDone({ count: 12, openCount: 1 })).toBe(false));
  it('nichts fällig: keine Feier', () => expect(monthDone({ count: 0, openCount: 0 })).toBe(false));
});

describe('Konfetti: live und einmal beim Öffnen', () => {
  it('die letzte Position abgehakt (gleicher Monat, vorher offen)', () => {
    expect(celebrateLive({ period: '2026-10', done: false }, '2026-10', true)).toBe(true);
  });
  it('kein Live-Konfetti beim Monatswechsel oder ohne Wechsel', () => {
    expect(celebrateLive({ period: '2026-09', done: false }, '2026-10', true)).toBe(false);
    expect(celebrateLive({ period: '2026-10', done: true }, '2026-10', true)).toBe(false);
    expect(celebrateLive(null, '2026-10', true)).toBe(false);
  });
  it('beim Öffnen: einmal, celebratedMonths verhindert die Wiederholung', () => {
    expect(celebrateOnOpen('2026-10', true, [])).toBe(true);
    expect(celebrateOnOpen('2026-10', true, ['2026-10'])).toBe(false);
    expect(celebrateOnOpen('2026-10', false, [])).toBe(false);
  });
});

describe('celebratedMonths: additiv im Einstellungs-Eintrag', () => {
  it('alter Eintrag ohne Feld: leer, und nichts Neues wird gespeichert', () => {
    const old = toKontoSettings({ enabled: false, balance: 0, receivedFor: null, rounding: 5 });
    expect(old.celebratedMonths).toEqual([]);
    expect('celebratedMonths' in storedKonto(old)).toBe(false);
  });
  it('Roundtrip; ungültige und doppelte Monate fallen weg', () => {
    const s = toKontoSettings({ ...storedKonto(DEFAULT_KONTO), celebratedMonths: ['2026-09', '2026-10', '2026-10', 'quatsch', 7] });
    expect(s.celebratedMonths).toEqual(['2026-09', '2026-10']);
    expect(toKontoSettings(storedKonto(s))).toEqual(s);
  });
  it('nur gefeierte Monate: „Fixkosten einplanen“ gilt als unberührt (die Einladung bleibt)', () => {
    expect(kontoUntouched(null)).toBe(true);
    expect(kontoUntouched(toKontoSettings({ ...storedKonto(DEFAULT_KONTO), celebratedMonths: ['2026-10'] }))).toBe(true);
    expect(kontoUntouched(toKontoSettings({ ...storedKonto(DEFAULT_KONTO), inviteDismissed: true }))).toBe(false);
    expect(kontoUntouched(toKontoSettings({ ...storedKonto(DEFAULT_KONTO), enabled: true }))).toBe(false);
  });
});

describe('Konfetti-Erbsen', () => {
  const peas = confettiPeas(360, 240, CONFETTI.count, 8, '2026-10-1');
  it('ca. 90 Erbsen, 5–16 px, 1,6–3,2 s, Verzögerung 0–0,9 s', () => {
    expect(peas).toHaveLength(90);
    for (const p of peas) {
      expect(p.size).toBeGreaterThanOrEqual(5);
      expect(p.size).toBeLessThanOrEqual(16);
      expect(p.duration).toBeGreaterThanOrEqual(1.6);
      expect(p.duration).toBeLessThanOrEqual(3.2);
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThanOrEqual(0.9);
      expect(p.color).toBeGreaterThanOrEqual(0);
      expect(p.color).toBeLessThan(8);
    }
  });
  it('über die ganze Kachel verteilt, sie bleiben in der Kachel liegen', () => {
    for (const p of peas) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.size).toBeLessThanOrEqual(360);
      expect(p.endY + p.size).toBeLessThanOrEqual(240);
    }
    expect(Math.min(...peas.map((p) => p.x))).toBeLessThan(40);
    expect(Math.max(...peas.map((p) => p.x))).toBeGreaterThan(300);
  });
  it('gleicher Monat, gleiches Bild (deterministisch)', () => {
    expect(confettiPeas(360, 240, 90, 8, '2026-10-1')).toEqual(peas);
    expect(confettiPeas(360, 240, 90, 8, '2026-10-2')).not.toEqual(peas);
  });
});
