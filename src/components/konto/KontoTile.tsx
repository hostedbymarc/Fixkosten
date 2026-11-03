import { useRef, useState } from 'react';
import { db } from '../../db/db';
import { writeKonto } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { formatEUR } from '../../lib/format';
import type { Dataset, Period } from '../../lib/types';
import { Pea } from '../Pea';
import { KontoSheet, useKontoOverview } from './KontoSheet';

/**
 * Bento tile „Fixkostenkonto · Dauerauftrag € X / Monat“ (mode on only), for the active month.
 * Below: covered or the Startlücke. Opens the sheet.
 */
export function KontoTile({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  if (!settings.enabled) return null;
  return <KontoTileOn ds={ds} active={active} />;
}

function KontoTileOn({ ds, active }: { ds: Dataset; active: Period }) {
  const overview = useKontoOverview(ds, active);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const gap = Math.round(overview.simulation.gap * 100) > 0;
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        className="glass glass-tile surface press focus-ring flex min-w-0 items-center gap-4 p-4 text-left md:p-5 xl:p-6"
        data-testid="konto-tile"
        aria-label={`Fixkostenkonto: Dauerauftrag ${formatEUR(overview.order.amount)} pro Monat${gap ? `, Startlücke ${formatEUR(overview.simulation.gap)}` : ', gedeckt'} – Details öffnen`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-5 text-ink-mute">Fixkostenkonto</span>
          <span className="mt-1 block text-ink">
            <span className="text-[15px] font-medium text-ink-soft">Dauerauftrag </span>
            <span className="num text-[24px] font-semibold tracking-[-0.02em] md:text-[28px]" data-testid="konto-tile-value">
              {formatEUR(overview.order.amount)}
            </span>
            <span className="text-[15px] font-medium text-ink-soft"> / Monat</span>
          </span>
          <span className="mt-1 block text-[12px] leading-4 text-ink-mute lg:text-[13px]" data-testid="konto-tile-sub">
            {gap ? (
              <>
                Einmalig <span className="num font-semibold text-ink">{formatEUR(overview.simulation.gap)}</span> einzahlen, dann reicht es 12 Monate
              </>
            ) : (
              'Gedeckt für die nächsten 12 Monate'
            )}
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-semibold text-accent-ink">Details</span>
      </button>
      {open && <KontoSheet ds={ds} active={active} onClose={() => setOpen(false)} returnFocusTo={button.current} />}
    </>
  );
}

/**
 * One-time invitation for installations from before the Fixkostenkonto: only while it was never
 * touched. „Später“ hides it for good (the mode stays in the settings).
 */
export function KontoInvite() {
  const { stored } = useKonto();
  if (stored !== null) return null;
  return (
    <section className="glass surface flex flex-col gap-3 p-4 md:flex-row md:items-center md:p-5" aria-labelledby="konto-invite-title" data-testid="konto-invite">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Pea size={28} className="mt-0.5 shrink-0" />
        <p className="min-w-0 text-[15px] leading-snug text-ink">
          <span id="konto-invite-title" className="font-semibold">
            Neu: Fixkostenkonto.
          </span>{' '}
          Erbse rechnet deinen Dauerauftrag aus.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => void writeKonto(db, { enabled: true })}
          className="focus-ring h-11 flex-1 rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover md:flex-none"
          data-testid="konto-invite-enable"
        >
          Aktivieren
        </button>
        <button
          type="button"
          onClick={() => void writeKonto(db, { inviteDismissed: true })}
          className="focus-ring h-11 flex-1 rounded-xl px-4 text-[15px] font-medium text-ink-soft hover:bg-zinc-100 md:flex-none"
          data-testid="konto-invite-later"
        >
          Später
        </button>
      </div>
    </section>
  );
}
