interface Props {
  /** 0–1 */
  ratio: number;
  size?: number;
  stroke?: number;
  label: string;
}

/** White month ring for the indigo hero card; closes into a check, like the logo. */
export function ProgressRing({ ratio, size = 104, stroke = 10, label }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  const done = clamped >= 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.22)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#ffffff"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
          style={{ filter: 'drop-shadow(0 1px 2px rgb(20 10 80 / 0.25))' }}
        />
      </svg>
      <div className="num absolute inset-0 flex items-center justify-center text-[20px] font-semibold tracking-tight text-white">
        {done ? (
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 12.5l4.5 4.5 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          `${Math.floor(clamped * 100)}%`
        )}
      </div>
    </div>
  );
}
