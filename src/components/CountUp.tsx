import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { reducedMotion } from '../lib/entrance';
import { fitEm } from './fitText';

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
 * tabular digits). There is exactly ONE element and ONE text node at any time: the count writes the
 * intermediate values into that same text node (no copy on top, no transparent original: two
 * stacked copies showed double and blurred in Safari). It always ends on the final text, also when a
 * frame never comes (a timer finishes it), when the value changes again or the element goes away.
 * Nothing but the text changes: no transform, filter or will-change on the number.
 */
export function CountUp({ value, format, trigger, className = '', style, testId }: Props) {
  const real = useRef<HTMLDivElement>(null);
  const key = testId ?? 'count';
  const text = format(value);
  const fit = (style as Record<string, unknown> | undefined)?.['--fit-em'];
  useLayoutEffect(() => {
    const from = memory.get(key) ?? { value, trigger };
    memory.set(key, { value, trigger });
    const el = real.current;
    const node = el?.firstChild;
    if (from.trigger === trigger || from.value === value || !el || !(node instanceof Text) || reducedMotion()) return;
    let frame = 0;
    let done = false;
    const start = performance.now();
    // while counting the number fits the WIDER of the two values (whole euros in between, never
    // wider than that: cents in between made „€ 2.511,83“ wider than „€ 2.589“)
    el.style.setProperty('--fit-em', Math.max(fitEm(format(from.value)), fitEm(format(value))).toFixed(3));
    const end = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      // the final text, as React rendered it (data-value), and the box size React set
      node.data = el.dataset.value ?? node.data;
      const fit = el.dataset.fit;
      if (fit) el.style.setProperty('--fit-em', fit);
      else el.style.removeProperty('--fit-em');
    };
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      if (t >= 1) return end();
      const eased = 1 - (1 - t) ** 3;
      node.data = format(Math.round(from.value + (value - from.value) * eased));
      frame = requestAnimationFrame(step);
    };
    node.data = format(from.value);
    frame = requestAnimationFrame(step);
    // no frame (hidden tab, a stalled renderer): the final value anyway
    const timer = window.setTimeout(end, COUNT_MS + 150);
    return end;
  }, [value, trigger, format, key]);
  return (
    <div ref={real} className={className} style={style} data-testid={testId} data-value={text} data-fit={fit === undefined ? undefined : String(fit)}>
      {text}
    </div>
  );
}
