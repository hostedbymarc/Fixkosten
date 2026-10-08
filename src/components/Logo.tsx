/**
 * Erbse mark: rounded square in the brand colour with three peas, opacity 100 / 85 / 70 %.
 * Colours come from tokens (currentColor = brand). The icon files in public/ use the same geometry.
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
