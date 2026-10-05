import { test as base, expect, type Page } from '@playwright/test';

/** Seed state is October 2026; freeze "today" to 05.10.2026. */
export const TODAY = new Date('2026-10-05T10:00:00+02:00');
export const FIXTURE = 'tests/fixtures/seed.json';

/** First start on an empty database → import the fixture through the setup dialog. */
export async function importFixture(page: Page) {
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
}

export const test = base.extend<{ app: Page; fresh: Page }>({
  /** App with the fixture imported (October 2026). */
  app: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await importFixture(page);
    await use(page);
  },
  /** App on an empty database, before any setup. */
  fresh: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
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

export async function goTo(page: Page, route: 'monat' | 'positionen' | 'analyse' | 'einstellungen') {
  await page.goto(`/#/${route}`);
}

/** Touch swipe made of real PointerEvents (Chromium has no native touch-move API in Playwright). */
export async function touchSwipe(page: Page, target: ReturnType<Page['locator']>, dx: number, dy = 0) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width * 0.8;
  const y = box.y + box.height / 2;
  const base = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0 };
  await target.dispatchEvent('pointerdown', { ...base, clientX: x, clientY: y, buttons: 1 });
  for (let i = 1; i <= 10; i++) {
    await target.dispatchEvent('pointermove', { ...base, clientX: x + (dx * i) / 10, clientY: y + (dy * i) / 10, buttons: 1 });
  }
  await target.dispatchEvent('pointerup', { ...base, clientX: x + dx, clientY: y + dy, buttons: 0 });
  await page.waitForTimeout(250); // settle animation
}

/** Touch projects (iPhone, iPad) archive by swiping; desktop uses the ⋯ menu. */
export function isTouchProject(): boolean {
  return base.info().project.name !== 'desktop';
}
