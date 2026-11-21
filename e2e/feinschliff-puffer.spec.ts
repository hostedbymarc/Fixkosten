import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY, closePlan } from './fixtures';

// feinschliff-puffer (seed data, today 5 October 2026 → October active; € 184,21 set aside, no own account):
// - the month info only once: no popup over „Verlauf mit Plan“ (analysis), the card under it shows the
//   month with the lowest balance, a tapped point shows its month
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
      /** „Dein Plan“ from the settings, „Gleichmäßig“: what goes to the account with the next salary */
      const transfer = async (page: Page) => {
        await goTo(page, 'einstellungen');
        await tap(page.getByTestId('settings-open-plan'));
        await expect(page.getByTestId('plan-sheet')).toBeVisible();
        await animationsDone(page, 'bottom-sheet');
        const value = amountOf((await page.getByTestId('plan-salary-row').first().locator('td').nth(1).textContent())!);
        // an Esc right while the sheet takes the focus can get lost: pressed again until it is closed
        await expect(async () => {
          if ((await page.getByTestId('plan-sheet').count()) > 0) await page.keyboard.press('Escape');
          await expect(page.getByTestId('plan-sheet')).toHaveCount(0, { timeout: 1000 });
        }).toPass({ intervals: [200, 500], timeout: 10000 });
        return value;
      };

      test('Einrichtung mit sichtbaren Buttons; Monatskarte statt Popup; Puffer und Rundung ändern den Betrag', async ({ page }) => {
        await startApp(page);
        // setup: the answer buttons have a visible edge (dark mode too)
        await tap(page.getByTestId('dein-monat-setup'));
        const setup = page.getByTestId('konto-setup');
        await expect(setup).toHaveAttribute('data-step', 'account');
        await animationsDone(page, 'bottom-sheet');
        for (const id of ['konto-setup-account-yes', 'konto-setup-account-no']) expect(await hasEdge(page.getByTestId(id)), id).toBe(true);
        await shot(page, `${tag}-01-einrichtung-buttons`);
        await tap(page.getByTestId('konto-setup-account-no'));
        await expect(setup).toHaveAttribute('data-step', 'balance');
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        // no question about the gap any more: saved, „Dein Plan“ opens
        await expect(setup).toHaveCount(0);
        await expect(page.getByTestId('plan-sheet')).toBeVisible();
        await animationsDone(page, 'bottom-sheet');
        await closePlan(page);

        // the analysis: the card shows the month with the lowest balance; no popup over the chart
        await goTo(page, 'analyse');
        const section = page.getByTestId('konto-analyse');
        await expect(section.getByTestId('konto-chart')).toContainText('Puffer € 100');
        const selected = section.getByTestId('konto-selected');
        const hint = section.getByTestId('konto-selected-hint');
        await expect(hint).toHaveAttribute('data-default', 'true');
        await expect(selected).toHaveAttribute('data-period', '2027-02');
        await expect(hint).toHaveText('Gezeigt: Februar 2027, der Monat mit dem tiefsten Stand. Tipp auf einen Punkt für einen anderen Monat.');
        for (const label of ['Stand am Monatsanfang', 'Einzahlung', 'Abbuchungen', 'Stand am Monatsende']) await expect(selected).toContainText(label);
        await expect(selected).toContainText('Steuerberater');
        // with the plan the lowest month ends at or above the buffer
        expect(amountOf((await selected.locator('dd').last().textContent())!)).toBeGreaterThanOrEqual(100);
        await selected.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-03-analyse-tiefster-monat`);
        // tap a point: its month in the card, the point marked, still no popup
        const dot = section.getByTestId('konto-dot').nth(6);
        await dot.scrollIntoViewIfNeeded();
        await tap(dot);
        await expect(selected).toHaveAttribute('data-period', '2027-04');
        await expect(hint).toHaveText('Gezeigt: April 2027.');
        await expect(hint).toHaveAttribute('data-default', 'false');
        await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
        await expect(section.getByTestId('konto-chart').locator('.recharts-tooltip-wrapper')).toHaveCount(0);
        await shot(page, `${tag}-04-analyse-angetippt`);

        // „Gleichmäßig“ with the buffer € 100: base plus extra, to the cent
        const base = await transfer(page);
        expect(base).toBeCloseTo(3237.71, 2);

        // settings: buffer € 100, rounding off
        const buffer = page.getByTestId('konto-buffer');
        await expect(buffer.getByRole('radio', { name: '€ 100' })).toHaveAttribute('aria-checked', 'true');
        expect(await hasEdge(buffer.getByRole('radiogroup').locator('> div'))).toBe(true);
        const roundingSwitch = page.getByTestId('konto-rounding-on').getByRole('switch');
        await expect(roundingSwitch).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByTestId('konto-rounding-step')).toHaveCount(0);
        await buffer.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-05-einstellungen-puffer`);
        // € 250: October already ends below it → the one-time amount at once, with the next salary
        await tap(buffer.getByRole('radio', { name: '€ 250' }));
        await expect(buffer.getByRole('radio', { name: '€ 250' })).toHaveAttribute('aria-checked', 'true');
        expect(await transfer(page)).toBeGreaterThan(base + 1000);
        // „Monatsbetrag runden“ on: € 5 preselected
        const rounding = page.getByTestId('konto-rounding-on').getByRole('switch');
        await rounding.scrollIntoViewIfNeeded();
        await tap(rounding);
        await expect(rounding).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('konto-rounding-step').getByRole('radio', { name: '€ 5' })).toHaveAttribute('aria-checked', 'true');
        await page.getByTestId('konto-rounding').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-06-einstellungen-rundung`);
        await goTo(page, 'analyse');
        await expect(page.getByTestId('konto-analyse').getByTestId('konto-chart')).toContainText('Puffer € 250');

        // buffer off and rounding off again: no line
        await goTo(page, 'einstellungen');
        await tap(page.getByTestId('konto-buffer').getByRole('radio', { name: 'Aus' }));
        await tap(page.getByTestId('konto-rounding-on').getByRole('switch'));
        await expect(page.getByTestId('konto-rounding-step')).toHaveCount(0);
        await goTo(page, 'analyse');
        await expect(page.getByTestId('konto-analyse').getByTestId('konto-chart')).not.toContainText('Puffer');
      });
    });
  }
}
