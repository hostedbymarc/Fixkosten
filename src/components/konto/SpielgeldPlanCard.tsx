import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { db } from '../../db/db';
import { setSpielgeld } from '../../db/kontoActions';
import { useKonto } from '../../db/useKonto';
import { amountToInput, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthName } from '../../lib/period';
import { spielgeldPlan } from '../../lib/spielgeldPlan';
import type { Dataset, Period } from '../../lib/types';
import { AmountField } from '../form';
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
 * „Dein Spielgeld“ (spielgeld-planer): the planned Spielgeld (slider in € 50 steps plus an amount field with
 * cents, both write „Spielgeld pro Monat“) against what is possible next to the Rücklage: per month
 * Netto − Zur Seite − Direkt bezahlt − Vermögensaufbau (spielgeldPlan over kontoState). While an extra runs
 * two lines („Bis {Monat} möglich“, „Ab {Monat} möglich“), else one. Status, tip and the calculation of the
 * first month below. Only in the active month and only with „Fixkosten einplanen“.
 */
export const SpielgeldPlanCard = forwardRef<HTMLButtonElement, Props>(function SpielgeldPlanCard({ ds, active, onOpenSalary }, ref) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  // what is shown while typing or dragging: the status follows at once, the setting a moment later
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  const [text, setText] = useState(settings.spielgeld === null ? '' : amountToInput(settings.spielgeld));
  const [typing, setTyping] = useState(false);
  const timer = useRef<number>();
  const spielgeld = draft === undefined ? settings.spielgeld : draft;
  useEffect(() => {
    if (!typing) setText(settings.spielgeld === null ? '' : amountToInput(settings.spielgeld));
  }, [settings.spielgeld, typing]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const plan = useMemo(() => spielgeldPlan(ds, state, spielgeld), [ds, state, spielgeld]);

  function change(value: number | null) {
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void setSpielgeld(db, value).then(() => setDraft(undefined));
    }, 250);
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
  const highest = Math.max(...[plan.extra?.possible ?? 0, plan.after?.possible ?? 0, spielgeld ?? 0]);
  const max = Math.max(STEP * 10, Math.ceil((highest * 1.25) / STEP) * STEP);
  const first = plan.months[0]!;
  const parsed = text.trim() === '' ? null : parseAmount(text);
  return (
    <section
      className="glass glass-tile surface min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="spielgeld-plan"
      data-state={plan.status ?? 'none'}
      aria-labelledby="spielgeld-plan-title"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="spielgeld-plan-title" className="text-[13px] font-medium leading-5 text-ink-mute">
          {t('plan.title')}
        </h2>
        <span className="num text-[22px] font-semibold tracking-[-0.01em] text-ink" data-testid="spielgeld-plan-amount">
          {spielgeld === null ? '–' : money(spielgeld)}
        </span>
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
          setTyping(false);
          setText(v > 0 ? amountToInput(v) : '');
          change(v > 0 ? v : null);
        }}
        data-testid="spielgeld-plan-slider"
      />
      <div className="mt-3">
        <AmountField
          label={t('plan.slider')}
          value={text}
          onChange={(v) => {
            setText(v);
            setTyping(true);
            if (v.trim() === '') change(null);
            else {
              const value = parseAmount(v);
              if (value !== null) change(value);
            }
          }}
          placeholder="z. B. 1.200,00"
          error={text.trim() !== '' && parsed === null ? 'Bitte einen Betrag eingeben, z. B. 1.200,00' : null}
          testId="spielgeld-plan-input"
        />
      </div>

      <ul className="num mt-4 flex flex-col gap-1 text-[15px] leading-snug text-ink" data-testid="spielgeld-plan-possible">
        {plan.extra && (
          <li data-testid="spielgeld-plan-until">{t('plan.until', { monat: monthName(plan.extra.to), betrag: money(plan.extra.possible) })}</li>
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
          {plan.status === 'ok'
            ? `${plan.extra ? t('plan.ok.until', { betrag: money(limit.reserve), monat: monthName(plan.extra.to) }) : t('plan.ok.plain', { betrag: money(limit.reserve) })} ${t('plan.ok.left', { betrag: money(plan.difference) })}`
            : plan.extra
              ? t('plan.over.until', { monat: monthName(plan.extra.to), betrag: money(plan.difference) })
              : t('plan.over.plain', { betrag: money(plan.difference) })}
        </p>
      )}

      <p className="num mt-3 text-[15px] leading-snug text-ink-soft" data-testid="spielgeld-plan-tip">
        {plan.extra
          ? `${t('plan.tip.until', { monat: monthName(plan.extra.to), betrag: formatEUR(plan.tipExtra!) })}${plan.after ? ` ${t('plan.tip.from', { monat: monthName(plan.after.from), betrag: formatEUR(plan.tipAfter!) })}` : ''}`
          : t('plan.tip.plain', { betrag: formatEUR(plan.tipAfter!) })}
      </p>

      <p className="num mt-3 text-[13px] leading-5 text-ink-mute" data-testid="spielgeld-plan-calc">
        {t('plan.calc', { netto: money(first.salary), seite: money(first.reserve), direkt: money(first.direct), va: money(first.wealth) })}
        {first.estimated && <span className="block">{t('plan.estimated')}</span>}
      </p>
    </section>
  );
});
