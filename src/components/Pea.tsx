import type { CSSProperties, ReactNode } from 'react';

export type PeaState = 'default' | 'checked' | 'pressed';

interface Props {
  /** diameter in px */
  size?: number;
  /** a colour token, e.g. 'var(--cat-3)' or 'rgb(var(--brand-500))'; every shade is derived from it */
  color?: string;
  state?: PeaState;
  className?: string;
  style?: CSSProperties;
  /** follows :active of the button it sits in (scale .97, light moves) */
  pressable?: boolean;
  children?: ReactNode;
  testId?: string;
}

/** Below this size: no soft light and no drop shadow (it would only smear). */
export const PEA_FLAT_BELOW = 16;
const BRAND = 'rgb(var(--brand-500))';

/**
 * THE Erbse (Soft-3D-Material): category dots, the check, the FAB, the logo, the loading animation,
 * empty states. Matte and inflated – broad soft light, shading in its own colour, a soft coloured
 * shadow; no hard glint. Styles in index.css (.pea). `checked`: brand pea with an embossed white tick.
 */
export function Pea({ size = 24, color, state = 'default', className = '', style, pressable, children, testId }: Props) {
  const c = color ?? BRAND;
  return (
    <span
      className={`pea ${className}`}
      style={{ '--pea-size': `${size}px`, '--pea-c': state === 'checked' && !color ? BRAND : c, ...style } as CSSProperties}
      data-state={state}
      data-flat={size < PEA_FLAT_BELOW || undefined}
      data-pressable={pressable || undefined}
      data-testid={testId}
      aria-hidden="true"
    >
      {state === 'checked' && <PeaTick />}
      {children}
    </span>
  );
}

/** White tick, slightly embossed (a darker copy of the stroke just below it). */
function PeaTick() {
  return (
    <svg className="pea-check" viewBox="0 0 14 14" aria-hidden="true">
      <path className="emboss" d="M3 7.9l2.6 2.6L11 5.1" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7.2l2.6 2.6L11 4.4" fill="none" style={{ stroke: 'var(--check-ink)' }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The open state of a check: a soft dashed ring with a faint inner shadow. */
export function PeaOpen({ size = 28, className = '' }: { size?: number; className?: string }) {
  return <span className={`pea-open ${className}`} style={{ '--pea-size': `${size}px` } as CSSProperties} aria-hidden="true" />;
}
