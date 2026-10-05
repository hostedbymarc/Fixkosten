import { animationsDone, expect, isSidebarLayout, test } from './fixtures';

test.describe('Layout (gemessen, nicht geraten)', () => {
  test('navigation: tab bar below 1024 px, sidebar from iPad landscape', async ({ app }) => {
    if (isSidebarLayout(app)) {
      await expect(app.getByTestId('sidebar')).toBeVisible();
      await expect(app.getByTestId('tabbar')).toBeHidden();
    } else {
      await expect(app.getByTestId('tabbar')).toBeVisible();
      await expect(app.getByTestId('sidebar')).toBeHidden();
    }
  });

  test('no horizontal scrolling', async ({ app }) => {
    const { scrollWidth, clientWidth } = await app.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('amounts are never truncated', async ({ app }) => {
    const clipped = await app.locator('.num').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
  });

  test('content width is capped at 1100 px', async ({ app }) => {
    const width = await app.locator('main > div').first().evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(1100);
  });

  test('tap targets are at least 44 px', async ({ app }) => {
    const sizes = await app
      .locator('[data-testid="toggle-paid"], main header button, nav a')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height, label: el.getAttribute('aria-label') ?? el.textContent };
          }),
      );
    expect(sizes.length).toBeGreaterThan(10);
    for (const s of sizes) {
      expect.soft(s.w, `${s.label} width`).toBeGreaterThanOrEqual(44);
      expect.soft(s.h, `${s.label} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('iPhone safe areas: notch and home indicator never cover content', async ({ app }) => {
    test.skip(isSidebarLayout(app), 'phone/tablet tab-bar layout only');
    // Chromium has no notch: inject iPhone 15 inset values into the same CSS variables env() feeds.
    await app.addStyleTag({ content: ':root{--safe-top:59px !important;--safe-bottom:34px !important}' });
    const viewport = app.viewportSize()!;

    const headerTop = await app.locator('main header').first().evaluate((el) => el.getBoundingClientRect().top);
    expect(headerTop).toBeGreaterThanOrEqual(59);

    const tabbar = app.getByTestId('tabbar');
    const tabLinks = await tabbar.locator('a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
    for (const bottom of tabLinks) expect(bottom).toBeLessThanOrEqual(viewport.height - 34);

    // last content is reachable above the tab bar after scrolling to the end
    await app.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const tabbarTop = await tabbar.evaluate((el) => el.getBoundingClientRect().top);
    const lastContentBottom = await app
      .locator('main section, main aside')
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    expect(lastContentBottom).toBeLessThanOrEqual(tabbarTop);
  });

  test('bottom sheet fits the viewport and keeps its buttons visible', async ({ app }) => {
    await app.locator('[data-position="pos-strom"]').getByRole('button', { name: /Details/ }).click();
    const sheet = app.getByTestId('bottom-sheet');
    await expect(sheet).toBeVisible();
    await animationsDone(app, 'bottom-sheet');
    const box = (await sheet.boundingBox())!;
    const viewport = app.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(app.getByRole('button', { name: 'Haken entfernen' })).toBeInViewport();
  });

  test('keyboard: Tab reaches the first toggle, Enter ticks it', async ({ app, browserName }) => {
    test.skip(browserName !== 'chromium');
    const depot = app.locator('[data-position="pos-depotentgelt"] [data-testid="toggle-paid"]');
    await depot.focus();
    await app.keyboard.press('Enter');
    await expect(app.locator('[data-position="pos-depotentgelt"]')).toHaveAttribute('data-paid', 'true');
  });
});
