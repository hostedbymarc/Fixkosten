import { describe, expect, it } from 'vitest';
import { addPeriods } from './period';
import { cushionMonths, podFromMonths, podText, tileState } from './schote';
import { SCHOTE_TEXTS, sentences, t, wordCount } from './schoteTexts';
import type { Period } from './types';

const months = (ends: number[], from: Period = '2026-11') => ends.map((end, i) => ({ period: addPeriods(from, i), end }));

describe('Schote: 12 Plätze aus den Monatsend-Ständen', () => {
  it('alle ≥ 0 → voll, „Gedeckt bis Oktober 2027“', () => {
    const pod = podFromMonths(months([10, 0, 5, 300, 1, 2, 3, 4, 5, 6, 7, 0]));
    expect(pod.covered).toBe(12);
    expect(pod.full).toBe(true);
    expect(pod.coveredUntil).toBe('2027-10');
    expect(podText(pod)).toBe('Gedeckt bis Oktober 2027');
  });

  it('genau 0 ist gedeckt, −0,01 nicht', () => {
    const pod = podFromMonths(months([0, -0.01]));
    expect(pod.slots.map((s) => s.covered)).toEqual([true, false]);
  });

  it('Lücke → „8 von 12 Monaten gedeckt“, Plätze in Monatsreihenfolge', () => {
    const pod = podFromMonths(months([100, 50, -20, -40, 10, 20, 30, 40, -5, -6, 70, 80]));
    expect(pod.covered).toBe(8);
    expect(pod.full).toBe(false);
    expect(pod.coveredUntil).toBeNull();
    expect(podText(pod)).toBe('8 von 12 Monaten gedeckt');
    expect(pod.slots[2]).toEqual({ period: '2027-01', covered: false });
  });

  it('keine Monate → nicht voll', () => {
    expect(podFromMonths([]).full).toBe(false);
  });
});

describe('Polster', () => {
  it('erst über einem Dauerauftrag, abgerundet auf eine Stelle', () => {
    expect(cushionMonths(3000, 3000)).toBeNull();
    expect(cushionMonths(2999, 3000)).toBeNull();
    expect(cushionMonths(4200, 3000)).toBe(1.4);
    expect(cushionMonths(4499, 3000)).toBe(1.4);
    expect(cushionMonths(100, 0)).toBeNull();
  });
});

describe('Kachel: genau 4 Zustände', () => {
  it('nicht eingerichtet geht vor allem anderen', () => {
    expect(tileState({ setupDone: false, gap: 500, cushion: 2 })).toBe('setup');
  });
  it('Lücke, gedeckt, Polster', () => {
    expect(tileState({ setupDone: true, gap: 0.01, cushion: null })).toBe('gap');
    expect(tileState({ setupDone: true, gap: 0, cushion: null })).toBe('covered');
    expect(tileState({ setupDone: true, gap: 0, cushion: 1.4 })).toBe('cushion');
  });
});

describe('Texte', () => {
  it('kein Satz über 12 Wörter (Platzhalter = 1 Wort)', () => {
    for (const [id, text] of Object.entries(SCHOTE_TEXTS)) {
      for (const s of sentences(text)) expect(wordCount(s), `${id}: ${s}`).toBeLessThanOrEqual(12);
    }
  });
  it('Platzhalter werden gefüllt', () => {
    expect(t('tile.gap.text', { betrag: '+€ 340' })).toBe('Noch +€ 340 einzahlen, dann ist alles gedeckt');
    expect(t('setup.q3', { monat: 'November' })).toBe('Ist der Dauerauftrag für November schon eingegangen?');
  });
  it('Wörter zählen', () => {
    expect(wordCount('Erbse rechnet deinen Dauerauftrag aus und warnt, bevor das Konto knapp wird.')).toBe(12);
    expect(wordCount('Noch {betrag} einzahlen')).toBe(3);
  });
});
