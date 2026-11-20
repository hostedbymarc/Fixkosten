import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// monat-feinschliff: October (past) and December (future) keep their layout – only texts change. Data like
// yours (rebuilt live example), „Neuer Monat beginnt am“ 25, today 10 November → November active,
// „Fixkosten einplanen“ set up. The boxes (position and size) of the hero, the Netto and Vermögensaufbau
// tiles, the note and the first category are compared with the reference taken from main before the sprint
// (e2e/monat-layout.json, written with UPDATE_LAYOUT=1 against the main build). Screenshots „vorher“ /
// „nachher“ to docs/screenshots/monat-feinschliff/. Six viewports × light/dark; runs in the desktop project.

const DIR = 'docs/screenshots/monat-feinschliff';
const REF = 'e2e/monat-layout.json';
const UPDATE = process.env.UPDATE_LAYOUT === '1';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

type Box = { x: number; y: number; width: number; height: number };
const ELEMENTS = ['hero', 'salary-tile', 'wealth-tile', 'note-card', 'categories-label', 'category-group'] as const;

async function boxes(page: Page): Promise<Record<string, Box | null>> {
  const out: Record<string, Box | null> = {};
  for (const id of ELEMENTS) {
    const l = page.locator('main > :not([data-tab-hidden])').getByTestId(id).first();
    const b = (await l.count()) ? await l.boundingBox() : null;
    out[id] = b && { x: Math.round(b.x), y: Math.round(b.y + (await page.evaluate(() => window.scrollY))), width: Math.round(b.width), height: Math.round(b.height) };
  }
  return out;
}

async function settle(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('hero-shimmer')).toHaveCount(0, { timeout: 4000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.fonts.ready);
}

const reference: Record<string, Record<string, Box | null>> = !UPDATE && existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {};
const written: Record<string, Record<string, Box | null>> = {};

test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  if (UPDATE) writeFileSync(REF, `${JSON.stringify({ ...(existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {}), ...written }, null, 1)}\n`);
});

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`Layout Oktober und Dezember · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(120_000);

      test('Oktober und Dezember: Kacheln an derselben Stelle wie vor dem Sprint', async ({ page }) => {
        await importLive(page, NOV_TODAY, (b) => {
          b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
        });
        await page.getByTestId('konto-invite-enable').click();
        await setUpKonto(page);
        const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
        for (const [month, step] of [
          ['oktober', 'Vorheriger Monat'],
          ['dezember', 'Nächster Monat'],
        ] as const) {
          await page.getByRole('button', { name: step }).click();
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(month === 'oktober' ? 'Oktober 2026' : 'Dezember 2026');
          await settle(page);
          const key = `${vp}-${scheme}-${month}`;
          const now = await boxes(page);
          await page.screenshot({ path: `${DIR}/${tag}-${month}-${UPDATE ? 'vorher' : 'nachher'}.jpg`, type: 'jpeg', quality: 78 });
          if (UPDATE) written[key] = now;
          else {
            const ref = reference[key];
            expect(ref, `Referenz ${key}`).toBeTruthy();
            for (const id of ELEMENTS) expect(now[id], `${key} · ${id}`).toEqual(ref![id]);
          }
          await page.getByRole('button', { name: /Zum aktiven Monat/ }).click();
          await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
        }
      });
    });
  }
}
