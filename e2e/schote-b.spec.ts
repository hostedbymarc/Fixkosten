import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// Schote · Phase B in the app (seed data, today 5 October 2026): setup from the tile in all three
// answers, „Erledigt, eingezahlt“, the monthly Erbsen-Check over a simulated change of month, the
// series, „Anderer Betrag“ (new anchor), the sheet in three questions and the settings summary.
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/schote/b-*. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/schote';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
const SHOTS = new Set(['iphone-15', 'ipad-landscape', 'desktop-1440']);

const day = (iso: string) => new Date(`${iso}T09:00:00+01:00`);

async function shot(page: Page, name: string) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(400); // snap-in
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
  await page.getByTestId('konto-invite-enable').click();
}

/** reload on another day (the clock is the only thing that changes) */
async function openOn(page: Page, date: Date) {
  await page.clock.setFixedTime(date);
  await page.reload();
  await appSettled(page);
}

const covered = (pod: Locator) => pod.locator('[data-testid="pod-slot"][data-covered]').count();

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `b-${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Schote B · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      for (const variant of ['ja', 'noch-nicht', 'weiss-nicht'] as const) {
        test(`Einrichtung „${variant}“ von der Kachel bis „Gedeckt“, bleibt nach Neuladen`, async ({ page }) => {
          await startApp(page);
          const card = page.getByTestId('konto-tile-card');
          // directly below the hero
          const below = await page.evaluate(() => {
            const [hero, tile, kpi] = ['hero', 'konto-tile-card', 'kpi-value'].map((id) => document.querySelector(`[data-testid="${id}"]`)!);
            const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
            return follows(hero!, tile!) && follows(tile!, kpi!);
          });
          expect(below).toBe(true);
          await expect(card).toHaveAttribute('data-state', 'setup');
          await expect(card.getByTestId('konto-tile-progress')).toHaveText('0 von 3 Schritten');
          if (SHOTS.has(vp) && variant === 'ja') await shot(page, `${tag}-1-kachel-einrichten`);

          await tap(page.getByTestId('konto-tile'));
          const setup = page.getByTestId('konto-setup');
          await expect(setup).toHaveAttribute('data-step', 'account');
          if (variant === 'noch-nicht') {
            await tap(page.getByTestId('konto-setup-no-account-button'));
            await tap(page.getByTestId('konto-setup-next'));
          } else {
            await tap(page.getByTestId('konto-setup-has-account'));
            if (variant === 'ja') {
              // progress is kept: close after question 1, the tile counts it
              await page.keyboard.press('Escape');
              await expect(setup).toHaveCount(0);
              await expect(card.getByTestId('konto-tile-progress')).toHaveText('1 von 3 Schritten');
              await tap(page.getByTestId('konto-tile'));
              await tap(page.getByTestId('konto-setup-has-account'));
              await page.getByTestId('konto-setup-balance').fill('250');
              await tap(page.getByTestId('konto-setup-next'));
            } else await tap(page.getByTestId('konto-setup-balance-unknown'));
            await expect(page.getByTestId('konto-setup-question')).toHaveText('Ist der Dauerauftrag für Oktober schon eingegangen?');
            await tap(page.getByTestId(variant === 'ja' ? 'konto-setup-order-no' : 'konto-setup-order-none'));
          }

          // „Dein Plan“: every point snaps in what it covers, at once
          const pod = page.getByTestId('plan-pod');
          await expect(page.getByTestId('plan-order')).toContainText(variant === 'ja' ? 'Dauerauftrag prüfen:' : 'Dauerauftrag einrichten:');
          await expect(page.getByTestId('plan-order')).toContainText('monatlich am 1.');
          if (variant === 'noch-nicht') {
            await expect(page.getByTestId('konto-setup-plan').locator('li').first()).toHaveAttribute('data-testid', 'plan-account');
            await tap(page.getByTestId('plan-account-done'));
          }
          const before = await covered(pod);
          await tap(page.getByTestId('plan-order-done'));
          await expect.poll(() => covered(pod)).toBeGreaterThanOrEqual(before);
          const afterOrder = await covered(pod);
          if (await page.getByTestId('plan-gap').count()) {
            if (SHOTS.has(vp) && variant === 'ja') await shot(page, `${tag}-2-dein-plan`);
            await tap(page.getByTestId('plan-gap-done'));
          }
          await expect(pod).toHaveAttribute('data-full', 'true');
          expect(afterOrder).toBeLessThanOrEqual(12);
          await expect(page.getByTestId('plan-pod-text')).toHaveText('Alles gedeckt bis September 2027');
          await tap(page.getByTestId('konto-setup-finish'));
          await expect(setup).toHaveCount(0);

          await expect(card).toHaveAttribute('data-state', /covered|cushion/);
          await expect(card.getByTestId('tile-pod-text')).toHaveText('Gedeckt bis September 2027');
          await expect(card.getByTestId('konto-tile-sub')).toHaveText(/^Dauerauftrag €\s[\d.,]+ am 1\.$/);
          if (SHOTS.has(vp) && variant === 'ja') await shot(page, `${tag}-3-kachel-gedeckt`);

          // stored: the same after a reload; „Weiß ich gerade nicht“ asks for the balance on the next start
          await page.reload();
          await appSettled(page);
          await expect(card).toHaveAttribute('data-state', /covered|cushion/);
          if (variant === 'weiss-nicht') {
            await expect(page.getByTestId('konto-check')).toHaveAttribute('data-card', 'remind');
            await expect(page.getByTestId('konto-check-title')).toHaveText('Trag deinen Kontostand ein. Dann rechnet Erbse genauer.');
            if (SHOTS.has(vp)) await shot(page, `${tag}-4-erinnerung-kontostand`);
            await page.getByTestId('konto-check-amount').fill('4000');
            await tap(page.getByTestId('konto-check-save'));
            await expect(page.getByTestId('konto-check')).toHaveCount(0);
          } else await expect(page.getByTestId('konto-check')).toHaveCount(0); // ja: „Nein“ asks again from tomorrow; noch nicht: none this month

          // settings: summary and „Einrichtung ändern“
          await goTo(page, 'einstellungen');
          await expect(page.getByTestId('konto-enabled-text')).toHaveText('Erbse rechnet deinen Dauerauftrag aus und warnt, bevor das Konto knapp wird.');
          await expect(page.getByTestId('konto-summary-balance')).toHaveText(/€/);
          await expect(page.getByTestId('konto-summary-asof')).toHaveText('Stand vom 05.10.2026');
          await expect(page.getByTestId('konto-summary-order')).toHaveText(/am 1\.$/);
          await expect(page.getByTestId('konto-setup-edit')).toHaveText('Einrichtung ändern');
          if (SHOTS.has(vp) && variant === 'ja') {
            await page.getByTestId('konto-settings').scrollIntoViewIfNeeded();
            await shot(page, `${tag}-5-einstellungen`);
          }
          await tap(page.getByTestId('konto-setup-edit'));
          await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'account');
          await page.keyboard.press('Escape');
          await tap(page.getByTestId('konto-enabled-switch'));
          await expect(page.getByTestId('konto-enabled-text')).toHaveText('Erbse zeigt nur deine Fixkosten.');
        });
      }

      test('Lücke → „Erledigt, eingezahlt“ → Erbsen rasten ein, Kachel springt auf „Gedeckt“; Sheet in 3 Fragen', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
        await tap(page.getByTestId('konto-setup-has-account'));
        await page.getByTestId('konto-setup-balance').fill('0');
        await tap(page.getByTestId('konto-setup-next'));
        await tap(page.getByTestId('konto-setup-order-yes'));
        await tap(page.getByTestId('plan-order-done'));
        if (await page.getByTestId('plan-gap').count()) await tap(page.getByTestId('plan-gap-done'));
        await tap(page.getByTestId('konto-setup-finish'));
        // the first full pod: a short toast with a pea, once
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft: Erste Schote voll' })).toBeVisible();

        // a balance far too low: the tile shows the gap
        const card = page.getByTestId('konto-tile-card');
        await tap(page.getByTestId('konto-tile'));
        const sheet = page.getByTestId('konto-sheet');
        await expect(sheet.getByRole('heading')).toHaveText(['Wie viel überweise ich monatlich?', 'Muss ich jetzt etwas tun?', 'Reicht es das ganze Jahr?']);
        await expect(sheet.getByTestId('konto-covered')).toHaveText('Nein, alles gedeckt.');
        await sheet.getByTestId('konto-settings-inline').locator('summary').click();
        await sheet.getByTestId('konto-balance').fill('-3000');
        await expect(sheet.getByTestId('konto-gap')).toHaveAttribute('data-gap', '');
        await expect(sheet.getByTestId('konto-gap')).toContainText(/^Ja\. Zahl einmalig €\s[\d.,]+ ein\./);
        await expect(sheet.getByTestId('sheet-pod')).not.toHaveAttribute('data-full');
        await sheet.getByTestId('konto-q-action').scrollIntoViewIfNeeded();
        if (SHOTS.has(vp)) await shot(page, `${tag}-6-sheet-luecke`);
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);

        await expect(card).toHaveAttribute('data-state', 'gap');
        await expect(card.getByTestId('konto-tile-sub')).toHaveText(/^Noch €\s[\d.,]+ einzahlen, dann ist alles gedeckt$/);
        const pod = card.getByTestId('tile-pod');
        const before = await covered(pod);
        expect(before).toBeLessThan(12);
        if (SHOTS.has(vp)) await shot(page, `${tag}-7-kachel-luecke`);
        await tap(card.getByTestId('konto-tile-paid'));
        await expect(card).toHaveAttribute('data-state', /covered|cushion/);
        await expect(pod).toHaveAttribute('data-full', 'true');
        await expect(card.getByTestId('tile-pod-text')).toHaveText('Gedeckt bis September 2027');
        // afterwards quietly in the row of badges in the sheet
        await tap(page.getByTestId('konto-tile'));
        await expect(sheet.getByTestId('konto-milestone')).toHaveText(['Erste Schote voll']);
        if (SHOTS.has(vp)) {
          await sheet.getByTestId('konto-q-year').scrollIntoViewIfNeeded();
          await shot(page, `${tag}-8-sheet-jahr`);
        }
      });

      test('Erbsen-Check über den Monatswechsel, Serie; nach 3 Monaten „Anderer Betrag“ = neuer Anker', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
        await tap(page.getByTestId('konto-setup-has-account'));
        await page.getByTestId('konto-setup-balance').fill('5000');
        await tap(page.getByTestId('konto-setup-next'));
        await tap(page.getByTestId('konto-setup-order-yes')); // October confirmed in the setup
        await tap(page.getByTestId('plan-order-done'));
        if (await page.getByTestId('plan-gap').count()) await tap(page.getByTestId('plan-gap-done'));
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-check')).toHaveCount(0);

        // November: new month → the card on top
        await openOn(page, day('2026-11-02'));
        const check = page.getByTestId('konto-check');
        await expect(check).toHaveAttribute('data-card', 'month');
        await expect(page.getByTestId('konto-check-title')).toHaveText('Neuer Monat. Ist dein Dauerauftrag eingegangen?');
        const top = await page.evaluate(
          () => (document.querySelector('[data-testid="konto-check"]')!.compareDocumentPosition(document.querySelector('[data-testid="hero"]')!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        );
        expect(top).toBe(true);
        if (SHOTS.has(vp)) await shot(page, `${tag}-9-erbsen-check`);
        await tap(page.getByTestId('konto-check-no'));
        await expect(check).toHaveCount(0);
        // „Noch nicht“: at most once a day
        await openOn(page, day('2026-11-02'));
        await expect(check).toHaveCount(0);
        await openOn(page, day('2026-11-03'));
        await expect(page.getByTestId('konto-check-title')).toHaveText('Ist dein Dauerauftrag für November eingegangen?');
        await tap(page.getByTestId('konto-check-yes'));
        await expect(check).toHaveCount(0);
        await expect(page.getByTestId('konto-tile-streak')).toHaveText('2 Monate in Folge');

        // December missed, January: the series starts anew, without blame
        await openOn(page, day('2027-01-04'));
        await tap(page.getByTestId('konto-check-yes'));
        await expect(page.getByTestId('konto-tile-streak')).toHaveText('Neue Serie startet.');

        // 3 months after the anchor: „Stimmt dein Kontostand noch?“ → „Anderer Betrag“
        await expect(check).toHaveAttribute('data-card', 'balance');
        await expect(page.getByTestId('konto-check-title')).toHaveText(/^Stimmt dein Kontostand noch\? €\s[\d.,]+$/);
        if (SHOTS.has(vp)) await shot(page, `${tag}-10-kontostand-check`);
        await tap(page.getByTestId('konto-check-other'));
        await page.getByTestId('konto-check-amount').fill('777');
        await tap(page.getByTestId('konto-check-save'));
        await expect(check).toHaveCount(0);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-summary-balance')).toHaveText('€ 777');
        await expect(page.getByTestId('konto-summary-asof')).toHaveText('Stand vom 04.01.2027');
      });
    });
  }
}

test.describe('Schote B · Bewegung reduzieren', () => {
  test.use({ ...VIEWPORTS['iphone-15'], contextOptions: { reducedMotion: 'reduce' } });
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
  test('„Erledigt, eingezahlt“: sofort voll, keine Pop-Animation, Text da', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('konto-tile').tap();
    await page.getByTestId('konto-setup-has-account').tap();
    await page.getByTestId('konto-setup-balance').fill('0');
    await page.getByTestId('konto-setup-next').tap();
    await page.getByTestId('konto-setup-order-no').tap();
    await page.getByTestId('plan-order-done').tap();
    await expect(page.locator('.pod-snap')).toHaveCount(0);
    if (await page.getByTestId('plan-gap').count()) await page.getByTestId('plan-gap-done').tap();
    await expect(page.getByTestId('plan-pod')).toHaveAttribute('data-full', 'true');
    await expect(page.locator('.pod-snap')).toHaveCount(0);
    await expect(page.getByTestId('plan-pod-text')).toHaveText('Alles gedeckt bis September 2027');
  });
});
