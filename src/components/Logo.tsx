import type { CSSProperties } from 'react';
import { Pea } from './Pea';

/** Pea radii at 28 units: a slight size step (3.6 / 3.4 / 3.2). */
const PEAS = [
  { cx: 9, r: 3.6 },
  { cx: 14, r: 3.4 },
  { cx: 19, r: 3.2 },
] as const;
/** Drawn right to left: the largest pea (lit from the top left) lies in front. */
const DRAW_ORDER = [...PEAS].reverse();
/** Below this size the square has no volume (light, inner shadow, coloured shadow). */
const DETAIL_FROM = 20;

interface Props {
  size?: number;
  /** full bleed, no rounding and no outer shadow (apple-touch-icon, maskable) */
  bleed?: boolean;
  /** app icon with rounding: no outer shadow (it would be cut off at the image edge) */
  icon?: boolean;
}

/**
 * Erbse mark: rounded square in the brand colour with Soft-3D volume (soft light at the top, inner
 * shadow at the bottom, coloured shadow) and three <Pea>s in a very light green, slightly graded in
 * size. Styles in index.css (.logo); the app icons in public/ are screenshots of this component
 * (scripts/make-icons.mjs renders dev/peas/?icon=…).
 */
export function Logo({ size = 28, bleed = false, icon = false }: Props) {
  const unit = size / 28;
  return (
    <span
      className="logo"
      style={{ '--logo-size': `${size}px` } as CSSProperties}
      data-flat={size < DETAIL_FROM || undefined}
      data-bleed={bleed || undefined}
      data-icon={icon || bleed || undefined}
      data-testid="logo"
      aria-hidden="true"
    >
      {DRAW_ORDER.map((p) => (
        <Pea
          key={p.cx}
          size={p.r * 2 * unit}
          color="var(--pea-logo)"
          className="logo-pea"
          style={{ left: `${((p.cx - p.r) / 28) * 100}%`, top: `${((14 - p.r) / 28) * 100}%` }}
        />
      ))}
    </span>
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
