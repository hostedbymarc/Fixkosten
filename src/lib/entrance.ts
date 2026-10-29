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
/** Card entrance: 420 ms, the first after 40 ms, each further card 45 ms later, at most 10 cards. */
export const CARD_MS = 420;
const CARD_DELAY = 40;
const CARD_STAGGER = 45;
const MAX_CARDS = 10;

/**
 * THE screen entrance – the one of the Monat screen, used by every tab (src/components/Screen.tsx):
 * the screen fades in (220 ms), its cards (glass surfaces in view, at most 10, top to bottom) rise by
 * 14 px one after another (420 ms each, 45 ms apart). Runs after the splash has started to fade.
 * Resolves with the time (ms from now) when the last card has arrived, so a screen can follow up
 * (Analyse: the bars grow). „Bewegung reduzieren“: no motion, resolves with 0.
 */
export async function playEntrance(main: HTMLElement, name: string, screen = main.firstElementChild as HTMLElement | null): Promise<number> {
  await splashFading();
  // marks which screen has come in (tests wait for it before measuring)
  main.dataset.screen = name;
  if (reducedMotion() || !screen) return 0;
  // the screen fades in – unless a tab transition already fades it in (src/lib/tabTransition.ts)
  if (!document.documentElement.hasAttribute('data-tab-switching')) {
    screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'backwards', id: ENTRANCE_ID });
  }
  const fold = window.innerHeight;
  const cards = [...screen.querySelectorAll<HTMLElement>('.glass')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top < fold && r.bottom > 0 && !el.parentElement?.closest('.glass');
    })
    .slice(0, MAX_CARDS);
  // no blur while a card moves in (it fades up from nothing anyway): each gets it back when it rests
  const settle = (el: HTMLElement, a: Animation) => {
    el.dataset.entering = '';
    const done = () => delete el.dataset.entering;
    a.finished.then(done, done);
  };
  cards.forEach((el, i) =>
    settle(
      el,
      el.animate(
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: CARD_MS, delay: CARD_DELAY + i * CARD_STAGGER, easing: EASE, fill: 'backwards', id: ENTRANCE_ID },
      ),
    ),
  );
  // a tile group's shared blur layer fades in with its first tile (it does not move: the mask keeps the tiles' place)
  for (const layer of screen.querySelectorAll<HTMLElement>('.glass-group-blur')) {
    const first = cards.findIndex((c) => layer.parentElement?.contains(c));
    if (first < 0) continue;
    settle(
      layer,
      layer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: CARD_MS,
        delay: CARD_DELAY + first * CARD_STAGGER,
        easing: EASE,
        fill: 'backwards',
        id: ENTRANCE_ID,
      }),
    );
  }
  return cards.length ? CARD_DELAY + (cards.length - 1) * CARD_STAGGER + CARD_MS : 220;
}
