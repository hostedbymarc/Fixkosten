import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import { adoptLegacyBalance, finishSetup, markMilestones, saveSetupProgress, setAnchor } from '../../db/kontoActions';
import { writeKonto } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { localToday } from '../../lib/activeMonth';
import { depositDone, newMilestones, setupCoverage, streakBadge, type KontoState } from '../../lib/kontoBalance';
import { monthName } from '../../lib/period';
import { orderDay } from '../../lib/schote';
import { MILESTONE_TEXT, t } from '../../lib/schoteTexts';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { Pea } from '../Pea';
import { useToast } from '../Toast';
import { KontoSetupSheet } from './KontoSetupSheet';
import { KontoSheet, useKontoState } from './KontoSheet';
import { KontoTileView, ORDER_INFO } from './KontoTileView';

/** Explanation of the standing order, in the tile's tooltip. */
export const STANDING_ORDER_INFO = ORDER_INFO;

/**
 * The Fixkostenkonto tile on the month screen (mode on only), directly below the hero: not set up →
 * the setup; otherwise the pod with the gap, „gedeckt“ or a Polster; it opens the sheet. Every change
 * of balance, account or positions shows at once (live query + kontoState).
 */
export function KontoTile({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  if (!settings.enabled) return null;
  return <KontoTileOn ds={ds} active={active} />;
}

function KontoTileOn({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  const start = useMonthStart();
  const [open, setOpen] = useState<'sheet' | 'setup' | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useMilestoneToasts(state);
  // data from PR #39: the stored balance becomes the anchor once
  useEffect(() => {
    if (settings.setupDone && !settings.anchor) void adoptLegacyBalance(db, localToday());
  }, [settings.setupDone, settings.anchor]);
  return (
    <>
      <KontoTileView
        state={state.tile}
        pod={state.pod}
        order={state.overview.order.amount}
        gap={state.gap}
        cushion={state.cushion}
        setupSteps={settings.setupSteps}
        streak={streakBadge(state.streak)}
        day={orderDay(start)}
        onOpen={() => setOpen('sheet')}
        onSetup={() => setOpen('setup')}
        onPaid={() => void setAnchor(db, state.balance + state.gap, localToday())}
        buttonRef={button}
      />
      {open === 'sheet' && <KontoSheet ds={ds} active={active} onClose={() => setOpen(null)} returnFocusTo={button.current} />}
      {open === 'setup' && <KontoSetup ds={ds} active={active} onClose={() => setOpen(null)} />}
    </>
  );
}

/** A milestone reached for the first time: a short toast with a pea, once; afterwards only the badge in the sheet. */
function useMilestoneToasts(state: KontoState) {
  const { settings } = useKonto();
  const toast = useToast();
  const fresh = newMilestones(settings, state.pod, state.streak);
  const key = fresh.join(',');
  useEffect(() => {
    if (!settings.setupDone || fresh.length === 0) return;
    toast({ message: t('milestone.toast', { meilenstein: t(MILESTONE_TEXT[fresh[fresh.length - 1]!]) }), icon: <Pea size={22} className="anim-check" /> });
    void markMilestones(db, fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.setupDone]);
}

/** The setup sheet with the real numbers of the active month. */
export function KontoSetup({ ds, active, onClose, onDone }: { ds: Dataset; active: Period; onClose: () => void; onDone?: () => void }) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const state = useKontoState(ds, active);
  const order = state.overview.order.amount;
  const coverage = (balance: number, opts: { firstDeposit: boolean; deposits: boolean }) => setupCoverage(ds, active, settings.rounding, balance, opts);
  // again from the settings („Einrichtung ändern“): the answers so far
  const initialResult = settings.setupDone
    ? {
        hasAccount: settings.hasAccount ?? true,
        balance: state.balance,
        order: depositDone(settings, active) ? (settings.orderStartsAfter === active ? 'none' : 'yes') : 'no',
      } as const
    : undefined;
  return (
    <KontoSetupSheet
      monthName={monthName(active)}
      order={order}
      day={orderDay(start)}
      coverage={coverage}
      initialResult={initialResult}
      onProgress={(steps) => void saveSetupProgress(db, steps)}
      onClose={onClose}
      onFinish={(r) => {
        const gap = coverage(r.balance, { firstDeposit: r.order === 'no', deposits: true }).gap;
        void finishSetup(db, r, { active, gap, now: localToday() }).then(() => (onDone ?? onClose)());
      }}
    />
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
    <section
      className="glass surface flex flex-col gap-3 p-4 md:flex-row md:items-center md:p-5"
      aria-labelledby="konto-invite-title"
      data-testid="konto-invite"
    >
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
