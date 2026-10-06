import {
  annualCostOfPlan,
  archivedPeriod,
  currentPlan,
  effectiveDate,
  entryKey,
  monthlyEquivalent,
  monthlyEquivalentOfPlan,
  nextPlannedChange,
  paymentDelta,
  paymentsOf,
  planHistory,
} from '../lib/calc';
import { formatDelta, formatEUR } from '../lib/format';
import { periodLabel } from '../lib/period';
import type { Dataset, Period, PlanEntry, Position } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { Badge, DeltaChip, formatIsoDate, planDescription } from './Chips';
import { PencilIcon, TrashIcon } from './Icons';
import { PrimaryButton, SecondaryButton } from './form';

interface Props {
  ds: Dataset;
  position: Position;
  today: Period;
  onClose: () => void;
  onEdit: () => void;
  onChangeAmount: () => void;
  onEditEntry: (entry: PlanEntry) => void;
  onDeleteEntry: (entry: PlanEntry) => void;
  onAddOneOff: () => void;
  onArchive: () => void;
  returnFocusTo?: HTMLElement | null;
}

function entryDate(entry: PlanEntry, first: boolean): string {
  return first ? `Beginn · ${periodLabel(entry.validFrom)}` : `ab ${formatIsoDate(effectiveDate(entry))}`;
}

/** Current plan, monthly equivalent, the history of amount changes and the last 12 payments. */
export function PositionDetailSheet({
  ds,
  position,
  today,
  onClose,
  onEdit,
  onChangeAmount,
  onEditEntry,
  onDeleteEntry,
  onAddOneOff,
  onArchive,
  returnFocusTo,
}: Props) {
  const plan = currentPlan(position, today)!;
  const once = plan.frequency === 'once';
  const category = ds.categories.find((c) => c.id === position.categoryId);
  const equivalent = monthlyEquivalent(position, today) || monthlyEquivalentOfPlan(plan);
  const payments = paymentsOf(ds, position.id, 12);
  const history = planHistory(position);
  const archived = archivedPeriod(position);
  const next = nextPlannedChange(position, today);

  return (
    <BottomSheet
      title={position.name}
      subtitle={
        <>
          {category?.name}
          {archived && <> · archiviert seit {periodLabel(archived)}</>}
        </>
      }
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <div className="flex flex-col gap-5" data-testid="position-detail">
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-[12px] font-medium text-ink-mute">{once ? 'Betrag' : 'Aktueller Plan'}</div>
            <div className="num mt-1 text-[20px] font-semibold text-ink" data-testid="detail-amount">
              {formatEUR(plan.amount)}
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">{once ? 'Einmalig' : planDescription(plan)}</div>
          </div>
          {once ? (
            <div className="rounded-2xl bg-zinc-50 p-3">
              <div className="text-[12px] font-medium text-ink-mute">Fällig am</div>
              <div className="num mt-1 text-[20px] font-semibold text-ink">{plan.dueDate ? formatIsoDate(plan.dueDate) : '–'}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">zählt nicht zu den Fixkosten</div>
            </div>
          ) : (
            <div className="rounded-2xl bg-zinc-50 p-3">
              <div className="text-[12px] font-medium text-ink-mute">Ø pro Monat</div>
              <div className="num mt-1 text-[20px] font-semibold text-ink">{formatEUR(equivalent)}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">gilt seit {formatIsoDate(effectiveDate(plan))}</div>
            </div>
          )}
        </section>
        {next && (
          <p className="-mt-2" data-testid="detail-next-change">
            <Badge tone="accent">
              Ab {formatIsoDate(effectiveDate(next))}: {formatEUR(next.amount)}
            </Badge>
          </p>
        )}
        {position.note && <p className="text-[14px] text-ink-soft">{position.note}</p>}

        {!once && !archived && (
          <PrimaryButton type="button" onClick={onChangeAmount}>
            Betrag ändern
          </PrimaryButton>
        )}

        {!once && (
          <section aria-labelledby="detail-history">
            <h3 id="detail-history" className="section-title mb-2">
              Verlauf
            </h3>
            <ol className="flex flex-col border-l-2 border-line pl-4" data-testid="detail-timeline">
              {[...history].reverse().map((entry) => {
                const index = history.indexOf(entry);
                const first = index === 0;
                const prev = history[index - 1];
                const planned = entry.validFrom > today;
                const monthly = prev ? monthlyEquivalentOfPlan(entry) - monthlyEquivalentOfPlan(prev) : 0;
                const yearly = prev ? annualCostOfPlan(entry) - annualCostOfPlan(prev) : 0;
                const label = `${entryDate(entry, first)}: ${formatEUR(entry.amount)}`;
                return (
                  <li key={entryKey(entry)} className="relative flex items-start gap-1 py-1.5" data-testid="history-entry">
                    <span
                      className={`absolute -left-[21px] top-[18px] h-2.5 w-2.5 rounded-full ${planned ? 'border-2 border-accent bg-white' : 'bg-accent'}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-[14px] font-medium text-ink">
                        {entryDate(entry, first)}
                        {planned && <Badge tone="accent">geplant</Badge>}
                      </div>
                      <div className="num text-[14px] text-ink-soft">
                        {prev ? `${formatEUR(prev.amount)} → ${formatEUR(entry.amount)}` : formatEUR(entry.amount)}
                        {prev && planDescription(prev) !== planDescription(entry) && ` · ${planDescription(entry)}`}
                      </div>
                      {prev && (
                        <div className={`num text-[13px] ${yearly > 0 ? 'text-over' : yearly < 0 ? 'text-paid' : 'text-ink-mute'}`}>
                          {formatDelta(monthly)} / Monat · {formatDelta(yearly)} / Jahr
                        </div>
                      )}
                      {entry.reason && <div className="text-[13px] text-ink-mute">{entry.reason}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditEntry(entry)}
                      aria-label={`${label} – bearbeiten`}
                      className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-mute hover:bg-zinc-100 hover:text-ink"
                    >
                      <PencilIcon size={18} />
                    </button>
                    {first ? (
                      <span className="w-11 shrink-0" aria-hidden="true" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(entry)}
                        aria-label={`${label} – löschen`}
                        className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-mute hover:bg-over-soft hover:text-over"
                      >
                        <TrashIcon size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section aria-labelledby="detail-payments">
          <h3 id="detail-payments" className="section-title mb-2">
            Letzte Zahlungen
          </h3>
          {payments.length === 0 ? (
            <p className="text-[14px] text-ink-mute">Noch nichts abgehakt.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line" data-testid="detail-payments">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-[14px] text-ink">{periodLabel(p.period)}</span>
                  {p.status === 'skipped' ? (
                    <Badge>entfallen</Badge>
                  ) : (
                    <>
                      <span className="num text-[12px] text-ink-mute">Plan {formatEUR(p.plannedAmount)}</span>
                      <span className="num text-[14px] font-semibold text-ink">{formatEUR(p.actualAmount)}</span>
                      <span className="w-[64px] text-right">
                        <DeltaChip delta={paymentDelta(p)} />
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-2">
          {once ? (
            <PrimaryButton type="button" onClick={onEdit}>
              Bearbeiten
            </PrimaryButton>
          ) : (
            <SecondaryButton onClick={onEdit}>Bearbeiten</SecondaryButton>
          )}
          {!once && <SecondaryButton onClick={onAddOneOff}>Einmalbetrag hinzufügen</SecondaryButton>}
          {!archived && (
            <SecondaryButton danger onClick={onArchive}>
              Archivieren
            </SecondaryButton>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
