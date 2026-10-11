import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoIcon } from './Icons';

/** Popover width; narrower on small phones (16 px margin each side). */
const WIDTH = 300;
const MARGIN = 16;
const GAP = 4;

interface Props {
  /** accessible name of the icon button, e.g. „Erklärung: im Ø-Monat“ */
  label: string;
  title: string;
  children: ReactNode;
  /** placement of the 44 px button (the parent positions it) */
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * ⓘ button with an explanation. Touch: tap opens, tap again or elsewhere closes.
 * Mouse: hover opens. Keyboard: focus opens, Esc closes. The popover is opaque,
 * above everything (incl. the tab bar) and always fully inside the viewport.
 */
export function InfoTip({ label, title, children, className = '', style, testId = 'info-tip' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const pointer = useRef('mouse');
  const id = useId();

  // below the icon, or above when there is no room; clamped to the viewport
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      if (!button.current || !popover.current) return;
      const b = button.current.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - 2 * MARGIN);
      popover.current.style.width = `${width}px`;
      const h = popover.current.offsetHeight;
      const left = Math.min(Math.max(b.left + b.width / 2 - width / 2, MARGIN), vw - width - MARGIN);
      let top = b.bottom + GAP;
      if (top + h > vh - MARGIN) top = b.top - h - GAP;
      top = Math.min(Math.max(top, MARGIN), Math.max(vh - h - MARGIN, MARGIN));
      setPos({ left, top, width });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Esc, a tap elsewhere or scrolling closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !popover.current?.contains(t)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className={`focus-ring flex h-11 w-11 items-center justify-center rounded-full text-ink-mute hover:text-ink ${className}`}
        style={style}
        data-testid={testId}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // touch and keyboard toggle; a mouse already opened it on hover
          if (e.detail === 0 || pointer.current !== 'mouse') setOpen((v) => !v);
        }}
      >
        <InfoIcon size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            id={id}
            role="tooltip"
            className="pointer-events-auto fixed z-[60] rounded-xl border border-edge bg-surface px-3.5 py-3 text-left text-[13px] leading-5 shadow-sheet"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? WIDTH, visibility: pos ? 'visible' : 'hidden' }}
            data-testid={`${testId}-popover`}
          >
            <p className="font-semibold text-ink">{title}</p>
            <div className="mt-1 flex flex-col gap-1 text-ink-soft">{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
