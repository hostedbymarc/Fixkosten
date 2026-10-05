import { test as base, expect, type Page } from '@playwright/test';

/** Seed state is October 2026; freeze "today" to 05.10.2026. */
export const TODAY = new Date('2026-10-05T10:00:00+02:00');

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await expect(page.getByTestId('hero')).toBeVisible();
    await use(page);
  },
});

export { expect };

/** Normalises Intl's no-break spaces for text assertions. */
export function eur(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0]'));
}

export function isSidebarLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

export function row(page: Page, positionId: string) {
  return page.locator(`[data-position="${positionId}"]`);
}

/** Resolves once all CSS animations inside the element have finished. */
export async function animationsDone(page: Page, testId: string) {
  await page
    .getByTestId(testId)
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}
