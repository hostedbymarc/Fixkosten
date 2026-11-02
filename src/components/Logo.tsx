import { useId } from 'react';

/** Pea radii at 28 units: a slight size step instead of the old opacity step 100 / 85 / 70 %. */
const PEAS = [
  { cx: 9, r: 3.6 },
  { cx: 14, r: 3.4 },
  { cx: 19, r: 3.2 },
] as const;
/** Drawn right to left: the largest pea (lit from the top left) lies in front. */
const DRAW_ORDER = [...PEAS].reverse();
/** Below this size glint, drop shadow and inner edge would only blur together. */
const DETAIL_FROM = 20;

/**
 * Erbse mark: rounded square in the brand colour (a barely visible brand-400 → brand-600 gradient,
 * a fine inner edge at the top) with three Soft-3D peas: radial glint top left (30 %) → --pea-body,
 * soft drop shadow in brand-700 at 25 %. Below 20 px: flat peas, no glint, shadow or edge.
 * All colours from tokens. The icon files in public/ (scripts/brand/) use the same geometry.
 */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  const detail = size >= DETAIL_FROM;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0" data-testid="logo">
      {detail && (
        <defs>
          <linearGradient id={`${id}-sq`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--logo-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--logo-bottom)' }} />
          </linearGradient>
          <radialGradient id={`${id}-pea`} cx="0.36" cy="0.32" r="0.75" fx="0.32" fy="0.28">
            <stop offset="0" style={{ stopColor: 'var(--pea-glint)' }} />
            <stop offset="0.3" style={{ stopColor: 'var(--pea-glint)' }} />
            <stop offset="1" style={{ stopColor: 'var(--pea-body)' }} />
          </radialGradient>
          <filter id={`${id}-drop`} x="-50%" y="-50%" width="200%" height="220%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.7" style={{ floodColor: 'var(--pea-drop)' }} />
          </filter>
        </defs>
      )}
      <rect width="28" height="28" rx="8" style={{ fill: detail ? `url(#${id}-sq)` : 'var(--logo-flat)' }} />
      {detail && (
        <path
          d="M1.1 5.2 A7.5 7.5 0 0 1 8 0.5 H20 A7.5 7.5 0 0 1 26.9 5.2"
          fill="none"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--logo-edge)' }}
        />
      )}
      <g filter={detail ? `url(#${id}-drop)` : undefined}>
        {DRAW_ORDER.map((p) => (
          <circle key={p.cx} cx={p.cx} cy="14" r={p.r} style={{ fill: detail ? `url(#${id}-pea)` : 'var(--pea-body)' }} />
        ))}
      </g>
    </svg>
  );
}

/** Logo plus the word mark „Erbse“ (18 px, weight 700). */
export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={28} />
      <span className="text-[18px] font-bold tracking-[-0.01em] text-ink">Erbse</span>
    </span>
  );
}
