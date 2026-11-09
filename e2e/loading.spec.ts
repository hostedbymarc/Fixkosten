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
  // Start screen (fix-white-start): static and visible from the first paint – the base colour, the mesh
  // and the flat logo, inline in index.html. Once the app script runs, the same three peas wave in
  // place (the only endless animation, gone with the splash); no minimum duration.
  test('Start: ein Logo ab dem ersten Bild, Erbsen kommen herein und pulsieren (CSS), die App übernimmt ohne Neustart, blockiert nichts', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await watchSplash(page);
    // a slow app script: the static start screen has its stage
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/assets\/index-.*\.js$/, async (r) => {
      await held;
      await r.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute('aria-hidden', 'true');
    await expect(splash.locator('.splash-mark .splash-pea')).toHaveCount(3);
    await expect(splash).toHaveText('');
    // before the app: visible at once, the peas come in and pulse (CSS of index.html), only opacity and transform
    // a removed splash (under load it can go before the second look) has no animations: null, nothing to compare
    const motion = (el: Element) => {
      if (!el.isConnected) return null;
      const anims = el.getAnimations({ subtree: true }) as CSSAnimation[];
      return {
        names: anims.map((a) => a.animationName).filter((n) => n.startsWith('splash-')).sort(),
        starts: anims.filter((a) => a.animationName.startsWith('splash-')).map((a) => a.startTime),
        props: [...new Set(anims.flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))).values()].filter(
          (k) => !['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'].includes(k),
        ),
      };
    };
    // a pending CSS animation has no start time yet (startTime null): wait until all have started
    await splash.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.ready)));
    const before = (await splash.evaluate(motion))!;
    expect(await splash.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).pointerEvents])).toEqual(['1', 'none']);
    expect(before.names).toEqual(['splash-in', 'splash-in', 'splash-in', 'splash-pulse', 'splash-pulse', 'splash-pulse']);
    expect(before.props, 'only transform and opacity').toEqual([]);
    release();
    // the app takes over the same element: nothing restarted
    await expect(splash).toHaveClass(/splash-live/);
    // under load the splash may already be removed: a detached element has no animations, nothing to compare
    const after = await splash.evaluate(motion).catch(() => null);
    if (after) expect(after.starts, 'not restarted').toEqual(before.starts);
    await expect(splash).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('hero')).toBeVisible();
    const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length);
    expect(infinite, 'nothing loops once the splash is gone').toBe(0);
  });

  test('schnelle Daten: der Start-Bildschirm geht gleich wieder', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    // from the splash's first appearance to its removal (performance.now: the test clock may be installed)
    await page.addInitScript(() => {
      const w = window as unknown as { splashMs: number };
      let seen = -1;
      new MutationObserver((_, obs) => {
        const s = document.getElementById('splash');
        if (s && seen < 0) seen = performance.now();
        if (!s && seen >= 0) {
          w.splashMs = performance.now() - seen;
          obs.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 8000 });
    const ms = await page.evaluate(() => (window as unknown as { splashMs: number }).splashMs);
    // no minimum duration: out as soon as the data is there (plus the exit of at most 360 ms)
    expect(ms, 'splash on screen').toBeGreaterThan(0);
    expect(ms, 'splash on screen').toBeLessThan(3000);
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
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 20_000 });
  });
});
