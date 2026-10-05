import { dueDayInPeriod } from '../lib/calc';
import { formatDayMonth, formatDelta } from '../lib/format';
import { shortMonthName } from '../lib/period';
import type { Frequency, Period, PlanEntry } from '../lib/types';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartal',
  semiannual: 'Halbjährlich',
  annual: 'Jährlich',
};

/**
 * 'Jährlich · 3.10.' / 'Quartal' / 'Halbjährlich · Jun, Dez'; null for monthly.
 * `period` resolves day 31 to the real last day of that month.
 */
export function scheduleLabel(plan: PlanEntry, period?: Period): string | null {
  if (plan.frequency === 'monthly') return null;
  const base = FREQUENCY_LABEL[plan.frequency];
  const months = [...plan.dueMonths].sort((a, b) => a - b);
  if (plan.dueDay && months.length === 1) {
    const month = months[0]!;
    const year = period ? period.slice(0, 4) : '2025'; // non-leap year: Feb 28
    const day = dueDayInPeriod(plan.dueDay, `${year}-${String(month).padStart(2, '0')}`)!;
    return `${base} · ${formatDayMonth(day, month)}`;
  }
  if (plan.frequency === 'quarterly' && months.length === 4) return base;
  return `${base} · ${months.map(shortMonthName).join(', ')}`;
}

/** Full schedule for lists: 'Monatlich' / 'Monatlich · am 3.' / 'Quartal · Jan, Apr, Jul, Okt' */
export function planDescription(plan: PlanEntry): string {
  if (plan.frequency === 'monthly') {
    return plan.dueDay ? `Monatlich · am ${plan.dueDay === 31 ? 'Monatsletzten' : `${plan.dueDay}.`}` : 'Monatlich';
  }
  const months = [...plan.dueMonths].sort((a, b) => a - b).map(shortMonthName).join(', ');
  const day = plan.dueDay ? ` · am ${plan.dueDay === 31 ? 'Monatsletzten' : `${plan.dueDay}.`}` : '';
  return `${FREQUENCY_LABEL[plan.frequency]} · ${months}${day}`;
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
