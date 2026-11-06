// Lade-Animation: the splash at app start (markup, layout and motion inline in index.html) and the
// entrance of every screen (tab change, first screen after the splash).
//
// Both only animate opacity and transform with fill „backwards“: when they end nothing is left on
// the elements (no transform that would become a containing block for fixed children). With
// „Bewegung reduzieren“ the splash and the screens only fade.

import { testFlag } from './importTrace';

/** Web Animations created here carry this id (tests wait for them). */
export const ENTRANCE_ID = 'entrance';

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let started = false;
let markFading: () => void = () => {};
/** Resolves when the splash starts to fade (at once if there is none). */
const fading = new Promise<void>((resolve) => (markFading = resolve));
let markRemoved: () => void = () => {};
/** Resolves when the splash is gone from the DOM (at once if there is none). */
const removed = new Promise<void>((resolve) => (markRemoved = resolve));

/** The splash is gone: what it covered may blur now ([data-splash] in index.html, index.css). */
function splashGone() {
  document.getElementById('splash')?.remove();
  // counter-check of e2e/splash-blur.spec.ts (test build only): the blur comes back late
  if (testFlag('lateBlur')) window.setTimeout(() => delete document.documentElement.dataset.splash, 15_000);
  else delete document.documentElement.dataset.splash;
  markRemoved();
}

/** Exit of the splash: logo and background fade together (inline CSS of index.html, .splash-out). */
export const SPLASH_OUT_MS = 200;

/**
 * Takes the splash out (once), as soon as the app is ready: the whole start screen – background and
 * the one logo – fades in 200 ms (also with „Bewegung reduzieren“), then it is removed. Nothing is
 * restarted or moved: the logo's motion runs in the inline CSS from the first paint.
 */
export function hideSplash(): Promise<void> {
  if (started) return fading;
  started = true;
  const splash = document.getElementById('splash');
  if (!splash) {
    splashGone();
    markFading();
    return fading;
  }
  splash.classList.add('splash-out');
  markFading();
  window.setTimeout(splashGone, SPLASH_OUT_MS + 30);
  return fading;
}

/** Resolves when the splash has started to fade. */
export function splashFading(): Promise<void> {
  if (!document.getElementById('splash')) markFading();
  return fading;
}

/**
 * Resolves when the splash is completely gone. Whatever blurs (the setup dialog) only appears then:
 * never an opacity transition over a surface with a backdrop-filter.
 */
export function splashRemoved(): Promise<void> {
  if (!document.getElementById('splash')) splashGone();
  return removed;
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** What rises in the entrance: glass cards and the Luxe surfaces. */
const CARD_SELECTOR = '.glass, .surface';
/** The screen's own fade-in. */
const SCREEN_FADE_MS = 150;
/** Card entrance: 280 ms, the first at once, each further card 20 ms later, at most 10 cards (Luxe 2: quicker tab switch). */
export const CARD_MS = 280;
const CARD_DELAY = 0;
const CARD_STAGGER = 20;
const MAX_CARDS = 10;
/** „Bewegung reduzieren“: the screen only fades in. */
export const REDUCED_FADE_MS = 120;

/**
 * THE screen entrance – the one of the Monat screen, used by every tab (src/components/Screen.tsx):
 * the screen fades in (150 ms), its cards (glass surfaces in view, at most 10, top to bottom) rise by
 * 14 px one after another (280 ms each, 20 ms apart). Runs after the splash has started to fade.
 * Resolves with the time (ms from now) when the last card has arrived, so a screen can follow up
 * (Analyse: the bars grow). „Bewegung reduzieren“: only a fade (120 ms), resolves with 0.
 */
export async function playEntrance(main: HTMLElement, name: string, screen = main.firstElementChild as HTMLElement | null): Promise<number> {
  await splashFading();
  // marks which screen has come in (tests wait for it before measuring)
  main.dataset.screen = name;
  if (!screen) return 0;
  // „Bewegung reduzieren“: only a fade (also on a tab switch), no cards rising
  if (reducedMotion()) {
    screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: 'ease-out', fill: 'backwards', id: ENTRANCE_ID });
    return 0;
  }
  screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SCREEN_FADE_MS, easing: 'ease-out', fill: 'backwards', id: ENTRANCE_ID });
  const fold = window.innerHeight;
  // glass cards and the Luxe surfaces (hero, tiles, cards: .surface)
  const cards = [...screen.querySelectorAll<HTMLElement>(CARD_SELECTOR)]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top < fold && r.bottom > 0 && !el.parentElement?.closest(CARD_SELECTOR);
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
  return cards.length ? CARD_DELAY + (cards.length - 1) * CARD_STAGGER + CARD_MS : SCREEN_FADE_MS;
}
