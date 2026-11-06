/**
 * Erbse mark: rounded square in the brand colour with three flat white peas, opacity 100 / 85 / 70 %
 * (state of sprint rebrand-erbse, commit afaa0bc). Colours come from tokens (currentColor = brand).
 * The icon files in public/ use the same geometry (scripts/brand/*.svg, scripts/make-icons.mjs).
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0 text-accent" data-logo="">
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

/**
 * Sidebar head on iPad and desktop: the brand mark alone – the three overlapping peas of the app icon,
 * same geometry (r 3.4 at cx 9 / 14 / 19 on 28 px), flat, opacity 100 / 85 / 70 % from left to right.
 * Colour: the token --c-mark (brand, a lighter brand tone in dark mode). No square, no word mark.
 * Hidden while the start screen is there (index.css, [data-splash]): exactly one logo at any time.
 */
export function PeaMark({ height = 18 }: { height?: number }) {
  // the icon's 28 × 28 grid, cropped to the three circles (x 5.6 … 22.4, y 10.6 … 17.4)
  const width = (height * 16.8) / 6.8;
  return (
    <svg
      role="img"
      aria-label="Erbse"
      width={width}
      height={height}
      viewBox="5.6 10.6 16.8 6.8"
      className="shrink-0 text-mark"
      data-testid="logo"
      data-logo=""
    >
      <circle cx="9" cy="14" r="3.4" fill="currentColor" />
      <circle cx="14" cy="14" r="3.4" fill="currentColor" opacity=".85" />
      <circle cx="19" cy="14" r="3.4" fill="currentColor" opacity=".7" />
    </svg>
  );
}
