// Lade-Animation: the splash at app start (markup in index.html, styles in index.css) and the
// entrance of every screen (tab change, first screen after the splash).
//
// Both only animate opacity and transform with fill „backwards“: when they end nothing is left on
// the elements (no transform that would become a containing block for fixed children). With
// „Bewegung reduzieren“ the splash only fades and the screens appear without motion.

/** The splash stays at least this long after navigation start, so its intro plays once. */
export const SPLASH_MIN_MS = 700;
const SPLASH_FADE_MS = 260;
/** Web Animations created here carry this id (tests wait for them). */
export const ENTRANCE_ID = 'entrance';

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let started = false;
let markFading: () => void = () => {};
/** Resolves when the splash starts to fade (at once if there is none). */
const fading = new Promise<void>((resolve) => (markFading = resolve));

/** Fades the splash out (once): not before SPLASH_MIN_MS, removed when the fade has ended. */
export function hideSplash(): Promise<void> {
  if (started) return fading;
  started = true;
  const splash = document.getElementById('splash');
  if (!splash) {
    markFading();
    return fading;
  }
  const reduced = reducedMotion();
  window.setTimeout(
    () => {
      splash.classList.add('splash-out');
      markFading();
      window.setTimeout(() => splash.remove(), (reduced ? 120 : SPLASH_FADE_MS) + 40);
    },
    reduced ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now()),
  );
  return fading;
}

/** Resolves when the splash has started to fade. */
export function splashFading(): Promise<void> {
  if (!document.getElementById('splash')) markFading();
  return fading;
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Screen entrance: the screen fades in, its cards (glass surfaces in view, at most 10) rise by
 * 14 px one after another. Runs after the splash has started to fade.
 */
export async function playEntrance(main: HTMLElement, name: string) {
  await splashFading();
  // marks which screen has come in (tests wait for it before measuring)
  main.dataset.screen = name;
  if (reducedMotion()) return;
  const screen = main.firstElementChild as HTMLElement | null;
  if (!screen) return;
  screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'backwards', id: ENTRANCE_ID });
  const fold = window.innerHeight;
  const cards = [...screen.querySelectorAll<HTMLElement>('.glass')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top < fold && r.bottom > 0 && !el.parentElement?.closest('.glass');
    })
    .slice(0, 10);
  cards.forEach((el, i) =>
    el.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 420, delay: 40 + i * 45, easing: EASE, fill: 'backwards', id: ENTRANCE_ID },
    ),
  );
}
