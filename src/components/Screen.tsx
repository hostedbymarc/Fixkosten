import { createContext, forwardRef, useContext, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { playEntrance } from '../lib/entrance';
import type { Route } from '../lib/routes';

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: Route;
  /** false while the screen still renders its content (Analyse): the entrance waits for it */
  ready?: boolean;
  /**
   * After the cards have come in: `delay` = ms from now until the last card has arrived (0 with
   * „Bewegung reduzieren“). Analyse lets its bars grow from there.
   */
  onEntered?: (delay: number) => void;
}

/**
 * false for a tab that stays built while another one is shown (src/App.tsx): its screen is hidden,
 * and when it is shown again its entrance plays as on a first visit.
 */
export const TabVisibleContext = createContext(true);

/**
 * Root of every tab (Monat, Positionen, Analyse, Einstellungen): plays THE entrance
 * (src/lib/entrance.ts) once per visit – when the screen is shown, i.e. when its data or lazy chunk
 * is there. No screen has an entrance of its own.
 */
export const Screen = forwardRef<HTMLDivElement, Props>(function Screen({ name, ready = true, onEntered, children, ...rest }, forwarded) {
  const own = useRef<HTMLDivElement | null>(null);
  const entered = useRef(onEntered);
  entered.current = onEntered;
  const visible = useContext(TabVisibleContext);
  useLayoutEffect(() => {
    const el = own.current;
    const main = el?.closest('main');
    if (!el || !main || !ready || !visible) return;
    let live = true;
    // in the next frame, before it is painted: the measuring of the cards does not add to the task
    // that rendered the screen (no long task when a big screen comes in)
    const frame = requestAnimationFrame(() => {
      void playEntrance(main, name, el).then((delay) => {
        if (live) entered.current?.(delay);
      });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [name, ready, visible]);
  return (
    <div
      {...rest}
      ref={(node) => {
        own.current = node;
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
      }}
      data-screen-root={name}
      data-tab-hidden={visible ? undefined : ''}
    >
      {children}
    </div>
  );
});
