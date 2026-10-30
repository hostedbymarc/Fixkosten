import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react';

// The Recharts charts of the Analyse tab mount one after another, each in its own task after a
// frame, inside their fixed-height boxes: opening the tab never blocks the main thread for long
// (the tab transition and the entrance stay smooth) and nothing moves when a chart appears.

const queue: (() => void)[] = [];
let pumping = false;

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    next();
    requestAnimationFrame(() => window.setTimeout(step, 0));
  };
  requestAnimationFrame(() => window.setTimeout(step, 0));
}

export function DeferredChart({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    // a transition: React renders the chart in slices of a few ms instead of one long task
    queue.push(() => live && startTransition(() => setReady(true)));
    pump();
    return () => {
      live = false;
    };
  }, []);
  return ready ? <>{children}</> : null;
}
