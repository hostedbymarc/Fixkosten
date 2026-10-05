import { formatDayMonth, formatDelta } from '../lib/format';
import { shortMonthName } from '../lib/period';
import type { Position } from '../lib/types';

const FREQUENCY_LABEL: Record<Position['frequency'], string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartal',
  semiannual: 'Halbjährlich',
  annual: 'Jährlich',
};

export function frequencyLabel(position: Position): string {
  return FREQUENCY_LABEL[position.frequency];
}

/** 'Jährlich · 3.10.' / 'Quartal' / 'Halbjährlich · Jun, Dez' */
export function scheduleLabel(position: Position): string | null {
  if (position.frequency === 'monthly') return null;
  const base = FREQUENCY_LABEL[position.frequency];
  const months = position.dueMonths;
  if (position.dueDay && months.length === 1) {
    return `${base} · ${formatDayMonth(position.dueDay, months[0]!)}`;
  }
  if (position.frequency === 'quarterly') return base;
  return `${base} · ${months.map(shortMonthName).join(', ')}`;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warn';
}) {
  const tones = {
    neutral: 'bg-zinc-100 text-ink-soft',
    accent: 'bg-accent-soft text-accent-strong',
    warn: 'bg-warn-soft text-warn',
  };
  return (
    <span
      className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** +€ 12 red (more expensive) / −€ 5 green (cheaper) */
export function DeltaChip({ delta }: { delta: number }) {
  if (Math.round(delta * 100) === 0) return null;
  const more = delta > 0;
  return (
    <span
      className={`num inline-flex h-[20px] items-center rounded-md px-1.5 text-[12px] font-semibold ${
        more ? 'bg-over-soft text-over' : 'bg-paid-soft text-paid'
      }`}
      aria-label={`${more ? 'Mehr' : 'Weniger'} als geplant: ${formatDelta(delta)}`}
    >
      {formatDelta(delta)}
    </span>
  );
}
