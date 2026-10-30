// Tabwechsel: the new screen comes in 12 px from the side of its tab and fades in, the old one
// fades out (280 ms ease-out; „Bewegung reduzieren“: only the fade, 120 ms). Tab bar, sidebar and the
// background do not take part. Same-document View Transitions where the browser has them, otherwise
// the same keyframes on the elements themselves: the old screen as a frozen copy that fades out above
// the new one. Keyframes and timing: src/index.css („Tabwechsel“).

import { routeIndex, type Route } from './routes';

type StartViewTransition = (update: () => Promise<void>) => { finished: Promise<void> };

/**
 * Plays the switch from → to. `apply` renders the new tab and restores its scroll position; it
 * resolves once the new tab is committed (React renders it in slices meanwhile, the transition waits
 * with the old picture – no long task in the frame that captures it).
 */
export function switchTab(from: Route, to: Route, apply: () => Promise<void>) {
  const root = document.documentElement;
  root.dataset.tabDir = routeIndex(to) > routeIndex(from) ? 'right' : 'left';
  // the new screen's entrance leaves its fade to this transition
  root.dataset.tabSwitching = '';
  window.setTimeout(() => delete root.dataset.tabSwitching, 600);
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition?.bind(document);
  const oldScroll = window.scrollY;
  const done = () => {
    delete root.dataset.tabSwitch;
    root.style.removeProperty('--tab-old-shift');
  };
  if (start) {
    root.dataset.tabSwitch = '';
    const t = start(async () => {
      await apply();
      // the old screen keeps its place on screen although the new tab has its own scroll position
      root.style.setProperty('--tab-old-shift', `${window.scrollY - oldScroll}px`);
    });
    void t.finished.finally(done);
    return;
  }
  // fallback: a frozen copy of the old screen fades out, the new screen comes in
  const main = document.querySelector('main');
  const old = main?.firstElementChild as HTMLElement | null;
  let ghost: HTMLElement | null = null;
  if (old) {
    const r = old.getBoundingClientRect();
    ghost = old.cloneNode(true) as HTMLElement;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.removeAttribute('data-testid');
    ghost.querySelectorAll('[data-testid]').forEach((n) => n.removeAttribute('data-testid'));
    Object.assign(ghost.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, margin: '0', pointerEvents: 'none', zIndex: '1' });
    ghost.classList.add('tab-anim-out');
    ghost.dataset.tabGhost = '';
    document.body.appendChild(ghost);
  }
  void apply().then(() => {
    const fresh = main?.firstElementChild as HTMLElement | null;
    fresh?.classList.add('tab-anim-in');
    const finish = () => {
      ghost?.remove();
      fresh?.classList.remove('tab-anim-in');
      done();
    };
    const anim = fresh?.getAnimations().find((a) => (a as CSSAnimation).animationName === 'tab-in');
    if (anim) void anim.finished.then(finish, finish);
    else window.setTimeout(finish, 300);
  });
}
