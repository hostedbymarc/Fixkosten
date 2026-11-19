// „{Monat} erledigt“: when every position of the month shown is paid, the hero celebrates. The confetti
// (peas) plays when the LAST position is ticked (live) and once when a month is opened that is complete
// since (celebratedMonths); afterwards only the calm state. A tap on the check plays it again.
// Only the ACTIVE month celebrates: past months never, not even when they are first opened.
import type { Period } from './types';

/** All positions of the month paid (at least one is due). */
export function monthDone(figures: { count: number; openCount: number }): boolean {
  return figures.count > 0 && figures.openCount === 0;
}

/** Opening the active month: confetti once, if it is complete and was not celebrated yet. */
export function celebrateOnOpen(period: Period, active: Period, done: boolean, celebrated: readonly Period[]): boolean {
  return period === active && done && !celebrated.includes(period);
}

/** Live: the last open position of the active month was ticked (done now, not done before, same month). */
export function celebrateLive(before: { period: Period; done: boolean } | null, period: Period, active: Period, done: boolean): boolean {
  return period === active && !!before && before.period === period && !before.done && done;
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
  /** where they rest: a strip of this height (px), this far above the bottom edge (hero padding 52 px) */
  strip: 28,
  stripInset: 10,
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
 * tile with a light swing (over the text while falling) and come to rest in a strip at the bottom
 * edge, where no text is. `colors` tokens to pick from.
 */
export function confettiPeas(width: number, height: number, count: number, colors: number, seed: string): ConfettiPea[] {
  const r = random(seedOf(seed));
  const between = (a: number, b: number) => a + (b - a) * r();
  return Array.from({ length: count }, () => {
    const size = Math.round(between(CONFETTI.minSize, CONFETTI.maxSize));
    return {
      x: Math.round(between(0, Math.max(width - size, 0))),
      // top edge where it rests: inside the strip at the bottom of the tile, below every text
      endY: Math.round(height - CONFETTI.stripInset - size - between(0, CONFETTI.strip - size)),
      sway: Math.round(between(8, 26)) * (r() < 0.5 ? -1 : 1),
      size,
      duration: Math.round(between(CONFETTI.minDuration, CONFETTI.maxDuration) * 100) / 100,
      delay: Math.round(between(0, CONFETTI.maxDelay) * 100) / 100,
      color: Math.floor(r() * colors),
    };
  });
}
