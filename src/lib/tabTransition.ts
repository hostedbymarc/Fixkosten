// Tabwechsel: the old screen only fades out (TAB_OUT_MS, no motion), then the new tab is shown and
// comes in with THE entrance of the start screen – its Screen (src/components/Screen.tsx) plays
// src/lib/entrance.ts: the screen fades in, its cards rise from below one after another. No keyframes
// of its own here. Tab bar, sidebar and the background do not take part.
// „Bewegung reduzieren“: the same fade out, the new screen only fades in (entrance.ts).

export const TAB_OUT_MS = 120;
/** The fade out carries this id (tests look for it). */
export const TAB_OUT_ID = 'tab-out';

let generation = 0;

/**
 * Fades the shown screen out, then `apply` shows the new tab and restores its scroll position (it
 * resolves once the new tab is committed). A newer switch during the fade takes over: only the last
 * one is applied.
 */
export function switchTab(apply: () => Promise<void>) {
  const gen = ++generation;
  const old = document.querySelector<HTMLElement>('main > [data-screen-root]:not([data-tab-hidden])');
  const fade =
    old?.getAnimations().find((a) => a.id === TAB_OUT_ID) ??
    old?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TAB_OUT_MS, easing: 'ease-out', fill: 'forwards', id: TAB_OUT_ID });
  const proceed = () => {
    if (gen !== generation) return;
    // the old screen is hidden now: nothing of the fade stays on it
    void apply().then(() => fade?.cancel());
  };
  if (fade) void fade.finished.then(proceed, proceed);
  else proceed();
}
