import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** Seed state is October 2026; freeze "today" to 05.10.2026. */
export const TODAY = new Date('2026-10-05T10:00:00+02:00');
export const FIXTURE = 'tests/fixtures/seed.json';

/**
 * Lade-Animation over: the splash is gone and the entrance of the current screen has finished
 * (a lazy screen first replaces its skeleton). Nothing is moving or fading any more afterwards.
 */
export async function appSettled(page: Page) {
  await expect(page.locator('#splash')).toHaveCount(0);
  // the current screen has come in (a lazy screen only after its skeleton)
  const [route, supported] = await page.evaluate(() => [location.hash.replace(/^#\/?/, '') || 'monat', document.documentElement.hasAttribute('data-entrance')] as const);
  if (supported) await expect(page.locator(`main[data-screen="${route}"]`)).toHaveCount(1);
  await expect(page.locator('main [data-testid="skeleton"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            void Promise.all(
              document
                .getAnimations()
                .filter((a) => a.id === 'entrance')
                .map((a) => a.finished),
            )
              // Analyse: the bars grow once the cards have arrived
              .then(() => Promise.all(document.getAnimations().filter((a) => a.id === 'bar-grow').map((a) => a.finished)))
              .then(() => resolve()),
          ),
        ),
      ),
  );
}

/**
 * „heute“ moves on (local clock) and the app is opened again: it shows that month. Used where a month
 * has to be over, e.g. for the banner „Offen aus …“ (only months before today).
 */
export async function setToday(page: Page, date: Date) {
  await page.clock.setFixedTime(date);
  await page.reload();
  await appSettled(page);
  await expandAll(page);
}

/**
 * Opens every collapsed category of the shown month (fully paid ones start collapsed). Tests that
 * work with single rows call it; collapse by status itself is tested in aktiver-monat.spec.ts.
 */
export async function expandAll(page: Page) {
  // the shown tab only (tabs visited before stay in main, hidden)
  const collapsed = page.locator('main > :not([data-tab-hidden]) [data-testid="category-group"][data-collapsed="true"] [data-testid="group-toggle"]');
  // one card per attempt; a click lost during the entrance animation is simply repeated
  await expect(async () => {
    if ((await collapsed.count()) > 0) await collapsed.first().click({ timeout: 2000 });
    await expect(collapsed).toHaveCount(0, { timeout: 500 });
  }).toPass({ intervals: [100, 250], timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  // leave no hover behind (it would show up in later screenshots)
  await page.mouse.move(0, 0);
}

/** 05.11.2026: October is over. */
export const NOV_5 = new Date('2026-11-05T10:00:00+01:00');

/** First start on an empty database → import the fixture through the setup dialog. */
export async function importFixture(page: Page) {
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
}

export const test = base.extend<{ app: Page; fresh: Page }>({
  /** App with the fixture imported (October 2026). */
  app: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await importFixture(page);
    await expandAll(page);
    await use(page);
  },
  /** App on an empty database, before any setup. */
  fresh: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await expect(page.locator('#splash')).toHaveCount(0);
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

/** Outside the tabs visited before (they stay in main, hidden); sheets and toasts sit outside main and count. */
export const SHOWN = ':not([data-tab-hidden] *)';

/** Narrows a page-wide locator to what the shown tab (plus sheets, toasts, navigation) contains. */
export function shown(locator: Locator): Locator {
  return locator.and(locator.page().locator(SHOWN));
}

export function row(page: Page, positionId: string) {
  return page.locator(`[data-position="${positionId}"]${SHOWN}`);
}

/** Resolves once all CSS animations inside the element have finished. */
export async function animationsDone(page: Page, testId: string) {
  await page
    .getByTestId(testId)
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

export async function goTo(page: Page, route: 'monat' | 'positionen' | 'analyse' | 'einstellungen') {
  await page.goto(`/#/${route}`);
  await appSettled(page);
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
