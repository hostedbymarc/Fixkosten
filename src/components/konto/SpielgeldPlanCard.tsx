import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { db } from '../../db/db';
import { setSpielgeld } from '../../db/kontoActions';
import { useKonto } from '../../db/useKonto';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { dayLabel } from '../../lib/kontoWords';
import { t } from '../../lib/kontoTexts';
import { monthName } from '../../lib/period';
import { spielgeldPlan } from '../../lib/spielgeldPlan';
import type { Dataset, Period } from '../../lib/types';
import { AmountInput } from '../form';
import { useKontoState } from './KontoSheet';

interface Props {
  ds: Dataset;
  /** the active month (the card only shows there) */
  active: Period;
  /** no salary yet: open the month close to enter it */
  onOpenSalary: () => void;
}

const money = (v: number) => formatEUR(v, { fixed: true });
const STEP = 50;

/**
 * „Dein Spielgeld“ (spielgeld-planer): the planned Spielgeld against what is possible next to the Rücklage:
 * per month Netto − Zur Seite − Direkt bezahlt − Vermögensaufbau (spielgeldPlan over kontoState). The
 * amount is set with the slider (€ 50 steps) or typed: a tap on the big amount makes it editable (cents,
 * the thousands dot; Enter or a tap outside saves, Esc cancels). Both write „Spielgeld pro Monat“, the
 * field in the Einstellungen stays. While an extra or the one-time amount („auf einmal“) runs two lines
 * („Bis {Monat} möglich“, „Ab {Monat} möglich“), else one. Status, tip and the calculation of the first
 * month below. Only in the active month and only with „Fixkosten einplanen“.
 */
export const SpielgeldPlanCard = forwardRef<HTMLButtonElement, Props>(function SpielgeldPlanCard({ ds, active, onOpenSalary }, ref) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  // what is shown while typing or dragging: the status follows at once, the setting a moment later
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const timer = useRef<number>();
  const field = useRef<HTMLInputElement>(null);
  const spielgeld = draft === undefined ? settings.spielgeld : draft;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);
  const plan = useMemo(() => spielgeldPlan(ds, state, spielgeld), [ds, state, spielgeld]);

  /** the slider: the setting follows 250 ms after the last move */
  function change(value: number | null) {
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void setSpielgeld(db, value).then(() => setDraft(undefined));
    }, 250);
  }

  function startEdit() {
    setText(spielgeld === null ? '' : amountToInput(spielgeld));
    setEditing(true);
  }

  /** Enter or a tap outside: saved at once; not an amount: back to what was there */
  function commit() {
    if (!editing) return;
    setEditing(false);
    window.clearTimeout(timer.current);
    const value = text.trim() === '' ? null : parseAmount(text);
    if (text.trim() !== '' && (value === null || value < 0)) {
      setDraft(undefined);
      return;
    }
    setDraft(value);
    void setSpielgeld(db, value).then(() => setDraft(undefined));
  }

  function cancel() {
    setEditing(false);
    setDraft(undefined);
  }

  if (!plan) {
    return (
      <section className="glass glass-tile surface min-w-0 p-4 md:p-5 xl:p-6" data-testid="spielgeld-plan" data-state="no-salary" aria-labelledby="spielgeld-plan-title">
        <h2 id="spielgeld-plan-title" className="text-[13px] font-medium leading-5 text-ink-mute">
          {t('plan.title')}
        </h2>
        <div className="mt-2 flex flex-col items-start gap-2">
          <p className="text-[15px] leading-snug text-ink-soft" data-testid="spielgeld-plan-empty">
            {t('plan.noSalary')}
          </p>
          <button
            ref={ref}
            type="button"
            onClick={onOpenSalary}
            className="focus-ring h-11 rounded-xl border border-control-edge bg-control px-4 text-[15px] font-semibold text-accent-ink hover:bg-control-track"
            data-testid="spielgeld-plan-enter"
          >
            {t('plan.noSalary.action')}
          </button>
        </div>
      </section>
    );
  }

  const limit = plan.extra ?? plan.after!;
  // the range: up to a quarter above the highest possible amount (fixed while dragging); a larger stored
  // Spielgeld widens it so the thumb never sits beyond the end
  const possible = Math.max(plan.extra?.possible ?? 0, plan.after?.possible ?? 0);
  const max = Math.max(STEP * 10, Math.ceil((possible * 1.25) / STEP) * STEP, Math.ceil((settings.spielgeld ?? 0) / STEP) * STEP);
  const first = plan.months[0]!;
  const lump = plan.extra?.lump ?? 0;
  const until = plan.extra ? monthName(plan.extra.to) : '';
  const okText = plan.extra
    ? lump > 0
      ? t('plan.ok.lump', { betrag: money(lump), monat: until })
      : t('plan.ok.until', { betrag: money(limit.reserve), monat: until })
    : t('plan.ok.plain', { betrag: money(limit.reserve) });
  const overText = plan.extra
    ? lump > 0
      ? t('plan.over.lump', { monat: until, betrag: money(plan.difference) })
      : t('plan.over.until', { monat: until, betrag: money(plan.difference) })
    : t('plan.over.plain', { betrag: money(plan.difference) });
  const amountClass = 'num text-[22px] font-semibold tracking-[-0.01em] text-ink';
  return (
    <section
      className="glass glass-tile surface min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="spielgeld-plan"
      data-state={plan.status ?? 'none'}
      aria-labelledby="spielgeld-plan-title"
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="spielgeld-plan-title" className="text-[13px] font-medium leading-5 text-ink-mute">
          {t('plan.title')}
        </h2>
        {editing ? (
          <span className="flex h-11 min-w-0 items-center rounded-xl border border-accent-ink bg-field px-3 ring-2 ring-focus/25">
            <span className="mr-1.5 text-[17px] text-ink-mute">{currencySymbol()}</span>
            <AmountInput
              ref={field}
              value={text}
              onChange={(v) => {
                setText(v);
                // the status follows while typing; saved with Enter or a tap outside
                const value = v.trim() === '' ? null : parseAmount(v);
                if (v.trim() === '' || (value !== null && value >= 0)) setDraft(value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  cancel();
                }
              }}
              onBlur={commit}
              enterKeyHint="done"
              aria-label={t('plan.slider')}
              placeholder="0"
              size={Math.max(4, text.length + 1)}
              className={`${amountClass} w-auto min-w-0 max-w-[10ch] bg-transparent text-right outline-none placeholder:font-normal placeholder:text-ink-faint`}
              data-testid="spielgeld-plan-input"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${t('plan.edit')}: ${spielgeld === null ? '–' : money(spielgeld)}`}
            className={`focus-ring -mr-2 h-11 rounded-xl px-2 hover:bg-control ${amountClass}`}
            data-testid="spielgeld-plan-amount"
          >
            {spielgeld === null ? '–' : money(spielgeld)}
          </button>
        )}
      </div>
      <input
        type="range"
        className="range mt-3 w-full"
        min={0}
        max={max}
        step={STEP}
        value={Math.min(spielgeld ?? 0, max)}
        aria-label={t('plan.slider')}
        aria-valuetext={spielgeld === null ? '–' : money(spielgeld)}
        onChange={(e) => {
          const v = Number(e.target.value);
          setEditing(false);
          change(v > 0 ? v : null);
        }}
        data-testid="spielgeld-plan-slider"
      />

      <ul className="num mt-4 flex flex-col gap-1 text-[15px] leading-snug text-ink" data-testid="spielgeld-plan-possible">
        {plan.extra && (
          <li data-testid="spielgeld-plan-until">
            {t('plan.until', { monat: until, betrag: money(plan.extra.possible) })}
            {lump > 0 && state.gapBy && (
              <span className="block text-[13px] leading-5 text-ink-mute" data-testid="spielgeld-plan-lump">
                {t('plan.lump.note', { betrag: money(lump), datum: dayLabel(state.gapBy) })}
              </span>
            )}
          </li>
        )}
        {plan.after && (
          <li data-testid="spielgeld-plan-from">
            {plan.extra
              ? t('plan.from', { monat: monthName(plan.after.from), betrag: money(plan.after.possible) })
              : t('plan.only', { betrag: money(plan.after.possible) })}
          </li>
        )}
      </ul>

      {plan.status && (
        <p
          className={`num mt-3 text-[15px] leading-snug ${plan.status === 'ok' ? 'text-paid-ink' : 'text-over'}`}
          data-testid="spielgeld-plan-status"
          data-status={plan.status}
          role="status"
        >
          <span className="font-semibold">{t(plan.status === 'ok' ? 'plan.ok' : 'plan.over')}</span>{' '}
          {plan.status === 'ok' ? `${okText} ${t('plan.ok.left', { betrag: money(plan.difference) })}` : overText}
        </p>
      )}

      <p className="num mt-3 text-[15px] leading-snug text-ink-soft" data-testid="spielgeld-plan-tip">
        {plan.extra
          ? `${t('plan.tip.until', { monat: until, betrag: formatEUR(plan.tipExtra!) })}${plan.after ? ` ${t('plan.tip.from', { monat: monthName(plan.after.from), betrag: formatEUR(plan.tipAfter!) })}` : ''}`
          : t('plan.tip.plain', { betrag: formatEUR(plan.tipAfter!) })}
      </p>

      <p className="num mt-3 text-[13px] leading-5 text-ink-mute" data-testid="spielgeld-plan-calc">
        {t('plan.calc', { netto: money(first.salary), seite: money(first.reserve + first.lump), direkt: money(first.direct), va: money(first.wealth) })}
        {first.estimated && <span className="block">{t('plan.estimated')}</span>}
      </p>
    </section>
  );
});
