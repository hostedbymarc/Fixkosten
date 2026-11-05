import type { Ref } from 'react';
import { formatEUR } from '../../lib/format';
import { streakBadge, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { InfoTip } from '../InfoTip';
import { Pea } from '../Pea';
import { KontoStatusLine, NextTask, nextTaskText, progressText, statusText } from './KontoStatusView';

/** Explanation of the monthly amount (the ⓘ next to the title). */
export const ORDER_INFO = t('tile.info');

export interface KontoTileProps {
  state: KontoState;
  /** „am 1.“ – from „Neuer Monat beginnt am“ (orderDay) */
  day: string;
  /** the card: the sheet (set up) or the setup / plan (status setup) */
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * The tile „Fixkosten einplanen“ on the month screen, directly below the hero. The small heading with
 * its ⓘ is the only title. Three states:
 * - no question answered: a short sentence and „Jetzt starten“
 * - questions answered, plan points open: the next task with amount, date and „Erledigt“, then the bar
 *   („Leg bis 24. Jänner einmalig € 1.087,34 zur Seite.“, „Dauerauftrag einrichten: € 2.912 am 25.“)
 * - covered: „Alles eingeplant bis Oktober 2027.“ with a tick and the monthly amount.
 * The whole card opens the sheet or the setup; the ⓘ and the buttons sit above it.
 */
export function KontoTileView({ state, day, onOpen, buttonRef }: KontoTileProps) {
  const fresh = !state.setupDone;
  const task = nextTaskText(state, day);
  const covered = !fresh && !task;
  const streak = covered ? streakBadge(state.streak) : null;
  const label = [
    t('tile.title'),
    fresh ? t('invite.text') : null,
    task,
    task && state.status === 'gap' ? statusText(state) : null,
    task ? progressText(state) : null,
    covered ? statusText(state) : null,
    covered ? t(state.hasAccount ? 'tile.order' : 'tile.monthly', { betrag: formatEUR(state.order), tag: day }) : null,
    state.status === 'setup' ? 'Einrichtung öffnen' : 'Details öffnen',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <section
      className="glass glass-tile tone-pea surface press relative min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="konto-tile-card"
      data-state={state.status}
      data-view={fresh ? 'start' : task ? 'task' : 'covered'}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium leading-5 text-ink-mute">{t('tile.title')}</span>
        <InfoTip label={`Erklärung: ${t('tile.info.title')}`} title={t('tile.info.title')} className="relative z-10 -my-3 -ml-1.5 shrink-0" testId="konto-tile-info">
          <p>{ORDER_INFO}</p>
        </InfoTip>
        <span className="flex-1" />
        {streak && <StreakBadge streak={streak} />}
      </div>
      <div className="mt-2">
        {fresh ? (
          <div data-testid="tile-status" data-status={state.status} role="status">
            <p className="sr-only" data-testid="tile-status-text">
              {statusText(state)}
            </p>
            <p className="text-[15px] leading-snug text-ink-soft" data-testid="konto-tile-intro">
              {t('invite.text')}
            </p>
            <button
              type="button"
              onClick={onOpen}
              className="focus-ring relative z-10 mt-3 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
              data-testid="konto-tile-start"
            >
              {t('tile.start')}
            </button>
          </div>
        ) : task ? (
          <NextTask state={state} day={day} testId="tile-status" />
        ) : (
          <KontoStatusLine state={state} size="compact" testId="tile-status" />
        )}
      </div>
      {covered && (
        <p className="mt-2 text-[13px] leading-5 text-ink-soft lg:text-[14px]" data-testid="konto-tile-sub">
          {state.hasAccount ? 'Dauerauftrag' : 'Monatlich'}{' '}
          <span className="num whitespace-nowrap font-semibold text-ink" data-testid="konto-tile-value">
            {formatEUR(state.order)}
          </span>{' '}
          {day}
        </p>
      )}
      {/* the whole card opens the sheet or the setup; the ⓘ and the buttons sit above this layer (z-10) */}
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-focus"
        data-testid="konto-tile"
        aria-label={label}
      />
    </section>
  );
}

function StreakBadge({ streak }: { streak: number | 'new' }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-paid-soft px-2.5 py-1 text-[12px] font-semibold text-paid-ink"
      data-testid="konto-tile-streak"
    >
      <Pea size={10} />
      {streak === 'new' ? t('tile.streak.new') : t('tile.streak', { n: streak })}
    </span>
  );
}
