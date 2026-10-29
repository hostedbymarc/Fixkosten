import { forwardRef, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { categoryColor } from '../lib/categoryColors';
import { useMonthSwipe } from '../lib/useMonthSwipe';
import { useCollapsed } from '../lib/useCollapsed';
import { Disclosure } from '../components/Disclosure';
import { InfoTip } from '../components/InfoTip';
import { averageMonthExplanation, deductionsExplanation, type AverageMonthExplanation } from '../lib/explain';
import { AlertIcon, BellIcon, ChevronLeft, ChevronRight, ClockIcon } from '../components/Icons';
import { MonthCloseSheet } from '../components/MonthCloseSheet';
import { MonthNoteCard, MonthNoteSheet } from '../components/MonthNote';
import { OneOffSheet } from '../components/OneOffSheet';
import { PaymentSheet } from '../components/PaymentSheet';
import { PositionFormSheet } from '../components/PositionFormSheet';
import { PositionRow } from '../components/PositionRow';
import { ProgressRing } from '../components/ProgressRing';
import { Badge, scheduleLabel } from '../components/Chips';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import { FEATURE_REMINDERS } from '../lib/features';
import {
  deleteOneOff,
  markPaid,
  deletePositionForUndo,
  markSkipped,
  removePayment,
  restoreDeletedPosition,
  restoreOneOff,
  restorePayment,
  saveMonthClose,
  saveMonthNote,
  toggleOneOffPaid,
  updatePayment,
} from '../db/repo';
import {
  dueItems,
  freeAfterFixedAvg,
  netSalaryForPeriod,
  groupByCategory,
  monthCloseFor,
  openFromPrevious,
  sumOpen,
  countOpen,
  openSavings,
  monthFigures,
  categoryFigures,
  progressPercent,
  sameMoney,
  shownOpen,
  type MonthFigures,
  type Tally,
  remindersForPeriod,
  reserveNeeded,
  sumMonthlyEquivalent,
  fixedCostsAvg,
  upcomingDue,
  type CategoryGroup,
  type DueItem,
  type OpenGroup,
} from '../lib/calc';
import { formatAvg, formatEUR, formatPercent } from '../lib/format';
import { addPeriods, monthName, periodLabel } from '../lib/period';
import { calendarMonth, localToday } from '../lib/activeMonth';
import { useActiveMonth } from '../lib/useToday';
import type { Dataset, OneOff, Period } from '../lib/types';

interface Props {
  ds: Dataset;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function MonthScreen({ ds, period, onPeriodChange }: Props) {
  const toast = useToast();
  const [openKey, setOpenKey] = useState<{ positionId: string; period: Period } | null>(null);
  const [oneOffSheet, setOneOffSheet] = useState<{ positionId: string; oneOff?: OneOff } | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const swipe = useMonthSwipe(
    () => onPeriodChange(addPeriods(period, 1)),
    () => onPeriodChange(addPeriods(period, -1)),
  );
  const salaryTile = useRef<HTMLButtonElement>(null);
  const closeTrigger = useRef<HTMLElement | null>(null);
  const [editOnce, setEditOnce] = useState<string | null>(null);
  const [onceOpen, setOnceOpen] = useState(false);
  const onceButton = useRef<HTMLButtonElement>(null);
  const closeTile = useRef<HTMLButtonElement>(null);
  const noteCard = useRef<HTMLButtonElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const items = useMemo(() => dueItems(ds, period), [ds, period]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const collapse = useCollapsed();
  const allCollapsed = groups.length > 0 && groups.every((g) => collapse.isCollapsed(g.category.id));
  // every amount of the month comes from here (hero, tiles, category headers)
  const figures = useMemo(() => monthFigures(ds, period), [ds, period]);
  const upcoming = useMemo(() => upcomingDue(ds, period, 2), [ds, period]);
  const reminders = FEATURE_REMINDERS ? remindersForPeriod(ds, period) : [];
  const today = useActiveMonth();
  const openGroups = useMemo(() => openFromPrevious(ds, period, today), [ds, period, today]);
  const openItem =
    openKey === null
      ? null
      : ((openKey.period === period ? items : openGroups.flatMap((g) => g.items)).find(
          (i) => i.position.id === openKey.positionId && i.period === openKey.period,
        ) ?? null);
  const oneOffPosition = oneOffSheet ? ds.positions.find((p) => p.id === oneOffSheet.positionId) : undefined;

  function openClose(trigger: HTMLElement | null) {
    closeTrigger.current = trigger;
    setCloseOpen(true);
  }

  /** One-time payments belong to their month: deleting them is done right here, with undo. */
  async function deleteOnce(item: DueItem) {
    setOpenKey(null);
    const removed = await deletePositionForUndo(db, item.position.id);
    toast({
      message: `„${item.position.name}“ gelöscht`,
      actionLabel: 'Rückgängig',
      onAction: () => void restoreDeletedPosition(db, removed),
      durationMs: 6000,
    });
  }

  async function unpay(item: DueItem) {
    if (!item.payment) return;
    const removed = await removePayment(db, item.payment.id);
    if (!removed) return;
    toast({
      message:
        removed.status === 'skipped'
          ? `„${item.position.name}“ ist wieder offen`
          : `Haken bei „${item.position.name}“ entfernt`,
      actionLabel: 'Rückgängig',
      onAction: () => void restorePayment(db, removed),
    });
  }

  async function toggle(item: DueItem) {
    if (item.payment) await unpay(item);
    else await markPaid(db, item.position.id, item.period, item.planned);
  }

  async function save(item: DueItem, actualAmount: number, note: string) {
    const payment =
      item.status === 'paid' ? item.payment! : await markPaid(db, item.position.id, item.period, item.planned);
    await updatePayment(db, payment.id, { actualAmount, note });
    setOpenKey(null);
  }

  async function skip(item: DueItem) {
    const skipped = await markSkipped(db, item.position.id, item.period, item.planned);
    toast({
      message: `„${item.position.name}“ (${monthName(item.period)}) entfällt`,
      actionLabel: 'Rückgängig',
      onAction: () => void removePayment(db, skipped.id),
    });
  }

  async function removeOneOff(oneOff: OneOff) {
    setOneOffSheet(null);
    const removed = await deleteOneOff(db, oneOff.id);
    if (!removed) return;
    toast({
      message: `„${oneOff.label}“ gelöscht`,
      actionLabel: 'Rückgängig',
      onAction: () => void restoreOneOff(db, removed),
    });
  }

  return (
    <div
      className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8"
      style={{ touchAction: 'pan-y' }}
      data-testid="month-screen"
      {...swipe.handlers}
    >
      <MonthHeader period={period} onChange={onPeriodChange} />
      <div key={swipe.enterKey} className={swipe.enterClass} style={swipe.style}>

      {openGroups.length > 0 && (
        <OpenFromPrevious
          groups={openGroups}
          onPay={(item) => setOpenKey({ positionId: item.position.id, period: item.period })}
          onSkip={(item) => void skip(item)}
        />
      )}

      <div className="grid gap-3 md:gap-4">
        <HeroCard figures={figures} />
        {/* iPhone 2 × 2, from iPad 4 in a row; each tile: label, value, at most one subline */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <SalaryTile
            ref={salaryTile}
            period={period}
            salary={netSalaryForPeriod(ds, period)}
            onOpen={() => openClose(salaryTile.current)}
          />
          <KpiTile label="Ø pro Monat" value={formatAvg(fixedCostsAvg(ds, period))}>
            <span data-testid="kpi-hint">
              davon <Amount>{formatAvg(reserveNeeded(ds, period))}</Amount> nicht monatlich
            </span>
          </KpiTile>
          <FreeTile
            ref={closeTile}
            period={period}
            calculated={figures.free}
            average={freeAfterFixedAvg(ds, period)}
            explanation={averageMonthExplanation(ds, period)}
            onOpen={() => openClose(closeTile.current)}
          />
          <WealthTile wealth={figures.wealth} notFromNet={figures.wealthNotFromNet} rate={figures.savingsRate} />
        </div>
        <MonthNoteCard ref={noteCard} period={period} note={monthCloseFor(ds, period)?.note} onOpen={() => setNoteOpen(true)} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Fällige Positionen" className="flex flex-col gap-3 md:gap-4">
          {groups.length > 0 && (
            <div className="-mb-1 flex items-center justify-between px-1">
              <p className="section-title" data-testid="categories-label">
                Kategorien
              </p>
              <button
                type="button"
                onClick={() => collapse.setAll(groups.map((g) => g.category.id), !allCollapsed)}
                className="focus-ring h-11 rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
                data-testid="collapse-all"
              >
                {allCollapsed ? 'Alle ausklappen' : 'Alle einklappen'}
              </button>
            </div>
          )}
          {groups.length === 0 ? (
            <EmptyCard>
              Für {periodLabel(period)} ist nichts fällig. Neue Positionen legst du unter „Positionen“ an.
            </EmptyCard>
          ) : (
            groups.map((group) => (
              <GroupCard
                key={group.category.id}
                group={group}
                tally={categoryFigures(figures, group.category.id)}
                collapsed={collapse.isCollapsed(group.category.id)}
                onToggleCollapsed={() => collapse.toggle(group.category.id)}
                spread={sumMonthlyEquivalent(ds, period, { categoryId: group.category.id })}
                onToggle={toggle}
                onOpen={(item) => setOpenKey({ positionId: item.position.id, period: item.period })}
                onToggleOneOff={(o) => void toggleOneOffPaid(db, o.id)}
                onOpenOneOff={(o) => setOneOffSheet({ positionId: o.positionId!, oneOff: o })}
              />
            ))
          )}
          <button
            ref={onceButton}
            type="button"
            onClick={() => setOnceOpen(true)}
            className="focus-ring flex min-h-[52px] items-center justify-center gap-2 rounded-card border border-dashed border-edge bg-field px-4 text-[15px] font-semibold text-accent-ink hover:bg-accent-soft"
            data-testid="add-once"
          >
            <span aria-hidden="true" className="text-[20px] leading-none">+</span>
            Einmalige Zahlung hinzufügen
          </button>
        </section>

        <aside className="flex flex-col gap-6">
          {FEATURE_REMINDERS && (
          <section aria-labelledby="reminders-title">
            <h2 id="reminders-title" className="section-title mb-2 flex items-center gap-1.5 px-1">
              <BellIcon size={15} /> Erinnerungen diesen Monat
            </h2>
            {reminders.length === 0 ? (
              <EmptyCard>Keine Erinnerungen für {monthName(period)}.</EmptyCard>
            ) : (
              <ul className="glass divide-y divide-line">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3.5 text-[15px] text-ink">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}

          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="section-title mb-3 flex min-h-11 items-center gap-2 px-1">
              <ClockIcon size={15} /> Kommt bald
            </h2>
            {upcoming.length === 0 ? (
              <EmptyCard>In den nächsten 2 Monaten keine Sonderzahlungen.</EmptyCard>
            ) : (
              <ul className="glass divide-y divide-line">
                {upcoming.map((item) => (
                  <li
                    key={`${item.period}-${item.position.id}`}
                    className="flex items-start gap-3 px-4 py-3 md:px-5"
                    data-testid="upcoming-row"
                  >
                    <span className="min-w-0 flex-1">
                      <span lang="de" className="line-clamp-2 hyphens-auto break-words text-[15px] font-medium leading-6 text-ink">
                        {item.position.name}
                      </span>
                      {/* fixed grid on every viewport: line 2 the month chip, line 3 the rhythm */}
                      <span className="mt-1 flex" data-testid="upcoming-month">
                        <Badge tone="warn">{monthName(item.period)}</Badge>
                      </span>
                      {item.plan && (
                        <span className="mt-0.5 block text-[13px] leading-5 text-ink-mute" data-testid="upcoming-rhythm">
                          {scheduleLabel(item.plan, item.period)}
                        </span>
                      )}
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-[15px] font-semibold leading-6 text-ink">{formatEUR(item.planned)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      </div>

      {editOnce && ds.positions.some((p) => p.id === editOnce) && (
        <PositionFormSheet
          ds={ds}
          today={period}
          position={ds.positions.find((p) => p.id === editOnce)}
          onClose={() => setEditOnce(null)}
          onSaved={() => setEditOnce(null)}
        />
      )}

      {onceOpen && (
        <PositionFormSheet
          ds={ds}
          today={period}
          once={{ dueDate: defaultDueDate(period), period }}
          onClose={() => setOnceOpen(false)}
          onSaved={() => setOnceOpen(false)}
          returnFocusTo={onceButton.current}
        />
      )}

      {noteOpen && (
        <MonthNoteSheet
          key={period}
          period={period}
          note={monthCloseFor(ds, period)?.note}
          returnFocusTo={noteCard.current}
          onClose={() => setNoteOpen(false)}
          onDeleted={(removed) => {
            setNoteOpen(false);
            toast({
              message: 'Notiz gelöscht',
              actionLabel: 'Rückgängig',
              onAction: () => void saveMonthNote(db, period, removed),
              durationMs: 6000,
            });
          }}
        />
      )}

      {closeOpen && (
        <MonthCloseSheet
          ds={ds}
          period={period}
          returnFocusTo={closeTrigger.current}
          onClose={() => setCloseOpen(false)}
          onSave={(input) => {
            void saveMonthClose(db, period, input).then(() => setCloseOpen(false));
          }}
        />
      )}

      {openItem && (
        <PaymentSheet
          key={`${openItem.position.id}-${openItem.period}`}
          item={openItem}
          onClose={() => setOpenKey(null)}
          onSave={(amount, note) => void save(openItem, amount, note)}
          onUnpay={() => {
            setOpenKey(null);
            void unpay(openItem);
          }}
          onEditOnce={
            openItem.plan?.frequency === 'once'
              ? () => {
                  setOpenKey(null);
                  setEditOnce(openItem.position.id);
                }
              : undefined
          }
          onDeleteOnce={openItem.plan?.frequency === 'once' ? () => void deleteOnce(openItem) : undefined}
          onAddOneOff={
            openItem.plan?.frequency !== 'once' && openItem.period === period
              ? () => {
                  setOpenKey(null);
                  setOneOffSheet({ positionId: openItem.position.id });
                }
              : undefined
          }
        />
      )}

      {oneOffSheet && oneOffPosition && (
        <OneOffSheet
          key={oneOffSheet.oneOff?.id ?? 'new'}
          position={oneOffPosition}
          period={period}
          oneOff={oneOffSheet.oneOff}
          onClose={() => setOneOffSheet(null)}
          onDelete={(o) => void removeOneOff(o)}
        />
      )}
    </div>
  );
}

/** Today when the month shown is the calendar month, otherwise the 1st of that month. */
function defaultDueDate(period: Period): string {
  const now = localToday();
  const current = calendarMonth(now);
  return period === current ? `${current}-${String(now.getDate()).padStart(2, '0')}` : `${period}-01`;
}

function MonthHeader({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const navButton =
    'focus-ring flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-zinc-100 active:bg-zinc-200';
  return (
    <header className="flex items-center justify-between py-3 lg:py-6">
      <button type="button" className={navButton} onClick={() => onChange(addPeriods(period, -1))} aria-label="Vorheriger Monat">
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]" aria-live="polite">
        {periodLabel(period)}
      </h1>
      <button type="button" className={navButton} onClick={() => onChange(addPeriods(period, 1))} aria-label="Nächster Monat">
        <ChevronRight size={22} />
      </button>
    </header>
  );
}

function HeroCard({ figures }: { figures: MonthFigures }) {
  const allPaid = figures.count > 0 && figures.openCount === 0;
  return (
    <div className="glass flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6 md:p-5" data-testid="hero">
      <div className="flex min-w-0 items-center gap-4 md:gap-6">
        <ProgressRing
          ratio={figures.ratio}
          percent={progressPercent(figures)}
          done={allPaid}
          label={`${progressPercent(figures)} Prozent abgebucht`}
        />
        <div className="min-w-0">
          <div className="num text-[32px] font-semibold leading-tight tracking-[-0.03em] text-ink lg:text-[38px]" data-testid="hero-paid">
            {formatEUR(figures.paid)}
          </div>
          <div className="text-[15px] text-ink-mute">
            von <span className="num font-medium text-ink" data-testid="hero-planned">{formatEUR(figures.total)}</span> abgebucht
          </div>
          <div className="mt-3">
            {allPaid ? (
              <span className="inline-flex h-7 items-center rounded-full bg-paid-soft px-3 text-[13px] font-semibold text-paid-ink">
                Alles abgebucht
              </span>
            ) : figures.count === 0 ? (
              <span className="text-[14px] text-ink-mute">Nichts fällig</span>
            ) : (
              <span
                className="num inline-flex h-7 items-center rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent-strong"
                data-testid="hero-open"
              >
                {figures.openCount} offen · {formatEUR(shownOpen(figures))}
              </span>
            )}
          </div>
        </div>
      </div>
      <HeroDeductions figures={figures} />
    </div>
  );
}

/**
 * „Abzüge vom Netto“ = Fixkosten + Vermögensaufbau vom Netto (monthFigures.deductions). Phone: an extra
 * row under ring and amount; from iPad on it uses the free space on the right of the hero.
 */
function HeroDeductions({ figures }: { figures: MonthFigures }) {
  const explanation = deductionsExplanation(figures);
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-edge pt-3 md:ml-auto md:grid-cols-1 md:justify-items-end md:border-l md:border-t-0 md:py-1 md:pl-6 md:text-right"
      data-testid="hero-deductions"
    >
      <div className="col-start-1 row-start-1 flex items-center text-[13px] font-medium text-ink-mute">
        Abzüge vom Netto
        <InfoTip label="Erklärung: Abzüge vom Netto" title="Abzüge vom Netto" className="-my-3 -mr-3" testId="hero-deductions-info">
          <p className="num text-ink" data-testid="hero-deductions-formula">
            {explanation.formula}
          </p>
          {explanation.notFromNet && (
            <p className="num text-ink" data-testid="hero-deductions-not-from-net">
              {explanation.notFromNet}
            </p>
          )}
          <p>Alles, was diesen Monat von deinem Netto abgeht: Fixkosten und Vermögensaufbau. Ring, „abgebucht“ und „offen“ zählen nur die Fixkosten.</p>
        </InfoTip>
      </div>
      <div
        className="num col-start-2 row-start-1 text-right text-[20px] font-semibold leading-7 tracking-[-0.02em] text-ink md:col-start-1 md:row-start-2 md:text-[24px] md:leading-8 lg:text-[28px] lg:leading-9"
        data-testid="hero-deductions-value"
      >
        {formatEUR(figures.deductions)}
      </div>
      <div className="num col-span-2 col-start-1 row-start-2 text-[12px] leading-4 text-ink-mute md:col-span-1 md:row-start-3 lg:text-[13px]" data-testid="hero-deductions-breakdown">
        {explanation.breakdown}
      </div>
    </div>
  );
}

/**
 * The four tiles under the hero share one structure: label on top, the large
 * number directly below, at most one short subline. Content is top-aligned; the
 * grid stretches tiles of a row to the same height, so the numbers share a baseline.
 */
const tileClass = 'glass flex min-w-0 flex-col items-stretch justify-start rounded-tile p-4 text-left md:p-5';
const tileLabel = 'block truncate text-[12px] font-medium leading-4 text-ink-mute lg:text-[13px]';
const tileValue = 'num mt-1 block truncate text-[17px] font-semibold leading-6 lg:text-[20px] lg:leading-7';
const tileSub = 'mt-1 block text-[11px] leading-4 tracking-[-0.01em] text-ink-mute lg:text-[12px] lg:tracking-normal';

/** An amount inside a subline: never wraps in the middle. */
function Amount({ children, strong, negative }: { children: React.ReactNode; strong?: boolean; negative?: boolean }) {
  // negative: red text token, the minus sign (U+2212) is part of the amount, so never colour only
  return <span className={`num whitespace-nowrap ${strong ? 'font-semibold' : 'font-medium'} ${negative ? 'text-over' : ''}`}>{children}</span>;
}

/** Netto-Gehalt of the month; opens the month close. */
const SalaryTile = forwardRef<HTMLButtonElement, { period: Period; salary: number | null; onOpen: () => void }>(
  function SalaryTile({ period, salary, onOpen }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        className={`${tileClass} focus-ring hover:bg-zinc-50/40`}
        data-testid="salary-tile"
      >
        <span className={tileLabel}>Netto-Gehalt</span>
        <span className={`${tileValue} ${salary === null ? 'text-ink-faint' : 'text-ink'}`} data-testid="salary-value">
          {salary === null ? '–' : formatEUR(salary)}
        </span>
        <span className={tileSub}>
          {salary === null ? <span className="font-semibold text-accent-ink">Gehalt eintragen</span> : periodLabel(period)}
        </span>
      </button>
    );
  },
);

function KpiTile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className={tileClass}>
      <span className={tileLabel}>{label}</span>
      <span className={`${tileValue} text-ink`} data-testid="kpi-value">{value}</span>
      {children && <span className={tileSub}>{children}</span>}
    </div>
  );
}

interface FreeTileProps {
  period: Period;
  /** net salary − fixed costs of the month */
  calculated: number | null;
  /** net salary − fixed costs spread over the year */
  average: number | null;
  /** tooltip of „im Ø-Monat“ (null without salary) */
  explanation: AverageMonthExplanation | null;
  onOpen: () => void;
}

/** Centre of the ⓘ slot behind the „im Ø-Monat“ amount, relative to the tile (the info button sits on top of it). */
function useSlotPosition(wrapper: React.RefObject<HTMLDivElement>, slot: React.RefObject<HTMLSpanElement>, active: boolean) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!active) return setPos(null);
    const update = () => {
      if (!wrapper.current || !slot.current) return;
      const w = wrapper.current.getBoundingClientRect();
      const s = slot.current.getBoundingClientRect();
      // 44 px hit area centred on the icon, kept inside the tile
      const left = Math.min(Math.max(s.left + s.width / 2 - w.left - 22, 0), Math.max(w.width - 44, 0));
      setPos({ left, top: s.top + s.height / 2 - w.top - 22 });
    };
    update();
    const observer = new ResizeObserver(update);
    if (wrapper.current) observer.observe(wrapper.current);
    void document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, [active, wrapper, slot]);
  return pos;
}

/** "Frei verfügbar": net salary − Abzüge vom Netto, one subline „im Ø-Monat“ with ⓘ. Opens the month close. */
const FreeTile = forwardRef<HTMLButtonElement, FreeTileProps>(function FreeTile(
  { period, calculated, average, explanation, onOpen },
  ref,
) {
  const value = calculated;
  const wrapper = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const showInfo = average !== null && explanation !== null;
  const info = useSlotPosition(wrapper, slot, showInfo);
  return (
    // the ⓘ is its own button next to (not inside) the tile button
    <div ref={wrapper} className="relative flex min-w-0">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={`Frei verfügbar – Monatsabschluss ${periodLabel(period)} öffnen`}
        className={`${tileClass} focus-ring w-full hover:bg-zinc-50/40`}
        data-testid="free-tile"
      >
        <span className={tileLabel}>Frei verfügbar</span>
        <span
          className={`${tileValue} ${value === null ? 'text-ink-faint' : value < 0 ? 'text-over' : 'text-ink'}`}
          data-testid="free-value"
          data-negative={value !== null && value < 0}
        >
          {value === null ? '–' : formatEUR(value)}
        </span>
        {calculated === null && (
          <span className={tileSub} data-testid="free-sub">
            {/* „Netto-Gehalt“ never splits at its hyphen: the line breaks before it */}
            rechnet mit dem <span className="whitespace-nowrap font-semibold text-accent-ink">Netto-Gehalt</span>
          </span>
        )}
        {average !== null && (
          <span className={tileSub} data-testid="free-average">
            im Ø-Monat{' '}
            {/* amount and ⓘ stay together: a narrow tile breaks before the amount, never before the icon */}
            <span className="whitespace-nowrap">
              <Amount negative={average < 0}>{formatAvg(average)}</Amount>
              {/* room for the ⓘ: the line keeps its layout, the icon button lies on top */}
              {showInfo && <span ref={slot} className="ml-px inline-block h-3 w-[15px] align-middle" aria-hidden="true" />}
            </span>
          </span>
        )}
      </button>
      {showInfo && (
        <InfoTip
          label="Erklärung: im Ø-Monat"
          title="Im Ø-Monat"
          className="absolute z-10"
          style={{ left: info?.left ?? 0, top: info?.top ?? 0, visibility: info ? 'visible' : 'hidden' }}
          testId="free-average-info"
        >
          <p className="num text-ink" data-testid="free-average-formula">
            {explanation.formula}
          </p>
          <p>So viel bleibt dir im Schnitt pro Monat, wenn du Jahres- und Quartalszahlungen anteilig zurücklegst und deinen Vermögensaufbau abziehst.</p>
        </InfoTip>
      )}
    </div>
  );
});

/** Vermögensaufbau gesamt; below the Sparquote (vom Netto) and, on its own line when there is any, the part not from the net salary. */
function WealthTile({ wealth, notFromNet, rate }: { wealth: number; notFromNet: number; rate: number | null }) {
  const other = Math.round(notFromNet * 100) > 0;
  return (
    <div className={tileClass} data-testid="wealth-tile">
      <span className={tileLabel}>Vermögensaufbau</span>
      <span className={`${tileValue} text-ink`} data-testid="wealth-value">
        {formatEUR(wealth)}
      </span>
      {/* two fixed lines when part of it is not from the net salary; neither breaks inside */}
      {(rate !== null || other) && (
        <span className={tileSub} data-testid="wealth-sub">
          {rate !== null && (
            <span className="block whitespace-nowrap" data-testid="wealth-rate">
              Sparquote <Amount>{formatPercent(rate)}</Amount>
            </span>
          )}
          {other && (
            <span className="block whitespace-nowrap" data-testid="wealth-not-from-net">
              <Amount>{formatEUR(notFromNet)}</Amount> nicht vom Netto
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function GroupCard({
  group,
  tally,
  collapsed,
  onToggleCollapsed,
  spread,
  onToggle,
  onOpen,
  onToggleOneOff,
  onOpenOneOff,
}: {
  group: CategoryGroup;
  /** Summe and „x/y bezahlt“ of the category (calc.monthFigures) */
  tally: Tally;
  /** positions and one-offs hidden; name, sum and progress stay in the header */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** monthly equivalent of the whole category, incl. positions not due this month */
  spread: number;
  onToggle: (item: DueItem) => void;
  onOpen: (item: DueItem) => void;
  onToggleOneOff: (oneOff: OneOff) => void;
  onOpenOneOff: (oneOff: OneOff) => void;
}) {
  const savings = group.category.kind === 'savings';
  const showSpread = !sameMoney(spread, tally.total);
  const allPaid = tally.count > 0 && tally.openCount === 0;
  const status = `${savings ? 'Vermögensaufbau · ' : ''}${allPaid ? '✓ bezahlt' : `${tally.paidCount}/${tally.count} bezahlt`}`;
  return (
    <section className="glass overflow-hidden" aria-label={group.category.name} data-testid="category-group" data-collapsed={collapsed}>
      <Disclosure
        expanded={!collapsed}
        onToggle={onToggleCollapsed}
        headingLevel={2}
        buttonLabel={`${group.category.name}, fällig ${formatEUR(tally.total)}${showSpread ? `, umgelegt ${formatAvg(spread)} pro Monat` : ''}, ${status}`}
        buttonClassName={`px-4 py-3 hover:bg-zinc-50/40 md:px-5 ${collapsed ? '' : 'border-b border-line'}`}
        buttonTestId="group-toggle"
        header={
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(group.category.color) }} aria-hidden="true" />
            {/* fixed grid: left name / status, right sum / Ø; every cell one line, long names end in an ellipsis */}
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
              <span className="truncate text-[15px] font-semibold leading-6 text-ink" data-testid="group-name">
                {group.category.name}
              </span>
              <span className="num whitespace-nowrap text-right text-[15px] font-semibold leading-6 text-ink" data-testid="group-sum">
                {formatEUR(tally.total)}
              </span>
              <span
                className={`truncate text-[12px] leading-4 ${allPaid ? 'font-semibold text-paid-ink' : 'text-ink-mute'}`}
                data-testid="group-progress"
              >
                {status}
              </span>
              {showSpread ? (
                <span className="num whitespace-nowrap text-right text-[12px] leading-4 text-ink-mute" data-testid="group-spread">
                  Ø {formatAvg(spread)}
                </span>
              ) : (
                <span aria-hidden="true" />
              )}
            </span>
          </>
        }
        contentTestId="group-content"
      >
        <ul className="divide-y divide-line py-1 pl-1">
          {group.items.map((item) => (
            <PositionRow
              key={item.position.id}
              item={item}
              onToggle={() => onToggle(item)}
              onOpen={() => onOpen(item)}
              onToggleOneOff={onToggleOneOff}
              onOpenOneOff={onOpenOneOff}
            />
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

/** "Offen aus Oktober": unticked items of earlier months; collapsed by default. */
function OpenFromPrevious({
  groups,
  onPay,
  onSkip,
}: {
  groups: OpenGroup[];
  onPay: (item: DueItem) => void;
  onSkip: (item: DueItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = countOpen(groups);
  const savings = openSavings(groups);
  const savingsText = `+ ${savings.count} Vermögensaufbau · ${formatEUR(savings.planned)}`;
  const title = groups.length === 1 ? `Offen aus ${monthName(groups[0]!.period)}` : 'Offen aus Vormonaten';
  const contentId = useId();
  return (
    <section className="glass mb-3 overflow-hidden" aria-label={title} data-testid="open-previous">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((e) => !e)}
        className="focus-ring flex min-h-[56px] w-full items-center gap-3 px-4 text-left"
      >
        <AlertIcon size={18} className="shrink-0 text-over" />
        <span className="flex-1 text-[15px] font-semibold text-ink">{title}</span>
        <span className="num text-[14px] text-ink-mute" data-testid="open-previous-sum">
          {count > 0 ? `${count} · ${formatEUR(sumOpen(groups))}` : savingsText}
        </span>
        <ChevronRight size={18} className={`text-ink-mute transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div id={contentId} className="border-t border-line">
          {groups.map((g) => (
            <div key={g.period}>
              {groups.length > 1 && <div className="section-title px-4 pb-1 pt-3">{periodLabel(g.period)}</div>}
              <ul className="divide-y divide-line">
                {g.items.map((item) => (
                  <OpenItemRow key={`${item.period}-${item.position.id}`} item={item} onPay={onPay} onSkip={onSkip} />
                ))}
              </ul>
            </div>
          ))}
          {/* open Vermögensaufbau of these months: own line, then its rows – not part of the banner figure */}
          {savings.count > 0 && (
            <div className="border-t border-line">
              <p className="num px-4 pb-1 pt-3 text-[13px] text-ink-mute" data-testid="open-previous-savings">
                {savingsText}
              </p>
              <ul className="divide-y divide-line">
                {groups.flatMap((g) => g.savingsItems).map((item) => (
                  <OpenItemRow key={`${item.period}-${item.position.id}`} item={item} onPay={onPay} onSkip={onSkip} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** One open item of an earlier month with „Bezahlt“ / „Entfallen“. */
function OpenItemRow({ item, onPay, onSkip }: { item: DueItem; onPay: (item: DueItem) => void; onSkip: (item: DueItem) => void }) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
      data-testid="open-item"
      data-position={item.position.id}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{item.position.name}</span>
        <span className="num text-[13px] text-ink-mute">
          {formatEUR(item.planned)} · {periodLabel(item.period)}
        </span>
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => onPay(item)}
          className="focus-ring h-11 rounded-xl bg-accent-soft px-3 text-[14px] font-semibold text-accent-strong hover:bg-accent-soft-hover"
        >
          Bezahlt
        </button>
        <button
          type="button"
          onClick={() => onSkip(item)}
          className="focus-ring h-11 rounded-xl px-3 text-[14px] font-medium text-ink-soft hover:bg-zinc-100"
        >
          Entfallen
        </button>
      </span>
    </li>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="glass px-4 py-5 text-[14px] text-ink-mute">{children}</div>;
}
