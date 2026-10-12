import type { Page } from '@playwright/test';
import { expect, importFixture, test, TODAY } from './fixtures';

const DIR = 'docs/screenshots/loader';

/** Holds back the lazily loaded analysis chunk so the Suspense fallback stays on screen. */
async function holdAnalyse(page: Page): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/AnalyseScreen.*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test.describe('Ladeanimation: drei Erbsen', () => {
  test('drei Erbsen in leicht verschiedenen Grüntönen pulsieren nacheinander; danach erscheint der Inhalt', async ({ app }, info) => {
    const release = await holdAnalyse(app);
    await app.getByRole('link', { name: 'Analyse' }).first().click();
    const loader = app.getByTestId('loader');
    await expect(loader).toBeVisible();
    await expect(loader).toHaveAttribute('role', 'status');
    await expect(loader).toHaveText('Lädt …'); // screen readers
    const peas = await loader.locator('.anim-pea').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { color: s.backgroundColor, name: s.animationName, delay: s.animationDelay, iteration: s.animationIterationCount };
      }),
    );
    expect(peas).toHaveLength(3);
    expect(new Set(peas.map((p) => p.color)).size, 'three different greens').toBe(3);
    for (const p of peas) {
      const [r, g, b] = p.color.match(/\d+/g)!.map(Number);
      expect(g, `green: ${p.color}`).toBeGreaterThan(r!);
      expect(g, `green: ${p.color}`).toBeGreaterThan(b!);
      expect(p.name).toBe('pea-pulse');
      expect(p.iteration).toBe('infinite');
    }
    expect(peas.map((p) => p.delay)).toEqual(['0s', '0.16s', '0.32s']);
    await app.waitForTimeout(500);
    await loader.screenshot({ path: `${DIR}/${info.project.name}-hell.png` });

    release();
    await expect(app.getByTestId('analyse')).toBeVisible();
    await expect(loader).toHaveCount(0);
  });

  test('Dunkelmodus und reduzierte Bewegung: nur sanftes Aufhellen, kein Skalieren', async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.clock.setFixedTime(TODAY);
    await page.goto('/');
    await importFixture(page);
    const release = await holdAnalyse(page);
    await page.getByRole('link', { name: 'Analyse' }).first().click();
    const loader = page.getByTestId('loader');
    await expect(loader).toBeVisible();
    const names = await loader.locator('.anim-pea').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(names).toEqual(['pea-fade', 'pea-fade', 'pea-fade']);
    await page.waitForTimeout(500);
    await loader.screenshot({ path: `${DIR}/${info.project.name}-dunkel.png` });
    release();
    await expect(page.getByTestId('analyse')).toBeVisible();
  });
});
