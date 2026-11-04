import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

// Hotfix „weißer Streifen oben“: the area behind the status bar (#root::before) is at most
// env(safe-area-inset-top) high, flat (no gradient) and covers no content while nothing has scrolled.
// Screenshots at the top and after 300 px of scroll on iPhone SE, iPhone 15, iPad hoch and
// Desktop 1440, light and dark; SHIMMER_TAG=vorher writes the pictures of the old state.

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
} as const;
const DIR = 'docs/screenshots/top-shimmer';
const TAG = process.env.SHIMMER_TAG ?? 'nachher';

/** Geometry and paint of the area behind the status bar, plus the top of the first content card. */
async function topArea(page: Page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('root')!, '::before');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:var(--safe-top);width:0';
    document.body.appendChild(probe);
    const safeTop = probe.getBoundingClientRect().height;
    probe.remove();
    const card = document.querySelector('main .glass, main [class*="glass"]');
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    return {
      safeTop,
      height: visible ? parseFloat(cs.height) || 0 : 0,
      image: cs.backgroundImage,
      cardTop: card ? card.getBoundingClientRect().top : Infinity,
    };
  });
}

for (const [name, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`Oberer Rand ohne Streifen · ${name} · ${scheme === 'light' ? 'hell' : 'dunkel'}`, () => {
      test.use({ ...use, colorScheme: scheme });

      test('höchstens Safe Area hoch, kein Verlauf, deckt in Ruhe nichts ab; Screenshots oben und nach 300 px', async ({ page }) => {
        // one project draws every viewport (the device list above), the others skip
        test.skip(test.info().project.name !== 'desktop');
        await importLive(page, OKT_TODAY);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        mkdirSync(DIR, { recursive: true });
        await page.screenshot({ path: `${DIR}/${TAG}-${name}-${scheme === 'light' ? 'hell' : 'dunkel'}-oben.png` });
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${DIR}/${TAG}-${name}-${scheme === 'light' ? 'hell' : 'dunkel'}-300px.png` });
        if (TAG === 'vorher') return;

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        for (const safe of [null, 59]) {
          if (safe) await page.addStyleTag({ content: `:root { --safe-top: ${safe}px !important; }` });
          const r = await topArea(page);
          expect(r.height, `Höhe ≤ Safe Area (${r.safeTop} px)`).toBeLessThanOrEqual(r.safeTop + 0.5);
          expect(r.image, 'kein Verlauf, kein Bild').toBe('none');
          // nothing scrolled: the first card starts below the area behind the status bar
          expect(r.cardTop, 'erste Karte unter dem Bereich der Statusleiste').toBeGreaterThanOrEqual(r.height);
        }
      });
    });
  }
}
