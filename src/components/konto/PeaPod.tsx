import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { monthOf, shortMonthName } from '../../lib/period';
import { podText, type Pod } from '../../lib/schote';
import { Pea } from '../Pea';

export type PodSize = 'large' | 'compact';

interface Props {
  pod: Pod;
  size?: PodSize;
  /** shows every slot empty (e.g. „Dein Plan“ before everything is done) */
  empty?: boolean;
  /** text next to the pod; default: podText(pod) */
  text?: string;
  /** hides the text (the caller shows it elsewhere) */
  hideText?: boolean;
  className?: string;
  testId?: string;
}

/** ms between two peas snapping in */
const STAGGER = 110;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The pea pod („Schote“): 12 slots = the next 12 months. Covered: a full brand <Pea>. Not covered: an
 * empty dashed slot with a minus – never colour alone. The sentence next to it is always visible and
 * is what the screen reader reads (the pod itself is decoration). A slot that becomes covered snaps
 * in with the check pop, one after another; with reduced motion they simply appear.
 */
export function PeaPod({ pod, size = 'large', empty = false, text, hideText = false, className = '', testId = 'pea-pod' }: Props) {
  const target = pod.slots.map((s) => !empty && s.covered);
  const shown = useSnapIn(target);
  const label = text ?? podText(pod);
  return (
    <div className={`pod pod-${size} ${className}`} data-testid={testId} data-covered={empty ? 0 : pod.covered} data-full={(!empty && pod.full) || undefined}>
      <div className="pod-shell" aria-hidden="true">
        {pod.slots.map((slot, i) => {
          const view = shown[i] ?? { on: false, snap: false };
          return (
            <span key={slot.period} className="pod-slot" data-covered={view.on || undefined} data-testid="pod-slot">
              {view.on ? (
                <Pea size={size === 'large' ? 28 : 16} className={view.snap ? 'pod-snap' : ''} style={{ '--pea-size': 'var(--pod-pea)' } as CSSProperties} />
              ) : (
                <span className="pea-open pod-empty" style={{ '--pea-size': 'var(--pod-pea)' } as CSSProperties}>
                  <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M3 5h4" fill="none" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </span>
          );
        })}
      </div>
      {size === 'large' && (
        <div className="pod-months" aria-hidden="true">
          {pod.slots.map((slot) => (
            <span key={slot.period}>{shortMonthName(monthOf(slot.period)).charAt(0)}</span>
          ))}
        </div>
      )}
      {!hideText && (
        <p className="pod-text" data-testid={`${testId}-text`}>
          {label}
        </p>
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
