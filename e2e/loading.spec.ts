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

/**
 * Records every entrance animation from now on, frame by frame (an animation is seen as soon as it
 * exists, also when the tab took long to build and the cards are already done when a poll would ask).
 */
const recordEntrance = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { entranceRec: { end: number; iterations: number; target: string }[] };
    w.entranceRec = [];
    const seen = new Set<Animation>();
    const until = performance.now() + 3000;
    const tick = () => {
      for (const a of document.getAnimations()) {
        if (a.id !== 'entrance' || seen.has(a)) continue;
        seen.add(a);
        const t = a.effect!.getComputedTiming();
        w.entranceRec.push({ end: Number(t.endTime), iterations: t.iterations ?? 1, target: (a.effect as KeyframeEffect).target?.tagName ?? '' });
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const entrance = (page: Page) => page.evaluate(() => (window as unknown as { entranceRec: { end: number; iterations: number; target: string }[] }).entranceRec);

test.describe('Lade-Animation', () => {
  // Luxe 2: „Squish & Merge“ – visible only after 300 ms, no minimum duration, the wave loops until the
  // data is there (the only endless animation, gone with the splash)
  test('Start: Squish & Merge – drei Erbsen, erst nach 300 ms sichtbar, keine Mindestdauer, blockiert nichts', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await watchSplash(page);
    // a slow app script: the splash gets its stage
    await page.route(/\/assets\/index-.*\.js$/, async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    const splash = page.locator('#splash');
    await expect(splash).toHaveAttribute('aria-hidden', 'true');
    await expect(splash.locator('.splash-goo .splash-body')).toHaveCount(3);
    await expect(splash.locator('.splash-lights .splash-light')).toHaveCount(3);
    await expect(splash).toHaveText('');
    const info = await splash.evaluate((el) => {
      const anims = el.getAnimations({ subtree: true }) as CSSAnimation[];
      const show = anims.find((a) => a.animationName === 'splash-show');
      return {
        pointer: getComputedStyle(el).pointerEvents,
        showDelay: show ? Number(show.effect!.getTiming().delay) : -1,
        drops: anims.filter((a) => a.animationName === 'splash-drop').length,
        // only transform and opacity
        props: [...new Set(anims.flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))).values()].filter(
          (k) => !['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'].includes(k),
        ),
      };
    });
    expect(info.pointer).toBe('none');
    expect(info.showDelay, 'visible only after 300 ms').toBe(300);
    expect(info.drops, 'the 3 peas drop in (silhouette and light layer each)').toBe(6);
    expect(info.props, 'only transform and opacity').toEqual([]);
    await expect(splash).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('hero')).toBeVisible();
    const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length);
    expect(infinite, 'nothing loops once the splash is gone').toBe(0);
  });

  test('schnelle Daten: der Splash blitzt nicht auf', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await page.addInitScript(() => {
      const w = window as unknown as { splashMax: number; splashGone: number };
      w.splashMax = 0;
      const tick = () => {
        const s = document.getElementById('splash');
        if (s) {
          w.splashMax = Math.max(w.splashMax, Number(getComputedStyle(s).opacity));
          requestAnimationFrame(tick);
        } else w.splashGone = performance.now();
      };
      requestAnimationFrame(tick);
    });
    await page.reload();
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 8000 });
    const { splashMax, splashGone } = await page.evaluate(() => {
      const w = window as unknown as { splashMax: number; splashGone: number };
      return { splashMax: w.splashMax, splashGone: w.splashGone };
    });
    // gone before 300 ms: it never showed
    if (splashGone < 280) expect(splashMax, 'no flash').toBeLessThan(0.05);
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
      await recordEntrance(page);
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

    test('Splash ohne Bewegung und schnell weg, Tabs nur mit Überblendung', async ({ page }) => {
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
        await page.waitForTimeout(160);
        // only the screen's fade (120 ms), no card rising
        const moving = await page.evaluate(() =>
          document.getAnimations().filter((a) => a.id === 'entrance' && (a.effect as KeyframeEffect).getKeyframes().some((k) => k.transform && k.transform !== 'none')).length,
        );
        expect(moving, `${tab}: no motion`).toBe(0);
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
