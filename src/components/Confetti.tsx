import { useLayoutEffect, useRef, useState } from 'react';
import { CONFETTI, confettiPeas, type ConfettiPea } from '../lib/celebration';

/**
 * Pea confetti over the hero: one layer of circles, animated with transform and opacity only (CSS
 * keyframes, compositor). They fall from above with a light swing and stay where they land until the
 * screen is left (the layer unmounts). Behind the hero's content, so the numbers stay readable.
 * The caller renders it only without prefers-reduced-motion; a new `run` plays it again.
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

export function Confetti({ run, seed }: { run: number; seed: string }) {
  const layer = useRef<HTMLSpanElement>(null);
  const [peas, setPeas] = useState<ConfettiPea[]>([]);
  useLayoutEffect(() => {
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    // iPhone SE and smaller: fewer peas (measured, see docs/fixkostenkonto/RUECKLAGE-SPIELGELD.md)
    const count = box.width < SMALL_HERO ? CONFETTI.countSmall : CONFETTI.count;
    setPeas(confettiPeas(box.width, box.height, count, COLORS.length, `${seed}-${run}`));
  }, [run, seed]);
  return (
    <span ref={layer} className="hero-confetti" aria-hidden="true" data-testid="hero-confetti" data-count={peas.length}>
      {peas.map((p, i) => (
        <span
          key={`${run}-${i}`}
          className="confetti-pea"
          style={
            {
              width: p.size,
              height: p.size,
              left: p.x,
              '--c': COLORS[p.color],
              '--end': `${p.endY + p.size}px`,
              '--sway': `${p.sway}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
