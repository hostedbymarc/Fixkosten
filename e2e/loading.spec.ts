import type { Page } from '@playwright/test';
import { appSettled, expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

// Lade-Animation: splash at app start (index.html + src/lib/entrance.ts) and the entrance of every
// tab. Finite, only opacity/transform, nothing left on the elements afterwards, no input blocked.

const TABS = ['Positionen', 'Analyse', 'Einstellungen', 'Monat'] as const;

/** Records when the splash leaves the DOM (ms since navigation start). */
async function watchSplash(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      if (document.readyState !== 'loading' && !document.getElementById('splash')) {
        (window as unknown as { splashGoneAt: number }).splashGoneAt = performance.now();
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const entrance = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.id === 'entrance')
      .map((a) => {
        const t = a.effect!.getComputedTiming();
        return { end: Number(t.endTime), iterations: t.iterations, target: (a.effect as KeyframeEffect).target?.tagName ?? '' };
      }),
  );

test.describe('Lade-Animation', () => {
  test('Start: Splash mit den drei Erbsen, sofort sichtbar, endlich, blockiert nichts, nach ≥ 700 ms weg', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await watchSplash(page);
    await page.reload({ waitUntil: 'commit' });
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute('aria-hidden', 'true');
    await expect(splash.locator('svg circle')).toHaveCount(3);
    await expect(splash.locator('rect')).toHaveCount(0);
    await expect(splash).toHaveText('');
    const info = await splash.evaluate((el) => ({
      pointer: getComputedStyle(el).pointerEvents,
      infinite: el.getAnimations({ subtree: true }).filter((a) => a.effect!.getComputedTiming().iterations === Infinity).length,
      animated: el.getAnimations({ subtree: true }).filter((a) => (a as CSSAnimation).animationName === 'splash-pea').length,
    }));
    expect(info.pointer).toBe('none');
    expect(info.infinite, 'no endless animation in the splash').toBe(0);
    expect(info.animated, 'the 3 peas animate').toBe(3);
    await expect(splash).toHaveCount(0, { timeout: 3000 });
    const gone = await page.evaluate(() => (window as unknown as { splashGoneAt: number }).splashGoneAt);
    expect(gone, 'shown at least 700 ms').toBeGreaterThanOrEqual(700);
    await expect(page.getByTestId('hero')).toBeVisible();
  });

  test('erster Start (leere Datenbank): Splash, dann der Einrichtungs-Dialog', async ({ page }) => {
    await page.clock.setFixedTime(OKT_TODAY);
    await page.goto('/');
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByTestId('setup-dialog')).toBeVisible();
  });

  test('jeder Tab kommt herein: Screen blendet ein, Karten steigen gestaffelt auf, danach bleibt nichts zurück', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    for (const tab of TABS) {
      await page.getByRole('link', { name: tab }).first().click();
      await expect(page.locator('main [data-testid="loader"]')).toHaveCount(0);
      await expect.poll(async () => (await entrance(page)).length, { message: `${tab}: entrance` }).toBeGreaterThanOrEqual(2);
      const anims = await entrance(page);
      expect(anims.every((a) => a.iterations === 1), `${tab}: finite`).toBe(true);
      expect(Math.max(...anims.map((a) => a.end)), `${tab}: done within 0.9 s`).toBeLessThanOrEqual(900);
      // staggered: the cards end one after another
      expect(new Set(anims.map((a) => a.end)).size, `${tab}: staggered`).toBeGreaterThan(1);
      await appSettled(page);
      // nothing left: no transform or opacity on the screen or its cards, fixed children stay fixed
      const left = await page.evaluate(() =>
        [document.querySelector('main > :not([data-tab-hidden])')!, ...document.querySelectorAll('main .glass')]
          .map((el) => getComputedStyle(el))
          .filter((cs) => cs.transform !== 'none' || cs.opacity !== '1').length,
      );
      expect(left, `${tab}: nothing left after the entrance`).toBe(0);
    }
    // the floating add button of Positionen sits where it belongs after its entrance
    await page.getByRole('link', { name: 'Positionen' }).first().click();
    await appSettled(page);
    const fab = (await page.getByTestId('fab').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(fab.y + fab.height).toBeLessThanOrEqual(vp.height);
    expect(fab.x + fab.width).toBeLessThanOrEqual(vp.width);
  });

  test('Eingaben während der Animation werden nicht blockiert', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await page.getByRole('link', { name: 'Positionen' }).first().click();
    // straight away, while the cards are still coming in
    await page.getByRole('link', { name: 'Monat' }).first().click();
    await expect(page.getByTestId('hero')).toBeVisible();
    await expect(page).toHaveURL(/#\/monat$/);
  });

  test.describe('Bewegung reduzieren', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('Splash ohne Bewegung und schnell weg, Tabs ohne Einflug', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await watchSplash(page);
      await page.reload({ waitUntil: 'commit' });
      const moving = await page.locator('#splash').evaluate((el) =>
        el.getAnimations({ subtree: true }).filter((a) => {
          const kf = (a.effect as KeyframeEffect).getKeyframes();
          return kf.some((k) => k.transform && k.transform !== 'none');
        }).length,
      );
      expect(moving, 'no scaling or moving in the splash').toBe(0);
      await expect(page.locator('#splash')).toHaveCount(0, { timeout: 3000 });
      await expect(page.getByTestId('hero')).toBeVisible();
      for (const tab of TABS) {
        await page.getByRole('link', { name: tab }).first().click();
        await page.waitForTimeout(100);
        expect(await entrance(page), `${tab}: no entrance`).toHaveLength(0);
      }
    });
  });

  test('Rückfall: lädt das Skript nicht, verschwindet der Splash trotzdem', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    await page.route('**/*.js', (r) => r.abort());
    await page.goto('/');
    await expect(page.locator('#splash')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 10_000 });
  });
});
