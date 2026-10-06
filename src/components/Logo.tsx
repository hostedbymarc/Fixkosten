/**
 * The Fixkosten mark: the month ring almost closed, a dot for the next payment
 * in the gap and a check in the middle. Geometry matches public/favicon.svg and
 * scripts/brand/icon.svg.
 */
export function LogoGlyph({ size = 24, dot = true, weight = 9 }: { size?: number; dot?: boolean; weight?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="30"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeDasharray="160 200"
        transform="rotate(-75 50 50)"
      />
      {dot && <circle cx="43.8" cy="20.7" r="4" fill="currentColor" />}
      <path
        d="M37.5 51 L46.5 60 L63 42.5"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** App-icon tile: glossy indigo with the white glyph. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="logo-tile inline-flex shrink-0 items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
      aria-hidden="true"
    >
      <LogoGlyph size={size * 0.8} dot={size >= 28} weight={size >= 28 ? 9 : 11} />
    </span>
  );
}
