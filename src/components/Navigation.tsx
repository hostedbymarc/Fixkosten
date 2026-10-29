import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { reducedMotion } from '../lib/entrance';
import { NAV, type Route } from '../lib/routes';
import { Brand } from './Logo';

// Tab bar (iPhone, iPad portrait) and sidebar (from iPad landscape). Both: a resting glass
// container (.glass-clear, the only blurred part) and a selection indicator (.glass-pill) that
// glides to the new tab – FLIP over `transform` only, so no layout moves and nothing is re-blurred.

export const SLIDE_MS = 380;
export const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Below this scroll position the tab bar is always full. */
export const COMPACT_AFTER = 24;

type Axis = 'x' | 'y';

/**
 * Places the indicator on the active link: size by layout (only on resize), position by transform.
 * On a tab change it starts where the previous tab was and glides over SLIDE_MS.
 */
function useSlidingIndicator(list: React.RefObject<HTMLElement>, pill: React.RefObject<HTMLElement>, route: Route, axis: Axis, inset: number) {
  const last = useRef<number | null>(null);
  useLayoutEffect(() => {
    const ul = list.current;
    const el = pill.current;
    if (!ul || !el) return;
    const place = (animate: boolean) => {
      const link = ul.querySelector<HTMLElement>(`[data-route="${route}"]`);
      if (!link) return;
      const pos = axis === 'x' ? link.offsetLeft + inset : link.offsetTop;
      if (axis === 'x') el.style.width = `${link.offsetWidth - 2 * inset}px`;
      else el.style.height = `${link.offsetHeight}px`;
      const to = axis === 'x' ? `translateX(${pos}px)` : `translateY(${pos}px)`;
      const from = last.current;
      el.style.transform = to;
      if (animate && from !== null && from !== pos && !reducedMotion()) {
        el.getAnimations().forEach((a) => a.cancel());
        el.animate([{ transform: axis === 'x' ? `translateX(${from}px)` : `translateY(${from}px)` }, { transform: to }], {
          duration: SLIDE_MS,
          easing: SLIDE_EASE,
        });
      }
      last.current = pos;
      el.dataset.activeRoute = route;
    };
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(ul);
    return () => observer.disconnect();
  }, [list, pill, route, axis, inset]);
}

/** Tab bar compact while scrolling down (beyond 24 px), full again when scrolling up and at the page end. */
function useCompactOnScroll(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const end = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (reducedMotion() || y <= COMPACT_AFTER || end) setCompact(false);
      else if (y > lastY + 2) setCompact(true);
      else if (y < lastY - 2) setCompact(false);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // a new tab starts at its own scroll position: re-evaluate
    const onHash = () => {
      lastY = window.scrollY;
      setCompact(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  return compact;
}

export function TabBar({ route }: { route: Route }) {
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const compact = useCompactOnScroll();
  useSlidingIndicator(list, pill, route, 'x', 4);
  return (
    <nav
      aria-label="Hauptnavigation"
      className="tabbar fixed z-30 mx-auto max-w-lg lg:hidden"
      style={{
        // floating: 12 px from the edges, above the home indicator
        left: 'calc(12px + var(--safe-left))',
        right: 'calc(12px + var(--safe-right))',
        bottom: 'var(--tabbar-gap)',
        height: 'var(--tabbar-h)',
      }}
      data-testid="tabbar"
      data-compact={compact || undefined}
    >
      {/* the resting capsule: the only blurred layer; compact = 52 px, anchored at the bottom */}
      <div className="tabbar-surface glass-clear" data-testid="tabbar-surface">
        <div ref={pill} className="glass-pill tabbar-pill rounded-full" aria-hidden="true" data-testid="tab-indicator" />
      </div>
      <ul ref={list} className="relative flex h-full">
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = r === route;
          return (
            <li key={r} className="flex-1" data-route={r}>
              <a
                href={`#/${r}`}
                aria-current={active ? 'page' : undefined}
                className={`tab-link focus-ring flex h-full flex-col items-center justify-center rounded-full text-[11px] ${
                  active ? 'font-semibold text-accent-ink' : 'font-medium text-ink-mute'
                }`}
                data-nav-link
              >
                <span className="tab-press flex flex-col items-center gap-0.5">
                  <span className="tab-icon flex h-[30px] w-[54px] items-center justify-center">
                    <Icon size={22} />
                  </span>
                  <span className="tab-label">{label}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  useSlidingIndicator(list, pill, route, 'y', 0);
  return (
    <nav
      aria-label="Hauptnavigation"
      className="glass-clear fixed bottom-3 left-3 top-3 z-30 hidden w-[228px] flex-col px-3 py-6 lg:flex"
      style={{ ['--glass-inset' as string]: '12px' }}
      data-testid="sidebar"
    >
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <Brand />
      </div>
      <ul ref={list} className="relative flex flex-col gap-1">
        <li aria-hidden="true" className="contents">
          <div ref={pill} className="glass-pill r-inner left-0 right-0 top-0" data-testid="sidebar-indicator" />
        </li>
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = r === route;
          return (
            // positioned: the links paint above the indicator
            <li key={r} data-route={r} className="relative">
              <a
                href={`#/${r}`}
                aria-current={active ? 'page' : undefined}
                className={`r-inner tab-press focus-ring flex h-11 items-center gap-3 px-3 text-[15px] font-medium ${
                  active ? 'text-accent-ink' : 'text-ink-soft hover:bg-zinc-100/70'
                }`}
                data-nav-link
              >
                <Icon size={20} />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
