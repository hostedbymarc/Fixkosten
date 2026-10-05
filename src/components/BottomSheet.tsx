import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

/**
 * Locks page scroll while a sheet is open. iOS Safari ignores overflow:hidden
 * on body for touch scrolling, so the body is pinned with position:fixed and
 * the scroll offset restored on close.
 */
function useScrollLock() {
  useEffect(() => {
    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: documentElement.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      documentElement.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

/**
 * Measures how much of the layout viewport is covered by the on-screen
 * keyboard (visualViewport shrinks, layout viewport does not on iOS).
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 1 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** element to focus after closing (Safari does not focus buttons on tap) */
  returnFocusTo?: HTMLElement | null;
}

export function BottomSheet({ title, subtitle, onClose, children, returnFocusTo }: Props) {
  useScrollLock();
  const keyboard = useKeyboardInset();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const returnFocus = useRef(returnFocusTo);
  useEffect(() => {
    const previouslyFocused = returnFocus.current ?? (document.activeElement as HTMLElement | null);
    // the app behind the sheet is unreachable for focus and screen readers
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    panel.current?.focus();
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      // keep focus inside the sheet
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => !n.hasAttribute('disabled'),
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="anim-fade absolute inset-0 bg-zinc-900/30" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute inset-x-0 flex justify-center lg:inset-0 lg:items-center lg:p-6"
        style={{ bottom: keyboard }}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="anim-sheet flex w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] bg-white shadow-sheet outline-none lg:rounded-[22px]"
          style={{ maxHeight: `calc(100dvh - ${keyboard}px - var(--safe-top) - 24px)` }}
          data-testid="bottom-sheet"
        >
          <div className="flex justify-center pt-2 lg:hidden" aria-hidden="true">
            <div className="h-1 w-9 rounded-full bg-zinc-200" />
          </div>
          <div className="flex items-start gap-3 px-5 pb-2 pt-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-[19px] font-semibold text-ink">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 text-[14px] text-ink-mute">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="focus-ring -mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-mute hover:bg-zinc-100"
            >
              <CloseIcon />
            </button>
          </div>
          <div
            className="overflow-y-auto overscroll-contain px-5 pt-2"
            style={{ paddingBottom: keyboard > 0 ? 16 : 'calc(var(--safe-bottom) + 20px)' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
