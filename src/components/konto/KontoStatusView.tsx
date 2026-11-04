import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import { setAnchor, setPlan } from '../../db/kontoActions';
import { localToday } from '../../lib/activeMonth';
import { amountToInput, formatEUR } from '../../lib/format';
import type { KontoState, PlanStep } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { periodLabel } from '../../lib/period';
import { AlertIcon } from '../Icons';
import { Pea, PeaOpen } from '../Pea';

/**
 * The status sentence, from kontoState only – tile, sheet, „Dein Plan“ and settings use exactly this.
 * setup: „Fixkostenkonto einrichten“ · gap: „Im Februar 2027 fehlen € 865,79.“ · covered: „Alles gedeckt bis Oktober 2027.“
 */
export function statusText(state: KontoState): string {
  if (state.status === 'setup') return t('status.setup');
  if (state.status === 'gap') return t('status.gap', { monat: periodLabel(state.gapMonth ?? state.coveredUntil), betrag: formatEUR(state.gap) });
  return t('status.covered', { monat: periodLabel(state.coveredUntil) });
}

export function progressText(state: KontoState): string {
  return t('status.progress', { n: state.planDone, gesamt: state.plan.length });
}

/**
 * The status in words, with its one action: the progress while the plan is open, „Zahl einmalig … ein“
 * with „Erledigt, eingezahlt“ for a gap, a tick when everything is covered.
 */
export function KontoStatusLine({
  state,
  size = 'regular',
  withAction = true,
  testId,
}: {
  state: KontoState;
  size?: 'compact' | 'regular';
  /** „Erledigt, eingezahlt“ under a gap */
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
      {state.status === 'setup' && (
        <p className={`mt-1 flex items-center gap-2 text-ink-mute ${small}`}>
          <span className="flex items-center gap-1" aria-hidden="true">
            {state.plan.map((p) => (p.done ? <Pea key={p.id} size={10} state="checked" /> : <PeaOpen key={p.id} size={10} />))}
          </span>
          <span data-testid={`${testId}-progress`}>{progressText(state)}</span>
        </p>
      )}
      {state.status === 'gap' && (
        <>
          <p className={`mt-1 leading-snug text-ink-soft ${small}`} data-testid={`${testId}-action`}>
            {t('status.gap.action', { betrag: formatEUR(state.gap) })}
          </p>
          {withAction && <PaidButton state={state} testId={`${testId}-paid`} />}
        </>
      )}
    </div>
  );
}

/** „Erledigt, eingezahlt“: the one-time transfer is on the account → a new anchor, the gap is 0. */
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
 * „Dein Plan“: always three points (account, standing order, one-time transfer); the progress is in the status line. Each
 * „Erledigt“ is saved at once and pops in; the numbers are the ones of kontoState.
 */
export function PlanList({ state, day, testId = 'plan' }: { state: KontoState; day: string; testId?: string }) {
  return (
    <ul className="flex flex-col gap-3" data-testid={testId}>
      {state.plan.map((step) => (
        <PlanItem key={step.id} step={step} state={state} day={day} testId={`${testId}-${step.id}`} />
      ))}
    </ul>
  );
}

function PlanItem({ step, state, day, testId }: { step: PlanStep; state: KontoState; day: string; testId: string }) {
  const amount = formatEUR(state.order);
  let body: ReactNode;
  let onDone: (() => void) | null = null;
  if (step.id === 'account') {
    body = step.isNew ? (
      <>
        <span className="font-semibold">{t('plan.account')}</span>
        <span className="mt-0.5 block text-[14px] text-ink-soft">{t('plan.account.hint')}</span>
      </>
    ) : (
      t('plan.account.ok')
    );
    if (step.isNew) onDone = () => void setPlan(db, { accountDone: !step.done });
  } else if (step.id === 'order') {
    const [before, after] = t(step.isNew ? 'plan.order.new' : 'plan.order.check', { betrag: '\u0000', tag: day }).split('\u0000');
    body = (
      <>
        {before}
        <span className="num whitespace-nowrap font-semibold" data-testid={`${testId}-value`}>
          {amount}
        </span>
        {after}
        <CopyButton amount={state.order} testId={`${testId}-copy`} />
      </>
    );
    onDone = () => void setPlan(db, { orderDone: !step.done });
  } else if (state.gap > 0) {
    const [before, after] = t('plan.gap', { betrag: '\u0000' }).split('\u0000');
    body = (
      <>
        {before}
        <span className="num whitespace-nowrap font-semibold" data-testid={`${testId}-value`}>
          {formatEUR(state.gap)}
        </span>
        {after}
      </>
    );
    // paid in: a new anchor, the gap is 0 and this point is done (it cannot be undone here)
    onDone = () => void setAnchor(db, state.balance + state.gap, localToday());
  } else {
    body = t('plan.gap.none');
  }
  const popped = usePop(step.done);
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
          className={`focus-ring h-11 shrink-0 rounded-xl px-4 text-[15px] font-semibold ${step.done ? 'text-paid-ink' : 'bg-accent text-white hover:bg-accent-hover'}`}
          data-testid={`${testId}-done`}
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

/** The success moment once the last point is done: the tick pops, „Alles gedeckt bis …“. */
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
