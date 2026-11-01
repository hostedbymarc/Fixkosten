import type { Page } from '@playwright/test';
import { appSettled, expect } from './fixtures';

/** Measures the current page: horizontal overflow, clipped text, small tap targets. */
export async function measure(page: Page, scope = 'body', relayout = false) {
  return page.locator(scope).first().evaluate((root, relayout) => {
    const doc = document.documentElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]');
    };
    const over = (el: Element) => el.scrollWidth > el.clientWidth + 1;
    const candidates = Array.from(root.querySelectorAll('.num, h1, h2, h3, label, button')).filter((el) => visible(el) && !el.classList.contains('truncate'));
    if (relayout) {
      // WebKit (also with the build of main 6e618fd) now and then keeps a stale grid track after a
      // figure changed: lay the container out once more, then measure – what stays clipped is real
      for (const el of candidates.filter(over)) {
        const box = el.parentElement as HTMLElement;
        const display = box.style.display;
        box.style.display = 'none';
        void box.offsetWidth;
        box.style.display = display;
        void box.offsetWidth;
      }
    }
    const clipped = candidates
      .filter(over)
      .map((el) => el.textContent?.trim());
    const small = Array.from(root.querySelectorAll('button, a, select, input:not([type="radio"]):not([type="file"]), textarea'))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${el.getAttribute('aria-label') ?? el.textContent?.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`);
    return { overflow: doc.scrollWidth - doc.clientWidth, clipped, small };
  }, relayout);
}

export async function expectClean(page: Page, scope?: string) {
  // measured on a page at rest: mid-entrance a transformed box can read 43.99 px instead of 44
  await appSettled(page);
  // a lasting state, not one frame; in WebKit with a fresh layout of what reads as clipped (see measure)
  await expect(async () => {
    const m = await measure(page, scope, page.context().browser()?.browserType().name() === 'webkit');
    expect(m.overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
    expect(m.clipped, 'clipped text').toEqual([]);
    expect(m.small, 'tap targets < 44 px').toEqual([]);
  }).toPass({ timeout: 3000, intervals: [100, 250, 500] });
}

