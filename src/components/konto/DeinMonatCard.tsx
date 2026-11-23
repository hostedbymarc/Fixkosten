import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { answerMonthCheck, markPlanSalaryHintSeen } from '../../db/kontoActions';
import { saveMonthClose } from '../../db/repo';
import { useKonto } from '../../db/useKonto';
import { localToday } from '../../lib/activeMonth';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { dayLabel } from '../../lib/kontoWords';
import { inclLine, monthPlan, type MonthPlan } from '../../lib/monthPlan';
import { monthCard, type CardItem, type CardRow, type MonthCard } from '../../lib/monthCard';
import { monthFigures } from '../../lib/calc';
import { monthDone } from '../../lib/celebration';
import { reducedMotion } from '../../lib/entrance';
import { salaryWhen } from '../../lib/salaryMonth';
import { Confetti } from '../Confetti';
import { useCelebration } from '../useCelebration';
import { monthName } from '../../lib/period';
import { openPlan } from '../../lib/planBus';
import type { Dataset, Period } from '../../lib/types';
import { useActiveMonth, useMonthStart } from '../../lib/useToday';
import { fitStyle } from '../fitText';
import { CheckIcon, ChevronDown, ChevronRight } from '../Icons';
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
 * „Dein Monat“ (alle-monate-gleich): ONE card for EVERY month – past, active, future – the same component in the
 * same order. The period of the month, paid by the salary that came at its start: Netto, ① to the
 * Fixkostenkonto (or set aside), ② paid directly, ③ Vermögensaufbau, ④ Spielgeld, then „Überschuss in diesem
 * Monat“ as the biggest number of the screen, over the limit „Spielgeld € X drüber“ and, in the active month, the one action of the
 * month. The bills row and the confetti at the bottom. Under the card, in the active month only: the next
 * salary and „Plan ansehen“. Every number: monthCard() with the plan of the active month.
 */
export function DeinMonatCard({ ds, period, onOpenSalary }: { ds: Dataset; period: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const active = useActiveMonth();
  const [setup, setSetup] = useState(false);
  return (
    <>
      {settings.setupDone ? (
        <>
          <Card ds={ds} period={period} active={active} onOpenSalary={onOpenSalary} />
          {period === active && <NextSalaryLine ds={ds} active={active} />}
        </>
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

function Card({ ds, period, active, onOpenSalary }: { ds: Dataset; period: Period; active: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const plan = useMonthPlan(ds, active);
  const card = useMemo(() => monthCard(ds, period, plan, start), [ds, period, plan, start]);
  const figures = useMemo(() => monthFigures(ds, period, start), [ds, period, start]);
  const allPaid = monthDone(figures);
  const { peas, run } = useCelebration(period, allPaid);
  useKontoEffects(plan.state);
  const isActive = period === active;
  const current = plan.current;
  const account = plan.hasAccount;
  // the monthly transfer: an action of the active month only
  const check = isActive ? settings.checks.find((c) => c.period === active && c.deposited) : undefined;
  const canConfirm = isActive && !plan.state.monthDone;
  const p = card.spielgeld;
  const status = p === null ? 'none' : p.over > 0 ? 'over' : 'ok';
  const [splitOpen, setSplitOpen] = useSplitOpen();
  const noSalary = card.salary.value === null;

  return (
    <section
      className="hero surface flex flex-col p-5 md:p-6"
      data-done={allPaid || undefined}
      data-testid="dein-monat"
      data-period={period}
      data-when={isActive ? 'active' : period < active ? 'past' : 'future'}
      data-state={noSalary ? 'no-salary' : status === 'over' ? 'short' : status}
      aria-labelledby="dein-monat-title"
    >
      {/* the confetti of „{Monat} erledigt“: lying at the bottom of this card, in every month */}
      {peas !== 'none' && <Confetti key={`${period}-${run}`} seed={period} falling={peas === 'falling'} />}
      <h2 id="dein-monat-title" className="sr-only">
        {t('month.title')}
      </h2>
      {/* the salary at the start of the period: „ausgezahlt am …“ once the day is reached, else „kommt am …“ */}
      <div className="flex items-start justify-between gap-3" data-testid="dein-monat-salary">
        <p className="min-w-0">
          <span className="block text-[17px] font-semibold leading-snug text-ink" data-testid="dein-monat-salary-title">
            {card.salary.title}
          </span>
          <span className="block text-[13px] leading-5 text-ink-mute" data-testid="dein-monat-salary-when">
            {/* gehalt-zum-planen: no entry → the planned salary, „geplant · kommt am 25.11.“ (short: one line on the iPhone SE) */}
            {card.salary.fallback ? t('month.salary.planned', { wann: salaryWhen(period, start, localToday(), true) }) : salaryWhen(period, start)}
          </span>
        </p>
        {card.salary.value !== null && <SalaryEdit period={period} salary={card.salary.value} fallback={card.salary.fallback} />}
      </div>
      {isActive && settings.planSalary === null && !settings.planSalaryHintSeen && <PlanSalaryHint />}

      {noSalary ? (
        <div className="mt-4 flex flex-col items-start gap-3" data-testid="dein-monat-no-salary">
          <p className="text-[15px] leading-snug text-ink">{t('month.noSalary')}</p>
          <button type="button" onClick={onOpenSalary} className={ACTION} data-testid="dein-monat-enter-salary">
            {t('month.noSalary.action')}
          </button>
        </div>
      ) : (
        <>
          {/* „So teilt sich dein Gehalt“: ① – ④ folded away by default, the state is kept per device */}
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
                row={card.reserve}
                testId="dein-monat-transfer"
                sub={isActive && current.period === plan.first.period ? inclText(plan) : undefined}
              />
              <Row n={2} label={t('month.direct')} row={card.direct} testId="dein-monat-direct" sub={card.direct.count > 0 ? t('month.direct.more', { n: card.direct.count }) : undefined} />
              <Row
                n={3}
                label={t('month.wealth')}
                row={card.wealth}
                testId="dein-monat-wealth"
                sub={card.wealth.notFromNet > 0 ? t('month.wealth.notFromNet', { betrag: money(card.wealth.notFromNet) }) : undefined}
              />
              <Row n={4} label={t('month.unplanned')} row={card.unplanned} testId="dein-monat-unplanned" sub={spielgeldSub(card)} subOver={p !== null && p.over > 0} />
            </ol>
          </div>
          <div className="mt-2 border-t border-edge pt-3">
            <div className="fit-box" data-testid="dein-monat-free">
              <p className="text-[15px] font-semibold text-ink-soft">{t('month.free')}</p>
              <p
                className={`num num-display fit fit-hero mt-0.5 block ${card.left! < 0 ? 'hero-warn' : 'text-ink'}`}
                style={fitStyle(money(card.left!))}
                data-testid="dein-monat-free-value"
                data-negative={card.left! < 0 || undefined}
              >
                {signed(card.left!)}
              </p>
              <p className="num mt-0.5 text-[13px] leading-5 text-ink-mute" data-testid="dein-monat-before">
                {t('month.before', { betrag: signed(card.beforeSpielgeld!) })}
              </p>
              {/* only over the limit: a muted line in the warn token (spielgeld-pille-rechenfehler) */}
              {p !== null && p.over > 0 && (
                <p className="num hero-warn mt-0.5 text-[13px] leading-5" data-testid="dein-monat-over">
                  {t('month.over', { betrag: money(p.over) })}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* monat-feinschliff-2: the bills of the month at the bottom of the card (no own white card any more) */}
      <BillsLine ds={ds} period={period} />

      {/* the one action of the month: the transfer (replaces the monthly check) */}
      {canConfirm && current.transfer > 0 && (
        <button
          type="button"
          onClick={() => void answerMonthCheck(db, active, true, localToday(), current.transfer)}
          className={`${ACTION} mt-4 w-full`}
          data-testid="dein-monat-confirm"
        >
          {t(account ? 'month.confirm.account' : 'month.confirm.aside', { betrag: money(current.transfer) })}
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

/**
 * „{Monat}-Gehalt · kommt am 25.11. · Plan ansehen ›“ under the card of the active month: „Dein Plan“ plans from
 * the next salary. One line down to the iPhone SE: the short date, nothing wraps.
 */
function NextSalaryLine({ ds, active }: { ds: Dataset; active: Period }) {
  const start = useMonthStart();
  const plan = useMonthPlan(ds, active);
  const card = useMemo(() => monthCard(ds, active, plan, start), [ds, active, plan, start]);
  const button = useRef<HTMLButtonElement>(null);
  const when = salaryWhen(card.next.period, start, localToday(), true);
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPlan({ returnFocusTo: button.current })}
      className="focus-ring flex min-h-11 w-full items-center justify-between gap-2 whitespace-nowrap rounded-2xl px-2 text-left text-[13px] tracking-[-0.01em] text-ink-soft hover:bg-zinc-50/60 sm:px-4 sm:text-[14px] sm:tracking-normal"
      data-testid="next-salary"
    >
      <span className="min-w-0" data-testid="next-salary-text">
        {t('month.next', { gehalt: card.next.title, wann: when })}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-semibold text-accent-ink">
        {t('month.next.plan')}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

const signed = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

/** under ④: „€ 120,00 von € 300,00 ausgegeben“ / „€ 450,00 ausgegeben · € 150,00 drüber“ / „Kein Spielgeld festgelegt“ */
function spielgeldSub(card: MonthCard): string {
  const p = card.spielgeld;
  if (p === null) return t('month.spielgeld.none');
  return p.over > 0 ? t('month.spielgeld.over', { betrag: money(p.used), over: money(p.over) }) : t('month.spielgeld.spent', { betrag: money(p.used), limit: money(p.limit) });
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

/**
 * „Leg dein Gehalt zum Planen fest ›“ (gehalt-zum-planen): in the active month while „Gehalt zum Planen“ is not
 * set, until it is tapped once. Opens the settings at „Gehalt“.
 */
function PlanSalaryHint() {
  return (
    <button
      type="button"
      onClick={() => {
        void markPlanSalaryHintSeen(db);
        window.location.hash = '#einstellungen';
        // once the settings are shown (they may still load): the field in view and focused
        const until = Date.now() + 3000;
        const reach = () => {
          const field = document.querySelector<HTMLInputElement>('main > :not([data-tab-hidden]) [data-testid="plan-salary"]');
          if (field) {
            field.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
            field.focus({ preventScroll: true });
          } else if (Date.now() < until) window.setTimeout(reach, 50);
        };
        window.setTimeout(reach, 50);
      }}
      className="focus-ring -mx-2 mt-1 inline-flex min-h-11 items-center gap-0.5 self-start rounded-xl px-2 text-[14px] font-semibold text-accent-ink"
      data-testid="dein-monat-plan-salary-hint"
    >
      {t('month.planSalary.hint')}
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

/**
 * The salary of the card: a tap makes it editable (decimal keyboard, cents); Enter or a tap outside saves.
 * gehalt-zum-planen: empty and confirmed, or „Gehalt entfernen“ (only with an entry), deletes the entry of the
 * month – the planned salary counts again at once. € 0 stays an entry.
 */
function SalaryEdit({ period, salary, fallback }: { period: Period; salary: number; fallback: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const removing = useRef(false);
  useEffect(() => {
    if (!editing) return;
    removing.current = false;
    field.current?.focus();
    field.current?.select();
  }, [editing]);
  function remove() {
    setEditing(false);
    void saveMonthClose(db, period, { netSalary: undefined });
  }
  function commit() {
    if (!editing || removing.current) return;
    setEditing(false);
    if (text.trim() === '') {
      if (!fallback) remove();
      return;
    }
    const value = parseAmount(text);
    // the fallback (the last salary entered) is not this month's entry yet: saving it as it is stores it
    if (value === null || value < 0 || (!fallback && Math.round(value * 100) === Math.round(salary * 100))) return;
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
        className={`focus-ring num -mr-2 shrink-0 whitespace-nowrap rounded-xl px-2 py-1 text-[17px] font-semibold hover:bg-white/5 ${fallback ? 'text-ink-mute' : 'text-ink'}`}
        data-testid="dein-monat-salary-value"
        data-fallback={fallback || undefined}
      >
        {money(salary)}
      </button>
    );
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-center rounded-xl border border-edge px-2 py-0.5">
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
      {!fallback && (
        <button
          type="button"
          // before the field loses the focus: the blur must not save what is typed
          onPointerDown={() => (removing.current = true)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={remove}
          className="focus-ring -mr-2 min-h-11 rounded-xl px-2 text-[14px] font-semibold text-accent-ink"
          data-testid="dein-monat-salary-remove"
        >
          {t('month.salary.remove')}
        </button>
      )}
    </span>
  );
}

/** „So teilt sich dein Gehalt“ open or folded – per device (a meta entry that no backup carries). */
const SPLIT_KEY = 'monthSplitOpen';
function useSplitOpen(): [boolean, (open: boolean) => Promise<void>] {
  const stored = useLiveQuery(() => db.meta.get(SPLIT_KEY), []);
  return [stored?.value === true, async (open) => void (await db.meta.put({ key: SPLIT_KEY, value: open }))];
}

/** „3.11.“ */
const shortDate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.` : '');

/** One row ① – ④: a tap opens its items (name · amount · date); the counted items add up to the row. */
function Row({ n, label, row, sub, subOver, testId }: { n: number; label: string; row: CardRow; sub?: string; subOver?: boolean; testId: string }) {
  const [open, setOpen] = useState(false);
  const listId = `${testId}-list`;
  return (
    <li data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={listId}
        className="focus-ring -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5"
        data-testid={`${testId}-toggle`}
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <span className="hero-chip mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" aria-hidden="true">
            {n}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] leading-6 text-ink">{label}</span>
            {sub &&
              (subOver ? (
                // over the limit: the warn tokens (warn on warn-soft)
                <span className="hero-chip pill-over mt-0.5 inline-block rounded-full px-2 text-[13px] font-medium leading-5" data-testid={`${testId}-sub`} data-over="">
                  {sub}
                </span>
              ) : (
                <span className="block text-[13px] leading-5 text-ink-mute" data-testid={`${testId}-sub`}>
                  {sub}
                </span>
              ))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="whitespace-nowrap text-right text-[15px] font-semibold leading-6 text-ink" data-testid={`${testId}-value`}>
            {minus(row.total)}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-mute transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ul id={listId} className="mb-1 ml-[1.875rem] flex flex-col border-l border-edge pl-3" data-testid={listId}>
          {row.items.length === 0 ? (
            <li className="py-1 text-[13px] text-ink-mute">{t('month.list.empty')}</li>
          ) : (
            row.items.map((i) => <ItemLine key={i.key} item={i} testId={testId} />)
          )}
        </ul>
      )}
    </li>
  );
}

function ItemLine({ item, testId }: { item: CardItem; testId: string }) {
  const name = item.balance === 'save' ? t('month.list.save') : item.balance === 'take' ? t('month.list.take') : item.balance === 'rest' ? t('month.list.rest') : item.name;
  const note = item.note === 'notFromNet' ? t('month.list.notFromNet') : item.note === 'other' ? t('month.list.other') : null;
  return (
    <li className={`flex items-baseline justify-between gap-3 py-1 text-[13px] leading-5 ${item.muted ? 'text-ink-mute' : 'text-ink-soft'}`} data-testid={`${testId}-item`} data-muted={item.muted || undefined}>
      <span className="min-w-0">
        <span className="break-words" data-testid={`${testId}-item-name`}>{name}</span>
        {(item.date || note) && <span className="text-ink-mute"> · {[shortDate(item.date), note].filter(Boolean).join(' · ')}</span>}
      </span>
      <span className="num shrink-0 whitespace-nowrap font-medium" data-testid={`${testId}-item-amount`}>
        {item.amount < 0 ? minus(-item.amount) : money(item.amount)}
      </span>
    </li>
  );
}

/**
 * „{x} von {n} Rechnungen bezahlt“ (a tap scrolls to the categories) or, when every bill is paid, a check,
 * „{Monat} erledigt“ and „Alle {n} Rechnungen bezahlt“ – after a line, under the Überschuss.
 */
function BillsLine({ ds, period }: { ds: Dataset; period: Period }) {
  const start = useMonthStart();
  const figures = useMemo(() => monthFigures(ds, period, start), [ds, period, start]);
  const allPaid = monthDone(figures);
  const paid = figures.count - figures.openCount;
  return (
    <div className="mt-4 border-t border-edge pt-3" data-testid="dein-monat-bills" data-done={allPaid || undefined}>
      {allPaid ? (
        <p className="flex items-center gap-3" data-testid="dein-monat-bills-done">
          <span className="hero-check flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700" aria-hidden="true">
            <CheckIcon size={20} strokeWidth={2.8} />
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold leading-snug text-ink" data-testid="dein-monat-bills-title">
              {t('bills.done', { monat: monthName(period) })}
            </span>
            <span className="block text-[13px] leading-5 text-ink-mute">
              {figures.count === 1 ? t('bills.done.sub.one') : t('bills.done.sub', { n: figures.count })}
            </span>
          </span>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => document.querySelector('[data-testid="categories-label"]')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })}
          className="focus-ring -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 text-left text-[15px] text-ink hover:bg-white/5"
          data-testid="dein-monat-bills-open"
        >
          <span className="num">{figures.count === 0 ? t('bills.none') : t('bills.count.card', { x: paid, n: figures.count })}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
