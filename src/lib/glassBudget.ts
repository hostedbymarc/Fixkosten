// Blur-Budget: at most MAX_BLUR surfaces with a backdrop-filter per screen, at every scroll position.
//
// The chrome (.glass-strong: sheets, dialogs, menus, toasts; .glass-clear: tab bar, sidebar) always
// blurs. Cards (.glass) and tile groups (.glass-group-blur) get [data-blur] from this module: the
// ones in the viewport first (top to bottom), then the ones just above or below it, until the
// budget is spent. Cards far outside the viewport carry no blur – nobody can see the difference,
// and Safari does not have to keep dozens of backdrop layers. Surfaces inside another surface never
// blur (index.css), and cards inside a tile group are blurred by the group's single layer.

export const MAX_BLUR = 8;

const CHROME = '.glass-strong, .glass-clear';
const CARDS = '.glass, .glass-group-blur';
const SURFACE = '.glass, .glass-strong, .glass-clear';

function rendered(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

/** Surfaces that may blur at all: not nested in another surface, not a tile inside a group. */
function eligible(el: Element): boolean {
  if (el.parentElement?.closest(SURFACE)) return false;
  if (el.classList.contains('glass') && el.closest('.glass-group')) return false;
  return true;
}

/** One pass: grants [data-blur] to the cards that are visible (then near), within the budget. */
export function updateGlassBudget(root: ParentNode = document) {
  const vh = window.innerHeight;
  const chrome = [...root.querySelectorAll(CHROME)].filter((el) => eligible(el) && rendered(el)).length;
  const ranked = [...root.querySelectorAll(CARDS)]
    .filter(eligible)
    .map((el) => ({ el, r: rendered(el) }))
    .filter((c): c is { el: Element; r: DOMRect } => c.r !== null)
    .map(({ el, r }) => {
      const visible = r.bottom > 0 && r.top < vh;
      // distance to the viewport, for the ones just outside (half a screen above or below)
      const distance = visible ? 0 : r.top >= vh ? r.top - vh : -r.bottom;
      return { el, visible, distance, top: r.top };
    })
    .filter((c) => c.visible || c.distance <= vh / 2)
    .sort((a, b) => Number(b.visible) - Number(a.visible) || (a.visible ? a.top - b.top : a.distance - b.distance));
  const granted = new Set(ranked.slice(0, Math.max(0, MAX_BLUR - chrome)).map((c) => c.el));
  for (const el of root.querySelectorAll(CARDS)) {
    const has = el.hasAttribute('data-blur');
    if (granted.has(el) && !has) el.setAttribute('data-blur', '');
    else if (!granted.has(el) && has) el.removeAttribute('data-blur');
  }
}

/** Keeps the budget up to date while the app runs (scroll, resize, new surfaces). Returns a stop function. */
export function startGlassBudget(root: HTMLElement = document.body): () => void {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateGlassBudget(root);
    });
  };
  // only surfaces appearing or disappearing matter, not the attribute this module writes
  const observer = new MutationObserver((records) => {
    if (records.some((r) => r.type === 'childList')) schedule();
  });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}
