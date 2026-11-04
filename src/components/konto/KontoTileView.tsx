import type { Ref } from 'react';
import { formatEUR } from '../../lib/format';
import { streakBadge, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { InfoTip } from '../InfoTip';
import { Pea } from '../Pea';
import { gapActionText, KontoStatusLine, progressText, statusText } from './KontoStatusView';

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
 * The tile „Fixkosten einplanen“ on the month screen, directly below the hero. Three states, only in
 * words: setup („Fixkosten einplanen“, bar „0 von 2 erledigt“) · gap („Ab Februar 2027 reicht das Geld
 * nicht.“, „Leg bis … einmalig … zur Seite.“, „Erledigt, zur Seite gelegt“) · covered („Alles eingeplant bis Oktober 2027.“ with a tick).
 * The whole card opens the sheet or the setup; the ⓘ and the action button sit above it.
 */
export function KontoTileView({ state, day, onOpen, buttonRef }: KontoTileProps) {
  const setup = state.status === 'setup';
  const streak = setup ? null : streakBadge(state.streak);
  const label = [
    `${t('tile.title')}: ${statusText(state)}`,
    setup ? progressText(state) : null,
    state.status === 'gap' ? gapActionText(state) : null,
    setup ? null : t(state.hasAccount ? 'tile.order' : 'tile.monthly', { betrag: formatEUR(state.order), tag: day }),
    setup ? 'Einrichtung öffnen' : 'Details öffnen',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <section
      className="glass glass-tile tone-pea surface press relative min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="konto-tile-card"
      data-state={state.status}
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
        <KontoStatusLine state={state} size="compact" testId="tile-status" />
      </div>
      {!setup && (
        <p className="mt-2 text-[13px] leading-5 text-ink-soft lg:text-[14px]" data-testid="konto-tile-sub">
          {state.hasAccount ? 'Dauerauftrag' : 'Monatlich'}{' '}
          <span className="num whitespace-nowrap font-semibold text-ink" data-testid="konto-tile-value">
            {formatEUR(state.order)}
          </span>{' '}
          {day}
        </p>
      )}
      {/* the whole card opens the sheet; the ⓘ and „Erledigt, zur Seite gelegt“ sit above this layer (z-10) */}
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
