import { useMemo, useState } from 'react';
import { BellIcon, ChevronLeft, ChevronRight, ClockIcon } from '../components/Icons';
import { PaymentSheet } from '../components/PaymentSheet';
import { PositionRow } from '../components/PositionRow';
import { ProgressRing } from '../components/ProgressRing';
import { Badge, scheduleLabel } from '../components/Chips';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import { markPaid, removePayment, restorePayment, updatePayment } from '../db/repo';
import {
  dueItems,
  freeCashflow,
  groupByCategory,
  periodProgress,
  plannedForPeriod,
  remindersForPeriod,
  reserveNeeded,
  trueMonthlyBurden,
  upcomingDue,
  type CategoryGroup,
  type DueItem,
} from '../lib/calc';
import { formatEUR } from '../lib/format';
import { addPeriods, monthName, periodLabel } from '../lib/period';
import type { Dataset, Period } from '../lib/types';

interface Props {
  ds: Dataset;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function MonthScreen({ ds, period, onPeriodChange }: Props) {
  const toast = useToast();
  const [openPositionId, setOpenPositionId] = useState<string | null>(null);

  const items = useMemo(() => dueItems(ds, period), [ds, period]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const progress = useMemo(() => periodProgress(ds, period), [ds, period]);
  const upcoming = useMemo(() => upcomingDue(ds, period, 2), [ds, period]);
  const reminders = remindersForPeriod(ds, period);
  const openItem = items.find((i) => i.position.id === openPositionId) ?? null;

  async function unpay(item: DueItem) {
    if (!item.payment) return;
    const removed = await removePayment(db, item.payment.id);
    if (!removed) return;
    toast({
      message: `Haken bei „${item.position.name}" entfernt`,
      actionLabel: 'Rückgängig',
      onAction: () => void restorePayment(db, removed),
    });
  }

  async function toggle(item: DueItem) {
    if (item.payment) await unpay(item);
    else await markPaid(db, item.position.id, period, item.planned);
  }

  async function save(item: DueItem, actualAmount: number, note: string) {
    const payment = item.payment ?? (await markPaid(db, item.position.id, period, item.planned));
    await updatePayment(db, payment.id, { actualAmount, note });
    setOpenPositionId(null);
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8">
      <MonthHeader period={period} onChange={onPeriodChange} />

      <div className="grid gap-3 lg:gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <HeroCard progress={progress} />
        <div className="grid grid-cols-3 gap-2 lg:gap-3">
          <KpiTile label="Fällig diesen Monat" value={formatEUR(plannedForPeriod(ds, period))} />
          <KpiTile
            label="Echte Monats­belastung"
            value={formatEUR(trueMonthlyBurden(ds, period))}
            hint={`inkl. ${formatEUR(reserveNeeded(ds, period))} Rücklage`}
          />
          <FreeTile value={freeCashflow(ds, period)} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <section aria-label="Fällige Positionen" className="flex flex-col gap-4">
          {groups.length === 0 ? (
            <EmptyCard>
              Für {periodLabel(period)} ist nichts fällig. Positionen kommen in Phase 2 dazu.
            </EmptyCard>
          ) : (
            groups.map((group) => (
              <GroupCard
                key={group.category.id}
                group={group}
                onToggle={toggle}
                onOpen={(item) => setOpenPositionId(item.position.id)}
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
                          {scheduleLabel(item.position)}
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

      {openItem && (
        <PaymentSheet
          key={openItem.position.id}
          item={openItem}
          onClose={() => setOpenPositionId(null)}
          onSave={(amount, note) => void save(openItem, amount, note)}
          onUnpay={() => {
            setOpenPositionId(null);
            void unpay(openItem);
          }}
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

function FreeTile({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="card flex min-w-0 flex-col justify-between gap-2 p-3 lg:p-4">
        <div className="text-[12px] font-medium leading-tight text-ink-mute lg:text-[13px]">Frei verfügbar</div>
        <div>
          <div className="text-[15px] font-semibold text-ink-faint sm:text-[17px] lg:text-[20px]">–</div>
          <div className="mt-0.5 text-[11px] leading-tight text-ink-mute lg:text-[12px]">Einkommen fehlt</div>
        </div>
      </div>
    );
  }
  return <KpiTile label="Frei verfügbar" value={formatEUR(value)} />;
}

function GroupCard({
  group,
  onToggle,
  onOpen,
}: {
  group: CategoryGroup;
  onToggle: (item: DueItem) => void;
  onOpen: (item: DueItem) => void;
}) {
  const savings = group.category.kind === 'savings';
  return (
    <section className="card overflow-hidden" aria-label={group.category.name} data-testid="category-group">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.category.color }} aria-hidden="true" />
        <h2 className="flex-1 text-[15px] font-semibold text-ink">{group.category.name}</h2>
        {savings && <Badge>Sparen · keine Fixkosten</Badge>}
        <span className="num text-[14px] font-medium text-ink-mute">{formatEUR(group.planned)}</span>
      </header>
      <ul className="divide-y divide-line py-1 pl-1">
        {group.items.map((item) => (
          <PositionRow key={item.position.id} item={item} onToggle={() => onToggle(item)} onOpen={() => onOpen(item)} />
        ))}
      </ul>
    </section>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-zinc-300 px-4 py-5 text-[14px] text-ink-mute">{children}</div>;
}
