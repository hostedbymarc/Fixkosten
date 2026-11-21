import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, test, TODAY, touchSwipe, closePlan } from './fixtures';

// walkthrough „So funktioniert Erbse“ (seed data, today 5 October 2026 → October active):
// - monat-verdichtet: right after the setup „Dein Plan“ opens (not the walkthrough); the way in is
//   Einstellungen → „So funktioniert Erbse“
// - five cards (2–5 after the new plan): swipe on touch, arrow keys on the desktop, „Weiter“ / „Zurück“,
//   „Fertig“ closes; closable at any time (×, Esc)
// - without a setup: example numbers with the chip „Beispiel“
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

      test('nach der Einrichtung „Dein Plan“; fünf Karten durchwischen; die Einstellungen öffnen den Walkthrough', async ({ page }) => {
        await startApp(page);
        await page.getByTestId('konto-invite-enable').click();
        await expect(page.getByTestId('dein-monat')).toHaveAttribute('data-state', 'setup');
        await shot(page, `${tag}-00-monat-einrichten`);

        // setup: no account, € 184,21 set aside → „Dein Plan“ opens (monat-verdichtet), not the walkthrough
        await tap(page.getByTestId('dein-monat-setup'));
        await sheetIn(page);
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await expect(page.getByTestId('plan-sheet')).toBeVisible();
        await expect(walk(page)).toHaveCount(0);
        await sheetIn(page);
        await closePlan(page);

        // the settings: the row opens it
        await page.goto('/#/einstellungen');
        const row = page.getByTestId('settings-walkthrough');
        await row.scrollIntoViewIfNeeded();
        await expect(row).toHaveText('So funktioniert Erbse');
        await tap(row);
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

        // card 2: „Bei Fälligkeit oder gleichmäßig“, the line of the even amount
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '2');
        await expect(visibleCard(page, 2)).toContainText('Bei Fälligkeit oder gleichmäßig.');
        await expect(page.getByTestId('walkthrough-text-2')).toHaveText(new RegExp(`^Gleichmäßig sind das ${AMOUNT} pro Monat\\. Bei Fälligkeit zahlst du, wenn es kommt\\.$`));
        await expect(page.getByTestId('walkthrough-base-line')).toBeVisible();
        await shot(page, `${tag}-02-gleich-viel`);

        // back and forth: the other direction works too
        await backward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '1');
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '2');

        // card 3: salary → Fixkostenkonto / direct / Vermögensaufbau / frei für dich
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '3');
        await expect(page.getByTestId('walkthrough-flow')).toHaveText(/Gehalt.*Fixkostenkonto.*Direkt bezahlt.*Frei für dich.*Vermögensaufbau/);
        await expect(page.getByTestId('walkthrough-text-3')).toHaveText('Aufs Fixkostenkonto, direkt bezahlt, Vermögensaufbau. Der Rest ist frei für dich.');
        await expect(visibleCard(page, 3)).toContainText('Spielgeld planst du nur ein. Erbse prüft, ob es passt.');
        await shot(page, `${tag}-03-ruecklage`);

        // card 4: the recommendation
        await tap(page.getByTestId('walkthrough-next'));
        await expect(walk(page)).toHaveAttribute('data-card', '4');
        const four = page.getByTestId('walkthrough-text-4');
        await expect(four.locator('p').first()).toHaveText('Zuerst bei Fälligkeit. Reicht das nicht jeden Monat, dann gleichmäßig.');
        await expect(four.locator('p').last()).toHaveText(/^(Für dich passt: (Bei Fälligkeit|Gleichmäßig)\.|Fehlt etwas, zeigt dir „Dein Plan“ einen Vorschlag\.)$/);
        await shot(page, `${tag}-04-anfang`);

        // card 5: the Spielgeld as the check, „Fertig“ closes
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '5');
        await expect(visibleCard(page, 5)).toContainText('Dein Spielgeld ist die Prüfgröße.');
        await expect(page.getByTestId('walkthrough-text-5')).toHaveText('Am 1. kommt dein Gehalt. Erbse zeigt dir, was frei bleibt.');
        await expect(page.getByTestId('walkthrough-next')).toHaveCount(0);
        // no swipe beyond the last card
        await forward(page);
        await expect(walk(page)).toHaveAttribute('data-card', '5');
        await shot(page, `${tag}-05-tipp`);
        await tap(page.getByTestId('walkthrough-done'));
        await expect(walk(page)).toHaveCount(0);

        // again from the settings, closed with ×
        await tap(row);
        await expect(walk(page)).toBeVisible();
        await sheetIn(page);
        await tap(page.getByTestId('bottom-sheet').getByRole('button', { name: 'Schließen' }));
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
        await expect(page.getByTestId('walkthrough-text-2')).toHaveText(/^Gleichmäßig sind das €\s298,34 pro Monat\./);
        await page.keyboard.press('Escape');
        await expect(walk(page)).toHaveCount(0);
      });
    });
  }
}
