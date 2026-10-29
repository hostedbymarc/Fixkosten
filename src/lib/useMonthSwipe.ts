import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Horizontal distance (px) that switches the month. */
export const SWIPE_THRESHOLD = 60;
const THRESHOLD = SWIPE_THRESHOLD;
/** At most this angle to the horizontal (degrees) counts as a swipe; anything steeper is scrolling. */
export const SWIPE_MAX_ANGLE = 30;
const TAN = Math.tan((SWIPE_MAX_ANGLE * Math.PI) / 180);
/** Movement before the gesture decides between horizontal swipe and vertical scroll. */
const LOCK = 10;
/** Touches starting this close to the screen edge belong to the system (iOS back gesture). */
const EDGE = 20;

type Direction = 'next' | 'prev';

/**
 * Swipe left/right on touch devices (phones, tablets) to go to the next/previous
 * month. Vertical scrolling stays with the browser (`touch-action: pan-y`); the
 * content follows the finger a little and slides in from the swipe direction.
 * Mouse input is ignored – desktop keeps the arrow buttons.
 */
export function useMonthSwipe(onNext: () => void, onPrev: () => void) {
  const gesture = useRef<{ id: number; x: number; y: number; mode: 'pending' | 'swipe' } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [entered, setEntered] = useState<{ from: Direction; key: number } | null>(null);

  function reset() {
    gesture.current = null;
    setOffset(0);
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      // events from bottom sheets bubble through their React portal: only the screen itself counts
      if (!e.currentTarget.contains(e.target as Node)) return;
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      // never while a sheet (dialog) is open
      if (document.querySelector('[role="dialog"]')) return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'pending' };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.mode === 'pending') {
        // steeper than 30° to the horizontal: vertical scrolling, the gesture is over
        if (Math.max(Math.abs(dx), Math.abs(dy)) > LOCK && Math.abs(dy) > Math.abs(dx) * TAN) return reset();
        if (Math.abs(dx) <= LOCK) return;
        g.mode = 'swipe';
      }
      // follows the finger with resistance, at most the threshold
      setOffset(Math.max(-THRESHOLD, Math.min(THRESHOLD, dx * 0.35)));
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      // ≥ 60 px and, over the whole gesture, flatter than 30°
      const swiped = g.mode === 'swipe' && Math.abs(dx) >= THRESHOLD && Math.abs(dy) <= Math.abs(dx) * TAN;
      reset();
      if (g.mode === 'swipe') {
        // a swipe ending on a row is no tap; cleared again if no click follows
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 400);
      }
      if (!swiped) return;
      const direction: Direction = dx < 0 ? 'next' : 'prev';
      if (direction === 'next') onNext();
      else onPrev();
      setEntered((prev) => ({ from: direction, key: (prev?.key ?? 0) + 1 }));
    },
    onPointerCancel() {
      reset();
    },
    onClickCapture(e: React.MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return {
    handlers,
    /** inline style for the moving content */
    style: { transform: offset ? `translateX(${offset}px)` : undefined, transition: offset ? 'none' : 'transform 160ms ease-out' },
    /** class + key so the new month slides in from the side it came from */
    enterClass: entered ? (entered.from === 'next' ? 'anim-month-next' : 'anim-month-prev') : '',
    enterKey: entered?.key ?? 0,
  };
}
