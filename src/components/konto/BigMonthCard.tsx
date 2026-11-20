import { useRef } from 'react';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import type { MonthPlan } from '../../lib/monthPlan';
import { monthName } from '../../lib/period';
import { openPlan } from '../../lib/planBus';
import { AlertIcon, CheckIcon, ChevronRight } from '../Icons';

const money = (v: number) => formatEUR(v, { fixed: true });

/** The proposal of „Dein Plan“ for „Plane vor: …“ (the first one, else the maximum). */
function prepareText(plan: MonthPlan): string {
  const a = plan.answer;
  if (a?.kind === 'save')
    return a.via === 'even' || !a.proposals[0]
      ? t('plan2.proposal.even')
      : t('plan2.proposal', { monat: monthName(a.proposals[0].start), betrag: money(a.proposals[0].rate), zahlung: a.proposals[0].name });
  if (a?.kind === 'max') return t('plan2.max', { betrag: money(a.max) });
  return t('plan2.none');
}

/**
 * „Nächster großer Monat“: only when a month of the next 12 is 25 % above their average. The month and its
 * bills, its two largest big payments and whether the plan is ready for it. A tap opens „Dein Plan“.
 */
export function BigMonthCard({ plan, className = '' }: { plan: MonthPlan; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const big = plan.bigMonth;
  if (!big) return null;
  const ready = big.ready && plan.fits !== false;
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPlan({ returnFocusTo: button.current })}
      className={`glass glass-tile surface press focus-ring flex w-full min-w-0 flex-col gap-2 p-4 text-left md:p-5 ${className}`}
      data-testid="big-month"
      data-ready={ready}
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
        <span className="num">{ready ? t('big.ready') : t('big.prepare', { vorschlag: prepareText(plan) })}</span>
      </span>
    </button>
  );
}
