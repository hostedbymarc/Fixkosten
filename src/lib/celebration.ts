// „{Monat} erledigt“: when every planned position of the month shown is paid, the done state shows.
// monat-feinschliff: the same in every month (past, active, future): the confetti (peas) falls exactly
// ONCE per month – live, when the LAST open position is ticked – and the month is remembered
// (celebratedMonths). Never when a month is opened, never again on a tap. Every other time the peas lie
// still at the bottom of the card (same place every time: seed = the month). A position set back to
// open: no peas. Done again: they lie, without a second celebration.
// alle-monate-gleich: a month AFTER the active one never celebrates live (ticking ahead is planning, not
// done yet): the peas lie, nothing is remembered. When it becomes the active month it celebrates once.
import type { Period } from './types';

/** All positions of the month paid (at least one is due). */
export function monthDone(figures: { count: number; openCount: number }): boolean {
  return figures.count > 0 && figures.openCount === 0;
}

/**
 * Live: the last open position of the month shown was ticked (done now, not done before, same month) – in
 * every month (monat-feinschliff), but only once per month: a month in `celebratedMonths` never falls again.
 */
export function celebrateLive(
  before: { period: Period; done: boolean } | null,
  period: Period,
  done: boolean,
  celebrated: boolean,
  active: Period | null = null,
): boolean {
  if (active !== null && period > active) return false;
  return !celebrated && !!before && before.period === period && !before.done && done;
}

/** One-time cleanup at the start: months after the active one are no celebrated months (they never fell live). */
export function celebratedUpTo(months: Period[], active: Period): Period[] {
  return months.filter((p) => p <= active);
}

/**
 * What the hero shows: no peas (not done), falling peas (the live moment, without reduced motion) or lying
 * peas (every other time, and with reduced motion instead of falling).
 */
export type ConfettiState = 'none' | 'falling' | 'resting';

export function confettiState(done: boolean, live: boolean, reducedMotion: boolean): ConfettiState {
  if (!done) return 'none';
  return live && !reducedMotion ? 'falling' : 'resting';
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
