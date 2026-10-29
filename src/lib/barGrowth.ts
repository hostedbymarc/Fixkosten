// Analyse, after the cards have come in (src/components/Screen.tsx → onEntered): the bars of the
// Jahresvorschau grow from the axis (400 ms, 20 ms apart, left to right; regular and one-time part
// of a month together) and the bars of the Verteilung grow from the left. Once per visit of the tab.
// Only `transform`, fill „backwards“: nothing is left on the bars afterwards.
// „Bewegung reduzieren“: the bars are simply there.

import { reducedMotion } from './entrance';

export const BAR_MS = 400;
export const BAR_STAGGER = 20;
export const GROW_ID = 'bar-grow';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function growForecast(root: ParentNode, delay: number): boolean {
  const bars = [...root.querySelectorAll<SVGGraphicsElement>('[data-testid="forecast"] .recharts-bar-rectangle path')];
  if (!bars.length) return false;
  // columns by their x position; the baseline of a column is the lowest edge of its parts
  const columns = new Map<number, { bars: SVGGraphicsElement[]; base: number }>();
  for (const bar of bars) {
    const b = bar.getBBox();
    const x = Math.round(b.x);
    const col = columns.get(x) ?? { bars: [], base: 0 };
    col.bars.push(bar);
    col.base = Math.max(col.base, b.y + b.height);
    columns.set(x, col);
  }
  [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([, col], i) => {
      for (const bar of col.bars) {
        bar.style.transformBox = 'view-box';
        bar.style.transformOrigin = `0 ${col.base}px`;
        bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
          duration: BAR_MS,
          delay: delay + i * BAR_STAGGER,
          easing: EASE,
          fill: 'backwards',
          id: GROW_ID,
        });
      }
    });
  return true;
}

function growDistribution(root: ParentNode, delay: number) {
  root.querySelectorAll<HTMLElement>('[data-testid="distribution"] [data-testid="share-bar"]').forEach((bar, i) => {
    bar.style.transformOrigin = 'left center';
    bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: BAR_MS,
      delay: delay + i * BAR_STAGGER,
      easing: EASE,
      fill: 'backwards',
      id: GROW_ID,
    });
  });
}

/** Starts the growth `delay` ms from now (when the cards have arrived). */
export function growBars(delay: number, root: ParentNode = document) {
  if (reducedMotion()) return;
  const start = performance.now();
  growDistribution(root, delay);
  // the chart may render its bars a frame after the screen: wait for them, keep the same end time
  let frames = 0;
  const tryForecast = () => {
    const left = Math.max(0, delay - (performance.now() - start));
    if (!growForecast(root, left) && frames++ < 30) requestAnimationFrame(tryForecast);
  };
  tryForecast();
}
