// Lade-Animation: the splash at app start (markup in index.html, styles in index.css) and the
// entrance of every screen (tab change, first screen after the splash).
//
// Both only animate opacity and transform with fill „backwards“: when they end nothing is left on
// the elements (no transform that would become a containing block for fixed children). With
// „Bewegung reduzieren“ the splash and the screens only fade.

import { testFlag } from './importTrace';

/** The splash only shows when loading takes longer than this (index.css: splash-show delay). */
export const SPLASH_SHOW_AFTER_MS = 300;
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

/** Exit of the splash: FLIP into the header logo, or zoom-out with fade, or (reduced motion) a fade. */
export const SPLASH_FLIP_MS = 360;
export const SPLASH_ZOOM_MS = 240;
export const SPLASH_FADE_MS = 180;

/** The logo the peas fly into: visible, in the viewport, not in a hidden tab (desktop: the sidebar). */
function headerLogo(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('#root [data-testid="logo"]')) {
    if (el.closest('[data-tab-hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 20 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

/**
 * Takes the splash out (once), as soon as the app is ready. A splash that never became visible (the
 * load took less than 300 ms) is removed at once. Otherwise: the three peas fly into the header logo
 * (FLIP, 360 ms) while the background fades; without a visible logo they zoom out and fade (240 ms);
 * „Bewegung reduzieren“: only a fade (180 ms). Removed when that has ended.
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
  // never shown (faster than 300 ms): nothing to animate, nothing may flash
  if (parseFloat(getComputedStyle(splash).opacity) < 0.02) {
    splashGone();
    markFading();
    return fading;
  }
  const stage = splash.querySelector<HTMLElement>('.splash-stage');
  const logo = reducedMotion() ? null : headerLogo();
  let ms = SPLASH_FADE_MS;
  if (stage && reducedMotion()) {
    stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SPLASH_FADE_MS, easing: 'ease-out', fill: 'forwards' });
  } else if (stage && logo) {
    ms = SPLASH_FLIP_MS;
    const from = stage.getBoundingClientRect();
    const to = logo.getBoundingClientRect();
    // the peas span 60 % of the logo's width and ~86 % of the stage's
    const scale = (to.width * 0.6) / (from.width * 0.86);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    stage.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1, offset: 0.8 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
      ],
      { duration: SPLASH_FLIP_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' },
    );
  } else if (stage) {
    ms = SPLASH_ZOOM_MS;
    stage.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.6)', opacity: 0 },
      ],
      { duration: SPLASH_ZOOM_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
  }
  splash.style.setProperty('--splash-out-ms', `${ms}ms`);
  splash.classList.add('splash-out');
  markFading();
  window.setTimeout(splashGone, ms + 30);
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
/** Card entrance: 420 ms, the first after 40 ms, each further card 45 ms later, at most 10 cards. */
export const CARD_MS = 420;
const CARD_DELAY = 40;
const CARD_STAGGER = 45;
const MAX_CARDS = 10;
/** „Bewegung reduzieren“: the screen only fades in. */
export const REDUCED_FADE_MS = 120;

/**
 * THE screen entrance – the one of the Monat screen, used by every tab (src/components/Screen.tsx):
 * the screen fades in (220 ms), its cards (glass surfaces in view, at most 10, top to bottom) rise by
 * 14 px one after another (420 ms each, 45 ms apart). Runs after the splash has started to fade.
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
  screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'backwards', id: ENTRANCE_ID });
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
  return cards.length ? CARD_DELAY + (cards.length - 1) * CARD_STAGGER + CARD_MS : 220;
}
