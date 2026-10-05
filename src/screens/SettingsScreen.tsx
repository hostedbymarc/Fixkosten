import { useRef, useState } from 'react';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import { deletePositionPermanently, restorePosition } from '../db/repo';
import { archivedPeriod, archivedPositions, currentPlan, positionUsage } from '../lib/calc';
import { formatEUR } from '../lib/format';
import { periodLabel } from '../lib/period';
import { useToday } from '../lib/useToday';
import type { Dataset, Position } from '../lib/types';

function deleteText(usage: { payments: number; oneOffs: number }): string {
  const parts = [];
  if (usage.payments) parts.push(usage.payments === 1 ? '1 Zahlung' : `${usage.payments} Zahlungen`);
  if (usage.oneOffs) parts.push(usage.oneOffs === 1 ? '1 Einmalbetrag' : `${usage.oneOffs} Einmalbeträge`);
  return parts.length ? `Dabei werden auch ${parts.join(' und ')} gelöscht.` : 'Es gibt keine Zahlungen dazu.';
}

export function SettingsScreen({ ds }: { ds: Dataset }) {
  const today = useToday();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Position | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const archived = archivedPositions(ds);
  const categoryName = (id: string) => ds.categories.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8">
      <header className="py-3 lg:py-6">
        <h1 className="flex h-11 items-center text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]">Einstellungen</h1>
      </header>

      <div className="flex max-w-2xl flex-col gap-6">
        <section aria-labelledby="archive-title">
          <h2 id="archive-title" className="section-title mb-2 px-1">
            Archiv
          </h2>
          {archived.length === 0 ? (
            <div className="rounded-card border border-dashed border-zinc-300 px-4 py-5 text-[14px] text-ink-mute">
              Keine archivierten Positionen. Archivieren geht in „Positionen“ per Wischen nach links oder über das ⋯-Menü.
            </div>
          ) : (
            <ul className="card divide-y divide-line" data-testid="archive-list">
              {archived.map((p) => {
                const plan = currentPlan(p, today)!;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-position={p.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                      <span className="block text-[13px] text-ink-mute">
                        {categoryName(p.categoryId)} · <span className="num">{formatEUR(plan.amount)}</span> · archiviert seit{' '}
                        {periodLabel(archivedPeriod(p)!)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await restorePosition(db, p.id, today);
                          toast({ message: `„${p.name}“ ist ab ${periodLabel(today)} wieder aktiv` });
                        }}
                        className="focus-ring h-11 rounded-xl border border-line px-3 text-[14px] font-medium text-ink hover:border-zinc-300"
                      >
                        Wiederherstellen
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          trigger.current = e.currentTarget;
                          setConfirm(p);
                        }}
                        className="focus-ring h-11 rounded-xl px-3 text-[14px] font-medium text-over hover:bg-over-soft"
                      >
                        Löschen
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="later-title">
          <h2 id="later-title" className="section-title mb-2 px-1">
            Erinnerungen & Backup
          </h2>
          <div className="rounded-card border border-dashed border-zinc-300 px-4 py-5 text-[14px] text-ink-mute">
            Kommt in Phase 4: Erinnerungen verwalten, JSON-/CSV-Export, Import, Backup-Hinweis.
          </div>
        </section>
      </div>

      {confirm && (
        <ConfirmSheet
          title={`„${confirm.name}“ endgültig löschen?`}
          confirmLabel="Endgültig löschen"
          returnFocusTo={trigger.current}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const name = confirm.name;
            setConfirm(null);
            await deletePositionPermanently(db, confirm.id);
            toast({ message: `„${name}“ gelöscht` });
          }}
        >
          <p>
            {deleteText(positionUsage(ds, confirm.id))} Das kann nicht rückgängig gemacht werden und fehlt danach auch in
            den Grafiken.
          </p>
        </ConfirmSheet>
      )}
    </div>
  );
}
