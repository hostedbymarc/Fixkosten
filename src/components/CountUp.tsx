import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { reducedMotion } from '../lib/entrance';

const COUNT_MS = 400;
/** Last shown value per number, across remounts (a swipe re-creates the month content). */
const memory = new Map<string, { value: number; trigger: string }>();

interface Props {
  value: number;
  /** the value as it is shown (formatted by the caller) */
  format: (v: number) => string;
  /** counting only happens when this changes (the month), not on every value change */
  trigger: string;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * A number that counts from the old to the new value when `trigger` changes (400 ms, ease-out,
 * tabular digits). Purely visual: the element itself always holds the final text (tests, screen
 * readers, copy); while counting it is transparent and an aria-hidden copy on top shows the
 * intermediate values, written straight into the DOM per frame (no re-render).
 */
export function CountUp({ value, format, trigger, className = '', style, testId }: Props) {
  const real = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const key = testId ?? 'count';
  useLayoutEffect(() => {
    const from = memory.get(key) ?? { value, trigger };
    memory.set(key, { value, trigger });
    const el = real.current;
    const copy = ghost.current;
    if (from.trigger === trigger || from.value === value || !el || !copy || reducedMotion()) return;
    let frame = 0;
    const start = performance.now();
    el.style.color = 'transparent';
    copy.hidden = false;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      copy.textContent = format(from.value + (value - from.value) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else end();
    };
    const end = () => {
      cancelAnimationFrame(frame);
      el.style.color = '';
      copy.hidden = true;
    };
    copy.textContent = format(from.value);
    frame = requestAnimationFrame(step);
    return end;
  }, [value, trigger, format, key]);
  return (
    <div className="relative">
      <div ref={real} className={className} style={style} data-testid={testId}>
        {format(value)}
      </div>
      <div ref={ghost} className={`pointer-events-none absolute left-0 top-0 ${className}`} style={style} aria-hidden="true" hidden />
    </div>
  );
}
