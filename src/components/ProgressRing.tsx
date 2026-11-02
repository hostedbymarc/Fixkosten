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
}

/** Month ring: brand on brand-100; a check replaces the percentage once everything is paid. */
export function ProgressRing({ ratio, percent, done, size = 104, stroke = 10, label, className }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div className={`relative shrink-0 ${className ?? ''}`} style={className ? undefined : { width: size, height: size }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track stroke-accent-soft" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-out"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
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
