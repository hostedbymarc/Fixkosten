import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CONFETTI, confettiPeas, type ConfettiPea } from '../lib/celebration';

/**
 * Pea confetti in the hero of a month that is „erledigt“ (spielgeld-planer). `falling`: the peas fall
 * once from above with a light swing (transform and opacity only) – only live,
 * when the last position of the active month is ticked. Otherwise they lie still at the bottom of the
 * tile, without any animation. The positions come from the month (seed): the same picture every time,
 * falling and lying alike. Behind the hero's content, in a strip below every text.
 */
const COLORS = [
  'rgb(var(--brand-100))',
  'rgb(var(--brand-200))',
  'rgb(var(--brand-300))',
  'rgb(var(--hero-src-salary))',
  'rgb(var(--hero-src-spielgeld))',
  'var(--cat-3)',
  'var(--cat-6)',
  'var(--pea-logo)',
];

const EASE = 'cubic-bezier(0.35, 0, 0.6, 1)';

/** every pea's animation runs this long: the latest start plus the longest fall (ms) */
export const FALL_TOTAL_MS = (CONFETTI.maxDelay + CONFETTI.maxDuration) * 1000;

/**
 * The fall of one pea (tests-stabil): the keyframes of the former CSS `confetti-fall`, with `--end` and
 * `--sway` worked out per pea, and with its own delay and duration folded into the offsets of one shared
 * timeline of FALL_TOTAL_MS. Every pea starts and ends at the same moment: Chrome wakes the main thread
 * (a style recalc of every pea) whenever a compositor animation starts or ends, so 60 different delays and
 * durations cost a main frame almost every frame. The picture is the same: before its delay the pea waits
 * where it starts (invisible), after its fall it lies where it lands. Each falling keyframe carries the
 * easing, as `animation-timing-function` did for each CSS keyframe.
 */
export function fallKeyframes(endY: number, sway: number, delayS: number, durationS: number): Keyframe[] {
  const t = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0px)`;
  const total = CONFETTI.maxDelay + CONFETTI.maxDuration;
  const start = Math.min(delayS / total, 1);
  const end = Math.min((delayS + durationS) / total, 1);
  const at = (f: number) => start + (end - start) * f;
  const from = { transform: t(0, -24), opacity: 0 };
  const to = { transform: t(0, endY), opacity: 0.85 };
  return [
    { offset: 0, ...from },
    { offset: start, ...from, easing: EASE },
    { offset: at(0.08), opacity: 1, easing: EASE },
    { offset: at(0.3), transform: t(sway, endY * 0.3), easing: EASE },
    { offset: at(0.6), transform: t(sway * -0.6, endY * 0.62), easing: EASE },
    { offset: at(0.85), transform: t(sway * 0.3, endY * 0.9), easing: EASE },
    { offset: end, ...to },
    { offset: 1, ...to },
  ];
}

/** the hero on an iPhone SE (375 px wide) is 343 px; the iPhone 15's is 361 px */
const SMALL_HERO = 350;

export function Confetti({ seed, falling }: { seed: string; falling: boolean }) {
  const layer = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.width === Math.round(r.width) && b.height === Math.round(r.height) ? b : { width: Math.round(r.width), height: Math.round(r.height) }));
    };
    measure();
    // a rotation or a narrower window: the peas lie in the new strip
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  // iPhone SE and smaller: fewer peas (measured, see docs/fixkostenkonto/RUECKLAGE-SPIELGELD.md)
  const peas: ConfettiPea[] = useMemo(
    () => (box ? confettiPeas(box.width, box.height, box.width < SMALL_HERO ? CONFETTI.countSmall : CONFETTI.count, COLORS.length, seed) : []),
    [box, seed],
  );
  // falling: one Web Animation per pea, started before the first paint (layout effect); none with reduced motion
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el || !falling || !peas.length || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = el.children;
    const running = peas.map((p, i) =>
      (nodes[i] as HTMLElement).animate(fallKeyframes(p.endY, p.sway, p.delay, p.duration), { duration: FALL_TOTAL_MS, fill: 'both', id: 'confetti-fall' }),
    );
    return () => running.forEach((a) => a.cancel());
  }, [falling, peas]);
  return (
    <span
      ref={layer}
      className="hero-confetti"
      aria-hidden="true"
      data-testid="hero-confetti"
      data-count={peas.length}
      data-falling={falling ? '' : undefined}
    >
      {peas.map((p, i) => (
        <span
          key={i}
          className={falling ? 'confetti-pea' : 'confetti-pea is-resting'}
          style={
            {
              width: p.size,
              height: p.size,
              left: p.x,
              '--c': COLORS[p.color],
              '--end': `${p.endY}px`,
              '--sway': `${p.sway}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
