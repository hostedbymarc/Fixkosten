import { archivedPeriod, currentPlan, monthlyEquivalent, monthlyEquivalentOfPlan, paymentDelta, paymentsOf } from '../lib/calc';
import { formatDate, formatEUR } from '../lib/format';
import { periodLabel } from '../lib/period';
import type { ChangeLog, Dataset, Period, PlanEntry, Position } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { Badge, DeltaChip, planDescription } from './Chips';
import { PrimaryButton, SecondaryButton } from './form';

interface Props {
  ds: Dataset;
  position: Position;
  today: Period;
  onClose: () => void;
  onEdit: () => void;
  onAddOneOff: () => void;
  onArchive: () => void;
  returnFocusTo?: HTMLElement | null;
}

function planText(plan: PlanEntry): string {
  return `${formatEUR(plan.amount)} · ${planDescription(plan)}`;
}

function changeText(entry: ChangeLog): { title: string; detail?: string } {
  const from = entry.from as PlanEntry | undefined;
  const to = entry.to as PlanEntry | undefined;
  switch (entry.type) {
    case 'created':
      return { title: 'Angelegt', detail: to ? `${planText(to)} ab ${periodLabel(to.validFrom)}` : undefined };
    case 'amount':
      return {
        title: `Geändert ab ${periodLabel(entry.validFrom!)}`,
        detail: from && to ? `${planText(from)} → ${planText(to)}` : undefined,
      };
    case 'corrected':
      return { title: 'Tippfehler korrigiert', detail: from && to ? `${planText(from)} → ${planText(to)}` : undefined };
    case 'archived':
      return { title: 'Archiviert' };
    case 'restored':
      return { title: `Wiederhergestellt ab ${periodLabel(entry.validFrom!)}` };
    case 'edited':
      return { title: 'Name/Kategorie/Notiz geändert' };
  }
}

/** Current plan, monthly equivalent, history timeline and the last 12 payments. */
export function PositionDetailSheet({ ds, position, today, onClose, onEdit, onAddOneOff, onArchive, returnFocusTo }: Props) {
  const plan = currentPlan(position, today)!;
  const category = ds.categories.find((c) => c.id === position.categoryId);
  const equivalent = monthlyEquivalent(position, today) || monthlyEquivalentOfPlan(plan);
  const payments = paymentsOf(ds, position.id, 12);
  const log = ds.changeLog.filter((c) => c.positionId === position.id).sort((a, b) => b.at.localeCompare(a.at));
  const versions = [...position.history].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const archived = archivedPeriod(position);

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
            <div className="text-[12px] font-medium text-ink-mute">Aktueller Plan</div>
            <div className="num mt-1 text-[20px] font-semibold text-ink" data-testid="detail-amount">
              {formatEUR(plan.amount)}
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">{planDescription(plan)}</div>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-[12px] font-medium text-ink-mute">Ø pro Monat</div>
            <div className="num mt-1 text-[20px] font-semibold text-ink">{formatEUR(equivalent)}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">gilt seit {periodLabel(plan.validFrom)}</div>
          </div>
        </section>
        {position.note && <p className="text-[14px] text-ink-soft">{position.note}</p>}

        <section aria-labelledby="detail-history">
          <h3 id="detail-history" className="section-title mb-2">
            Verlauf
          </h3>
          <ol className="flex flex-col gap-0 border-l-2 border-line pl-4" data-testid="detail-timeline">
            {versions.map((v) => (
              <li key={`v-${v.validFrom}`} className="relative py-1.5">
                <span className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
                <div className="text-[14px] font-medium text-ink">ab {periodLabel(v.validFrom)}</div>
                <div className="num text-[13px] text-ink-mute">{planText(v)}</div>
              </li>
            ))}
            {log.map((entry) => {
              const text = changeText(entry);
              return (
                <li key={entry.id} className="relative py-1.5">
                  <span className="absolute -left-[20px] top-3 h-2 w-2 rounded-full bg-zinc-300" aria-hidden="true" />
                  <div className="text-[13px] text-ink-soft">
                    {formatDate(entry.at)} · {text.title}
                  </div>
                  {text.detail && <div className="num text-[12px] text-ink-mute">{text.detail}</div>}
                </li>
              );
            })}
          </ol>
        </section>

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
          <PrimaryButton type="button" onClick={onEdit}>
            Bearbeiten
          </PrimaryButton>
          <SecondaryButton onClick={onAddOneOff}>Einmalbetrag hinzufügen</SecondaryButton>
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
