import { expect, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// Luxe 2 regressions.

test.describe('Luxe 2', () => {
  // iPhone report of 3.11.2026: while the hero number counted to the new month, its intermediate
  // values with cents („€ 2.511,83“) were wider than the final „€ 2.589“ and ran out of the tile
  test('Riesenzahl zählt beim Monatswechsel innerhalb der Hero-Kachel', async ({ page }) => {
    await importLive(page, NOV_TODAY);
    for (const button of ['Vorheriger Monat', 'Nächster Monat', 'Nächster Monat']) {
      await page.evaluate(() => {
        const w = window as unknown as { overflow: number[]; counting: number };
        w.overflow = [];
        w.counting = 0;
        const end = performance.now() + 900;
        const tick = () => {
          const hero = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
          for (const el of document.querySelectorAll<HTMLElement>('[data-testid="hero"] [aria-hidden="true"].num-display, [data-testid="hero-paid"]')) {
            if (el.hidden) continue;
            if (el.getAttribute('aria-hidden')) w.counting++;
            const r = el.getBoundingClientRect();
            const over = Math.max(0, r.right - (hero.right - 16), el.scrollWidth - el.clientWidth);
            if (over > 1) w.overflow.push(Math.round(over));
          }
          if (performance.now() < end) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.getByRole('button', { name: button }).click();
      await page.waitForTimeout(1000);
      const { overflow, counting } = await page.evaluate(() => {
        const w = window as unknown as { overflow: number[]; counting: number };
        return { overflow: w.overflow, counting: w.counting };
      });
      expect(counting, `${button}: the number counted`).toBeGreaterThan(0);
      expect(overflow, `${button}: inside the tile`).toEqual([]);
    }
  });
});
