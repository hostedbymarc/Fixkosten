import type { CSSProperties } from 'react';
import { Pea } from './Pea';

/**
 * Erbse mark: rounded square in the brand colour with three flat white peas, opacity 100 / 85 / 70 %
 * (state of sprint rebrand-erbse, commit afaa0bc). Colours come from tokens (currentColor = brand).
 * The icon files in public/ use the same geometry (scripts/brand/*.svg, scripts/make-icons.mjs).
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0 text-accent">
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <circle cx="9" cy="14" r="3.4" className="fill-white" />
      <circle cx="14" cy="14" r="3.4" className="fill-white" opacity=".85" />
      <circle cx="19" cy="14" r="3.4" className="fill-white" opacity=".7" />
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

/** The three peas of the sidebar head: brand tokens (lighter in dark mode), the same ones the splash lands in. */
const MARK = ['var(--pea-1)', 'var(--pea-2)', 'var(--pea-3)'] as const;

/**
 * Sidebar head on iPad and desktop: only the three peas as the brand mark, no square, no word mark.
 * The splash's peas fly into it (data-testid="logo", src/lib/entrance.ts).
 */
export function PeaMark({ size = 14 }: { size?: number }) {
  return (
    <span role="img" aria-label="Erbse" className="flex items-center" style={{ gap: `${size * 0.3}px` } as CSSProperties} data-testid="logo">
      {MARK.map((c) => (
        <Pea key={c} size={size} color={c} />
      ))}
    </span>
  );
}
