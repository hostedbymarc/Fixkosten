import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import { writeKonto, type KontoSettings } from '../../db/settings';
import { ROUNDING_CHOICES, type KontoMonth, type KontoOverview, type Rounding, type StandingOrderCause } from '../../lib/fixkostenkonto';
import { amountToInput, formatAvg, formatEUR, formatEURSet, MINUS, parseAmount } from '../../lib/format';
import { monthName, periodLabel } from '../../lib/period';
import type { Period } from '../../lib/types';
import { AlertIcon } from '../Icons';
import { AmountField, Segmented } from '../form';

/** The assumption of the simulation, visible wherever its numbers are. */
export const KONTO_ASSUMPTION = 'Annahme: Der Dauerauftrag kommt jeden Monat vor allen Abbuchungen. Im aktiven Monat zählen nur noch offene Positionen.';

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

/** „Damit dein Konto nie ins Minus rutscht, zahl einmalig € Y ein.“ / „Dein Konto ist gedeckt.“ */
export function GapMessage({ overview, active }: { overview: KontoOverview; active: Period }) {
  const { simulation } = overview;
  const gap = Math.round(simulation.gap * 100) > 0;
  return (
    <div
      className={`rounded-2xl px-3 py-3 text-[15px] leading-snug ${gap ? 'bg-warn-soft text-ink' : 'bg-paid-soft text-ink'}`}
      data-testid="konto-gap"
      data-gap={gap || undefined}
      role="status"
    >
      {gap ? (
        <>
          <p className="flex items-start gap-2 font-semibold">
            <AlertIcon size={18} className="mt-0.5 shrink-0 text-warn-icon" aria-hidden="true" />
            <span>
              Damit dein Konto nie ins Minus rutscht, zahl einmalig{' '}
              <span className="num whitespace-nowrap" data-testid="konto-gap-value">
                {formatEUR(simulation.gap)}
              </span>{' '}
              ein.
            </span>
          </p>
          {simulation.lowestPeriod && (
            <p className="mt-1 pl-[26px] text-[13px] text-ink-soft">
              Tiefster Stand ohne Einzahlung: <SignedBalance value={simulation.lowest} /> Ende {monthName(simulation.lowestPeriod)}
              {simulation.lowestPeriod.slice(0, 4) !== active.slice(0, 4) ? ` ${simulation.lowestPeriod.slice(0, 4)}` : ''}.
            </p>
          )}
        </>
      ) : (
        <p className="font-semibold" data-testid="konto-covered">
          Dein Konto ist gedeckt.
        </p>
      )}
    </div>
  );
}

/** Hint when the balance keeps growing: the standing order is higher than needed. */
export function RisingHint({ overview }: { overview: KontoOverview }) {
  if (!overview.simulation.rising) return null;
  return (
    <p className="rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-snug text-ink-soft" data-testid="konto-rising">
      Dein Kontostand steigt in 12 Monaten um <span className="num whitespace-nowrap font-semibold text-ink">{formatEUR(overview.simulation.surplus)}</span>.
      Der Dauerauftrag ist höher als nötig, z. B. durch die Rundung.
    </p>
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

/** Month list as text: every month with its end balance; tap opens the breakdown. Also the table alternative to the chart. */
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
  return (
    <ul className="divide-y divide-line" data-testid="konto-month-list">
      {overview.simulation.months.map((m) => {
        const open = selected === m.period;
        return (
          <li key={m.period}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onSelect(open ? null : m.period)}
              className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-[14px] hover:bg-zinc-50"
              data-testid="konto-month-row"
              data-period={m.period}
            >
              <span className="text-ink">{periodLabel(m.period)}</span>
              <span className="flex items-center gap-3">
                <span className="num text-[12px] text-ink-mute">{formatEUR(m.debits)} ab</span>
                <SignedBalance value={m.end} className="font-semibold" />
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

/** „Dauerauftrag € X / Monat“ with the exact sum, the rounding and its largest reason. */
export function StandingOrderHeadline({ overview }: { overview: KontoOverview }) {
  const { order } = overview;
  return (
    <div data-testid="konto-order">
      <p className="text-[13px] font-medium text-ink-mute">Dauerauftrag</p>
      <p className="num text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        <span data-testid="konto-order-value">{formatEUR(order.amount)}</span>
        <span className="text-[16px] font-medium text-ink-mute"> / Monat</span>
      </p>
      <p className="text-[13px] text-ink-mute" data-testid="konto-order-exact">
        Abbuchungen {periodLabel(order.from)} bis {periodLabel(order.to)} ÷ 12 = <span className="num">{formatAvg(order.exact)}</span>, aufgerundet auf{' '}
        {formatEUR(order.rounding)}
      </p>
      {order.cause && (
        <p className="mt-1 text-[13px] text-ink-soft" data-testid="konto-order-cause">
          {causeText(order.cause)}
        </p>
      )}
    </div>
  );
}

/** „Kontostand heute“, „Dauerauftrag für diesen Monat schon eingegangen?“, rounding. Saved right away. */
export function KontoInputs({ settings, active, showRounding = true }: { settings: KontoSettings; active: Period; showRounding?: boolean }) {
  const [text, setText] = useState(amountToInput(settings.balance));
  const [dirty, setDirty] = useState(false);
  // a change from elsewhere (import, the other screen) shows up unless the field is being edited
  useEffect(() => {
    if (!dirty) setText(amountToInput(settings.balance));
  }, [settings.balance, dirty]);
  const parsed = text.trim() === '' ? 0 : parseAmount(text);
  const received = settings.receivedFor === active;
  return (
    <div className="flex flex-col gap-4" data-testid="konto-inputs">
      <AmountField
        label="Kontostand heute"
        value={text}
        onChange={(v) => {
          setText(v);
          setDirty(true);
          const value = v.trim() === '' ? 0 : parseAmount(v);
          if (value !== null) void writeKonto(db, { balance: value });
        }}
        placeholder="0"
        error={parsed === null ? 'Bitte einen Betrag eingeben, z. B. 1.250,00' : null}
        info="Was heute auf deinem Fixkostenkonto liegt."
        testId="konto-balance"
      />
      <Segmented<'yes' | 'no'>
        label={`Dauerauftrag für ${monthName(active)} schon eingegangen?`}
        value={received ? 'yes' : 'no'}
        onChange={(v) => void writeKonto(db, { receivedFor: v === 'yes' ? active : null })}
        options={[
          { value: 'yes', label: 'Ja' },
          { value: 'no', label: 'Nein' },
        ]}
      />
      {showRounding && (
        <Segmented<string>
          label="Dauerauftrag aufrunden auf"
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
