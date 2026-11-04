import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import { setAnchor, setPlan } from '../../db/kontoActions';
import { localToday } from '../../lib/activeMonth';
import { amountToInput, formatEUR } from '../../lib/format';
import type { KontoState, PlanStep } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { periodLabel, toPeriod } from '../../lib/period';
import { AlertIcon } from '../Icons';
import { InfoTip } from '../InfoTip';
import { Pea, PeaOpen } from '../Pea';

/**
 * The status sentence, from kontoState only – tile, sheet, „Dein Plan“ and settings use exactly this.
 * setup: „Fixkosten einplanen“ · gap: „Ab Februar 2027 reicht das Geld nicht.“ · covered: „Alles eingeplant bis Oktober 2027.“
 */
export function statusText(state: KontoState): string {
  if (state.status === 'setup') return t('status.setup');
  if (state.status === 'gap') return t('status.gap', { monat: periodLabel(state.gapFrom ?? state.coveredUntil) });
  return t('status.covered', { monat: periodLabel(state.coveredUntil) });
}

export function progressText(state: KontoState): string {
  return t('status.progress', { n: state.planDone, gesamt: state.plan.length });
}

/** „24. Jänner 2027“ */
export function dayLabel(d: Date): string {
  return `${d.getDate()}. ${periodLabel(toPeriod(d))}`;
}

/** The deadline has passed (the money is missing in the active month): „jetzt“ instead of a date. */
function deadlinePassed(by: Date | null): boolean {
  if (!by) return true;
  const today = localToday();
  return by < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/** „Leg bis 24. Jänner 2027 einmalig € 865,79 zur Seite.“ (tile, sheet, settings) */
export function gapActionText(state: KontoState): string {
  const betrag = formatEUR(state.gap);
  return deadlinePassed(state.gapBy) ? t('status.gap.actionNow', { betrag }) : t('status.gap.action', { datum: dayLabel(state.gapBy!), betrag });
}

/** Thin progress bar in brand green: „1 von 2 erledigt“ (plan and tile). */
export function PlanProgress({ state, testId, className = '' }: { state: KontoState; testId: string; className?: string }) {
  const total = state.plan.length;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={state.planDone}
        aria-label={progressText(state)}
        className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-accent-soft"
        data-testid={`${testId}-bar`}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(state.planDone / total) * 100}%` }} />
      </div>
      <span className="shrink-0 text-[14px] text-ink-mute" data-testid={`${testId}-progress`}>
        {progressText(state)}
      </span>
    </div>
  );
}

/**
 * The status in words, with its one action: the progress bar while the plan is open, „Leg bis …
 * einmalig … zur Seite.“ with „Erledigt, zur Seite gelegt“ for a gap, a tick when everything is planned.
 */
export function KontoStatusLine({
  state,
  size = 'regular',
  withAction = true,
  testId,
}: {
  state: KontoState;
  size?: 'compact' | 'regular';
  /** „Erledigt, zur Seite gelegt“ under a gap */
  withAction?: boolean;
  testId: string;
}) {
  const big = size === 'regular' ? 'text-[17px]' : 'text-[16px]';
  const small = size === 'regular' ? 'text-[15px]' : 'text-[14px]';
  return (
    <div data-testid={testId} data-status={state.status} role="status">
      <p className={`flex items-center gap-2 font-semibold leading-snug text-ink ${big}`}>
        {state.status === 'gap' && <AlertIcon size={18} className="shrink-0 text-over" aria-hidden="true" />}
        {state.status === 'covered' && <Pea size={20} state="checked" className="shrink-0" />}
        <span data-testid={`${testId}-text`}>{statusText(state)}</span>
      </p>
      {state.status === 'setup' && <PlanProgress state={state} testId={testId} className="mt-2" />}
      {state.status === 'gap' && (
        <>
          <p className={`mt-1 leading-snug text-ink-soft ${small}`} data-testid={`${testId}-action`}>
            {gapActionText(state)}
          </p>
          {withAction && <PaidButton state={state} testId={`${testId}-paid`} />}
        </>
      )}
    </div>
  );
}

/** „Erledigt, zur Seite gelegt“: the one-time amount is set aside → a new anchor, the gap is 0. */
function PaidButton({ state, testId }: { state: KontoState; testId: string }) {
  return (
    <button
      type="button"
      onClick={() => void setAnchor(db, state.balance + state.gap, localToday())}
      className="focus-ring relative z-10 mt-2 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
      data-testid={testId}
    >
      {t('status.gap.done')}
    </button>
  );
}

/**
 * „Dein Plan“: two points (the monthly amount, the one-time amount); the progress is in the status
 * line. Only the next open point has the primary green „Erledigt“, the others a secondary one – any
 * order works. Each „Erledigt“ is saved at once and pops in; the numbers are the ones of kontoState.
 */
export function PlanList({ state, day, testId = 'plan' }: { state: KontoState; day: string; testId?: string }) {
  const next = state.plan.find((p) => !p.done)?.id;
  return (
    <ul className="flex flex-col gap-3" data-testid={testId}>
      {state.plan.map((step) => (
        <PlanItem key={step.id} step={step} state={state} day={day} primary={step.id === next} testId={`${testId}-${step.id}`} />
      ))}
    </ul>
  );
}

/** text with one amount in it, the amount bold and with its test id */
function withAmount(text: string, amount: string, testId: string): ReactNode {
  const [before, after] = text.split('\u0000');
  return (
    <>
      {before}
      <span className="num whitespace-nowrap font-semibold" data-testid={testId}>
        {amount}
      </span>
      {after}
    </>
  );
}

function PlanItem({ step, state, day, primary, testId }: { step: PlanStep; state: KontoState; day: string; primary: boolean; testId: string }) {
  let body: ReactNode;
  let onDone: (() => void) | null = null;
  if (step.id === 'order') {
    if (state.hasAccount) {
      body = (
        <>
          {withAmount(t(step.isNew ? 'plan.order.new' : 'plan.order.check', { betrag: '\u0000', tag: day }), formatEUR(state.order), `${testId}-value`)}
          <CopyButton amount={state.order} testId={`${testId}-copy`} />
        </>
      );
    } else {
      body = (
        <span className="inline">
          {withAmount(t('plan.monthly', { betrag: '\u0000' }), formatEUR(state.order), `${testId}-value`)}
          <InfoTip label="Erklärung: Monatsbetrag zur Seite legen" title="Automatisch zur Seite legen" className="-my-3 -ml-1 inline-flex align-middle" testId={`${testId}-info`}>
            <p>{t('plan.monthly.info')}</p>
          </InfoTip>
        </span>
      );
    }
    onDone = () => void setPlan(db, { orderDone: !step.done });
  } else if (state.gap > 0) {
    const text = deadlinePassed(state.gapBy) ? t('plan.gap.now', { betrag: '\u0000' }) : t('plan.gap', { datum: dayLabel(state.gapBy!), betrag: '\u0000' });
    body = withAmount(text, formatEUR(state.gap), `${testId}-value`);
    // set aside: a new anchor, the gap is 0 and this point is done (it cannot be undone here)
    onDone = () => void setAnchor(db, state.balance + state.gap, localToday());
  } else {
    body = t('plan.gap.none');
  }
  const popped = usePop(step.done);
  const button = step.done
    ? 'text-paid-ink'
    : primary
      ? 'bg-accent text-white hover:bg-accent-hover'
      : 'glass-inset bg-surface text-accent-ink hover:bg-accent-soft';
  return (
    <li className="glass-inset flex items-start gap-3 rounded-2xl bg-surface p-4" data-testid={testId} data-done={step.done || undefined}>
      <span className="mt-0.5 shrink-0">
        {step.done ? <Pea size={24} state="checked" className={popped ? 'anim-check' : ''} /> : <PeaOpen size={24} />}
      </span>
      <div className="min-w-0 flex-1 text-[16px] leading-snug text-ink">{body}</div>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          aria-pressed={step.done}
          className={`focus-ring h-11 shrink-0 rounded-xl px-4 text-[15px] font-semibold ${button}`}
          data-testid={`${testId}-done`}
          data-primary={(primary && !step.done) || undefined}
        >
          {t('plan.done')}
        </button>
      )}
    </li>
  );
}

/** True right after `done` turned true (not when it was already done on mount): the pop plays once. */
function usePop(done: boolean): boolean {
  const was = useRef(done);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (done && !was.current) setPop(true);
    was.current = done;
  }, [done]);
  return pop;
}

/** The success moment once the last point is done: the tick pops, „Alles eingeplant bis …“. */
export function PlanSuccess({ state, testId = 'plan-success' }: { state: KontoState; testId?: string }) {
  if (state.status !== 'covered') return null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-paid-soft px-4 py-5 text-center" data-testid={testId} role="status">
      <Pea size={44} state="checked" className="anim-check" />
      <p className="text-[18px] font-semibold leading-snug text-ink">{statusText(state)}</p>
    </div>
  );
}

export function CopyButton({ amount, testId }: { amount: number; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(amountToInput(amount));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* no clipboard: the amount stays visible */
        }
      }}
      className="focus-ring glass-inset mt-2 flex h-11 items-center rounded-xl bg-surface px-3 text-[15px] font-semibold text-accent-ink"
      data-testid={testId}
    >
      {copied ? t('plan.copied') : t('plan.copy')}
    </button>
  );
}
