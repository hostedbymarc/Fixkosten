import { useRef, useState, type MouseEvent } from 'react';
import { CategoriesSheet } from '../components/CategoriesSheet';
import { planDescription } from '../components/Chips';
import { OneOffSheet } from '../components/OneOffSheet';
import { PositionDetailSheet } from '../components/PositionDetailSheet';
import { PositionFormSheet } from '../components/PositionFormSheet';
import { RowMenu } from '../components/RowMenu';
import { DragHandle, SortableList } from '../components/Sortable';
import { SwipeRow } from '../components/SwipeRow';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import { archivePosition, reorderPositions, undoArchive } from '../db/repo';
import {
  activePositions,
  currentPlan,
  monthlyEquivalentOfPlan,
  planForPeriod,
  sortedCategories,
  sumMonthlyEquivalent,
  trueMonthlyBurden,
} from '../lib/calc';
import { formatEUR } from '../lib/format';
import { periodLabel } from '../lib/period';
import { useToday } from '../lib/useToday';
import type { Dataset, Position } from '../lib/types';

type Sheet =
  | { kind: 'new' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'oneoff'; id: string }
  | { kind: 'categories' };

export function PositionsScreen({ ds }: { ds: Dataset }) {
  const today = useToday();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const categories = sortedCategories(ds);
  const active = activePositions(ds);
  const position = sheet && 'id' in sheet ? ds.positions.find((p) => p.id === sheet.id) : undefined;

  function open(next: Sheet, e?: MouseEvent<HTMLElement>) {
    if (e) trigger.current = e.currentTarget;
    setSheet(next);
  }

  async function archive(p: Position) {
    setSheet(null);
    const undo = await archivePosition(db, p.id);
    toast({
      message: `„${p.name}“ archiviert`,
      actionLabel: 'Rückgängig',
      onAction: () => void undoArchive(db, undo),
      durationMs: 5000,
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-24 lg:px-8">
      <header className="flex items-center justify-between gap-3 py-3 lg:py-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]">Positionen</h1>
          <p className="text-[13px] text-ink-mute">
            {active.length} aktiv · Ø <span className="num">{formatEUR(trueMonthlyBurden(ds, today))}</span> pro Monat
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => open({ kind: 'categories' }, e)}
          className="focus-ring h-11 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink hover:border-zinc-300"
        >
          Kategorien
        </button>
      </header>

      <div className="flex flex-col gap-4">
        {categories.map((category) => {
          const items = activePositions(ds, category.id);
          return (
            <section key={category.id} className="card overflow-hidden" aria-label={category.name} data-testid="positions-group">
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }} aria-hidden="true" />
                <h2 className="flex-1 text-[15px] font-semibold text-ink">
                  {category.name}
                  {category.kind === 'savings' && <span className="ml-2 text-[12px] font-medium text-ink-mute">Sparen</span>}
                </h2>
                <span className="num text-[13px] text-ink-mute">
                  Ø {formatEUR(sumMonthlyEquivalent(ds, today, { categoryId: category.id }))}
                </span>
              </header>
              {items.length === 0 ? (
                <p className="px-4 py-4 text-[14px] text-ink-mute">Keine aktiven Positionen.</p>
              ) : (
                <SortableList
                  items={items}
                  noun="Position"
                  getName={(p) => p.name}
                  onReorder={(ids) => void reorderPositions(db, ids)}
                  renderItem={(p, handle) => (
                    <SwipeRow actionLabel="Archivieren" onAction={() => void archive(p)}>
                      <PositionListRow
                        position={p}
                        today={today}
                        handle={<DragHandle handle={handle} />}
                        onOpen={(e) => open({ kind: 'detail', id: p.id }, e)}
                        onEdit={() => setSheet({ kind: 'edit', id: p.id })}
                        onArchive={() => void archive(p)}
                      />
                    </SwipeRow>
                  )}
                />
              )}
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={(e) => open({ kind: 'new' }, e)}
        aria-label="Position hinzufügen"
        className="focus-ring fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-strong lg:right-8"
        style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 16px)' }}
        data-testid="fab"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      {sheet?.kind === 'new' && (
        <PositionFormSheet
          ds={ds}
          today={today}
          onClose={() => setSheet(null)}
          onSaved={() => setSheet(null)}
          returnFocusTo={trigger.current}
        />
      )}
      {sheet?.kind === 'edit' && position && (
        <PositionFormSheet
          ds={ds}
          today={today}
          position={position}
          onClose={() => setSheet({ kind: 'detail', id: position.id })}
          onSaved={(id) => setSheet({ kind: 'detail', id })}
          returnFocusTo={trigger.current}
        />
      )}
      {sheet?.kind === 'detail' && position && (
        <PositionDetailSheet
          ds={ds}
          position={position}
          today={today}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ kind: 'edit', id: position.id })}
          onAddOneOff={() => setSheet({ kind: 'oneoff', id: position.id })}
          onArchive={() => void archive(position)}
          returnFocusTo={trigger.current}
        />
      )}
      {sheet?.kind === 'oneoff' && position && (
        <OneOffSheet
          position={position}
          period={today}
          onClose={() => setSheet({ kind: 'detail', id: position.id })}
          returnFocusTo={trigger.current}
        />
      )}
      {sheet?.kind === 'categories' && (
        <CategoriesSheet ds={ds} onClose={() => setSheet(null)} returnFocusTo={trigger.current} />
      )}
    </div>
  );
}

function PositionListRow({
  position,
  today,
  handle,
  onOpen,
  onEdit,
  onArchive,
}: {
  position: Position;
  today: string;
  handle: React.ReactNode;
  onOpen: (e: MouseEvent<HTMLElement>) => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const plan = currentPlan(position, today)!;
  const startsLater = planForPeriod(position, today) === null;
  return (
    <div
      className="flex items-center gap-1 pl-1 pr-2"
      data-testid="position-list-row"
      data-position={position.id}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && (e.target as HTMLElement).dataset.rowMain !== undefined) {
          e.preventDefault();
          onArchive();
        }
      }}
    >
      {handle}
      <button
        type="button"
        onClick={onOpen}
        data-row-main=""
        aria-label={`${position.name} – Details`}
        aria-keyshortcuts="Delete"
        className="focus-ring flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-1 pr-2 text-left hover:bg-zinc-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium text-ink">{position.name}</span>
          <span className="block text-[13px] leading-snug text-ink-mute">
            {startsLater ? `ab ${periodLabel(plan.validFrom)} · ` : ''}
            {planDescription(plan)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="num text-[16px] font-semibold text-ink">{formatEUR(plan.amount)}</span>
          {plan.frequency !== 'monthly' && (
            <span className="num whitespace-nowrap text-[12px] text-ink-mute">Ø {formatEUR(monthlyEquivalentOfPlan(plan))} / Monat</span>
          )}
        </span>
      </button>
      <RowMenu
        className="hidden lg:block"
        label={`Aktionen für ${position.name}`}
        items={[
          { label: 'Bearbeiten', onSelect: onEdit },
          { label: 'Archivieren', onSelect: onArchive, danger: true },
        ]}
      />
    </div>
  );
}
