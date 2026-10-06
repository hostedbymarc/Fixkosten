import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/** Measures the current page: horizontal overflow, clipped text, small tap targets. */
export async function measure(page: Page, scope = 'body') {
  return page.locator(scope).first().evaluate((root) => {
    const doc = document.documentElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]');
    };
    const clipped = Array.from(root.querySelectorAll('.num, h1, h2, h3, label, button'))
      .filter((el) => visible(el) && !el.classList.contains('truncate') && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.trim());
    const small = Array.from(root.querySelectorAll('button, a, select, input:not([type="radio"]):not([type="file"]), textarea'))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${el.getAttribute('aria-label') ?? el.textContent?.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`);
    return { overflow: doc.scrollWidth - doc.clientWidth, clipped, small };
  });
}

export async function expectClean(page: Page, scope?: string) {
  const m = await measure(page, scope);
  expect(m.overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  expect(m.clipped, 'clipped text').toEqual([]);
  expect(m.small, 'tap targets < 44 px').toEqual([]);
}

