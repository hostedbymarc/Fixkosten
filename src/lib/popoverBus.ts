// Only one popover at a time: an ⓘ (InfoTip) or a chart's month popup claims the screen, and the
// one that was open before closes – on the screen and in a sheet alike.
import { useCallback, useEffect, useRef, useState } from 'react';

type Close = () => void;
let current: { key: symbol; close: Close } | null = null;

/** Open now: closes the popover that was open before (if it is another one). */
export function claimPopover(key: symbol, close: Close): void {
  if (current && current.key !== key) {
    const prev = current;
    current = null;
    prev.close();
  }
  current = { key, close };
}

/** Closed: forget it (only if it is still the open one). */
export function releasePopover(key: symbol): void {
  if (current?.key === key) current = null;
}

/** For a component with an `open` state: claims while open, releases when closed or unmounted. */
export function useExclusivePopover(open: boolean, close: Close): void {
  const key = useRef(Symbol('popover')).current;
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    claimPopover(key, () => closeRef.current());
    return () => releasePopover(key);
  }, [open, key]);
}

/**
 * For a Recharts tooltip (opened by the chart itself on hover or tap): touching the chart claims the
 * screen; when another popover opens, the tooltip is hidden (`active={false}`) until the next touch.
 */
export function useExclusiveChartTooltip() {
  const key = useRef(Symbol('chart')).current;
  const [hidden, setHidden] = useState(false);
  const claim = useCallback(() => {
    setHidden(false);
    claimPopover(key, () => setHidden(true));
  }, [key]);
  useEffect(() => () => releasePopover(key), [key]);
  return {
    /** spread on the <Tooltip>: undefined lets Recharts decide, false hides it */
    active: hidden ? false : undefined,
    /** spread on the element around the chart */
    handlers: { onPointerDown: claim, onPointerEnter: (e: { pointerType: string }) => e.pointerType === 'mouse' && claim() },
  } as const;
}
