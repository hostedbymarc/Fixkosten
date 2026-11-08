import { useState } from 'react';
import { db } from '../../db/db';
import { answerMonthCheck, confirmLump, setGapMode } from '../../db/kontoActions';
import { localToday, type MonthStart } from '../../lib/activeMonth';
import { amountToInput, formatEUR } from '../../lib/format';
import type { KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { coveredText, dayLabel, planText, reasonText, whenText } from '../../lib/kontoWords';
import { monthName } from '../../lib/period';
import { Pea } from '../Pea';

/**
 * ONE amount, always with its reason (tile, setup, sheet): the amount of the next deposit, when it
 * comes, and – with a gap – why and how it is closed:
 * - spread: „Im Februar kommen Kfz-Versicherung und Haushaltsversicherung. Darum bis dahin € 362,48 extra, ab März € 2.920.“
 * - lump: „Im Februar kommen … Leg bis 31. Jänner € 1.087,43 extra zur Seite.“
 * - covered: „Alles eingeplant bis Oktober 2027.“ with a tick.
 * Every number from kontoState.
 */
export function PlanAmount({ state, start, size = 'regular', testId = 'konto' }: { state: KontoState; start: MonthStart; size?: 'regular' | 'large'; testId?: string }) {
  return (
    <div data-testid={`${testId}-plan`} data-mode={state.mode ?? 'covered'}>
      <p className={`num font-semibold leading-tight tracking-[-0.02em] text-ink ${size === 'large' ? 'text-[34px]' : 'text-[30px]'}`} data-testid={`${testId}-amount`}>
        {formatEUR(state.next.amount)}
      </p>
      <p className="mt-0.5 text-[14px] leading-snug text-ink-soft" data-testid={`${testId}-when`}>
        {whenText(state, start)}
      </p>
      <PlanHint state={state} start={start} testId={testId} />
    </div>
  );
}

/** The reason and how the gap is closed – or the tick when everything is planned. */
export function PlanHint({ state, start, testId = 'konto' }: { state: KontoState; start: MonthStart; testId?: string }) {
  if (!state.mode) {
    return (
      <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold leading-snug text-ink" data-testid={`${testId}-covered`}>
        <Pea size={20} state="checked" className="shrink-0" />
        <span data-testid={`${testId}-status-text`}>{coveredText(state, start)}</span>
      </p>
    );
  }
  return (
    <p className="mt-3 rounded-2xl bg-accent-soft px-3 py-2.5 text-[14px] leading-snug text-ink" data-testid={`${testId}-hint`}>
      <span data-testid={`${testId}-reason`}>{reasonText(state, start)}</span> <span data-testid={`${testId}-how`}>{planText(state, start)}</span>
    </p>
  );
}

/** Something to confirm now: this month's deposit while it is open, else the open one-time amount. */
export function pendingConfirm(state: KontoState): 'month' | 'lump' | null {
  if (!state.setupDone) return null;
  if (!state.monthDone) return 'month';
  return state.mode === 'lump' ? 'lump' : null;
}

/**
 * „Zur Seite gelegt“: confirms this month (its amount, base plus extra) or the one-time amount –
 * the amount set aside grows by it.
 */
export function ConfirmButton({ state, active, testId = 'konto-confirm', className = '' }: { state: KontoState; active: string; testId?: string; className?: string }) {
  const what = pendingConfirm(state);
  if (!what) return null;
  const onClick = () =>
    what === 'month'
      ? void answerMonthCheck(db, active as never, true, localToday(), state.months[0]!.amount)
      : void confirmLump(db, state.balance, state.lump, localToday());
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring relative z-10 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto ${className}`}
      data-testid={testId}
      data-confirm={what}
    >
      {t('plan.confirm')}
    </button>
  );
}

/** „Lieber auf einmal?“ / „Lieber verteilen?“ – only while spreading is possible. */
export function SwitchModeLink({ state, testId = 'konto-switch', className = '' }: { state: KontoState; testId?: string; className?: string }) {
  if (!state.canSpread || !state.mode) return null;
  const to = state.mode === 'spread' ? 'lump' : 'spread';
  return (
    <button
      type="button"
      onClick={() => void setGapMode(db, to)}
      className={`focus-ring relative z-10 -mx-1 h-11 rounded-lg px-1 text-[14px] font-medium text-accent-ink underline underline-offset-2 ${className}`}
      data-testid={testId}
      data-to={to}
    >
      {t(to === 'lump' ? 'plan.toLump' : 'plan.toSpread')}
    </button>
  );
}

/**
 * „Warum € X?“ (sheet): „Normaler Monat € 2.920“, „Extra für Februar + € 362,48“ with the big bills
 * of that month under it (name and amount), the sum. With the one-time amount: „Einmalig bis …“.
 */
export function WhyAmount({ state }: { state: KontoState }) {
  const extra = state.mode === 'spread' ? state.next.extra : state.mode === 'lump' ? state.lump : 0;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="konto-why" data-testid="konto-why">
      <h3 id="konto-why" className="text-[17px] font-semibold leading-snug text-ink">
        {t('sheet.why', { betrag: formatEUR(state.next.amount) })}
      </h3>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="text-ink-soft">{t('sheet.normal')}</dt>
        <dd className="num text-right text-ink" data-testid="konto-why-base">
          {formatEUR(state.order)}
        </dd>
        {extra > 0 && state.gapFrom && (
          <>
            <dt className="text-ink-soft">
              {state.mode === 'spread' ? t('sheet.extra', { monat: monthName(state.gapFrom) }) : t('sheet.lump', { datum: dayLabel(state.gapBy ?? localToday()) })}
            </dt>
            <dd className="num text-right text-ink" data-testid="konto-why-extra">
              + {formatEUR(extra)}
            </dd>
            {state.gapBills.length > 0 && (
              <dd className="col-span-2 -mt-0.5 mb-1">
                <ul className="flex flex-col gap-0.5 border-l-2 border-accent-soft pl-3 text-[13px] text-ink-mute" data-testid="konto-why-bills">
                  {state.gapBills.map((b, i) => (
                    <li key={`${b.name}-${i}`} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{b.name}</span>
                      <span className="num shrink-0">{formatEUR(b.amount)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            )}
          </>
        )}
        {state.mode === 'spread' && state.next.extra > 0 && (
          <>
            <div className="col-span-2 border-t border-line" aria-hidden="true" />
            <dt className="font-semibold text-ink">{t('sheet.sum')}</dt>
            <dd className="num text-right font-semibold text-ink" data-testid="konto-why-sum">
              {formatEUR(state.next.amount)}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** Status of the plan (sheet): „Mit diesem Plan nie im Minus.“ with a tick, or – one-time amount open – the reason. */
export function PlanStatus({ state, start }: { state: KontoState; start: MonthStart }) {
  if (state.mode === 'lump') {
    return (
      <p className="rounded-2xl bg-accent-soft px-3 py-2.5 text-[14px] leading-snug text-ink" data-testid="konto-plan-status" data-ok="false">
        {reasonText(state, start)} {planText(state, start)}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[15px] font-semibold leading-snug text-ink" data-testid="konto-plan-status" data-ok="true">
      <Pea size={20} state="checked" className="shrink-0" />
      {t('sheet.ok')}
    </p>
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
