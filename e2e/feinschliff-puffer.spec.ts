import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// feinschliff-puffer (seed data, today 5 October 2026 → October active; € 184,21 set aside, no own account):
// - the month info only once: no popup over „Verlauf mit Plan“, the card under it shows the month
//   with the lowest balance, a tapped point shows its month
// - Sicherheitspuffer: € 100 by default (line „Puffer € 100“, „Mit diesem Plan nie unter € 100.“);
//   € 250 raises the amount, „Aus“ gives „nie im Minus“ and no line
// - „Monatsbetrag runden“ off by default (to the cent); on → € 1 / 5 / 10 (€ 5), off again → to the cent
// - setup in dark mode: answer buttons and segments with a visible edge, the chosen segment in the brand tone
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/feinschliff-puffer/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/feinschliff-puffer';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const amountOf = (text: string) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(300);
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

/** the edge of an element is drawn (1 px, not transparent) */
async function hasEdge(l: Locator) {
  return l.evaluate((el) => {
    const s = getComputedStyle(el);
    return parseFloat(s.borderTopWidth) >= 1 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.borderTopColor);
  });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Feinschliff Puffer · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(150_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());
      const openSheet = async (page: Page) => {
        const card = page.getByTestId('konto-tile');
        await card.scrollIntoViewIfNeeded();
        await (use.hasTouch ? card.tap({ position: { x: 12, y: 12 } }) : card.click({ position: { x: 12, y: 12 } }));
        await expect(page.getByTestId('konto-sheet')).toBeVisible();
        await animationsDone(page, 'bottom-sheet');
        return page.getByTestId('konto-sheet');
      };

      test('Einrichtung mit sichtbaren Buttons; Monatskarte statt Popup; Puffer und Rundung ändern den Betrag', async ({ page }) => {
        await startApp(page);
        // setup: the answer buttons have a visible edge (dark mode too)
        await tap(page.getByTestId('konto-tile-start'));
        const setup = page.getByTestId('konto-setup');
        await expect(setup).toHaveAttribute('data-step', 'account');
        await animationsDone(page, 'bottom-sheet');
        for (const id of ['konto-setup-account-yes', 'konto-setup-account-no']) expect(await hasEdge(page.getByTestId(id)), id).toBe(true);
        await shot(page, `${tag}-01-einrichtung-buttons`);
        await tap(page.getByTestId('konto-setup-account-no'));
        await expect(setup).toHaveAttribute('data-step', 'balance');
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(setup).toHaveAttribute('data-step', 'gap');
        for (const id of ['konto-setup-gap-spread', 'konto-setup-gap-lump']) expect(await hasEdge(page.getByTestId(id)), id).toBe(true);
        // the gap against the buffer of € 100, to the cent
        await expect(page.getByTestId('konto-setup-gap-text')).toHaveText(/^Dafür fehlen dir €\s1\.142,13\. Wie willst du das lösen\?$/);
        await shot(page, `${tag}-02-einrichtung-luecke`);
        await tap(page.getByTestId('konto-setup-gap-spread'));
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(setup).toHaveCount(0);

        // the sheet: the card shows the month with the lowest balance; no popup over the chart
        let sheet = await openSheet(page);
        await expect(sheet.getByTestId('konto-plan-status')).toHaveText('Mit diesem Plan nie unter € 100.');
        await expect(sheet.getByTestId('konto-chart')).toContainText('Puffer € 100');
        const selected = sheet.getByTestId('konto-selected');
        const hint = sheet.getByTestId('konto-selected-hint');
        await expect(hint).toHaveAttribute('data-default', 'true');
        await expect(selected).toHaveAttribute('data-period', '2027-02');
        await expect(hint).toHaveText('Gezeigt: Februar 2027, der Monat mit dem tiefsten Stand. Tipp auf einen Punkt für einen anderen Monat.');
        for (const label of ['Stand am Monatsanfang', 'Einzahlung', 'Abbuchungen', 'Stand am Monatsende']) await expect(selected).toContainText(label);
        await expect(selected).toContainText('Steuerberater');
        // with the plan the lowest month ends at or above the buffer
        expect(amountOf((await selected.locator('dd').last().textContent())!)).toBeGreaterThanOrEqual(100);
        await selected.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-03-sheet-tiefster-monat`);
        // tap a point: its month in the card, the point marked, still no popup
        const dot = sheet.getByTestId('konto-dot').nth(6);
        await dot.scrollIntoViewIfNeeded();
        await tap(dot);
        await expect(selected).toHaveAttribute('data-period', '2027-04');
        await expect(hint).toHaveText('Gezeigt: April 2027.');
        await expect(hint).toHaveAttribute('data-default', 'false');
        await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
        await expect(sheet.getByTestId('konto-chart').locator('.recharts-tooltip-wrapper')).toHaveCount(0);
        await shot(page, `${tag}-04-sheet-angetippt`);
        await tap(sheet.getByTestId('konto-settings-link'));

        // settings: buffer € 100, rounding off
        const settings = page.getByTestId('konto-settings');
        await expect(settings).toBeVisible();
        const amount = page.getByTestId('settings-amount');
        await expect(amount).toHaveText(/^€\s3\.237,71$/);
        const buffer = page.getByTestId('konto-buffer');
        await expect(buffer.getByRole('radio', { name: '€ 100' })).toHaveAttribute('aria-checked', 'true');
        expect(await hasEdge(buffer.getByRole('radiogroup').locator('> div'))).toBe(true);
        const roundingSwitch = page.getByTestId('konto-rounding-on').getByRole('switch');
        await expect(roundingSwitch).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByTestId('konto-rounding-step')).toHaveCount(0);
        await buffer.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-05-einstellungen-puffer`);
        // € 250: October already ends below it (€ 149,21) → at once, the gap € 1.142,13 + € 150
        await tap(buffer.getByRole('radio', { name: '€ 250' }));
        await expect(buffer.getByRole('radio', { name: '€ 250' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('settings-hint')).toHaveText(/Leg jetzt €\s1\.292,13 extra zur Seite\.$/);
        // „Monatsbetrag runden“ on: € 5 preselected, the base amount rounded up
        await roundingSwitch.scrollIntoViewIfNeeded();
        await tap(roundingSwitch);
        await expect(roundingSwitch).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('konto-rounding-step').getByRole('radio', { name: '€ 5' })).toHaveAttribute('aria-checked', 'true');
        await page.getByTestId('konto-rounding').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-06-einstellungen-rundung`);
        await goTo(page, 'monat');
        sheet = await openSheet(page);
        // at once: the status names the one-time amount (rounded base: € 2.955)
        await expect(sheet.getByTestId('konto-plan-status')).toHaveText(/^Diesen Monat reicht das Geld nicht\. Leg jetzt €\s[\d.]+,\d{2} extra zur Seite\.$/);
        await expect(sheet.getByTestId('konto-chart')).toContainText('Puffer € 250');
        await expect(sheet.getByTestId('konto-why-base')).toHaveText(/^€\s2\.955$/);
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);

        // buffer off and rounding off again: „nie im Minus“, no line, to the cent
        await goTo(page, 'einstellungen');
        await tap(page.getByTestId('konto-buffer').getByRole('radio', { name: 'Aus' }));
        await tap(page.getByTestId('konto-rounding-on').getByRole('switch'));
        await expect(page.getByTestId('konto-rounding-step')).toHaveCount(0);
        await goTo(page, 'monat');
        sheet = await openSheet(page);
        await expect(sheet.getByTestId('konto-plan-status')).toHaveText('Mit diesem Plan nie im Minus.');
        await expect(sheet.getByTestId('konto-chart')).not.toContainText('Puffer');
        await expect(sheet.getByTestId('konto-why-base')).toHaveText(/^€\s2\.952,17$/);
      });
    });
  }
}
