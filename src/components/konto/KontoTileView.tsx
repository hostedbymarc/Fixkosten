import type { Ref } from 'react';
import type { MonthStart } from '../../lib/activeMonth';
import { formatEUR } from '../../lib/format';
import { streakBadge, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { coveredText, dayLabel, deadlinePassed, planText, reasonText, whenText } from '../../lib/kontoWords';
import type { LumpAdvice } from '../../lib/salarySplit';
import { askDay } from '../../lib/walkthrough';
import type { Period } from '../../lib/types';
import { InfoTip } from '../InfoTip';
import { openWalkthrough } from '../../lib/walkthroughBus';
import { Pea } from '../Pea';
import { ConfirmButton, PlanAmount, SwitchModeLink } from './KontoStatusView';

/** Explanation of the monthly amount (the ⓘ next to the title). */
export const ORDER_INFO = t('tile.info');

export interface KontoTileProps {
  state: KontoState;
  /** „Neuer Monat beginnt am“ */
  start: MonthStart;
  active: Period;
  /** the card: the sheet (set up) or the setup (not set up) */
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** with a Spielgeld: „Leg die … auf einmal zur Seite. Danach bleiben dir …“ (only a hint, the choice stays with the user) */
  advice?: LumpAdvice | null;
}

/**
 * The tile on the month screen, directly below the hero: ONE amount, with its reason.
 * - not set up: „Fixkosten einplanen“, one sentence, „Jetzt starten“
 * - set up: „Diesen Monat zur Seite legen“ (this month confirmed: „Nächsten Monat …“), the amount
 *   big, „am 1. Dezember, wenn dein Gehalt kommt“ (with an own account „per Dauerauftrag am …“), then
 *   - spread: „Im Februar kommen … Darum bis dahin € 362,48 extra, ab März € 2.920.“
 *   - lump: „Im Februar kommen … Leg bis 31. Jänner € 1.087,43 extra zur Seite.“
 *   - covered: „Alles eingeplant bis Oktober 2027.“ with a tick
 *   „Zur Seite gelegt“ when something is to confirm; „Lieber auf einmal?“ / „Lieber verteilen?“ while spreading is possible.
 * The whole card opens the sheet or the setup; the ⓘ, the button and the link sit above it.
 */
export function KontoTileView({ state, start, active, onOpen, buttonRef, advice }: KontoTileProps) {
  const fresh = !state.setupDone;
  const streak = fresh ? null : streakBadge(state.streak);
  const title = fresh ? t('tile.setup') : state.monthDone ? t('tile.title.next') : t('tile.title');
  const label = fresh
    ? [t('tile.setup'), t('invite.text'), 'Einrichtung öffnen'].join('. ')
    : [
        title,
        formatEUR(state.next.amount),
        whenText(state, start),
        state.mode ? `${reasonText(state, start)} ${planText(state, start)}` : coveredText(state, start),
        'Details öffnen',
      ]
        .map((part) => part.replace(/\.$/, ''))
        .join('. ');
  return (
    <section
      className="glass glass-tile tone-pea surface press relative min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="konto-tile-card"
      data-state={state.status}
      data-view={fresh ? 'start' : (state.mode ?? 'covered')}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium leading-5 text-ink-mute" data-testid="konto-tile-title">
          {title}
        </span>
        <InfoTip label={`Erklärung: ${title}`} title={title} className="relative z-10 -my-3 -ml-1.5 shrink-0" testId="konto-tile-info">
          <p>{ORDER_INFO}</p>
          <button
            type="button"
            className="focus-ring -mx-1 mt-1 inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-accent-ink hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              openWalkthrough();
            }}
            data-testid="konto-tile-walkthrough"
          >
            {t('walk.link')}
          </button>
        </InfoTip>
        <span className="flex-1" />
        {streak && <StreakBadge streak={streak} />}
      </div>
      <div className="mt-2">
        {fresh ? (
          <div data-testid="tile-status" data-status={state.status}>
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
        ) : (
          <div data-testid="tile-status" data-status={state.status}>
            {state.mode === 'lump' ? <LumpFields state={state} start={start} /> : <PlanAmount state={state} start={start} testId="tile" />}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <ConfirmButton state={state} active={active} testId="tile-confirm" lumpLabel={t('tile.lump.done')} />
              <SwitchModeLink state={state} testId="tile-switch" />
            </div>
            {advice && (
              <p className="num mt-2 text-[14px] leading-snug text-ink-soft" data-testid="tile-advice" data-advice={advice.advice}>
                {t(advice.advice === 'lump' ? 'advice.lump' : 'advice.spread', {
                  betrag: formatEUR(advice.amount, { fixed: true }),
                  rest: formatEUR(advice.left, { fixed: true }),
                })}
              </p>
            )}
          </div>
        )}
      </div>
      {/* the whole card opens the sheet or the setup; the ⓘ, the button and the link sit above this layer (z-10) */}
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

/**
 * „Auf einmal“ with the one-time amount still open: two fields of the same size – „jeden Monat am 1.“
 * with the monthly amount and „einmalig bis 31. Jänner“ with the one-time amount – and the reason under them.
 */
function LumpFields({ state, start }: { state: KontoState; start: MonthStart }) {
  const box = 'flex min-w-0 flex-col gap-0.5 rounded-2xl border border-edge bg-field px-3 py-2.5';
  const label = 'text-[13px] leading-5 text-ink-mute';
  const value = 'num text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]';
  return (
    <div data-testid="tile-plan" data-mode="lump">
      <div className="grid grid-cols-2 gap-2">
        <div className={box} data-testid="tile-monthly">
          <span className={label}>{t('tile.monthly', { tag: askDay(start) })}</span>
          <span className={value} data-testid="tile-amount">
            {formatEUR(state.next.amount, { fixed: true })}
          </span>
        </div>
        <div className={box} data-testid="tile-once">
          <span className={label}>{deadlinePassed(state.gapBy) ? t('tile.once.now') : t('tile.once', { datum: dayLabel(state.gapBy!) })}</span>
          <span className={value} data-testid="tile-lump">
            {formatEUR(state.lump, { fixed: true })}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[14px] leading-snug text-ink" data-testid="tile-reason">
        {reasonText(state, start)}
      </p>
    </div>
  );
}
