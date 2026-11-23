import { useRef } from 'react';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { bigMonthFrom, type MonthPlan } from '../../lib/monthPlan';
import { monthName } from '../../lib/period';
import type { Period } from '../../lib/types';
import { openPlan } from '../../lib/planBus';
import { AlertIcon, CheckIcon, ChevronRight } from '../Icons';

const money = (v: number) => formatEUR(v, { fixed: true });

/**
 * „Nächster großer Monat“: only when a month of the next 12 is 25 % above their average. The month and its
 * bills, its two largest big payments and whether the plan is ready for it (else: what is missing). A tap opens „Dein Plan“.
 * komplett-ansparen: in the active month and every later one, from the month shown (`period`) on. Every big
 * payment of it saved up before: „✓ Schon angespart“.
 */
export function BigMonthCard({ plan, period, className = '' }: { plan: MonthPlan; period: Period; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const big = bigMonthFrom(plan, period);
  if (!big) return null;
  // gehalt-zum-planen: not ready → the largest amount missing in the plan (monthPlan.shortfall)
  // komplett-ansparen: „✓ Schon angespart“ only when nothing is missing – a missing amount comes first
  const short = big.ready && plan.fits !== false ? null : plan.shortfall;
  const ready = short === null;
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPlan({ returnFocusTo: button.current })}
      className={`glass glass-tile surface press focus-ring flex w-full min-w-0 flex-col gap-2 p-4 text-left md:p-5 ${className}`}
      data-testid="big-month"
      data-ready={ready}
      data-saved={(ready && big.saved) || undefined}
      data-period={big.period}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-mute">{t('big.title')}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
      </span>
      <span className="num flex w-full items-baseline justify-between gap-3 text-[17px] font-semibold text-ink" data-testid="big-month-head">
        <span>{monthName(big.period)}</span>
        <span>{money(big.total)}</span>
      </span>
      {big.top.length > 0 && (
        <span className="num flex w-full flex-col gap-0.5 text-[14px] leading-5 text-ink-soft" data-testid="big-month-top">
          {big.top.map((p) => (
            <span key={p.key} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0">{money(p.amount)}</span>
            </span>
          ))}
        </span>
      )}
      <span className={`flex items-start gap-1.5 text-[14px] font-medium leading-snug ${ready ? 'text-paid-ink' : 'text-over'}`} data-testid="big-month-status">
        {ready ? <CheckIcon size={16} strokeWidth={2.6} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <span className="num">{short !== null ? t('big.short', { betrag: money(short.amount) }) : big.saved ? t('big.saved') : t('big.ready')}</span>
      </span>
    </button>
  );
}
