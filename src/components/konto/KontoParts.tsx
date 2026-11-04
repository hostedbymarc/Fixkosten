import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import { answerMonthCheck, setAnchor } from '../../db/kontoActions';
import { writeKonto, type KontoSettings } from '../../db/settings';
import { localToday } from '../../lib/activeMonth';
import { depositDone } from '../../lib/kontoBalance';
import { ROUNDING_CHOICES, type KontoMonth, type KontoOverview, type Rounding, type StandingOrderCause } from '../../lib/fixkostenkonto';
import { amountToInput, formatEUR, formatEURSet, MINUS, parseAmount } from '../../lib/format';
import { axisPeriodLabel } from '../../lib/analytics';
import { t } from '../../lib/kontoTexts';
import { monthName, periodLabel } from '../../lib/period';
import type { Period } from '../../lib/types';
import { AlertIcon } from '../Icons';
import { AmountField, Segmented } from '../form';

/** The assumption of the simulation, visible wherever its numbers are. */
export const KONTO_ASSUMPTION = t('sheet.assumption');

/** Signed amount, never colour only: '−€ 120' with the alert icon when below 0. */
export function SignedBalance({ value, className = '' }: { value: number; className?: string }) {
  const negative = Math.round(value * 100) < 0;
  return (
    <span className={`num inline-flex items-center gap-1 whitespace-nowrap ${negative ? 'text-over' : ''} ${className}`} data-negative={negative || undefined}>
      {negative && <AlertIcon size={14} />}
      {formatEUR(value)}
    </span>
  );
}

/** Hint when the balance keeps growing: the standing order is higher than needed. */
export function RisingHint({ overview }: { overview: KontoOverview }) {
  if (!overview.simulation.rising) return null;
  return (
    <p className="rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-snug text-ink-soft" data-testid="konto-rising">
      {withBold(t('sheet.rising', { betrag: '\u0000' }), formatEUR(overview.simulation.surplus))}
    </p>
  );
}

/** A text with one bold amount in place of the \u0000 placeholder. */
function withBold(text: string, amount: string) {
  const [before, after] = text.split('\u0000');
  return (
    <>
      {before}
      <span className="num whitespace-nowrap font-semibold text-ink">{amount}</span>
      {after}
    </>
  );
}

/** One month of the simulation: deposit, debits, balance. */
export function MonthBreakdown({ month, active }: { month: KontoMonth; active: Period }) {
  const [deposit, debits] = formatEURSet(month.deposit, month.debits);
  return (
    <div className="text-[13px]" data-testid="konto-month-detail" data-period={month.period}>
      <p className="font-semibold text-ink">
        {periodLabel(month.period)}
        {month.period === active && <span className="ml-1 font-normal text-ink-mute">· nur noch offene</span>}
      </p>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-ink-soft">
        <dt>Stand am Monatsanfang</dt>
        <dd className="text-right">
          <SignedBalance value={month.start} />
        </dd>
        <dt>Einzahlung</dt>
        <dd className="num text-right">+{deposit}</dd>
        <dt>Abbuchungen</dt>
        <dd className="num text-right">
          {MINUS}
          {debits}
        </dd>
        <dt className="font-semibold text-ink">Stand am Monatsende</dt>
        <dd className="text-right font-semibold text-ink">
          <SignedBalance value={month.end} />
        </dd>
      </dl>
      {month.items.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-line pt-1.5 text-ink-mute">
          {month.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {item.name}
                {item.once ? ' (einmalig)' : ''}
              </span>
              <span className="num shrink-0">{formatEUR(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Month list as a table: Monat · Einzahlung · Abbuchungen · Stand, with signs (+ in, − out); tap opens
 * the breakdown. Also the table alternative to the chart.
 */
export function MonthList({
  overview,
  active,
  selected,
  onSelect,
}: {
  overview: KontoOverview;
  active: Period;
  selected: Period | null;
  onSelect: (p: Period | null) => void;
}) {
  const months = overview.simulation.months;
  // one format for each column, so the amounts line up (cents only where one of them has some)
  const deposits = formatEURSet(...months.map((m) => m.deposit));
  const debits = formatEURSet(...months.map((m) => m.debits));
  const row = 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2.5 sm:gap-x-4';
  return (
    <div data-testid="konto-month-list">
      <div className={`${row} px-1 pb-1 text-[11px] font-medium text-ink-mute sm:text-[12px]`} aria-hidden="true" data-testid="konto-month-head">
        <span>Monat</span>
        <span className="text-right">{t('sheet.col.deposit')}</span>
        <span className="text-right">{t('sheet.col.debits')}</span>
        <span className="min-w-[72px] text-right">{t('sheet.col.end')}</span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {months.map((m, i) => {
          const open = selected === m.period;
          const deposit = Math.round(m.deposit * 100) > 0 ? `+${deposits[i]}` : deposits[i];
          const debit = Math.round(m.debits * 100) > 0 ? `${MINUS}${debits[i]}` : debits[i];
          return (
            <li key={m.period}>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${periodLabel(m.period)}: Einzahlung ${deposit}, Abbuchungen ${debit}, Stand ${formatEUR(m.end)}`}
                onClick={() => onSelect(open ? null : m.period)}
                className={`focus-ring ${row} min-h-11 w-full rounded-xl px-1 text-left text-[13px] hover:bg-zinc-50 sm:text-[14px]`}
                data-testid="konto-month-row"
                data-period={m.period}
              >
                <span className="min-w-0 truncate text-ink">{axisPeriodLabel(m.period)}</span>
                <span className="num text-right text-ink-soft" data-testid="konto-month-deposit">
                  {deposit}
                </span>
                <span className="num text-right text-ink-soft" data-testid="konto-month-debits">
                  {debit}
                </span>
                <span className="min-w-[72px] text-right">
                  <SignedBalance value={m.end} className="justify-end font-semibold" />
                </span>
              </button>
              {open && (
                <div className="px-1 pb-3">
                  <MonthBreakdown month={m} active={active} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The hint line under the standing order: its largest reason, in one sentence. */
export function causeText(cause: StandingOrderCause): string {
  const more = cause.monthly > 0 ? 'Mehr' : 'Weniger';
  const month = periodLabel(cause.period);
  switch (cause.kind) {
    case 'change':
      return `${more}, weil ${cause.name} ab ${month} ${formatEUR(cause.amount)} kostet.`;
    case 'start':
      return `${more}, weil ${cause.name} ab ${month} dazukommt.`;
    case 'end':
      return `${more}, weil ${cause.name} nach ${month} endet.`;
    case 'once':
      return `${more}, weil ${cause.name} im ${month} einmalig ${formatEUR(cause.amount)} kostet.`;
  }
}

/**
 * „Schon zur Seite gelegt“, „Dauerauftrag für … schon eingegangen?“ (without account: „Für … schon zur Seite gelegt?“), rounding. Saved right away:
 * a balance typed here is a new anchor, the answer is this month's check.
 */
export function KontoInputs({ settings, active, balance, showRounding = true }: { settings: KontoSettings; active: Period; balance?: number; showRounding?: boolean }) {
  const shown = balance ?? settings.balance;
  const [text, setText] = useState(amountToInput(shown));
  const [dirty, setDirty] = useState(false);
  // a change from elsewhere (import, the other screen) shows up unless the field is being edited
  useEffect(() => {
    if (!dirty) setText(amountToInput(shown));
  }, [shown, dirty]);
  const parsed = text.trim() === '' ? 0 : parseAmount(text);
  const received = depositDone(settings, active);
  return (
    <div className="flex flex-col gap-4" data-testid="konto-inputs">
      <AmountField
        label={t('settings.balance')}
        value={text}
        onChange={(v) => {
          setText(v);
          setDirty(true);
          const value = v.trim() === '' ? 0 : parseAmount(v);
          if (value !== null) void setAnchor(db, value, localToday());
        }}
        placeholder="0"
        error={parsed === null ? 'Bitte einen Betrag eingeben, z. B. 1.250,00' : null}
        info={t('sheet.balance.info')}
        testId="konto-balance"
      />
      <Segmented<'yes' | 'no'>
        label={t(settings.hasAccount === false ? 'sheet.received.plan' : 'sheet.received', { monat: monthName(active) })}
        value={received ? 'yes' : 'no'}
        onChange={(v) =>
          void answerMonthCheck(db, active, v === 'yes', localToday()).then(() =>
            writeKonto(db, { receivedFor: v === 'yes' ? active : null, ...(v === 'yes' && settings.orderStartsAfter === active ? { orderStartsAfter: null } : {}) }),
          )
        }
        options={[
          { value: 'yes', label: 'Ja' },
          { value: 'no', label: 'Nein' },
        ]}
      />
      {showRounding && (
        <Segmented<string>
          label={t('sheet.rounding')}
          value={String(settings.rounding)}
          onChange={(v) => void writeKonto(db, { rounding: Number(v) as Rounding })}
          options={ROUNDING_CHOICES.map((r) => ({ value: String(r), label: formatEUR(r) }))}
        />
      )}
    </div>
  );
}

/** A folded block (native <details>): heading button with 44 px height, content below. */
export function Fold({ summary, testId, children }: { summary: string; testId?: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-line pt-1" data-testid={testId}>
      <summary className="focus-ring -mx-2 flex h-11 cursor-pointer list-none items-center justify-between rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft">
        {summary}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="pb-1 pt-2">{children}</div>
    </details>
  );
}
