import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import { setPlanMode, setSaving, setSpielgeld, applyMax } from '../../db/kontoActions';
import { useKonto } from '../../db/useKonto';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import type { BigPayment, MonthPlan } from '../../lib/monthPlan';
import { addPeriods, monthName } from '../../lib/period';
import type { Dataset, Period, SavingSetting } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { AmountInput } from '../form';
import { AlertIcon, CheckIcon } from '../Icons';
import { useMonthPlan } from './DeinMonatCard';

const money = (v: number) => formatEUR(v, { fixed: true });
const BUTTON = 'focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold';
const PRIMARY = `${BUTTON} bg-accent text-white hover:bg-accent-hover`;

interface Props {
  ds: Dataset;
  active: Period;
  /** opened from the pill: the Spielgeld is editable at once */
  editSpielgeld?: boolean;
  /** right after the setup: the recommended plan becomes the plan (when none was chosen) */
  fromSetup?: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * „Dein Plan“ (monat-verdichtet; replaces „verteilt / auf einmal“): the answer in one sentence, the
 * Spielgeld, the switch „Bei Fälligkeit | Gleichmäßig“ with „Empfohlen“, the next salaries and the big
 * payments with how each one is paid. Every number: monthPlan().
 */
export function DeinPlanSheet({ ds, active, editSpielgeld, fromSetup, onClose, returnFocusTo }: Props) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  // right after the setup: the recommendation is the plan (an existing choice stays)
  const adopted = useRef(false);
  useEffect(() => {
    if (!fromSetup || adopted.current || settings.planMode !== null) return;
    adopted.current = true;
    void setPlanMode(db, plan.recommended ?? 'even');
  }, [fromSetup, settings.planMode, plan.recommended]);

  return (
    <BottomSheet title={t('plan2.title')} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-6" data-testid="plan-sheet" data-mode={plan.mode}>
        <Answer plan={plan} />
        <SpielgeldEdit spielgeld={plan.spielgeld} startEditing={!!editSpielgeld} />
        <ModeSwitch plan={plan} />
        <Salaries plan={plan} />
        <Payments plan={plan} />
      </div>
    </BottomSheet>
  );
}

/** The answer in one sentence (one of three), with what can be done about it. */
function Answer({ plan }: { plan: MonthPlan }) {
  const a = plan.answer;
  if (plan.noSalary)
    return (
      <p className="text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="no-salary">
        {t('plan2.noSalary')}
      </p>
    );
  if (!a)
    return (
      <p className="text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="none">
        {t('plan2.none')}
      </p>
    );
  if (a.kind === 'ok')
    return (
      <p className="flex items-start gap-2 text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="ok">
        <CheckIcon size={22} strokeWidth={2.6} className="mt-0.5 shrink-0 text-paid-ink" aria-hidden="true" />
        {t('plan2.ok')}
      </p>
    );
  if (a.kind === 'save') {
    const apply = () => {
      if (a.via === 'even') return void setPlanMode(db, 'even');
      const changes = Object.fromEntries(a.proposals.map((p) => [p.positionId, { mode: 'spread', startMonth: p.start } as SavingSetting]));
      // the proposals were computed with everything else paid when due
      const others = Object.fromEntries(plan.payments.filter((p) => p.positionId && !(p.positionId in changes)).map((p) => [p.positionId!, { mode: 'due' } as SavingSetting]));
      void setSaving(db, changes, others);
    };
    return (
      <div className="flex flex-col gap-3" data-testid="plan-answer" data-kind="save">
        <p className="flex items-start gap-2 text-[19px] font-semibold leading-snug text-ink">
          <AlertIcon size={22} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          {t('plan2.save')}
        </p>
        <ul className="flex flex-col gap-1.5 text-[15px] leading-snug text-ink" data-testid="plan-proposals">
          {a.via === 'even' ? (
            <li>{t('plan2.proposal.even')}</li>
          ) : (
            a.proposals.map((p) => (
              <li key={p.positionId} className="num" data-testid="plan-proposal">
                {t('plan2.proposal', { monat: monthName(p.start), betrag: money(p.rate), zahlung: p.name })}
              </li>
            ))
          )}
        </ul>
        <button type="button" className={`${PRIMARY} self-start`} onClick={apply} data-testid="plan-apply">
          {t('plan2.apply')}
        </button>
      </div>
    );
  }
  // gehalt-zum-planen: not even € 0 Spielgeld fits → which month and how much is missing, no button
  if (a.max <= 0 && plan.shortfall)
    return (
      <p className="num flex items-start gap-2 text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="short">
        <AlertIcon size={22} className="mt-0.5 shrink-0 text-over" aria-hidden="true" />
        {t('plan2.short', { monat: monthName(plan.shortfall.period), betrag: money(plan.shortfall.amount) })}
      </p>
    );
  return (
    <div className="flex flex-col gap-3" data-testid="plan-answer" data-kind="max">
      <p className="num flex items-start gap-2 text-[19px] font-semibold leading-snug text-ink">
        <AlertIcon size={22} className="mt-0.5 shrink-0 text-over" aria-hidden="true" />
        {t('plan2.max', { betrag: money(a.max) })}
      </p>
      <button type="button" className={`${PRIMARY} self-start`} onClick={() => void applyMax(db, a.max, a.via.mode, a.via.savings)} data-testid="plan-set-max">
        {t('plan2.max.apply', { betrag: money(a.max) })}
      </button>
    </div>
  );
}

/** „Dein Spielgeld“: tap the amount to edit (cents allowed); Enter or a tap outside saves, Esc cancels. */
function SpielgeldEdit({ spielgeld, startEditing }: { spielgeld: number | null; startEditing: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  const [text, setText] = useState(spielgeld === null ? '' : amountToInput(spielgeld));
  const field = useRef<HTMLInputElement>(null);
  // the sheet focuses its panel when it opens: the field takes the focus right after
  useEffect(() => {
    if (!editing) return;
    const id = window.setTimeout(() => {
      field.current?.focus();
      field.current?.select();
    }, 60);
    return () => window.clearTimeout(id);
  }, [editing]);
  function commit() {
    if (!editing) return;
    setEditing(false);
    const value = text.trim() === '' ? null : parseAmount(text);
    if (text.trim() !== '' && (value === null || value < 0)) return;
    void setSpielgeld(db, value);
  }
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-edge bg-field px-4 py-2" data-testid="plan-spielgeld">
      <span className="text-[15px] font-medium text-ink-soft">{t('plan2.spielgeld')}</span>
      {editing ? (
        <span className="flex items-center">
          <span className="mr-1.5 text-[17px] text-ink-mute">{currencySymbol()}</span>
          <AmountInput
            ref={field}
            value={text}
            onChange={setText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
                setText(spielgeld === null ? '' : amountToInput(spielgeld));
              }
            }}
            onBlur={commit}
            enterKeyHint="done"
            aria-label={t('plan2.spielgeld')}
            placeholder="0"
            size={Math.max(4, text.length + 1)}
            className="num w-auto max-w-[10ch] bg-transparent text-right text-[19px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
            data-testid="plan-spielgeld-input"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setText(spielgeld === null ? '' : amountToInput(spielgeld));
            setEditing(true);
          }}
          aria-label={`${t('plan2.spielgeld.edit')}: ${spielgeld === null ? '–' : money(spielgeld)}`}
          className="focus-ring num -mr-2 h-11 rounded-xl px-2 text-[19px] font-semibold text-ink hover:bg-control"
          data-testid="plan-spielgeld-amount"
        >
          {spielgeld === null ? '–' : money(spielgeld)}
        </button>
      )}
    </div>
  );
}

/** „Bei Fälligkeit | Gleichmäßig“, the recommended one marked; a payment changed on its own: „Eigener Plan“. */
function ModeSwitch({ plan }: { plan: MonthPlan }) {
  const options = [
    { value: 'due' as const, label: t('plan2.mode.due') },
    { value: 'even' as const, label: t('plan2.mode.even') },
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="plan-mode">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink" data-testid="plan-mode-title">{t('plan2.mode')}</p>
        {plan.mode === 'custom' && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent-ink" data-testid="plan-custom">
            {t('plan2.custom')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-control-track p-1" role="radiogroup" aria-label={t('plan2.mode')}>
        {options.map((o) => {
          const on = plan.mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void setPlanMode(db, o.value)}
              className={`focus-ring flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-[15px] font-semibold ${on ? 'bg-control text-ink shadow-card' : 'text-ink-soft'}`}
              data-testid={`plan-mode-${o.value}`}
            >
              {o.label}
              {plan.recommended === o.value && (
                <span className="text-[12px] font-semibold leading-4 text-accent-ink" data-testid={`plan-recommended-${o.value}`}>
                  {t('plan2.recommended')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="px-1 text-[13px] leading-5 text-ink-mute" data-testid="plan-mode-info">
        {t(plan.mode === 'due' ? 'plan2.mode.due.info' : plan.mode === 'even' ? 'plan2.mode.even.info' : 'plan2.mode.custom.info')}
      </p>
    </div>
  );
}

/** The next 4 salaries (12 unfolded): Monat · aufs Konto · frei für dich; below the Spielgeld marked. */
function Salaries({ plan }: { plan: MonthPlan }) {
  const [all, setAll] = useState(false);
  const rows = all ? plan.months : plan.months.slice(0, 4);
  // the salary planned for months without an entry („Gehalt zum Planen“, else the last one entered)
  const planned = plan.months.find((m) => m.estimated && m.salary !== null)?.salary ?? undefined;
  return (
    <div className="flex flex-col gap-2" data-testid="plan-salaries">
      <p className="text-[13px] font-medium text-ink-mute">{t('plan2.table')}</p>
      <table className="num w-full text-[15px]">
        <thead>
          <tr className="text-[12px] text-ink-mute">
            <th className="py-1 text-left font-medium">{t('plan2.table.month')}</th>
            <th className="py-1 text-right font-medium">{t(plan.hasAccount ? 'plan2.table.transfer' : 'plan2.table.aside')}</th>
            <th className="py-1 text-right font-medium">{t('plan2.table.free')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((m) => (
            <tr key={m.period} data-testid="plan-salary-row" data-period={m.period} data-short={m.short || undefined}>
              <td className="py-2 text-ink">
                {monthName(m.period)}
                {m.estimated && m.salary !== null && (
                  <span className="ml-1.5 text-[13px] text-ink-mute" data-testid="plan-salary-planned">
                    {t('plan2.table.planned')}
                  </span>
                )}
              </td>
              <td className="py-2 text-right text-ink-soft">{money(m.transfer)}</td>
              <td className={`py-2 text-right font-semibold ${m.short ? 'text-over' : 'text-ink'}`}>
                {m.short && <AlertIcon size={14} className="mr-1 inline-block align-[-2px]" aria-label={t('plan2.table.short')} />}
                {m.free === null ? '–' : money(m.free)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {planned !== undefined && (
        <p className="num px-1 text-[13px] leading-5 text-ink-mute" data-testid="plan-planned-note">
          {t('plan2.planned', { betrag: money(planned) })}
        </p>
      )}
      <button type="button" onClick={() => setAll(!all)} className="focus-ring h-11 self-start rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft" aria-expanded={all} data-testid="plan-salaries-more">
        {t(all ? 'plan2.table.less' : 'plan2.table.more')}
      </button>
    </div>
  );
}

/** „Große Zahlungen“: every big payment of the next 12 months, by date, with its state and „ändern“. */
function Payments({ plan }: { plan: MonthPlan }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2" data-testid="plan-payments">
      <p className="text-[13px] font-medium text-ink-mute">{t('plan2.payments')}</p>
      {plan.payments.length === 0 ? (
        <p className="text-[15px] text-ink-soft">{t('plan2.payments.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-edge bg-field px-4">
          {plan.payments.map((p) => (
            <li key={p.key} className="py-3" data-testid="plan-payment" data-name={p.name} data-mode={p.mode}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{p.name}</span>
                <span className="num shrink-0 text-[15px] font-semibold text-ink">{money(p.amount)}</span>
              </div>
              <div className="num mt-0.5 flex items-center justify-between gap-3 text-[13px] leading-5 text-ink-mute">
                <span data-testid="plan-payment-state">{stateText(p)}</span>
                {p.positionId && (
                  <button
                    type="button"
                    onClick={() => setEditing(editing === p.key ? null : p.key)}
                    aria-expanded={editing === p.key}
                    className="focus-ring -my-2 h-11 shrink-0 rounded-lg px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
                    data-testid="plan-payment-edit"
                  >
                    {t('plan2.pay.edit')}
                  </button>
                )}
              </div>
              {p.saved > 0 && (
                <p className="num text-[13px] leading-5 text-ink-mute" data-testid="plan-payment-saved">
                  {p.rest > 0 ? t('plan2.pay.saved', { betrag: money(p.saved), monat: monthName(p.period), rest: money(p.rest) }) : t('plan2.pay.savedAll', { betrag: money(p.saved) })}
                </p>
              )}
              {editing === p.key && p.positionId && <PaymentEditor plan={plan} payment={p} onDone={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function stateText(p: BigPayment): string {
  if (p.mode === 'even') return t('plan2.pay.even');
  if (p.mode === 'spread' && p.rates > 0) return t('plan2.pay.spread', { n: p.rates, betrag: money(p.rate), monat: monthName(p.start!) });
  return t('plan2.pay.due', { monat: monthName(p.period) });
}

/** „im {Monat} zahlen“ or „vorher ansparen“ from a chosen month (the rate is computed). */
function PaymentEditor({ plan, payment, onDone }: { plan: MonthPlan; payment: BigPayment; onDone: () => void }) {
  const first = plan.first.period;
  const spread = payment.mode === 'spread' || payment.mode === 'even';
  const [from, setFrom] = useState<Period>(payment.start ?? first);
  const months: Period[] = [];
  for (let p = first; p <= payment.period; p = addPeriods(p, 1)) months.push(p);
  // coming from „Gleichmäßig“: every other big payment keeps saving up from the next salary
  const others = (): Record<string, SavingSetting> =>
    plan.mode === 'even'
      ? Object.fromEntries(plan.payments.filter((x) => x.positionId && x.positionId !== payment.positionId).map((x) => [x.positionId!, { mode: 'spread', startMonth: first } as SavingSetting]))
      : {};
  const save = (setting: SavingSetting) => void setSaving(db, { [payment.positionId!]: setting }, others());
  return (
    <fieldset className="mt-3 flex flex-col gap-2 rounded-xl bg-control p-3" data-testid="plan-payment-editor">
      <legend className="sr-only">{t('plan2.pay.when', { zahlung: payment.name })}</legend>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="radio" name={`pay-${payment.key}`} checked={!spread} onChange={() => save({ mode: 'due' })} className="h-5 w-5 accent-[rgb(var(--c-accent))]" data-testid="plan-payment-due" />
        {t('plan2.pay.due', { monat: monthName(payment.period) })}
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="radio" name={`pay-${payment.key}`} checked={spread} onChange={() => save({ mode: 'spread', startMonth: from })} className="h-5 w-5 accent-[rgb(var(--c-accent))]" data-testid="plan-payment-spread" />
        {t('plan2.pay.from')}
        <select
          value={from}
          onChange={(e) => {
            const p = e.target.value as Period;
            setFrom(p);
            save({ mode: 'spread', startMonth: p });
          }}
          className="focus-ring h-10 rounded-lg border border-control-edge bg-field px-2 text-[15px] text-ink"
          aria-label={t('plan2.pay.from')}
          data-testid="plan-payment-from"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onDone} className="focus-ring h-11 self-end rounded-xl px-3 text-[15px] font-semibold text-accent-ink hover:bg-accent-soft" data-testid="plan-payment-ready">
        {t('plan2.pay.ready')}
      </button>
    </fieldset>
  );
}
