import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { appSettled, expect, FIXTURE, NOV_5, test, TODAY } from './fixtures';
import { differentPixels } from './pixels';

// „{Monat} erledigt“ and the hero layout. Seed data, today 5 October 2026: one position open (Depotentgelt
// € 35). Ticking it is the last one → the peas fall ONCE, live (spielgeld-planer).
// - the big amount keeps the iPhone hierarchy on every device; no text wraps inside a pill
// - „Woraus du bezahlst“ under „Abzüge vom Netto“
// - live: check, „Oktober erledigt“, „Alle 16 Rechnungen bezahlt“, the amount, falling peas; the check pops
// - opened again (reload): the peas lie still at the bottom, the same place, no animation; the check is no button
// - set back to open: no peas, the normal hero; 100 % again: they fall once more
// - only the active month falls; the peas rest in a strip at the bottom, clear of every text
// - exactly one amount element at any time; after the celebration pixel for pixel the calm state
// - prefers-reduced-motion: nothing falls, the lying peas stay
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to docs/screenshots/feier/.

const DIR = 'docs/screenshots/feier';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const fontSize = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

/** exactly ONE element in the hero shows the big amount (no copy on top, no second text layer) */
async function oneAmount(page: Page) {
  const paid = page.getByTestId('hero-paid');
  await expect(paid).toHaveCount(1);
  const n = await page.getByTestId('hero').evaluate((hero, text) => {
    let count = 0;
    const walk = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) if (walk.currentNode.textContent?.trim() === text) count++;
    return count;
  }, (await paid.textContent())!.trim());
  expect(n, 'one text node with the amount').toBe(1);
}

/** the amount and everything around it carry no transform, filter or will-change */
async function amountPlain(page: Page) {
  const styles = await page.getByTestId('hero-paid').evaluate((el) => {
    const out: string[] = [];
    for (let e: Element | null = el; e && e.getAttribute('data-testid') !== 'hero'; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.transform !== 'none' || cs.filter !== 'none' || cs.willChange !== 'auto') out.push(`${e.tagName}: ${cs.transform} ${cs.filter} ${cs.willChange}`);
    }
    return out;
  });
  expect(styles).toEqual([]);
}

/** where the peas rest: outside every text box of the hero */
async function peasClearOfText(page: Page) {
  const overlaps = await page.getByTestId('hero').evaluate((hero) => {
    const texts: DOMRect[] = [];
    const walk = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      if (!walk.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walk.currentNode);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) texts.push(r);
    }
    const peas = [...hero.querySelectorAll('.confetti-pea')].map((p) => p.getBoundingClientRect());
    let n = 0;
    for (const p of peas) for (const t of texts) if (p.left < t.right && p.right > t.left && p.top < t.bottom && p.bottom > t.top) n++;
    return { n, peas: peas.length, texts: texts.length };
  });
  expect(overlaps.peas).toBeGreaterThan(0);
  expect(overlaps.texts).toBeGreaterThan(3);
  expect(overlaps.n, 'peas at rest over text').toBe(0);
}

/** the peas lie still: no falling layer, not one running animation */
async function peasStill(page: Page) {
  const confetti = page.getByTestId('hero-confetti');
  await expect(confetti).toHaveCount(1);
  await expect(confetti).not.toHaveAttribute('data-falling', '');
  const running = await confetti.evaluate((layer) => [...layer.querySelectorAll('.confetti-pea')].reduce((n, p) => n + p.getAnimations().length, 0));
  expect(running, 'no animation on the lying peas').toBe(0);
}

/** where each pea lies (relative to the hero): the same picture every time */
const peaPlaces = (page: Page) =>
  page.getByTestId('hero').evaluate((hero) => {
    const h = hero.getBoundingClientRect();
    return [...hero.querySelectorAll('.confetti-pea')].map((p) => {
      const r = p.getBoundingClientRect();
      return [Math.round(r.left - h.left), Math.round(r.top - h.top), Math.round(r.width)];
    });
  });

async function shot(page: Page, name: string) {
  await page.getByTestId('hero').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('hero').screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 82 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Feier · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(150_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Hero-Hierarchie, letzte Position → einmal fallen, neu laden → Erbsen liegen, offen → weg, erneut → liegen, reduced motion', async ({ page }) => {
        await page.clock.setFixedTime(TODAY);
        await page.goto('/');
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        // without „Fixkosten einplanen“: the hero celebrates (with the mode on the bills row of „Dein Monat“
        // does, see monat-verdichtet.spec.ts)
        // the big amount: as on the iPhone (≥ 48 px, at least twice „Abzüge vom Netto“); pills on one line
        const paid = page.getByTestId('hero-paid');
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(48);
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(2 * (await fontSize(page.getByTestId('hero-deductions-value'))));
        // from the iPad on as big as on the iPhone at least
        if (use.viewport.width >= 800) expect(await fontSize(paid)).toBeGreaterThanOrEqual(56);
        expect((await page.getByTestId('hero-open').boundingBox())!.height).toBeLessThanOrEqual(33);
        await expect(page.getByTestId('hero-done')).toHaveCount(0);
        await page.waitForTimeout(300);
        await shot(page, `${tag}-01-hero-normal`);

        // the last position ticked: the celebration, live
        await tap(page.getByTestId('hero-open-filter'));
        await tap(page.locator('[data-position="pos-depotentgelt"]').getByTestId('toggle-paid').first());
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
        await expect(page.getByTestId('hero-done-sub')).toHaveText('Alle 16 Rechnungen bezahlt');
        await expect(page.getByText('Alles abgebucht')).toHaveCount(0);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(1);
        await expect(page.getByTestId('hero-confetti')).toHaveAttribute('data-falling', '');
        await expect(page.getByTestId('hero-confetti')).toHaveAttribute('data-count', vp === 'iphone-se' ? '60' : '90');
        await expect(page.getByTestId('hero-check')).toHaveAttribute('data-pop', '');
        // the check is no button: nothing replays the celebration
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('type', 'button');
        await expect(page.getByTestId('hero').getByRole('button', { name: /Feier/ })).toHaveCount(0);
        expect(await fontSize(paid)).toBeGreaterThanOrEqual(48);
        // during the celebration, at three moments: exactly one amount element
        await oneAmount(page);
        await page.waitForTimeout(400);
        await oneAmount(page);
        await page.waitForTimeout(1200);
        await oneAmount(page);
        // the peas stay where they landed (≤ 0.9 s delay + 3.2 s fall): in the strip at the bottom, clear of every text
        await page.waitForTimeout(2800);
        await expect(page.getByTestId('hero-confetti').locator('.confetti-pea').first()).toBeVisible();
        await peasClearOfText(page);
        await amountPlain(page);
        const landed = await peaPlaces(page);
        await page.evaluate(() => document.fonts.ready);
        const afterParty = await paid.screenshot({ animations: 'disabled' });
        await shot(page, `${tag}-02-hero-erledigt`);

        // opened again (reload): the peas lie still at the bottom – the same places, no animation, no pop
        await page.waitForTimeout(300);
        await page.reload();
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await appSettled(page);
        await page.waitForTimeout(500);
        await peasStill(page);
        expect(await peaPlaces(page), 'they lie where they landed').toEqual(landed);
        await peasClearOfText(page);
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');
        await oneAmount(page);
        await amountPlain(page);
        // the amount after the celebration: pixel for pixel the calm state
        await page.evaluate(() => document.fonts.ready);
        expect(await differentPixels(page, afterParty, await paid.screenshot({ animations: 'disabled' })), 'amount after the celebration = calm state').toBe(0);
        await shot(page, `${tag}-03-hero-erledigt-liegend`);
        // a tap on the check does nothing
        await tap(page.getByTestId('hero-check'));
        await page.waitForTimeout(300);
        await peasStill(page);

        // set back to open: no peas, the normal hero; 100 % again: they lie, no second celebration (celebratedMonths)
        const depot = page.locator('[data-position="pos-depotentgelt"]').getByTestId('toggle-paid').first();
        // a fully paid category starts collapsed
        const showDepot = async () => {
          if (!(await depot.isVisible())) await tap(page.getByRole('button', { name: 'Alle ausklappen' }));
          await depot.scrollIntoViewIfNeeded();
        };
        await showDepot();
        await tap(depot);
        await expect(page.getByTestId('hero-done')).toHaveCount(0);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(0);
        await tap(depot);
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await expect(page.getByTestId('hero-confetti')).toHaveCount(1);
        await expect(page.getByTestId('hero-confetti')).not.toHaveAttribute('data-falling', '');
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');

        // prefers-reduced-motion: nothing falls, the lying peas stay
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.reload();
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await appSettled(page);
        await peasStill(page);
        await showDepot();
        await tap(depot);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(0);
        await tap(depot);
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await page.waitForTimeout(300);
        await peasStill(page);
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
      });

      test('beim Öffnen fällt nie etwas: Oktober aus „Offen aus Oktober“ bezahlt, dann geöffnet – die Erbsen liegen nur', async ({ page }) => {
        test.skip(scheme === 'dark', 'Logik, einmal je Gerät');
        await page.clock.setFixedTime(NOV_5);
        await page.goto('/');
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        // November is active; October's last open position is paid from „Offen aus Oktober“
        const section = page.getByTestId('open-previous');
        await tap(section.getByRole('button', { name: /Offen aus Oktober/ }));
        await tap(section.getByRole('button', { name: 'Bezahlt' }));
        const sheet = page.getByRole('dialog', { name: 'Depotentgelt' });
        await expect(sheet).toBeVisible();
        await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
        await tap(sheet.getByRole('button', { name: 'Als bezahlt speichern' }));
        await expect(section).toHaveCount(0);
        await expect(page.getByTestId('hero-confetti')).toHaveCount(0);
        // October, complete, opened for the first time: the calm state only
        await tap(page.getByRole('button', { name: 'Vorheriger Monat' }));
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
        await page.waitForTimeout(800);
        await peasStill(page);
        await expect(page.getByTestId('hero-check')).not.toHaveAttribute('data-pop', '');
        // and again after a reload
        await page.reload();
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        await tap(page.getByRole('button', { name: 'Vorheriger Monat' }));
        await expect(page.getByTestId('hero-done-title')).toHaveText('Oktober erledigt');
        await page.waitForTimeout(800);
        await peasStill(page);
      });
    });
  }
}
