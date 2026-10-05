import { forwardRef, useId, useMemo, useRef, useState } from 'react';
import { BellIcon, ChevronLeft, ChevronRight, ClockIcon } from '../components/Icons';
import { MonthCloseSheet } from '../components/MonthCloseSheet';
import { OneOffSheet } from '../components/OneOffSheet';
import { PaymentSheet } from '../components/PaymentSheet';
import { PositionRow } from '../components/PositionRow';
import { ProgressRing } from '../components/ProgressRing';
import { Badge, scheduleLabel } from '../components/Chips';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import {
  deleteOneOff,
  markPaid,
  markSkipped,
  removePayment,
  restoreOneOff,
  restorePayment,
  saveMonthClose,
  toggleOneOffPaid,
  updatePayment,
} from '../db/repo';
import {
  dueItems,
  freeCalculated,
  freeGap,
  groupByCategory,
  monthCloseFor,
  openFromPrevious,
  sumOpen,
  periodProgress,
  plannedForPeriod,
  remindersForPeriod,
  reserveNeeded,
  savingsRate,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
  upcomingDue,
  type CategoryGroup,
  type DueItem,
  type OpenGroup,
} from '../lib/calc';
import { formatDelta, formatEUR, formatPercent } from '../lib/format';
import { addPeriods, monthName, periodLabel } from '../lib/period';
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
  const closeTile = useRef<HTMLButtonElement>(null);

  const items = useMemo(() => dueItems(ds, period), [ds, period]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const progress = useMemo(() => periodProgress(ds, period), [ds, period]);
  const upcoming = useMemo(() => upcomingDue(ds, period, 2), [ds, period]);
  const reminders = remindersForPeriod(ds, period);
  const openGroups = useMemo(() => openFromPrevious(ds, period), [ds, period]);
  const openItem =
    openKey === null
      ? null
      : ((openKey.period === period ? items : openGroups.flatMap((g) => g.items)).find(
          (i) => i.position.id === openKey.positionId && i.period === openKey.period,
        ) ?? null);
  const oneOffPosition = oneOffSheet ? ds.positions.find((p) => p.id === oneOffSheet.positionId) : undefined;

  async function unpay(item: DueItem) {
    if (!item.payment) return;
    const removed = await removePayment(db, item.payment.id);
    if (!removed) return;
    toast({
      message:
        removed.status === 'skipped'
          ? `„${item.position.name}" ist wieder offen`
          : `Haken bei „${item.position.name}" entfernt`,
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
      message: `„${item.position.name}" (${monthName(item.period)}) entfällt`,
      actionLabel: 'Rückgängig',
      onAction: () => void removePayment(db, skipped.id),
    });
  }

  async function removeOneOff(oneOff: OneOff) {
    setOneOffSheet(null);
    const removed = await deleteOneOff(db, oneOff.id);
    if (!removed) return;
    toast({
      message: `„${oneOff.label}" gelöscht`,
      actionLabel: 'Rückgängig',
      onAction: () => void restoreOneOff(db, removed),
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8">
      <MonthHeader period={period} onChange={onPeriodChange} />

      {openGroups.length > 0 && (
        <OpenFromPrevious
          groups={openGroups}
          onPay={(item) => setOpenKey({ positionId: item.position.id, period: item.period })}
          onSkip={(item) => void skip(item)}
        />
      )}

      <div className="grid gap-3 lg:gap-4">
        <HeroCard progress={progress} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:gap-3">
          <KpiTile label="Fällig diesen Monat" value={formatEUR(plannedForPeriod(ds, period))} />
          <KpiTile
            label="Ø pro Monat"
            value={formatEUR(trueMonthlyBurden(ds, period))}
            hint={`Jahreskosten verteilt · inkl. ${formatEUR(reserveNeeded(ds, period))} Rücklage`}
          />
          <FreeTile
            ref={closeTile}
            period={period}
            freeActual={monthCloseFor(ds, period)?.freeActual ?? null}
            calculated={freeCalculated(ds, period)}
            difference={freeGap(ds, period)}
            rate={savingsRate(ds, period)}
            onOpen={() => setCloseOpen(true)}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <section aria-label="Fällige Positionen" className="flex flex-col gap-4">
          {groups.length === 0 ? (
            <EmptyCard>
              Für {periodLabel(period)} ist nichts fällig. Neue Positionen legst du unter „Positionen“ an.
            </EmptyCard>
          ) : (
            groups.map((group) => (
              <GroupCard
                key={group.category.id}
                group={group}
                spread={sumMonthlyEquivalent(ds, period, { categoryId: group.category.id })}
                onToggle={toggle}
                onOpen={(item) => setOpenKey({ positionId: item.position.id, period: item.period })}
                onToggleOneOff={(o) => void toggleOneOffPaid(db, o.id)}
                onOpenOneOff={(o) => setOneOffSheet({ positionId: o.positionId!, oneOff: o })}
              />
            ))
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="reminders-title">
            <h2 id="reminders-title" className="section-title mb-2 flex items-center gap-1.5 px-1">
              <BellIcon size={15} /> Erinnerungen diesen Monat
            </h2>
            {reminders.length === 0 ? (
              <EmptyCard>Keine Erinnerungen für {monthName(period)}.</EmptyCard>
            ) : (
              <ul className="card divide-y divide-line">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3.5 text-[15px] text-ink">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="section-title mb-2 flex items-center gap-1.5 px-1">
              <ClockIcon size={15} /> Kommt bald
            </h2>
            {upcoming.length === 0 ? (
              <EmptyCard>In den nächsten 2 Monaten keine Sonderzahlungen.</EmptyCard>
            ) : (
              <ul className="card divide-y divide-line">
                {upcoming.map((item) => (
                  <li key={`${item.period}-${item.position.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{item.position.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone="warn">{monthName(item.period)}</Badge>
                        <span className="text-[13px] leading-[22px] text-ink-mute">
                          {item.plan && scheduleLabel(item.plan, item.period)}
                        </span>
                      </span>
                    </span>
                    <span className="num shrink-0 text-[15px] font-semibold text-ink">{formatEUR(item.planned)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {closeOpen && (
        <MonthCloseSheet
          ds={ds}
          period={period}
          returnFocusTo={closeTile.current}
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
          onAddOneOff={
            openItem.period === period
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

function HeroCard({ progress }: { progress: ReturnType<typeof periodProgress> }) {
  const allPaid = progress.totalCount > 0 && progress.openCount === 0;
  return (
    <div className="card flex items-center gap-5 p-5" data-testid="hero">
      <ProgressRing
        ratio={progress.ratio}
        label={`${Math.floor(progress.ratio * 100)} Prozent abgebucht`}
      />
      <div className="min-w-0">
        <div className="num text-[28px] font-semibold leading-tight tracking-tight text-ink" data-testid="hero-paid">
          {formatEUR(progress.paidActual)}
        </div>
        <div className="text-[15px] text-ink-soft">
          von <span className="num font-medium text-ink" data-testid="hero-planned">{formatEUR(progress.planned)}</span> abgebucht
        </div>
        <div className="mt-2">
          {allPaid ? (
            <span className="text-[14px] font-medium text-paid">Alles abgebucht</span>
          ) : progress.totalCount === 0 ? (
            <span className="text-[14px] text-ink-mute">Nichts fällig</span>
          ) : (
            <span className="text-[14px] font-medium text-ink-soft" data-testid="hero-open">
              {progress.openCount} offen · <span className="num">{formatEUR(progress.openPlanned)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex min-w-0 flex-col justify-between gap-2 p-3 lg:p-4">
      <div className="text-[12px] font-medium leading-tight text-ink-mute lg:text-[13px]">{label}</div>
      <div>
        <div className="num truncate text-[15px] font-semibold text-ink sm:text-[17px] lg:text-[20px]" data-testid="kpi-value">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-tight text-ink-mute lg:text-[12px]">{hint}</div>}
      </div>
    </div>
  );
}

interface FreeTileProps {
  period: Period;
  freeActual: number | null;
  calculated: number | null;
  difference: number | null;
  rate: number | null;
  onOpen: () => void;
}

/** "Frei verfügbar": entered value large, calculated value and gap below. Opens the month close. */
const FreeTile = forwardRef<HTMLButtonElement, FreeTileProps>(function FreeTile(
  { period, freeActual, calculated, difference, rate, onOpen },
  ref,
) {
  const value = freeActual ?? calculated;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={`Frei verfügbar – Monatsabschluss ${periodLabel(period)} öffnen`}
      className="card focus-ring col-span-2 flex min-w-0 flex-col justify-between gap-2 p-3 text-left hover:border-zinc-300 sm:col-span-1 lg:p-4"
      data-testid="free-tile"
    >
      <span className="text-[12px] font-medium leading-tight text-ink-mute lg:text-[13px]">Frei verfügbar</span>
      <span className="block">
        <span
          className={`num block text-[15px] font-semibold sm:text-[17px] lg:text-[20px] ${value === null ? 'text-ink-faint' : 'text-ink'}`}
          data-testid="free-value"
        >
          {value === null ? '–' : formatEUR(value)}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-mute lg:text-[12px]" data-testid="free-sub">
          {calculated === null ? (
            <span className="font-semibold text-accent">Gehalt eintragen</span>
          ) : freeActual === null ? (
            <>rechnerisch · <span className="font-medium text-accent">tatsächlich eintragen</span></>
          ) : (
            <>
              rechnerisch <span className="num whitespace-nowrap">{formatEUR(calculated)}</span> · Differenz{' '}
              <span className={`num whitespace-nowrap font-semibold ${difference !== null && difference < 0 ? 'text-over' : ''}`}>
                {formatDelta(difference ?? 0)}
              </span>
            </>
          )}
        </span>
        {rate !== null && (
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-mute lg:text-[12px]" data-testid="savings-rate">
            Sparquote <span className="num font-medium text-ink-soft">{formatPercent(rate)}</span>
          </span>
        )}
      </span>
    </button>
  );
});

function GroupCard({
  group,
  spread,
  onToggle,
  onOpen,
  onToggleOneOff,
  onOpenOneOff,
}: {
  group: CategoryGroup;
  /** monthly equivalent of the whole category, incl. positions not due this month */
  spread: number;
  onToggle: (item: DueItem) => void;
  onOpen: (item: DueItem) => void;
  onToggleOneOff: (oneOff: OneOff) => void;
  onOpenOneOff: (oneOff: OneOff) => void;
}) {
  const savings = group.category.kind === 'savings';
  const showSpread = Math.round(spread * 100) !== Math.round(group.planned * 100);
  return (
    <section className="card overflow-hidden" aria-label={group.category.name} data-testid="category-group">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.category.color }} aria-hidden="true" />
        <h2 className="flex-1 text-[15px] font-semibold text-ink">{group.category.name}</h2>
        {savings && <Badge>Sparen · keine Fixkosten</Badge>}
        <span
          className="flex flex-col items-end"
          aria-label={`fällig ${formatEUR(group.planned)}${showSpread ? `, umgelegt ${formatEUR(spread)} pro Monat` : ''}`}
        >
          <span className="num text-[14px] font-medium text-ink-mute">{formatEUR(group.planned)}</span>
          {showSpread && (
            <span className="num whitespace-nowrap text-[12px] text-ink-faint" data-testid="group-spread">
              Ø {formatEUR(spread)} / Monat
            </span>
          )}
        </span>
      </header>
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
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const title = groups.length === 1 ? `Offen aus ${monthName(groups[0]!.period)}` : 'Offen aus Vormonaten';
  const contentId = useId();
  return (
    <section className="card mb-3 overflow-hidden border-warn/30" aria-label={title} data-testid="open-previous">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((e) => !e)}
        className="focus-ring flex min-h-[56px] w-full items-center gap-3 px-4 text-left"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
        <span className="flex-1 text-[15px] font-semibold text-ink">{title}</span>
        <span className="num text-[14px] text-ink-mute">
          {count} · {formatEUR(sumOpen(groups))}
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
                  <li
                    key={item.position.id}
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
                        className="focus-ring h-11 rounded-xl bg-accent-soft px-3 text-[14px] font-semibold text-accent-strong hover:bg-[#E2E2F8]"
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
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-zinc-300 px-4 py-5 text-[14px] text-ink-mute">{children}</div>;
}
