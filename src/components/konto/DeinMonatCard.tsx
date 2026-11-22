import { useEffect, useMemo, useRef, useState } from 'react';
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
import { monthCard, type CardItem, type CardRow } from '../../lib/monthCard';
import { monthFigures } from '../../lib/calc';
import { monthDone } from '../../lib/celebration';
import { reducedMotion } from '../../lib/entrance';
import { salaryWhen } from '../../lib/salaryMonth';
import { Confetti } from '../Confetti';
import { useCelebration } from '../useCelebration';
import { monthName } from '../../lib/period';
import { openPlan } from '../../lib/planBus';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { fitStyle } from '../fitText';
import { AlertIcon, CheckIcon, ChevronDown, ChevronRight } from '../Icons';
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
 * „Dein Monat“ (monat-ist-monat): ONE card for the ACTIVE period, paid by the salary that came at its start:
 * Netto, ① to the Fixkostenkonto (or set aside), ② paid directly, ③ Vermögensaufbau, ④ nicht eingeplant, then
 * „Übrig in diesem Monat“ as the biggest number of the screen. Under it the Spielgeld pill (④ against the limit)
 * and the one action of the month. Under the card: the next salary and „Plan ansehen“. Every number: monthCard().
 */
export function DeinMonatCard({ ds, active, onOpenSalary }: { ds: Dataset; active: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const [setup, setSetup] = useState(false);
  return (
    <>
      {settings.setupDone ? (
        <>
          <Card ds={ds} active={active} onOpenSalary={onOpenSalary} />
          <NextSalaryLine ds={ds} active={active} />
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

function Card({ ds, active, onOpenSalary }: { ds: Dataset; active: Period; onOpenSalary: () => void }) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const plan = useMonthPlan(ds, active);
  const card = useMemo(() => monthCard(ds, active, plan, start), [ds, active, plan, start]);
  const figures = useMemo(() => monthFigures(ds, active), [ds, active]);
  const allPaid = monthDone(figures);
  const { peas, run } = useCelebration(active, allPaid);
  useKontoEffects(plan.state);
  const current = plan.current;
  const account = plan.hasAccount;
  const pill = useRef<HTMLButtonElement>(null);
  const check = settings.checks.find((c) => c.period === active && c.deposited);
  const canConfirm = !plan.state.monthDone;
  const p = card.pill;
  const status = p === null ? 'none' : p.over > 0 ? 'over' : 'ok';
  const open = (el: HTMLElement | null, editSpielgeld = false) => openPlan({ returnFocusTo: el, editSpielgeld });
  const [splitOpen, setSplitOpen] = useSplitOpen();
  const noSalary = card.salary.value === null;

  return (
    <section className="hero surface flex flex-col p-5 md:p-6" data-done={allPaid || undefined} data-testid="dein-monat" data-state={noSalary ? 'no-salary' : status === 'over' ? 'short' : status} aria-labelledby="dein-monat-title">
      {/* the confetti of „{Monat} erledigt“: the same component as in the hero, lying at the bottom of this card */}
      {peas !== 'none' && <Confetti key={`${active}-${run}`} seed={active} falling={peas === 'falling'} />}
      <h2 id="dein-monat-title" className="sr-only">
        {t('month.title')}
      </h2>
      {/* monat-ist-monat: the salary at the start of the ACTIVE period – the same entry as this month's salary tile */}
      <div className="flex items-start justify-between gap-3" data-testid="dein-monat-salary">
        <p className="min-w-0">
          <span className="block text-[17px] font-semibold leading-snug text-ink" data-testid="dein-monat-salary-title">
            {card.salary.title}
          </span>
          <span className="block text-[13px] leading-5 text-ink-mute" data-testid="dein-monat-salary-when">
            {salaryWhen(active, start)}
          </span>
        </p>
        {card.salary.value !== null && <SalaryEdit period={active} salary={card.salary.value} />}
      </div>

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
                sub={current.period === plan.first.period ? inclText(plan) : undefined}
              />
              <Row n={2} label={t('month.direct')} row={card.direct} testId="dein-monat-direct" sub={card.direct.count > 0 ? t('month.direct.more', { n: card.direct.count }) : undefined} />
              <Row
                n={3}
                label={t('month.wealth')}
                row={card.wealth}
                testId="dein-monat-wealth"
                sub={card.wealth.notFromNet > 0 ? t('month.wealth.notFromNet', { betrag: money(card.wealth.notFromNet) }) : undefined}
              />
              <Row
                n={4}
                label={t('month.unplanned')}
                row={card.unplanned}
                testId="dein-monat-unplanned"
                sub={card.unplanned.other > 0 ? t('month.unplanned.other', { betrag: money(card.unplanned.other) }) : undefined}
              />
            </ol>
          </div>
          <div className="mt-2 border-t border-edge pt-3">
            <div className="fit-box" data-testid="dein-monat-free">
              <p className="text-[15px] font-semibold text-ink-soft">{t('month.free')}</p>
              <p className="num num-display fit fit-hero mt-0.5 block text-ink" style={fitStyle(money(card.left!))} data-testid="dein-monat-free-value">
                {signed(card.left!)}
              </p>
              <p className="num mt-0.5 text-[13px] leading-5 text-ink-mute" data-testid="dein-monat-before">
                {t('month.before', { betrag: signed(card.beforeSpielgeld!) })}
              </p>
            </div>
            <button
              ref={pill}
              type="button"
              onClick={() => open(pill.current, true)}
              className="focus-ring -my-1 mt-2 inline-flex min-h-11 max-w-full items-center rounded-full"
              data-testid="dein-monat-pill"
              data-status={status}
            >
              <span className={`hero-chip num inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-3.5 py-1 text-left text-[14px] font-semibold leading-snug ${status === 'over' ? 'pill-over' : ''}`}>
                {p === null ? (
                  t('month.pill.none')
                ) : p.over > 0 ? (
                  <>
                    <AlertIcon size={16} className="shrink-0" aria-hidden="true" />
                    {t('month.pill.over', { betrag: money(p.used), limit: money(p.limit), over: money(p.over) })}
                  </>
                ) : (
                  <>
                    <CheckIcon size={16} strokeWidth={2.6} className="shrink-0" aria-hidden="true" />
                    {t('month.pill.rest', { betrag: money(p.used), limit: money(p.limit), rest: money(p.rest) })}
                  </>
                )}
              </span>
            </button>
          </div>
        </>
      )}

      {/* monat-feinschliff-2: the bills of the month at the bottom of the card (no own white card any more) */}
      <BillsLine ds={ds} active={active} />

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

/** „{Monat}-Gehalt · kommt am {Datum} · Plan ansehen ›“ under the card: „Dein Plan“ plans from the next salary. */
function NextSalaryLine({ ds, active }: { ds: Dataset; active: Period }) {
  const start = useMonthStart();
  const plan = useMonthPlan(ds, active);
  const card = useMemo(() => monthCard(ds, active, plan, start), [ds, active, plan, start]);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPlan({ returnFocusTo: button.current })}
      className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-[14px] text-ink-soft hover:bg-zinc-50/60"
      data-testid="next-salary"
    >
      <span className="min-w-0" data-testid="next-salary-text">
        {t('month.next', { gehalt: card.next.title, wann: card.next.when })}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-semibold text-accent-ink">
        {t('month.next.plan')}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

const signed = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

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

/** „3.11.“ */
const shortDate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.` : '');

/** One row ① – ④: a tap opens its items (name · amount · date); the counted items add up to the row. */
function Row({ n, label, row, sub, testId }: { n: number; label: string; row: CardRow; sub?: string; testId: string }) {
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
            {sub && (
              <span className="block text-[13px] leading-5 text-ink-mute" data-testid={`${testId}-sub`}>
                {sub}
              </span>
            )}
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
  const name = item.balance === 'save' ? t('month.list.save') : item.balance === 'take' ? t('month.list.take') : item.name;
  const note = item.note === 'notFromNet' ? t('month.list.notFromNet') : item.note === 'other' ? t('month.list.other') : null;
  return (
    <li className={`flex items-baseline justify-between gap-3 py-1 text-[13px] leading-5 ${item.muted ? 'text-ink-mute' : 'text-ink-soft'}`} data-testid={`${testId}-item`} data-muted={item.muted || undefined}>
      <span className="min-w-0">
        <span className="break-words" data-testid={`${testId}-item-name`}>{name}</span>
        {(item.date || note) && <span className="text-ink-mute"> · {[shortDate(item.date), note].filter(Boolean).join(' · ')}</span>}
      </span>
      <span className="num shrink-0 whitespace-nowrap font-medium" data-testid={`${testId}-item-amount`}>
        {signed(item.amount)}
      </span>
    </li>
  );
}

/**
 * „{x} von {n} Rechnungen bezahlt“ (a tap scrolls to the categories) or, when every bill is paid, a check,
 * „{Monat} erledigt“ and „Alle {n} Rechnungen bezahlt“ – after a line, under the pill.
 */
function BillsLine({ ds, active }: { ds: Dataset; active: Period }) {
  const figures = useMemo(() => monthFigures(ds, active), [ds, active]);
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
              {t('bills.done', { monat: monthName(active) })}
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
