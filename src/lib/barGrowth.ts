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

/**
 * Forecast bars still without their growth get it, timed against `start` (performance.now() of the
 * first column's start): bars that Recharts draws anew later (it measures its box, a scrollbar
 * appears) join in sync – a negative delay starts them part-way.
 */
function growForecast(root: ParentNode, start: number): boolean {
  // only once the chart has its final width: Recharts first draws at its initial size and then
  // draws the bars anew (new elements) when it has measured its box
  const container = root.querySelector<HTMLElement>('[data-testid="forecast"] .recharts-responsive-container');
  const svg = container?.querySelector<SVGSVGElement>('svg.recharts-surface');
  const box = container?.getBoundingClientRect();
  if (!svg || !box || Math.abs(svg.getBoundingClientRect().width - box.width) > 1) return false;
  const bars = [...root.querySelectorAll<SVGGraphicsElement>('[data-testid="forecast"] .recharts-bar-rectangle path')];
  if (!bars.length) return false;
  if (bars.every((b) => 'grow' in b.dataset)) return true;
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
  const now = performance.now();
  [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([, col], i) => {
      for (const bar of col.bars) {
        if ('grow' in bar.dataset) continue;
        bar.dataset.grow = '';
        bar.style.transformBox = 'view-box';
        bar.style.transformOrigin = `0 ${col.base}px`;
        bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
          duration: BAR_MS,
          delay: start - now + i * BAR_STAGGER,
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
  // a tab kept from an earlier visit: its bars grow again
  root.querySelectorAll<SVGGraphicsElement>('[data-testid="forecast"] .recharts-bar-rectangle path').forEach((b) => delete b.dataset.grow);
  const start = performance.now() + delay;
  growDistribution(root, delay);
  // the chart mounts a few frames after the screen (src/components/analysis/DeferredChart.tsx) and
  // may draw its bars anew once more: look every frame until the growth is over (at most 3 s)
  const end = start + 12 * BAR_STAGGER + BAR_MS;
  const watch = () => {
    growForecast(root, start);
    if (performance.now() < Math.max(end, start + 3000 - delay)) requestAnimationFrame(watch);
  };
  watch();
}
