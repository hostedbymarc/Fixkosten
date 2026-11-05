import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// Polish „Fixkosten einplanen“ (Darstellung und Texte, keine Rechenlogik):
// - tile in three views: start (no question answered) · next task with amount, date, „Erledigt“, bar · covered
// - no repeated title in tile, settings, analysis (the analysis has no setup progress)
// - progress track visible at 0 %, its edge ≥ 3:1 against the tile (measured on the screenshot)
// - settings: „Einmalig zur Seite legen“ with its date
// - sidebar mark: the three overlapping peas of the app icon
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/polish-fixkosten-einplanen/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/polish-fixkosten-einplanen';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const AMOUNT = /€\s[\d.]+(?:,\d{2})?/;

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(350);
  await page.evaluate(() => document.fonts.ready);
  if (target) await target.screenshot({ path: `${DIR}/${name}.png` });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function startApp(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await page.getByTestId('konto-invite-enable').click();
}

/** Contrast (WCAG) of the track's edge and of its fill against the tile, read from the rendered pixels. */
async function trackContrast(page: Page, bar: Locator) {
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  const pad = 6;
  const png = await page.screenshot({ clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }, scale: 'css' });
  return page.evaluate(
    async ([b64, w, h, p]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = (x: number, y: number) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
      const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = ([r, gg, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(gg!) + 0.0722 * lin(b!);
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
        return (hi + 0.05) / (lo + 0.05);
      };
      // the empty part of the track (right end, the bar is filled from the left)
      const x = p + w * 0.8;
      const tile = px(x, 1);
      const edge = px(x, p); // top edge row of the track
      const fill = px(x, p + h / 2);
      return { tile, edge, fill, edgeRatio: ratio(edge, tile), fillRatio: ratio(fill, tile) };
    },
    [png.toString('base64'), box.width, box.height, pad] as const,
  );
}

/** How often „Fixkosten einplanen“ can be seen in `scope` (screen-reader-only text, 1 × 1 px, does not count). */
async function titlesSeen(scope: Locator): Promise<number> {
  return scope
    .getByText('Fixkosten einplanen', { exact: true })
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== 'hidden').length);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Polish Fixkosten einplanen · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(120_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Kachel: Start · nächste Aufgabe · eingeplant; keine doppelten Titel; Spur sichtbar mit Kontrast ≥ 3:1', async ({ page }) => {
        await startApp(page);
        const card = page.getByTestId('konto-tile-card');

        // 1) no question answered: heading with ⓘ, one sentence, „Jetzt starten“
        await expect(card).toHaveAttribute('data-view', 'start');
        await expect.poll(() => titlesSeen(card)).toBe(1);
        await expect(card.getByTestId('konto-tile-info')).toBeVisible();
        await expect(card.getByTestId('konto-tile-start')).toHaveText('Jetzt starten');
        await expect(card.getByTestId('tile-status-bar')).toHaveCount(0);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-01-kachel-start`);

        await tap(card.getByTestId('konto-tile-start'));
        await tap(page.getByTestId('konto-setup-account-yes'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await tap(page.getByTestId('konto-setup-order-no'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'plan');
        const order = (await page.getByTestId('plan-order-value').textContent())!.trim();
        const gapPoint = ((await page.getByTestId('plan-gap').textContent()) ?? '').replace(/\s+/g, ' ');
        await expect.poll(() => titlesSeen(page.getByTestId('konto-setup'))).toBe(1); // the sheet title only
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);

        // 2) questions answered, both points open: the next task is the standing order
        await expect(card).toHaveAttribute('data-view', 'task');
        await expect.poll(() => titlesSeen(card)).toBe(1);
        await expect(card.getByTestId('tile-status-action')).toHaveText(`Dauerauftrag einrichten: ${order} am 1.`);
        await expect(card.getByTestId('tile-status-done')).toHaveText('Erledigt');
        await expect(card.getByTestId('tile-status-progress')).toHaveText('0 von 2 erledigt');
        await expect(card.getByTestId('tile-status-bar')).toHaveAttribute('aria-valuenow', '0');
        // bar and text left-aligned in one line, the bar starts where the task text starts (no indent)
        const [bar, label, action] = await Promise.all(
          ['tile-status-bar', 'tile-status-progress', 'tile-status-action'].map(async (id) => (await card.getByTestId(id).boundingBox())!),
        );
        expect(Math.abs(bar!.x - action!.x)).toBeLessThanOrEqual(1);
        expect(label!.x).toBeGreaterThan(bar!.x + bar!.width);
        expect(Math.abs(bar!.y + bar!.height / 2 - (label!.y + label!.height / 2))).toBeLessThanOrEqual(2);
        // the track is visible at 0 %: its edge ≥ 3:1 against the tile, the fill differs from the tile
        const c = await trackContrast(page, card.getByTestId('tile-status-bar'));
        expect(c.edgeRatio, JSON.stringify(c)).toBeGreaterThanOrEqual(3);
        expect(c.fill, JSON.stringify(c)).not.toEqual(c.tile);
        test.info().annotations.push({ type: 'Spur-Kontrast', description: `${tag}: Rand ${c.edgeRatio.toFixed(2)}:1, Fläche ${c.fillRatio.toFixed(2)}:1` });
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-02-kachel-aufgabe-dauerauftrag`);

        // 3) standing order done: the next task is the one-time amount, with its date
        await tap(card.getByTestId('tile-status-done'));
        await expect(card.getByTestId('tile-status-progress')).toHaveText('1 von 2 erledigt');
        await expect(card.getByTestId('tile-status-bar')).toHaveAttribute('aria-valuenow', '1');
        const task = (await card.getByTestId('tile-status-action').textContent())!;
        expect(task).toMatch(/^Leg (bis \d{1,2}\. [A-Za-zäÄ]+|jetzt) einmalig €\s[\d.]+,\d{2} zur Seite\.$/);
        expect(gapPoint).toContain(task.replace(/\s+/g, ' ')); // the same sentence as the point in „Dein Plan“
        await expect(card.getByTestId('tile-status-text')).toHaveText(/^Ab \S+ \d{4} reicht das Geld nicht\.$/);
        await expect(card.getByTestId('tile-status-paid')).toHaveText('Erledigt, zur Seite gelegt');
        await expect.poll(() => titlesSeen(card)).toBe(1);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-03-kachel-aufgabe-luecke`);

        // settings: no subheading „Fixkosten einplanen“ above the status; the one-time amount with its date
        await goTo(page, 'einstellungen');
        const settings = page.getByTestId('konto-settings');
        await expect.poll(() => titlesSeen(settings)).toBe(1); // the switch label (the section heading sits above the card)
        const amount = AMOUNT.exec(task)![0];
        const by = /^Leg (bis .+|jetzt) einmalig/.exec(task)![1]!;
        await expect(page.getByTestId('konto-summary-gap')).toHaveText(amount);
        await expect(page.getByTestId('konto-summary-gap-by')).toHaveText(by);
        await expect(page.getByTestId('konto-summary-gap').locator('..')).toHaveText(`${amount} ${by}`);
        await settings.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-04-einstellungen`);

        // analysis: amount, chart and month list only, no setup progress
        await goTo(page, 'analyse');
        const analyse = page.getByTestId('konto-analyse');
        await expect(page.getByTestId('konto-analyse-order')).toBeVisible();
        await expect(analyse.getByRole('progressbar')).toHaveCount(0);
        await expect(analyse.getByText(/von 2 erledigt/)).toHaveCount(0);
        await expect.poll(() => titlesSeen(analyse)).toBe(1);
        await analyse.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-05-analyse`);

        // 4) everything planned: „Alles eingeplant bis …“ with the tick, no bar
        await goTo(page, 'monat');
        await tap(card.getByTestId('tile-status-paid'));
        await expect(card).toHaveAttribute('data-view', 'covered');
        await expect(card.getByTestId('tile-status-text')).toHaveText(/^Alles eingeplant bis \S+ \d{4}\.$/);
        await expect(card.getByTestId('tile-status-bar')).toHaveCount(0);
        await expect.poll(() => titlesSeen(card)).toBe(1);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-06-kachel-eingeplant`);
      });

      test('Seitenmenü: die drei überlappenden Erbsen des App-Icons', async ({ page }) => {
        await startApp(page);
        const sidebar = page.getByTestId('sidebar');
        test.skip(!(await sidebar.isVisible()), 'Seitenmenü erst ab 1024 px');
        const mark = sidebar.getByTestId('logo');
        await expect(mark).toHaveAttribute('aria-label', 'Erbse');
        const box = (await mark.boundingBox())!;
        // three circles of r 3.4 at cx 9 / 14 / 19: width 16.8 : height 6.8
        expect(box.width / box.height).toBeCloseTo(16.8 / 6.8, 1);
        await shot(page, `${tag}-07-seitenmenue`, sidebar.locator('div').first());
        await page.screenshot({ path: `${DIR}/${tag}-08-logo-gross.png`, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 }, scale: 'device' });
      });
    });
  }
}
