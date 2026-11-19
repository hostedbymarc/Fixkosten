// „{Monat} erledigt“: when the hero celebrates, and the confetti's peas.
import { describe, expect, it } from 'vitest';
import { DEFAULT_KONTO, kontoUntouched, storedKonto, toKontoSettings } from '../db/settings';
import { CONFETTI, celebrateLive, confettiPeas, confettiState, monthDone, type ConfettiState } from './celebration';

describe('Feier-Zustand nur, wenn alles bezahlt ist', () => {
  it('alle bezahlt', () => expect(monthDone({ count: 12, openCount: 0 })).toBe(true));
  it('eine offen', () => expect(monthDone({ count: 12, openCount: 1 })).toBe(false));
  it('nichts fällig: keine Feier', () => expect(monthDone({ count: 0, openCount: 0 })).toBe(false));
});

describe('Konfetti: nur einmal live', () => {
  it('die letzte Position abgehakt (gleicher Monat, vorher offen)', () => {
    expect(celebrateLive({ period: '2026-10', done: false }, '2026-10', '2026-10', true)).toBe(true);
  });
  it('kein Live-Konfetti beim Monatswechsel oder ohne Wechsel', () => {
    expect(celebrateLive({ period: '2026-09', done: false }, '2026-10', '2026-10', true)).toBe(false);
    expect(celebrateLive({ period: '2026-10', done: true }, '2026-10', '2026-10', true)).toBe(false);
    expect(celebrateLive(null, '2026-10', '2026-10', true)).toBe(false);
  });
  it('vergangene Monate fallen nie, auch nicht live', () => {
    expect(celebrateLive({ period: '2026-09', done: false }, '2026-09', '2026-10', true)).toBe(false);
  });
  it('beim Öffnen nie: ohne vorherigen Zustand oder schon erledigt', () => {
    expect(celebrateLive(null, '2026-10', '2026-10', true)).toBe(false);
    expect(celebrateLive({ period: '2026-10', done: true }, '2026-10', '2026-10', true)).toBe(false);
  });
});

/**
 * The hero over a sequence of events, as HeroCard runs it: `run` counts the live moments of the month,
 * set back to 0 when a position is open again (or another month is shown).
 */
function heroSequence(events: { period: string; done: boolean }[], active = '2026-11', reduced = false): ConfettiState[] {
  let last: { period: string; done: boolean } | null = null;
  let run = 0;
  return events.map((e) => {
    if (!last || last.period !== e.period) run = 0;
    if (celebrateLive(last, e.period, active, e.done)) run++;
    else if (!e.done) run = 0;
    last = e;
    return confettiState(e.done, run > 0, reduced);
  });
}

describe('Konfetti-Zustände: einmal fallen, danach liegen', () => {
  const NOV = '2026-11';
  it('öffnen (erledigt) → liegen, kein Fallen', () => {
    expect(heroSequence([{ period: NOV, done: true }])).toEqual(['resting']);
  });
  it('letzte Position abgehakt → einmal fallen; neu laden → liegen', () => {
    expect(heroSequence([{ period: NOV, done: false }, { period: NOV, done: true }])).toEqual(['none', 'falling']);
    // a reload starts without the state before: the peas lie
    expect(heroSequence([{ period: NOV, done: true }])).toEqual(['resting']);
  });
  it('wieder offen → keine Erbsen; erneut 100 % → wieder einmal fallen', () => {
    expect(
      heroSequence([
        { period: NOV, done: false },
        { period: NOV, done: true },
        { period: NOV, done: false },
        { period: NOV, done: true },
      ]),
    ).toEqual(['none', 'falling', 'none', 'falling']);
  });
  it('Monatswechsel zurück: liegen, nicht noch einmal fallen', () => {
    expect(
      heroSequence([
        { period: NOV, done: false },
        { period: NOV, done: true },
        { period: '2026-10', done: true },
        { period: NOV, done: true },
      ]),
    ).toEqual(['none', 'falling', 'resting', 'resting']);
  });
  it('reduzierte Bewegung: nie fallen, liegende Erbsen bleiben', () => {
    expect(heroSequence([{ period: NOV, done: false }, { period: NOV, done: true }], NOV, true)).toEqual(['none', 'resting']);
  });
  it('nicht erledigt: nie Erbsen', () => {
    expect(confettiState(false, true, false)).toBe('none');
    expect(confettiState(false, false, true)).toBe('none');
  });
});

describe('Liegende Erbsen: deterministisch pro Monat', () => {
  it('gleicher Monat → gleiche Lage, jedes Mal', () => {
    expect(confettiPeas(361, 300, 90, 8, '2026-11')).toEqual(confettiPeas(361, 300, 90, 8, '2026-11'));
  });
  it('anderer Monat → andere Lage', () => {
    expect(confettiPeas(361, 300, 90, 8, '2026-11')).not.toEqual(confettiPeas(361, 300, 90, 8, '2026-10'));
  });
  it('liegen und fallen enden an derselben Stelle (dieselben Erbsen)', () => {
    const a = confettiPeas(361, 300, 60, 8, '2026-11');
    expect(a.map((p) => [p.x, p.endY, p.size])).toEqual(confettiPeas(361, 300, 60, 8, '2026-11').map((p) => [p.x, p.endY, p.size]));
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
  it('sie ruhen im Streifen am Unterrand (Padding 52 px): oberhalb liegt kein Text', () => {
    for (const p of peas) {
      expect(p.endY).toBeGreaterThanOrEqual(240 - CONFETTI.stripInset - CONFETTI.strip);
      expect(p.endY + p.size).toBeLessThanOrEqual(240 - CONFETTI.stripInset);
    }
    // the strip lies inside the hero's bottom padding with room to spare
    expect(CONFETTI.strip + CONFETTI.stripInset).toBeLessThanOrEqual(52 - 8);
  });
  it('gleicher Monat, gleiches Bild (deterministisch)', () => {
    expect(confettiPeas(360, 240, 90, 8, '2026-10-1')).toEqual(peas);
    expect(confettiPeas(360, 240, 90, 8, '2026-10-2')).not.toEqual(peas);
  });
});
