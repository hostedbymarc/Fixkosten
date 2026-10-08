import { useRef, useState, type ReactNode } from 'react';

const ACTION_WIDTH = 104;
const LOCK_DISTANCE = 10;

/**
 * Swipe left (touch only) reveals a destructive action; a long swipe triggers it.
 * Vertical gestures are left to the browser (touch-action: pan-y), so scrolling
 * never archives anything by accident.
 */
export function SwipeRow({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; base: number; mode: 'pending' | 'swipe' | 'scroll' } | null>(null);
  const suppressClick = useRef(false);
  const row = useRef<HTMLDivElement>(null);
  const open = offset <= -ACTION_WIDTH;

  function reset() {
    gesture.current = null;
    setDragging(false);
  }

  return (
    <div ref={row} className="relative overflow-hidden" data-testid="swipe-row">
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => {
          setOffset(0);
          onAction();
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-danger px-4 text-[15px] font-semibold text-white"
        // rows are transparent on glass: the action only exists visually while the row is moved
        style={{ width: ACTION_WIDTH, visibility: offset === 0 && !dragging ? 'hidden' : 'visible' }}
      >
        {actionLabel}
      </button>
      <div
        className={`relative ${dragging ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          // a swipe produces no click, so a stale flag must not eat the next real tap
          suppressClick.current = false;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: offset, mode: 'pending' };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId || g.mode === 'scroll') return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (g.mode === 'pending') {
            if (Math.abs(dy) > LOCK_DISTANCE && Math.abs(dy) >= Math.abs(dx)) {
              g.mode = 'scroll';
              return;
            }
            if (Math.abs(dx) > LOCK_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
              g.mode = 'swipe';
              setDragging(true);
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // pointer already released; the move handler still works without capture
              }
            } else return;
          }
          const width = row.current?.clientWidth ?? 360;
          setOffset(Math.max(-width, Math.min(0, g.base + dx)));
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          if (g.mode === 'swipe') {
            suppressClick.current = true;
            const width = row.current?.clientWidth ?? 360;
            if (offset < -width * 0.6) {
              setOffset(0);
              onAction();
            } else {
              setOffset(offset < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
            }
          } else if (open) {
            suppressClick.current = true;
            setOffset(0);
          }
          reset();
        }}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
