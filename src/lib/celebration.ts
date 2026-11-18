// „{Monat} erledigt“: when every position of the month shown is paid, the hero celebrates. The confetti
// (peas) plays when the LAST position is ticked (live) and once when a month is opened that is complete
// since (celebratedMonths); afterwards only the calm state. A tap on the check plays it again.
import type { Period } from './types';

/** All positions of the month paid (at least one is due). */
export function monthDone(figures: { count: number; openCount: number }): boolean {
  return figures.count > 0 && figures.openCount === 0;
}

/** Opening a month: confetti once, if it is complete and was not celebrated yet. */
export function celebrateOnOpen(period: Period, done: boolean, celebrated: readonly Period[]): boolean {
  return done && !celebrated.includes(period);
}

/** Live: the last open position was ticked (done now, not done before, same month). */
export function celebrateLive(before: { period: Period; done: boolean } | null, period: Period, done: boolean): boolean {
  return !!before && before.period === period && !before.done && done;
}

/** One pea of the confetti: px inside the hero, s for the timing. */
export interface ConfettiPea {
  /** start (above the top edge) and end (where it stays) */
  x: number;
  endY: number;
  /** sideways swing (px, ±) */
  sway: number;
  size: number;
  duration: number;
  delay: number;
  /** index into the colour tokens */
  color: number;
}

export const CONFETTI = {
  count: 90,
  /** iPhone SE (narrow and slow): fewer peas */
  countSmall: 60,
  minSize: 5,
  maxSize: 16,
  minDuration: 1.6,
  maxDuration: 3.2,
  maxDelay: 0.9,
} as const;

/** Deterministic (same month → same picture, also for the screenshots): mulberry32. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/**
 * The peas of one celebration over a hero of `width` × `height`: they fall from above over the whole
 * tile with a light swing and stay scattered (more towards the bottom). `colors` tokens to pick from.
 */
export function confettiPeas(width: number, height: number, count: number, colors: number, seed: string): ConfettiPea[] {
  const r = random(seedOf(seed));
  const between = (a: number, b: number) => a + (b - a) * r();
  return Array.from({ length: count }, () => {
    const size = Math.round(between(CONFETTI.minSize, CONFETTI.maxSize));
    return {
      x: Math.round(between(0, Math.max(width - size, 0))),
      // the lower part of the tile, where they come to rest (sqrt: more at the bottom)
      endY: Math.round(height * (0.25 + 0.75 * Math.sqrt(r())) - size),
      sway: Math.round(between(8, 26)) * (r() < 0.5 ? -1 : 1),
      size,
      duration: Math.round(between(CONFETTI.minDuration, CONFETTI.maxDuration) * 100) / 100,
      delay: Math.round(between(0, CONFETTI.maxDelay) * 100) / 100,
      color: Math.floor(r() * colors),
    };
  });
}
