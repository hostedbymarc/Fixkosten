import { useContext, useId, useLayoutEffect, useRef } from 'react';
import { reducedMotion } from '../lib/entrance';
import { TabVisibleContext } from './Screen';

interface Props {
  /** 0–1 */
  ratio: number;
  /** label in the middle (rounded by calc.progressPercent) */
  percent: number;
  /** everything ticked: a check replaces the percentage */
  done: boolean;
  size?: number;
  stroke?: number;
  label: string;
  /** size classes (e.g. responsive); replaces `size` for the box, the drawing scales with it */
  className?: string;
  /** on the hero: gradient brand-300 → white, soft glow, fills from 0 when the screen comes in */
  hero?: boolean;
}

/** Fill-in on entering the screen: 700 ms with a soft spring. */
const FILL_MS = 700;
const SPRING = 'linear(0, 0.22 8%, 0.62 20%, 0.9 33%, 1.03 45%, 1.05 53%, 1.01 68%, 1)';

/** Month ring: brand on brand-100; a check replaces the percentage once everything is paid. */
export function ProgressRing({ ratio, percent, done, size = 104, stroke = 10, label, className, hero }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  const gradient = `ring-${useId().replace(/:/g, '')}`;
  const bar = useRef<SVGCircleElement>(null);
  const visible = useContext(TabVisibleContext);
  const target = circumference * (1 - clamped);
  const targetRef = useRef(target);
  targetRef.current = target;
  // the hero ring fills from 0 to its value each time the screen comes in (presentation only)
  useLayoutEffect(() => {
    const el = bar.current;
    if (!hero || !visible || !el?.animate || reducedMotion()) return;
    const a = el.animate([{ strokeDashoffset: circumference }, { strokeDashoffset: targetRef.current }], { duration: FILL_MS, easing: SPRING });
    return () => a.cancel();
  }, [hero, visible, circumference]);
  return (
    <div className={`relative shrink-0 ${className ?? ''}`} style={className ? undefined : { width: size, height: size }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block overflow-visible">
        {hero && (
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'rgb(var(--brand-300))' }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--hero-ring))' }} />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track stroke-accent-soft" strokeWidth={stroke} fill="none" />
        <circle
          ref={bar}
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`${hero ? 'ring-glow' : 'stroke-accent'} transition-[stroke-dashoffset] duration-500 ease-out`}
          style={hero ? { stroke: `url(#${gradient})` } : undefined}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={target}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="num absolute inset-0 flex items-center justify-center text-[20px] font-semibold tracking-tight text-ink">
        {done ? (
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" className="text-accent">
            <path d="M6 12.5l4.5 4.5 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          `${percent}%`
        )}
      </div>
    </div>
  );
}
