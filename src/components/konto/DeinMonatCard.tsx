import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { answerMonthCheck } from '../../db/kontoActions';
import { saveMonthClose } from '../../db/repo';
import { useKonto } from '../../db/useKonto';
import { localToday } from '../../lib/activeMonth';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { dayLabel } from '../../lib/kontoWords';
import { inclLine, monthPlan, type MonthPlan } from '../../lib/monthPlan';
import { monthName } from '../../lib/period';
import { openPlan } from '../../lib/planBus';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { fitStyle } from '../fitText';
import { AlertIcon, CheckIcon, ChevronDown } from '../Icons';
import { AmountInput } from '../form';
import { KontoSetup, useKontoEffects } from './KontoTile';

const money = (v: number) => formatEUR(v, { fixed: true });
const minus = (v: number) => `− ${money(v)}`;

/** monthPlan with the stored settings – recomputed on every change of the data or the settings. */
export function useMonthPlan(ds: Dataset, active: Period): MonthPlan {
  const { settings } = useKonto();
  const start = useMonthStart();
  return useMemo(() => monthPlan(ds, active, settings, start), [ds, active, settings, start]);
}

/**
 * „Dein Monat“ (monat-verdichtet): ONE card for the active month, read like a bank statement, for the
 * NEXT salary: Netto, ① to the Fixkostenkonto (or set aside), ② paid directly, ③ Vermögensaufbau, then
 * „Frei für dich“ as the biggest number of the screen. Under it the pill (does the Spielgeld fit?) and the
 * one action of the month („€ T aufs Fixkostenkonto überwiesen“). Every number: monthPlan().
 */
export function DeinMonatCard({ ds, active, onOpenSalary }: { ds: Dataset; active: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const [setup, setSetup] = useState(false);
  return (
    <>
      {settings.setupDone ? (
        <Card ds={ds} active={active} onOpenSalary={onOpenSalary} />
      ) : (
        <section className="hero surface flex flex-col items-start gap-3 p-5 md:p-6" data-testid="dein-monat" data-state="setup" aria-labelledby="dein-monat-title">
          <h2 id="dein-monat-title" className="text-[13px] font-medium text-ink-mute">
            {t('month.title')}
          </h2>
          <p className="text-[17px] font-semibold leading-snug text-ink">{t('month.setup')}</p>
          <button type="button" onClick={() => setSetup(true)} className={ACTION} data-testid="dein-monat-setup">
            {t('month.setup.action')}
          </button>
        </section>
      )}
      {/* outside the switch: once saved the card shows the month, the sheet stays until it closes itself and opens „Dein Plan“ */}
      {setup && <KontoSetup ds={ds} active={active} restart onClose={() => setSetup(false)} />}
    </>
  );
}

const ACTION =
  'focus-ring press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand-100 px-5 text-center text-[15px] font-semibold leading-snug text-brand-700 shadow-card';

function Card({ ds, active, onOpenSalary }: { ds: Dataset; active: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  useKontoEffects(plan.state);
  const first = plan.first;
  const account = plan.hasAccount;
  const reserveRow = useRef<HTMLButtonElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const check = settings.checks.find((c) => c.period === active && c.deposited);
  const canConfirm = first.period === active && !plan.state.monthDone;
  // the pill: the Spielgeld against F of this salary (the 12 months are in „Dein Plan“)
  const fits = plan.spielgeld === null || first.free === null ? null : Math.round(first.free * 100) >= Math.round(plan.spielgeld * 100);
  const open = (el: HTMLElement | null, editSpielgeld = false) => openPlan({ returnFocusTo: el, editSpielgeld });
  const [splitOpen, setSplitOpen] = useSplitOpen();

  return (
    <section className="hero surface flex flex-col p-5 md:p-6" data-testid="dein-monat" data-state={plan.noSalary ? 'no-salary' : fits === false ? 'short' : fits ? 'ok' : 'none'} aria-labelledby="dein-monat-title">
      <h2 id="dein-monat-title" className="sr-only">
        {t('month.title')}
      </h2>
      {/* the salary: tap the amount to change it (cents allowed); every number follows at once */}
      <div className="flex items-baseline justify-between gap-3" data-testid="dein-monat-salary">
        <p className="min-w-0 text-[15px] leading-snug text-ink-soft">{t('month.salary', { datum: dayLabel(first.payday) })}</p>
        {first.salary !== null && <SalaryEdit period={first.period} salary={first.salary} />}
      </div>

      {plan.noSalary ? (
        <div className="mt-4 flex flex-col items-start gap-3" data-testid="dein-monat-no-salary">
          <p className="text-[15px] leading-snug text-ink">{t('month.noSalary')}</p>
          <button type="button" onClick={onOpenSalary} className={ACTION} data-testid="dein-monat-enter-salary">
            {t('month.noSalary.action')}
          </button>
        </div>
      ) : (
        <>
          {/* „So teilt sich dein Gehalt“: ① ② ③ folded away by default, the state is kept per device */}
          <button
            type="button"
            onClick={() => void setSplitOpen(!splitOpen)}
            aria-expanded={splitOpen}
            aria-controls="dein-monat-split"
            className="focus-ring -mx-2 mt-2 flex min-h-11 items-center justify-between gap-2 rounded-xl px-2 text-left text-[14px] font-medium text-ink-soft hover:bg-white/5"
            data-testid="dein-monat-split-toggle"
          >
            {t('month.split')}
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${splitOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <div id="dein-monat-split" className="fold grid" data-open={splitOpen || undefined} data-testid="dein-monat-split" aria-hidden={!splitOpen} {...(!splitOpen ? { inert: '' } : {})}>
            <ol className="num flex min-h-0 flex-col overflow-hidden">
              <Row
                n={1}
                label={t(account ? 'month.toAccount' : 'month.aside')}
                value={minus(first.transfer)}
                testId="dein-monat-transfer"
                buttonRef={reserveRow}
                onClick={() => open(reserveRow.current)}
                sub={inclText(plan)}
              />
              <Row n={2} label={t('month.direct')} value={minus(first.direct)} testId="dein-monat-direct" sub={directNames(first.directItems.map((i) => i.name))} />
              <Row n={3} label={t('month.wealth')} value={minus(first.wealth)} testId="dein-monat-wealth" />
            </ol>
          </div>
          <div className="mt-2 border-t border-edge pt-3">
            <div className="fit-box" data-testid="dein-monat-free">
              <p className="text-[15px] font-semibold text-ink-soft">{t('month.free')}</p>
              <p className="num num-display fit fit-hero mt-0.5 block text-ink" style={fitStyle(money(first.free!))} data-testid="dein-monat-free-value">
                {first.free! < 0 ? `−${money(-first.free!)}` : money(first.free!)}
              </p>
            </div>
            <button
              ref={pill}
              type="button"
              onClick={() => open(pill.current, true)}
              className="focus-ring -my-1 mt-2 inline-flex min-h-11 max-w-full items-center rounded-full"
              data-testid="dein-monat-pill"
              data-status={plan.spielgeld === null ? 'none' : fits ? 'ok' : 'short'}
            >
              <span className="hero-chip num inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-3.5 py-1 text-left text-[14px] font-semibold leading-snug">
                {plan.spielgeld === null ? (
                  t('month.pill.none')
                ) : fits ? (
                  <>
                    <CheckIcon size={16} strokeWidth={2.6} className="shrink-0" aria-hidden="true" />
                    {t('month.pill.ok', { betrag: money(plan.spielgeld) })}
                  </>
                ) : (
                  <>
                    <AlertIcon size={16} className="shrink-0" aria-hidden="true" />
                    {t('month.pill.short', { betrag: money(Math.round((plan.spielgeld - first.free!) * 100) / 100) })}
                  </>
                )}
              </span>
            </button>
          </div>
        </>
      )}

      {/* the one action of the month: the transfer (replaces the monthly check) */}
      {canConfirm && first.transfer > 0 && (
        <button
          type="button"
          onClick={() => void answerMonthCheck(db, active, true, localToday(), first.transfer)}
          className={`${ACTION} mt-4 w-full`}
          data-testid="dein-monat-confirm"
        >
          {t(account ? 'month.confirm.account' : 'month.confirm.aside', { betrag: money(first.transfer) })}
        </button>
      )}
      {check && (
        <p className="mt-4 flex items-center gap-2 text-[15px] font-semibold text-ink" data-testid="dein-monat-done">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700" aria-hidden="true">
            <CheckIcon size={16} strokeWidth={2.8} />
          </span>
          {t(account ? 'month.done.account' : 'month.done.aside', { datum: dayLabel(new Date(check.answeredAt)) })}
        </p>
      )}
    </section>
  );
}

/** „inkl. € 326,81 für Februar · Steuerberater, Öffis“ / „inkl. € 262,00 Baurechtszins“ (monthPlan.inclLine) */
function inclText(plan: MonthPlan): string | undefined {
  const line = inclLine(plan);
  if (!line || line.names.length === 0) return undefined;
  const zahlungen = line.names.join(', ');
  return line.month
    ? t('month.incl.save', { betrag: money(line.amount), monat: monthName(line.month), zahlungen })
    : t('month.incl.due', { betrag: money(line.amount), zahlungen });
}

/** The salary of the card: a tap makes it editable (decimal keyboard, cents); Enter or a tap outside saves. */
function SalaryEdit({ period, salary }: { period: Period; salary: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    field.current?.select();
  }, [editing]);
  function commit() {
    if (!editing) return;
    setEditing(false);
    const value = parseAmount(text);
    if (value === null || value < 0 || Math.round(value * 100) === Math.round(salary * 100)) return;
    void saveMonthClose(db, period, { netSalary: value });
  }
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setText(amountToInput(salary));
          setEditing(true);
        }}
        aria-label={`${t('month.salary.edit')}: ${money(salary)}`}
        className="focus-ring num -mr-2 shrink-0 whitespace-nowrap rounded-xl px-2 py-1 text-[17px] font-semibold text-ink hover:bg-white/5"
        data-testid="dein-monat-salary-value"
      >
        {money(salary)}
      </button>
    );
  return (
    <span className="flex shrink-0 items-center rounded-xl border border-edge px-2 py-0.5">
      <span className="mr-1 text-[15px] text-ink-soft">{currencySymbol()}</span>
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
          }
        }}
        onBlur={commit}
        enterKeyHint="done"
        aria-label={t('month.salary.edit')}
        size={Math.max(5, text.length + 1)}
        className="num w-auto max-w-[11ch] bg-transparent text-right text-[17px] font-semibold text-ink outline-none"
        data-testid="dein-monat-salary-input"
      />
    </span>
  );
}

/** „So teilt sich dein Gehalt“ open or folded – per device (a meta entry that no backup carries). */
const SPLIT_KEY = 'monthSplitOpen';
function useSplitOpen(): [boolean, (open: boolean) => Promise<void>] {
  const stored = useLiveQuery(() => db.meta.get(SPLIT_KEY), []);
  return [stored?.value === true, async (open) => void (await db.meta.put({ key: SPLIT_KEY, value: open }))];
}

/** up to two names, else „{n} Posten“ */
function directNames(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.length <= 2 ? names.join(', ') : t('month.direct.more', { n: names.length });
}

function Row({
  n,
  label,
  value,
  sub,
  testId,
  onClick,
  buttonRef,
}: {
  n: number;
  label: string;
  value: string;
  sub?: string;
  testId: string;
  onClick?: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const body: ReactNode = (
    <>
      <span className="flex min-w-0 items-start gap-2.5">
        <span className="hero-chip mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" aria-hidden="true">
          {n}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] leading-6 text-ink">{label}</span>
          {sub && (
            <span className="block text-[13px] leading-5 text-ink-mute" data-testid={`${testId}-sub`}>
              {sub}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-[15px] font-semibold leading-6 text-ink" data-testid={`${testId}-value`}>
        {value}
      </span>
    </>
  );
  return (
    <li data-testid={testId}>
      {onClick ? (
        <button ref={buttonRef} type="button" onClick={onClick} className="focus-ring -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
          {body}
        </button>
      ) : (
        <div className="flex min-h-11 items-start justify-between gap-3 py-1.5">{body}</div>
      )}
    </li>
  );
}
