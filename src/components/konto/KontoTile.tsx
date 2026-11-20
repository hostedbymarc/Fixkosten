import { useEffect } from 'react';
import { db } from '../../db/db';
import { adoptLegacyBalance, finishSetup, markMilestones } from '../../db/kontoActions';
import { kontoUntouched, writeKonto } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { localToday } from '../../lib/activeMonth';
import { newMilestones, type KontoState } from '../../lib/kontoBalance';
import { MILESTONE_TEXT, t } from '../../lib/kontoTexts';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { Pea } from '../Pea';
import { openPlan } from '../../lib/planBus';
import { useToast } from '../Toast';
import { KontoSetupSheet } from './KontoSetupSheet';
import { useKontoState } from './KontoSheet';

/**
 * What used to run in the tile (monat-verdichtet: in „Dein Monat“): the milestone toasts, and data from
 * PR #39 – the stored balance becomes the anchor once.
 */
export function useKontoEffects(state: KontoState, paused = false) {
  const { settings } = useKonto();
  useMilestoneToasts(state, paused);
  useEffect(() => {
    if (settings.setupDone && !settings.anchor) void adoptLegacyBalance(db, localToday());
  }, [settings.setupDone, settings.anchor]);
}

/** A milestone reached for the first time: a short toast with a pea, once; afterwards only the badge in the sheet. */
function useMilestoneToasts(state: KontoState, paused: boolean) {
  const { settings } = useKonto();
  const toast = useToast();
  const fresh = newMilestones(settings, state.status, state.streak);
  const key = fresh.join(',');
  useEffect(() => {
    if (paused || !settings.setupDone || fresh.length === 0) return;
    toast({ message: t('milestone.toast', { meilenstein: t(MILESTONE_TEXT[fresh[fresh.length - 1]!]) }), icon: <Pea size={22} className="anim-check" /> });
    void markMilestones(db, fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.setupDone, paused]);
}

/**
 * The setup sheet: the questions (also for „Einrichtung ändern“); saved, it closes and „Dein Plan“ opens.
 */
export function KontoSetup({ ds, active, onClose, onDone }: { ds: Dataset; active: Period; restart?: boolean; onClose: () => void; onDone?: () => void }) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const state = useKontoState(ds, active);
  return (
    <KontoSetupSheet
      state={state}
      start={start}
      initialStep="account"
      initial={settings.setupDone ? { balance: state.balance, hasAccount: settings.hasAccount !== false, orderRuns: settings.orderRuns } : undefined}
      onAnswers={(answers) => finishSetup(db, answers, { active, now: localToday() })}
      onClose={onClose}
      onFinish={() => {
        (onDone ?? onClose)();
        // right after the setup: „Dein Plan“ with the recommended plan
        openPlan({ fromSetup: true });
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
  if (stored === undefined || !kontoUntouched(stored)) return null;
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
            {t('invite.title')}
          </span>{' '}
          {t('invite.text')}
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
