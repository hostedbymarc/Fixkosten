import type { Ref } from 'react';
import { formatEUR } from '../../lib/format';
import { podText, type Pod, type TileState } from '../../lib/schote';
import { t } from '../../lib/schoteTexts';
import { InfoTip } from '../InfoTip';
import { Pea, PeaOpen } from '../Pea';
import { PeaPod } from './PeaPod';

/** Explanation of the standing order (the ⓘ next to the title). */
export const ORDER_INFO =
  'So viel überweist du jeden Monat per Dauerauftrag aufs Fixkostenkonto: die Monatsanteile aller Rechnungen auf diesem Konto (Quartal ÷ 3, Halbjahr ÷ 6, Jahr ÷ 12), aufgerundet.';

export interface KontoTileProps {
  state: TileState;
  pod: Pod;
  /** the rounded standing order */
  order: number;
  /** Startlücke */
  gap: number;
  /** Polster in months (state 'cushion') */
  cushion: number | null;
  /** setup steps already answered (state 'setup') */
  setupSteps?: number;
  /** months in a row with a confirmed standing order; 'new' = a new series starts */
  streak?: number | 'new' | null;
  onOpen: () => void;
  onPaid?: () => void;
  onSetup?: () => void;
  /** „am 1.“ – from „Neuer Monat beginnt am“ (orderDay) */
  day: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

const oneDecimal = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** „+1,4“ */
export function formatCushion(months: number): string {
  return `+${oneDecimal.format(months)}`;
}

/**
 * The Fixkostenkonto tile on the month screen, directly below the hero: exactly four states.
 * 1 setup · 2 gap („Erledigt, eingezahlt“) · 3 covered · 4 covered with a Polster.
 * The whole card opens the sheet (or the setup); the ⓘ and the action button sit above it.
 */
export function KontoTileView(props: KontoTileProps) {
  if (props.state === 'setup') return <SetupTile {...props} />;
  const { state, pod, order, gap, cushion, streak, onOpen, onPaid, buttonRef, day } = props;
  const text = podText(pod);
  const label =
    state === 'gap'
      ? `Fixkostenkonto: ${text}. ${t('tile.gap.text', { betrag: formatEUR(gap) })}. Details öffnen`
      : `Fixkostenkonto: ${text}. ${t('tile.order', { betrag: formatEUR(order), tag: day })}. Details öffnen`;
  return (
    <section className="glass glass-tile tone-pea surface press relative min-w-0 p-4 md:p-5 xl:p-6" data-testid="konto-tile-card" data-state={state}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium leading-5 text-ink-mute">{t('tile.title')}</span>
        <InfoTip label="Erklärung: Dauerauftrag" title="Dauerauftrag" className="relative z-10 -my-3 -ml-1.5 shrink-0" testId="konto-tile-info">
          <p>{ORDER_INFO}</p>
        </InfoTip>
        <span className="flex-1" />
        {streak && <StreakBadge streak={streak} />}
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full min-w-0 rounded-lg text-left outline-none after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-focus"
        data-testid="konto-tile"
        aria-label={label}
      >
        <PeaPod pod={pod} size="compact" testId="tile-pod" />
        <span className="mt-1 block text-[13px] leading-5 text-ink-soft lg:text-[14px]" data-testid="konto-tile-sub">
          {state === 'gap' ? (
            <>
              Noch <span className="num whitespace-nowrap font-semibold text-ink">{formatEUR(gap)}</span> einzahlen, dann ist alles gedeckt
            </>
          ) : (
            <>
              Dauerauftrag <span className="num whitespace-nowrap font-semibold text-ink" data-testid="konto-tile-value">
                {formatEUR(order)}
              </span>{' '}
              {day}
            </>
          )}
        </span>
      </button>
      {state === 'cushion' && cushion !== null && (
        <p className="mt-2" data-testid="konto-tile-cushion">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paid-soft px-2.5 py-1 text-[12px] font-semibold text-paid-ink">
            <Pea size={10} />
            {t('tile.cushion', { monate: formatCushion(cushion) })}
          </span>
        </p>
      )}
      {state === 'gap' && onPaid && (
        <button
          type="button"
          onClick={onPaid}
          className="focus-ring relative z-10 mt-3 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
          data-testid="konto-tile-paid"
        >
          {t('tile.gap.action')}
        </button>
      )}
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

function SetupTile({ setupSteps = 0, onSetup, buttonRef }: KontoTileProps) {
  return (
    <section className="glass glass-tile tone-pea surface press relative min-w-0 p-4 md:p-5 xl:p-6" data-testid="konto-tile-card" data-state="setup">
      <button
        ref={buttonRef}
        type="button"
        onClick={onSetup}
        className="flex w-full min-w-0 items-center gap-4 rounded-lg text-left outline-none after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-focus"
        data-testid="konto-tile"
        aria-label={`${t('tile.setup.title')}, ${t('tile.setup.progress', { n: setupSteps })}`}
      >
        <Pea size={40} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-6 text-ink">{t('tile.setup.title')}</span>
          <span className="mt-1 flex items-center gap-2 text-[13px] text-ink-mute">
            <span className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (i < setupSteps ? <Pea key={i} size={10} /> : <PeaOpen key={i} size={10} />))}
            </span>
            <span data-testid="konto-tile-progress">{t('tile.setup.progress', { n: setupSteps })}</span>
          </span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-accent-ink">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}
