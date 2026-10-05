interface Props {
  /** 0–1 */
  ratio: number;
  size?: number;
  stroke?: number;
  label: string;
}

export function ProgressRing({ ratio, size = 96, stroke = 9, label }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  const done = clamped >= 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EFEFF3" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={done ? '#16A34A' : '#5B5BD6'}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      <div className="num absolute inset-0 flex items-center justify-center text-[17px] font-semibold text-ink">
        {Math.floor(clamped * 100)}%
      </div>
    </div>
  );
}
