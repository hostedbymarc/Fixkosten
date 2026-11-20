import { useLayoutEffect, useRef, useState } from 'react';
import { CONFETTI, confettiPeas, type ConfettiPea } from '../lib/celebration';

/**
 * Pea confetti in the hero of a month that is „erledigt“ (spielgeld-planer). `falling`: the peas fall
 * once from above with a light swing (transform and opacity only, CSS keyframes, compositor) – only live,
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
  const peas: ConfettiPea[] = box ? confettiPeas(box.width, box.height, box.width < SMALL_HERO ? CONFETTI.countSmall : CONFETTI.count, COLORS.length, seed) : [];
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
              ...(falling ? { animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` } : {}),
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
