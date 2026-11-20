import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, openInfo, test, TODAY, touchSwipe } from './fixtures';

// walkthrough „So funktioniert Erbse“ (seed data, today 5 October 2026 → October active):
// - right after the setup it opens by itself, once; a second setup does not open it again
// - five cards: swipe on touch, arrow keys on the desktop, „Weiter“ / „Zurück“, „Fertig“ closes;
//   closable at any time (×, Esc)
// - the other two ways in: Einstellungen → „So funktioniert Erbse“, the tile's ⓘ → „So funktioniert's“
// - without a setup: example numbers with the chip „Beispiel“
// - month screen: under „Abzüge vom Netto“ the Fixkosten by source (only with the mode on)
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/walkthrough/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/walkthrough';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const AMOUNT = '€\\s[\\d.]+(?:,\\d{2})?';

async function shot(page: Page, name: string) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(350);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function startApp(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
}

/** the sheet rests (a tap while it slides in can land on the scrim) */
async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
}

const walk = (page: Page) => page.getByTestId('walkthrough');

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Walkthrough · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      /** next card: swipe left on touch, → on the desktop */
      const forward = async (page: Page) => {
        if (use.hasTouch) await touchSwipe(page, page.getByTestId('walkthrough-track'), -220);
        else await page.keyboard.press('ArrowRight');
      };
      const backward = async (page: Page) => {
        if (use.hasTouch) await touchSwipe(page, page.getByTestId('walkthrough-track'), 220);
        else await page.keyboard.press('ArrowLeft');
      };
      const visibleCard = (page: Page, n: number) => page.getByTestId(`walkthrough-card-${n}`);

      test('nach der Einrichtung einmal von selbst; fünf Karten durchwischen; Einstellungen und ⓘ öffnen ihn wieder', async ({ page }) => {
        await startApp(page);
        // mode off: no source lines under „Abzüge vom Netto“
        await expect(page.getByTestId('hero-sources')).toHaveCount(0);
        await page.getByTestId('konto-invite-enable').click();
        // mode on (ruecklage-spielgeld): the Fixkosten by source, here everything from the Rücklage
        await expect(page.getByTestId('hero-source-reserve')).toHaveText(/^Rücklage€\s[\d.]+,\d{2}$/);
        await shot(page, `${tag}-00-monat-ruecklage`);

        // setup: no account, € 184,21 set aside, spread → „Fertig“ → the walkthrough by itself
        await page.getByTestId('konto-tile').scrollIntoViewIfNeeded();
        await tap(page.getByTestId('konto-tile-start'));
        await sheetIn(page);
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'gap');
        await tap(page.getByTestId('konto-setup-gap-spread'));
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await expect(walk(page)).toBeVisible();
        await expect(walk(page)).toHaveAttribute('data-example', 'false');
        await expect(walk(page)).toHaveAttribute('data-card', '1');
        await expect(page.getByTestId('walkthrough-example')).toHaveCount(0);
        await sheetIn(page);

        // card 1: bars, dearest and cheapest month labelled
        await expect(visibleCard(page, 1)).toContainText('Deine Fixkosten schwanken.');
        await expect(page.getByTestId('walkthrough-text-1')).toHaveText(new RegExp(`^Im \\S+ zahlst du ${AMOUNT}, im \\S+ nur ${AMOUNT}\\.$`));
        await expect(page.getByTestId('walkthrough-bars').locator('rect')).toHaveCount(12);
        await expect(page.getByTestId('walkthrough-max')).toBeVisible();
        await expect(page.getByTestId('walkthrough-min')).toBeVisible();
        await shot(page, `${tag}-01-schwanken`);
        await expect(page.getByTestId('walkthrough-back')).toBeHidden();

        // card 2: the same bars and the line of the base amount
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '2');
        await expect(visibleCard(page, 2)).toContainText('Darum legst du jeden Monat gleich viel zur Seite.');
        await expect(page.getByTestId('walkthrough-text-2')).toHaveText(new RegExp(`^Das sind ${AMOUNT} pro Monat\\. Teure Monate gleicht deine Rücklage aus\\.$`));
        await expect(page.getByTestId('walkthrough-base-line')).toBeVisible();
        await shot(page, `${tag}-02-gleich-viel`);

        // back and forth: the other direction works too
        await backward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '1');
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '2');

        // card 3: salary → Rücklage / direct / Spielgeld / Vermögensaufbau
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '3');
        await expect(page.getByTestId('walkthrough-flow')).toHaveText(/Gehalt.*Rücklage.*Direkt bezahlt.*Spielgeld.*Vermögensaufbau/);
        await expect(page.getByTestId('walkthrough-text-3')).toHaveText('Die Rücklage ist kein Extra-Geld. Es ist dasselbe Geld, nur gleichmäßig verteilt.');
        await expect(visibleCard(page, 3)).toContainText('Manches zahlst du direkt. Spielgeld planst du nur ein.');
        await shot(page, `${tag}-03-ruecklage`);

        // card 4: the gap, spread
        await tap(page.getByTestId('walkthrough-next'));
        await expect(walk(page)).toHaveAttribute('data-card', '4');
        const four = page.getByTestId('walkthrough-text-4');
        await expect(four).toContainText('Deine Rücklage ist bis dahin noch nicht voll.');
        await expect(four.locator('p').last()).toHaveText(new RegExp(`^Darum bis dahin ${AMOUNT} extra pro Monat\\. Das fällt nur einmal an\\.$`));
        await shot(page, `${tag}-04-anfang`);

        // card 5: the monthly question, „Fertig“ closes
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '5');
        await expect(page.getByTestId('walkthrough-text-5')).toHaveText('Am 1. fragt Erbse, ob du den Betrag zur Seite gelegt hast. Den Rest rechnet Erbse.');
        await expect(page.getByTestId('walkthrough-next')).toHaveCount(0);
        // no swipe beyond the last card
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '5');
        await shot(page, `${tag}-05-tipp`);
        await tap(page.getByTestId('walkthrough-done'));
        await expect(walk(page)).toHaveCount(0);

        // the tile's ⓘ: „So funktioniert's“
        await page.getByTestId('konto-tile').scrollIntoViewIfNeeded();
        const tip = await openInfo(page, page.getByTestId('konto-tile-info'));
        await tap(tip.getByTestId('konto-tile-walkthrough'));
        await expect(walk(page)).toBeVisible();
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        await expect(walk(page)).toHaveAttribute('data-card', '1');
        await sheetIn(page);
        await page.keyboard.press('Escape');
        await expect(walk(page)).toHaveCount(0);

        // settings: the row, closed with ×
        await page.goto('/#/einstellungen');
        const row = page.getByTestId('settings-walkthrough');
        await row.scrollIntoViewIfNeeded();
        await expect(row).toHaveText('So funktioniert Erbse');
        await tap(row);
        await expect(walk(page)).toBeVisible();
        await sheetIn(page);
        await tap(page.getByTestId('bottom-sheet').getByRole('button', { name: 'Schließen' }));
        await expect(walk(page)).toHaveCount(0);

        // a second setup („Einrichtung ändern“): no walkthrough by itself
        await tap(page.getByTestId('konto-setup-edit'));
        await sheetIn(page);
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', /^(gap|plan)$/);
        if ((await page.getByTestId('konto-setup').getAttribute('data-step')) === 'gap') await tap(page.getByTestId('konto-setup-gap-spread'));
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await expect(page.getByTestId('hero')).toBeVisible();
        await page.waitForTimeout(800);
        await expect(walk(page)).toHaveCount(0);
      });

      test('ohne Einrichtung: Beispielzahlen mit „Beispiel“', async ({ page }) => {
        await startApp(page);
        await page.getByTestId('konto-invite-enable').click();
        await page.goto('/#/einstellungen');
        const row = page.getByTestId('settings-walkthrough');
        await row.scrollIntoViewIfNeeded();
        await tap(row);
        await expect(walk(page)).toHaveAttribute('data-example', 'true');
        await sheetIn(page);
        await expect(visibleCard(page, 1).getByTestId('walkthrough-example')).toHaveText('Beispiel');
        await expect(page.getByTestId('walkthrough-text-1')).toHaveText(/^Im Dezember zahlst du €\s900, im Oktober nur €\s180\.$/);
        await expect(visibleCard(page, 1)).toContainText('Beispielzahlen. Richte „Fixkosten einplanen“ ein, dann siehst du deine.');
        await shot(page, `${tag}-06-beispiel`);
        await tap(page.getByTestId('walkthrough-next'));
        await expect(page.getByTestId('walkthrough-text-2')).toHaveText(/^Das sind €\s298,34 pro Monat\./);
        await page.keyboard.press('Escape');
        await expect(walk(page)).toHaveCount(0);
      });
    });
  }
}
