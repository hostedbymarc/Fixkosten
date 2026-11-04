import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatEUR } from '../../lib/format';
import { monthName, monthOf, periodLabel, shortMonthName } from '../../lib/period';
import { podText, type Pod } from '../../lib/schote';
import { t } from '../../lib/schoteTexts';
import { AlertIcon } from '../Icons';
import { Pea } from '../Pea';

export type PodSize = 'large' | 'compact';

interface Props {
  pod: Pod;
  size?: PodSize;
  /** shows every slot empty (e.g. „Dein Plan“ before anything is done) */
  empty?: boolean;
  className?: string;
  testId?: string;
}

/** ms between two peas snapping in */
const STAGGER = 110;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The answer that comes before every pod: one sentence, and when money is missing what to do.
 * „Alles gedeckt bis Oktober 2027.“ / „Ab Februar 2027 fehlt Geld.“ + „Zahl einmalig € Y ein, dann
 * passt alles.“ + „Erledigt, eingezahlt“. `action` replaces the default sentence and button (e.g.
 * „Dein Plan“, where the steps are the action).
 */
export function PodAnswer({
  pod,
  gap,
  onPaid,
  action,
  size = 'large',
  testId = 'pod-answer',
}: {
  pod: Pod;
  gap: number;
  onPaid?: () => void;
  action?: ReactNode;
  size?: PodSize;
  testId?: string;
}) {
  const short = pod.shortFrom !== null;
  const showGap = short && Math.round(gap * 100) > 0;
  return (
    <div className={`pod-answer pod-answer-${size}`} data-testid={testId} data-short={short || undefined}>
      <p className="pod-answer-text" data-testid={`${testId}-text`} aria-live="polite">
        {short && <AlertIcon size={size === 'large' ? 18 : 16} className="pod-answer-icon" />}
        {podText(pod)}
      </p>
      {action ??
        (showGap && (
          <>
            <p className="pod-answer-action" data-testid={`${testId}-action`}>
              Zahl einmalig <span className="num whitespace-nowrap font-semibold text-ink">{formatEUR(gap)}</span> ein, dann passt alles.
            </p>
            {onPaid && (
              <button
                type="button"
                onClick={onPaid}
                className="focus-ring relative z-10 mt-2 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
                data-testid={`${testId}-paid`}
              >
                {t('tile.gap.action')}
              </button>
            )}
          </>
        ))}
    </div>
  );
}

/**
 * The pea pod („Schote“): 12 slots = the next 12 months, filled like a battery from the left up to
 * the first month without enough money. Covered: a full brand <Pea>. Empty: a light, calm pea-shaped
 * placeholder. Only the first empty slot – the month from which money is missing – gets a subtle red
 * ring with an alert icon, never colour alone. The answer sentence (PodAnswer) above the pod is what
 * the screen reader reads; the pod itself is decoration. The large pod has the month initials (a tap
 * shows the full name), the short month written out under its pea, and the legend.
 * A slot that becomes covered snaps in with the check pop, one after another; with reduced motion
 * they simply appear.
 */
export function PeaPod({ pod, size = 'large', empty = false, className = '', testId = 'pea-pod' }: Props) {
  const target = pod.slots.map((s) => !empty && s.covered);
  const shown = useSnapIn(target);
  const shortIndex = empty || pod.shortFrom === null ? -1 : pod.covered;
  // large pod: tapping a month initial shows the full month name below (in the flow, never on top)
  const [picked, setPicked] = useState<number | null>(null);
  const pickedSlot = picked === null ? null : pod.slots[picked];
  useEffect(() => {
    if (picked === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);
  const monthLabel = (i: number) => t(pod.slots[i]!.covered && !empty ? 'pod.month.covered' : 'pod.month.open', { monat: periodLabel(pod.slots[i]!.period) });
  return (
    <div className={`pod pod-${size} ${className}`} data-testid={testId} data-covered={empty ? 0 : pod.covered} data-full={(!empty && pod.full) || undefined}>
      <div className="pod-shell" aria-hidden="true">
        {pod.slots.map((slot, i) => {
          const view = shown[i] ?? { on: false, snap: false };
          return (
            <span key={slot.period} className="pod-slot" data-covered={view.on || undefined} data-short={i === shortIndex || undefined} data-testid="pod-slot">
              {view.on ? (
                <Pea size={size === 'large' ? 28 : 16} className={view.snap ? 'pod-snap' : ''} style={{ '--pea-size': 'var(--pod-pea)' } as CSSProperties} />
              ) : (
                <span className={`pod-empty ${i === shortIndex ? 'pod-short' : ''}`} style={{ '--pea-size': 'var(--pod-pea)' } as CSSProperties}>
                  {i === shortIndex && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 6.5v7M12 17.5v.01" fill="none" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {size === 'large' && (
        <>
          <div className="pod-months">
            {pod.slots.map((slot, i) => (
              <button
                key={slot.period}
                type="button"
                className="pod-month focus-ring"
                aria-label={monthLabel(i)}
                aria-pressed={picked === i}
                onClick={() => setPicked((cur) => (cur === i ? null : i))}
                data-testid="pod-month"
              >
                {shortMonthName(monthOf(slot.period)).charAt(0)}
              </button>
            ))}
          </div>
          {shortIndex >= 0 && (
            <div className="pod-short-row" aria-hidden="true">
              <span
                className="pod-short-label"
                style={{ gridColumn: shortIndex + 1, justifySelf: shortIndex < 2 ? 'start' : shortIndex > 9 ? 'end' : 'center' }}
                data-testid={`${testId}-short`}
              >
                {monthName(pod.slots[shortIndex]!.period)}
              </span>
            </div>
          )}
          <p className="pod-month-name" aria-live="polite" data-testid={`${testId}-month`}>
            {pickedSlot && picked !== null && monthLabel(picked)}
          </p>
          <p className="pod-legend" data-testid={`${testId}-legend`}>
            <Pea size={12} />
            {t('pod.legend')}
          </p>
        </>
      )}
    </div>
  );
}

interface SlotView {
  on: boolean;
  /** snaps in right now (pop animation) */
  snap: boolean;
}

/** Shown slots follow the target; newly covered slots switch on one by one. */
function useSnapIn(target: boolean[]): SlotView[] {
  const key = target.map((v) => (v ? 1 : 0)).join('');
  const [shown, setShown] = useState<SlotView[]>(() => target.map((on) => ({ on, snap: false })));
  const current = useRef(shown);
  current.current = shown;
  useEffect(() => {
    const prev = current.current;
    const newly = target.flatMap((on, i) => (on && !prev[i]?.on ? [i] : []));
    if (reducedMotion() || newly.length === 0 || prev.length !== target.length) {
      setShown(target.map((on) => ({ on, snap: false })));
      return;
    }
    // slots that lost their cover switch off at once; the new ones follow one by one
    setShown(target.map((on, i) => ({ on: on && !!prev[i]?.on, snap: false })));
    const timers = newly.map((slot, n) =>
      window.setTimeout(() => setShown((cur) => cur.map((s, i) => (i === slot ? { on: true, snap: true } : s))), (n + 1) * STAGGER),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown.length === target.length ? shown : target.map((on) => ({ on, snap: false }));
}
