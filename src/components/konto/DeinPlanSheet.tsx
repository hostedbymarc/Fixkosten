import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db/db';
import { setPlanMode, setSaving, setSpielgeld, applyMax } from '../../db/kontoActions';
import { useKonto } from '../../db/useKonto';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthLevel, planRows, planStatus, type PlanRow, type PlanStatus } from '../../lib/monthCard';
import { monthPlan, storedSavings, type BigPayment, type MonthPlan } from '../../lib/monthPlan';
import { addPeriods, monthName, monthOf, periodLabel, shortMonthName, yearOf } from '../../lib/period';
import { salaryMonth, salaryName } from '../../lib/salaryMonth';
import type { MonthStart } from '../../lib/activeMonth';
import { useMonthStart } from '../../lib/useToday';
import type { Dataset, Period, SavingSetting } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { AmountInput } from '../form';
import { AlertIcon, CheckIcon } from '../Icons';
import { useMonthPlan } from './DeinMonatCard';
import { PlanCushionLine, useCushionPlan } from './Polster';
import { cushionActive, cushionLevel, cushionMessage, goalSalary, type Cushion, type CushionLevel, type CushionMessage, type CushionRow } from '../../lib/polster';

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
  /** plan-optionen: a row of „Deine nächsten Gehälter“ shows its month */
  onJump?: (period: Period) => void;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * „Dein Plan“ (monat-verdichtet; replaces „verteilt / auf einmal“): the answer in one sentence, the
 * Spielgeld, the switch „Bei Fälligkeit | Gleichmäßig“ with „Empfohlen“, the next salaries and the big
 * payments with how each one is paid. Every number: monthPlan().
 */
export function DeinPlanSheet({ ds, active, editSpielgeld, fromSetup, onJump, onClose, returnFocusTo }: Props) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const plan = useMonthPlan(ds, active);
  // plan-optionen: the table and the message read the month cards (Überschuss = the card's large amount)
  const rows = useMemo(() => planRows(ds, plan, start), [ds, plan, start]);
  const status = useMemo(() => planStatus(rows), [rows]);
  // polster-ziel: the Polster column and messages as soon as a Polster is entered
  const { c, proj } = useCushionPlan(ds, plan);
  const withCushion = cushionActive(c);
  const message = useMemo(() => (withCushion ? cushionMessage(proj, c) : null), [withCushion, proj, c]);
  // polster-feinschliff: „Polster vor Rot“ – the Polster pays every gap, or the first month it would go below 0
  const level = useMemo(() => (withCushion ? cushionLevel(proj) : null), [withCushion, proj]);
  const box = useMemo(() => (withCushion ? goalSalary(rows, proj, plan, c) : null), [withCushion, rows, proj, plan, c]);
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
        <Answer plan={plan} status={status} cushion={message} level={level} />
        <PlanCushionLine plan={plan} />
        <SpielgeldEdit spielgeld={plan.spielgeld} startEditing={!!editSpielgeld} />
        <ModeSwitch plan={plan} />
        <Salaries plan={plan} rows={rows} active={active} cushion={withCushion ? { c, proj } : null} onJump={onJump} />
        {box && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-accent-soft p-3.5" data-testid="plan-cushion-box" data-period={box.period}>
            <p className="text-[15px] font-semibold text-ink">{t('plan2.cushion.box.title', { monat: monthName(box.period) })}</p>
            <p className="num text-[13px] text-ink-soft" data-testid="plan-cushion-box-text">
              {t('plan2.cushion.box.text', { gehalt: salaryName(box.period, start), betrag: formatEUR(box.amount / 100) })}
            </p>
          </div>
        )}
        <Payments ds={ds} active={active} plan={plan} rows={rows} />
      </div>
    </BottomSheet>
  );
}

/**
 * The message on top (plan-optionen, two steps): red only when a month misses its fixed costs and Vermögensaufbau
 * („{Monat Jahr} geht sich nicht aus. Dir fehlen € X.“), muted in the warn token when only the Spielgeld is short
 * („Ab {Monat} reicht dein Gehalt zum Planen nicht fürs volle Spielgeld.“), else green. With the Polster: how long it
 * lasts. Below it, what can be done about it (the proposals, „Spielgeld auf € X setzen“).
 */
function Answer({ plan, status, cushion, level }: { plan: MonthPlan; status: PlanStatus | null; cushion: CushionMessage | null; level: CushionLevel | null }) {
  const a = plan.answer;
  if (plan.noSalary || !status)
    return (
      <p className="text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="no-salary">
        {t('plan2.noSalary')}
      </p>
    );
  // polster-feinschliff, „Polster vor Rot“: with a Polster the red step comes only when the Polster would go below 0
  // („{Monat Jahr}: Dein Polster reicht nicht. Dir fehlen € X.“); it pays every gap → green „Dein Polster deckt
  // alle Lücken.“ with the goal line below. Without a Polster as before.
  const cushionShort = level?.kind === 'short' ? level : null;
  const covered = level?.kind === 'covered' && status.kind !== 'ok';
  const shortStep = cushion ? null : status.kind === 'short' ? status : null;
  // polster-ziel: with a Polster and a goal the green line is about the goal (below „deckt alle Lücken“ when that shows)
  const goalLine = cushion?.goal && !cushionShort && !shortStep ? cushion.goal : null;
  const okay = !cushionShort && !shortStep && (status.kind === 'ok' || goalLine !== null || covered || cushion !== null);
  const drop = cushion?.drop ? plan.months.find((m) => m.period === cushion.drop!.period) : undefined;
  const dropLine = drop && drop.salary !== null && (
    <p className="num text-[14px] font-medium leading-snug text-warn" data-testid="plan-cushion-drop" data-period={drop.period}>
      {t('plan2.cushion.drop', { betrag: money(drop.salary), monat: monthName(drop.period) })}
    </p>
  );
  // without a Spielgeld the plan has nothing to keep – unless the Polster has a goal
  if (status.kind === 'ok' && plan.spielgeld === null && !goalLine)
    return (
      <p className="text-[19px] font-semibold leading-snug text-ink" data-testid="plan-answer" data-kind="none">
        {t('plan2.none')}
      </p>
    );
  const red = !!cushionShort || !!shortStep;
  const goalText =
    goalLine?.kind === 'reached'
      ? t('plan2.cushion.reached', { monat: periodLabel(goalLine.period) })
      : goalLine?.kind === 'missing'
        ? t('plan2.cushion.missing', { monat: monthName(goalLine.period), betrag: formatEUR(goalLine.amount / 100) })
        : null;
  const text = cushionShort
    ? t('plan2.cushion.short', { monat: periodLabel(cushionShort.period), betrag: formatEUR(cushionShort.amount / 100) })
    : shortStep
      ? t('plan2.short', { monat: periodLabel(shortStep.period), betrag: money(shortStep.amount) })
      : covered
        ? t('plan2.cushion.covered')
        : (goalText ??
          (status.kind === 'spielgeld' && !cushion ? t('plan2.spielgeldShort', { monat: monthName(status.period) }) : t('plan2.ok')));
  const kind = cushionShort ? 'cushion-short' : covered ? 'cushion-covered' : goalLine ? `cushion-${goalLine.kind}` : cushion && status.kind !== 'ok' ? 'cushion-ok' : status.kind;
  const apply = () => {
    if (a?.kind !== 'save') return;
    if (a.via === 'even') return void setPlanMode(db, 'even');
    const changes = Object.fromEntries(a.proposals.map((p) => [p.positionId, { mode: 'spread', startMonth: p.start } as SavingSetting]));
    // the proposals were computed with everything else paid when due
    const others = Object.fromEntries(plan.payments.filter((p) => p.positionId && !(p.positionId in changes)).map((p) => [p.positionId!, { mode: 'due' } as SavingSetting]));
    void setSaving(db, changes, others);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="plan-answer" data-kind={kind} data-level={okay ? 'ok' : red ? 'short' : 'spielgeld'} data-answer={a?.kind}>
      <p
        className={`num flex items-start gap-2 leading-snug ${okay || red ? 'text-[19px] font-semibold text-ink' : 'text-[17px] font-medium text-warn'}`}
        data-testid="plan-answer-text"
      >
        {okay ? (
          <CheckIcon size={22} strokeWidth={2.6} className="mt-0.5 shrink-0 text-paid-ink" aria-hidden="true" />
        ) : (
          <AlertIcon size={22} className={`mt-0.5 shrink-0 ${red ? 'text-over' : 'text-warn'}`} aria-hidden="true" />
        )}
        {text}
      </p>
      {covered && goalText && (
        <p className="num text-[15px] font-medium leading-snug text-ink" data-testid="plan-cushion-goal-line">
          {goalText}
        </p>
      )}
      {dropLine}
      {!okay && a?.kind === 'save' && (
        <>
          <p className="text-[15px] leading-snug text-ink-soft">{t('plan2.save')}</p>
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
        </>
      )}
      {!okay && a?.kind === 'max' && a.max > 0 && (
        <>
          <p className="num text-[15px] leading-snug text-ink-soft" data-testid="plan-max">
            {t('plan2.max', { betrag: money(a.max) })}
          </p>
          <button type="button" className={`${PRIMARY} self-start`} onClick={() => void applyMax(db, a.max, a.via.mode, a.via.savings)} data-testid="plan-set-max">
            {t('plan2.max.apply', { betrag: money(a.max) })}
          </button>
        </>
      )}
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

/** „Okt“ in the year of the active month, „Okt 27“ in another year (plan-optionen) */
export function rowMonth(period: Period, active: Period): string {
  return yearOf(period) === yearOf(active) ? shortMonthName(monthOf(period)) : `${shortMonthName(monthOf(period))} ${String(yearOf(period)).slice(2)}`;
}

/**
 * „Deine nächsten Gehälter“ – 4 rows, 12 unfolded: Monat (+ „geplant“) · zur Seite · Überschuss, each from the month
 * card of its period (planRows). polster-ziel, with a Polster entered: Monat · Überschuss · Polster ± · Polster (from
 * today's Polster on, by the rule up to the goal, never below 0). A row shows its month.
 */
function Salaries({
  plan,
  rows,
  active,
  cushion,
  onJump,
}: {
  plan: MonthPlan;
  rows: PlanRow[];
  active: Period;
  cushion: { c: Cushion; proj: CushionRow[] } | null;
  onJump?: (p: Period) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 4);
  // the salary planned for months without an entry („Gehalt zum Planen“, else the last one entered)
  const planned = plan.months.find((m) => m.estimated && m.salary !== null)?.salary ?? undefined;
  return (
    <div className="flex flex-col gap-2" data-testid="plan-salaries">
      <p className="text-[13px] font-medium text-ink-mute">{t('plan2.table')}</p>
      <table className="num w-full text-[15px]" data-cushion={cushion ? '' : undefined}>
        <thead>
          <tr className="text-[12px] text-ink-mute">
            <th className="py-1 text-left font-medium">{t('plan2.table.month')}</th>
            {!cushion && <th className="py-1 text-right font-medium">{t(plan.hasAccount ? 'plan2.table.transfer' : 'plan2.table.aside')}</th>}
            <th className="py-1 text-right font-medium">{t('plan2.table.left')}</th>
            {cushion && (
              <>
                <th className="py-1 pl-2 text-right font-medium" data-testid="plan-cushion-delta-head">
                  {t('plan2.table.cushionDelta')}
                </th>
                <th className="py-1 pl-2 text-right font-medium" data-testid="plan-cushion-head">
                  {t('plan2.table.cushion')}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r, i) => {
            const level = monthLevel(r)?.kind ?? 'ok';
            const pr = cushion?.proj[i];
            return (
              <tr
                key={r.period}
                onClick={onJump ? () => onJump(r.period) : undefined}
                className={onJump ? 'cursor-pointer hover:bg-control' : undefined}
                data-testid="plan-salary-row"
                data-period={r.period}
                data-level={level}
                data-short={level !== 'ok' || undefined}
              >
                <td className="py-2 text-ink">
                  {onJump ? (
                    <button type="button" className="focus-ring -mx-1 rounded-md px-1 text-left" aria-label={t('plan2.table.jump', { monat: periodLabel(r.period) })} data-testid="plan-salary-jump">
                      {rowMonth(r.period, active)}
                    </button>
                  ) : (
                    rowMonth(r.period, active)
                  )}
                  {r.estimated && (
                    <span className="ml-1.5 text-[13px] text-ink-mute" data-testid="plan-salary-planned">
                      {t('plan2.table.planned')}
                    </span>
                  )}
                </td>
                {!cushion && (
                  <td className="py-2 text-right text-ink-soft" data-testid="plan-salary-transfer">
                    {money(r.transfer)}
                  </td>
                )}
                <td className={`py-2 text-right font-semibold ${level === 'short' ? 'text-over' : level === 'spielgeld' ? 'text-warn' : 'text-ink'}`} data-testid="plan-salary-left">
                  {level !== 'ok' && <AlertIcon size={14} className="mr-1 inline-block align-[-2px]" aria-label={t(level === 'short' ? 'plan2.table.miss' : 'plan2.table.short')} />}
                  {r.left === null ? '–' : money(r.left)}
                </td>
                {pr && (
                  <>
                    <td className={`py-2 pl-2 text-right ${pr.delta > 0 ? 'text-accent-ink' : 'text-ink-soft'}`} data-testid="plan-salary-cushion-delta" data-cents={pr.delta}>
                      {pr.delta === 0 ? '–' : `${pr.delta > 0 ? '+' : '−'}${formatEUR(Math.abs(pr.delta) / 100, { fixed: true }).replace(currencySymbol(), '').trim()}`}
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold text-ink" data-testid="plan-salary-cushion" data-cents={pr.balance}>
                      {formatEUR(pr.balance / 100, { fixed: true })}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
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
function Payments({ ds, active, plan, rows }: { ds: Dataset; active: Period; plan: MonthPlan; rows: PlanRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const start = useMonthStart();
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
                <span data-testid="plan-payment-state">{stateText(p, start)}</span>
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
              {editing === p.key && p.positionId && <PaymentEditor ds={ds} active={active} plan={plan} rows={rows} payment={p} start={start} onDone={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function stateText(p: BigPayment, start: MonthStart): string {
  if (p.mode === 'even') return t('plan2.pay.even');
  if (p.mode === 'spread' && p.rates > 0) return t('plan2.pay.spread', { n: p.rates, betrag: money(p.rate), monat: monthName(p.start!) });
  if (p.mode === 'once' && p.salaryMonth) {
    const gehalt = salaryName(p.salaryMonth, start);
    return p.atDue > 0 ? t('plan2.pay.oncePart', { betrag: money(p.fromSalary), gehalt }) : t('plan2.pay.once', { gehalt });
  }
  if (p.mode === 'range' && p.start && p.end) {
    if (p.start === p.end) return t('plan2.pay.once', { gehalt: salaryName(p.start, start) });
    return t('plan2.pay.range', { von: monthName(salaryMonth(p.start, start)), bis: monthName(salaryMonth(p.end, start)) });
  }
  return t('plan2.pay.due', { monat: monthName(p.period) });
}

type Choice = 'due' | 'spread' | 'all' | 'part' | 'range';

/** at most 4 months of the preview */
const PREVIEW_ROWS = 4;

/**
 * „im {Monat} zahlen“, „Ansparen ab {Monat}“ (the rate is computed), „Komplett vom {Monat}-Gehalt“, „Teilbetrag vom
 * {Monat}-Gehalt: € …“ (the rest when due) and (plan-optionen) „Aufteilen: vom {Monat}- bis {Monat}-Gehalt“ – the
 * salaries from the next one up to the month it is due. Live below: the months whose Überschuss changes, before →
 * after (at most 4, worse ones in the warn token). Only „Übernehmen“ saves.
 */
function PaymentEditor({
  ds,
  active,
  plan,
  rows,
  payment,
  start,
  onDone,
}: {
  ds: Dataset;
  active: Period;
  plan: MonthPlan;
  rows: PlanRow[];
  payment: BigPayment;
  start: MonthStart;
  onDone: () => void;
}) {
  const { settings } = useKonto();
  const first = plan.first.period;
  const initial: Choice =
    payment.mode === 'once' ? (payment.partial ? 'part' : 'all') : payment.mode === 'range' ? 'range' : payment.mode === 'spread' || payment.mode === 'even' ? 'spread' : 'due';
  const [choice, setChoice] = useState<Choice>(initial);
  const [from, setFrom] = useState<Period>(payment.mode === 'spread' ? (payment.start ?? first) : first);
  const [salary, setSalary] = useState<Period>(payment.salaryMonth ?? first);
  const [part, setPart] = useState(payment.partial ? amountToInput(payment.fromSalary) : '');
  const [rangeFrom, setRangeFrom] = useState<Period>(payment.mode === 'range' ? (payment.start ?? first) : first);
  const [rangeTo, setRangeTo] = useState<Period>(payment.mode === 'range' ? (payment.end ?? payment.period) : payment.period);
  const partField = useRef<HTMLInputElement>(null);
  const months: Period[] = [];
  for (let p = first; p <= payment.period; p = addPeriods(p, 1)) months.push(p);
  // coming from „Gleichmäßig“: every other big payment keeps saving up from the next salary
  const others = useMemo(
    (): Record<string, SavingSetting> =>
      plan.mode === 'even'
        ? Object.fromEntries(plan.payments.filter((x) => x.positionId && x.positionId !== payment.positionId).map((x) => [x.positionId!, { mode: 'spread', startMonth: first } as SavingSetting]))
        : {},
    [plan, payment.positionId, first],
  );
  /** the part in cents, or null while nothing valid is typed */
  const partCents = (text: string): number | null => {
    const v = text.trim() === '' ? null : parseAmount(text);
    return v === null || v <= 0 ? null : Math.round(v * 100);
  };
  // the setting the editor stands on; null while a part is not typed yet
  const draft: SavingSetting | null =
    choice === 'due'
      ? { mode: 'due' }
      : choice === 'spread'
        ? { mode: 'spread', startMonth: from }
        : choice === 'all'
          ? { mode: 'once', salaryMonth: salary }
          : choice === 'range'
            ? { mode: 'range', fromSalaryMonth: rangeFrom, toSalaryMonth: rangeTo }
            : partCents(part) === null
              ? null
              : { mode: 'once', salaryMonth: salary, amount: partCents(part)! };
  const key = JSON.stringify(draft);
  // the preview: the plan as it is after „Übernehmen“ („Eigener Plan“ with this one payment changed)
  const preview = useMemo(() => {
    if (!draft) return null;
    const savings = { ...storedSavings(ds), ...others, [payment.positionId!]: draft };
    const next = planRows(ds, monthPlan(ds, active, settings, start, { mode: 'custom', savings }), start);
    return next
      .map((r, i) => ({ period: r.period, was: rows[i]?.left ?? null, now: r.left }))
      .filter((r) => r.was !== null && r.now !== null && Math.round(r.was * 100) !== Math.round(r.now * 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ds, active, settings, start, rows, others, payment.positionId]);
  const apply = () => {
    if (!draft) return;
    void setSaving(db, { [payment.positionId!]: draft }, others);
    onDone();
  };
  const pick = (c: Choice) => {
    setChoice(c);
    if (c === 'part') window.setTimeout(() => partField.current?.focus(), 0);
  };
  const select = (value: Period, options: Period[], onChange: (p: Period) => void, label: string, testId: string, name: (p: Period) => string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      className="focus-ring h-10 min-w-0 rounded-lg border border-control-edge bg-field px-2 text-[15px] text-ink"
      aria-label={label}
      data-testid={testId}
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {name(m)}
        </option>
      ))}
    </select>
  );
  const gehalt = (m: Period) => salaryName(m, start);
  const radio = (c: Choice, testId: string) => (
    <input type="radio" name={`pay-${payment.key}`} checked={choice === c} onChange={() => pick(c)} className="h-5 w-5 shrink-0 accent-[rgb(var(--c-accent))]" data-testid={testId} />
  );
  return (
    <fieldset className="mt-3 flex flex-col gap-2 rounded-xl bg-control p-3" data-testid="plan-payment-editor">
      <legend className="sr-only">{t('plan2.pay.when', { zahlung: payment.name })}</legend>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        {radio('due', 'plan-payment-due')}
        {t('plan2.pay.due', { monat: monthName(payment.period) })}
      </label>
      <label className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink">
        {radio('spread', 'plan-payment-spread')}
        {t('plan2.pay.from')}
        {select(from, months, (p) => (setFrom(p), setChoice('spread')), t('plan2.pay.from'), 'plan-payment-from', monthName)}
      </label>
      <label className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink">
        {radio('all', 'plan-payment-all')}
        {t('plan2.pay.onceAll')}
        {select(salary, months, (p) => (setSalary(p), setChoice('all')), t('plan2.pay.salary'), 'plan-payment-all-salary', gehalt)}
      </label>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink">
        <label className="flex items-center gap-3">
          {radio('part', 'plan-payment-part')}
          {t('plan2.pay.oncePartLabel')}
        </label>
        {select(salary, months, (p) => (setSalary(p), setChoice('part')), t('plan2.pay.salary'), 'plan-payment-part-salary', gehalt)}
        <span className="flex items-center rounded-lg border border-control-edge bg-field px-2">
          <span className="mr-1 text-ink-mute">{currencySymbol()}</span>
          <AmountInput
            ref={partField}
            value={part}
            onChange={setPart}
            onFocus={() => setChoice('part')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
            enterKeyHint="done"
            aria-label={t('plan2.pay.partAmount')}
            placeholder="0,00"
            size={Math.max(6, part.length + 1)}
            className="num h-10 w-auto max-w-[10ch] bg-transparent text-right text-[15px] text-ink outline-none placeholder:text-ink-faint"
            data-testid="plan-payment-part-amount"
          />
        </span>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink">
        <label className="flex items-center gap-3">
          {radio('range', 'plan-payment-range')}
          {t('plan2.pay.rangeLabel')}
        </label>
        {select(
          rangeFrom,
          months,
          (p) => {
            setRangeFrom(p);
            if (rangeTo < p) setRangeTo(p);
            setChoice('range');
          },
          t('plan2.pay.rangeFrom'),
          'plan-payment-range-from',
          gehalt,
        )}
        <span>{t('plan2.pay.rangeTo')}</span>
        {select(
          rangeTo,
          months.filter((m) => m >= rangeFrom),
          (p) => (setRangeTo(p), setChoice('range')),
          t('plan2.pay.rangeLast'),
          'plan-payment-range-to',
          gehalt,
        )}
      </div>
      {preview && (
        <div className="flex flex-col gap-0.5 px-1 pt-1 text-[13px] leading-5 text-ink-mute" data-testid="plan-preview" aria-live="polite">
          <p className="font-medium">{t('plan2.preview')}</p>
          {preview.length === 0 ? (
            <p data-testid="plan-preview-none">{t('plan2.preview.none')}</p>
          ) : (
            preview.slice(0, PREVIEW_ROWS).map((r) => (
              <p key={r.period} className={`num flex justify-between gap-3 ${r.now! < r.was! ? 'text-warn' : ''}`} data-testid="plan-preview-row" data-period={r.period} data-worse={r.now! < r.was! || undefined}>
                <span>{rowMonth(r.period, active)}</span>
                <span>
                  {money(r.was!)} → {money(r.now!)}
                </span>
              </p>
            ))
          )}
        </div>
      )}
      <button type="button" onClick={apply} disabled={!draft} className={`${PRIMARY} self-end disabled:opacity-50`} data-testid="plan-payment-apply">
        {t('plan2.apply')}
      </button>
    </fieldset>
  );
}
