import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, openInfo, setUpKonto, test, TODAY } from './fixtures';

// „Fixkosten einplanen“ (internally Fixkostenkonto): onboarding with the currency only (Euro with
// de-AT / de-DE, Franken), activation through the invitation card, the short sheet („Warum € X?“),
// analysis section – on iPhone SE, iPhone 15, iPad portrait/landscape and desktop 1440, light and dark. Runs in the desktop project only; every viewport is its own context below.

const DIR = 'docs/screenshots/fixkostenkonto';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
} as const;

/** '€ 2.952,17' / '2.952,17 €' / "CHF 2'952.17" → 2952.17 */
function amountOf(text: string): number {
  const t = text.replace(/[^\d,.'’−-]/g, '');
  const ch = /CHF/.test(text);
  const n = ch ? t.replace(/['’]/g, '') : t.replace(/\./g, '').replace(',', '.');
  return Number(n.replace('−', '-'));
}

async function shot(page: Page, vp: string, scheme: string, name: string) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${vp}-${scheme}-${name}.jpg`, type: 'jpeg', quality: 72 });
}

async function importApp(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`Fixkostenkonto · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));

      test('bestehende Installation: Einladungskarte → Aktivieren → Kachel → Sheet mit Startlücke', async ({ page }) => {
        test.setTimeout(90_000); // setup plan + six full-page screenshots: ~28 s at 1440 px
        await importApp(page);
        // existing installation: four tiles as before, one invitation card, no Fixkostenkonto tile
        await expect(page.getByTestId('konto-invite')).toBeVisible();
        await expect(page.getByTestId('konto-invite')).toContainText('Neu: Fixkosten einplanen. Erbse sagt dir, wie viel du monatlich zur Seite legst.');
        await expect(page.getByTestId('konto-tile')).toHaveCount(0);
        await shot(page, vp, scheme, '1-einladung');

        await page.getByTestId('konto-invite-enable').click();
        await expect(page.getByTestId('konto-invite')).toHaveCount(0);
        const tile = page.getByTestId('konto-tile');
        await expect(tile).toBeVisible();
        await setUpKonto(page);
        // everything planned: the one amount is the base amount
        await expect(page.getByTestId('konto-tile-card')).toHaveAttribute('data-view', 'covered');
        const order = amountOf((await page.getByTestId('tile-amount').textContent())!);
        await tile.scrollIntoViewIfNeeded();
        await shot(page, vp, scheme, '2-kachel');

        await tile.click({ position: { x: 12, y: 12 } });
        const sheet = page.getByTestId('konto-sheet');
        await expect(sheet).toBeVisible();
        // „Warum € X?“: the normal month = the amount of the tile
        await expect(sheet.getByTestId('konto-why')).toContainText(/^Warum €/);
        expect(amountOf((await sheet.getByTestId('konto-why-base').textContent())!)).toBe(order);
        // base = all debits of the 12 months from next month on ÷ 12, rounded up to € 5
        const exactText = (await sheet.getByTestId('konto-order-exact').textContent())!;
        const exact = amountOf(exactText.match(/€\s?\d[\d.]*(,\d+)?/)![0]);
        expect(order).toBe(Math.ceil(Math.round(exact * 100) / 500) * 5);
        // the assumption is in the ⓘ next to „Verlauf mit Plan“
        const assumption = await openInfo(page, sheet.getByTestId('konto-assumption'));
        await expect(assumption).toContainText('Diesen Monat zählen nur noch offene Rechnungen');
        await page.keyboard.press('Escape');
        await expect(assumption).toHaveCount(0);
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId('konto-chart')).toBeVisible();
        await expect(sheet.getByTestId('konto-dot')).toHaveCount(12);
        await expect(sheet.getByTestId('konto-plan-status')).toHaveText('Mit diesem Plan nie im Minus.');
        await shot(page, vp, scheme, '3-sheet');

        // tap on a month: deposit, debits, balance
        await sheet.getByTestId('konto-dot').nth(2).click();
        const detail = sheet.getByTestId('konto-selected');
        await expect(detail).toBeVisible();
        await expect(detail).toContainText('Einzahlung');
        await expect(detail).toContainText('Abbuchungen');
        await expect(detail).toContainText('Stand am Monatsende');
        // amount set aside and rounding live in the settings: one link
        await sheet.getByTestId('konto-settings-link').click();
        await expect(page.getByTestId('konto-settings')).toBeVisible();
        await goTo(page, 'monat');

        // analysis section
        await goTo(page, 'analyse');
        const section = page.getByTestId('konto-analyse');
        await expect(section).toBeVisible();
        await expect(section.getByTestId('konto-chart')).toBeVisible();
        await section.scrollIntoViewIfNeeded();
        await shot(page, vp, scheme, '5-analyse');

        // settings
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-settings')).toBeVisible();
        await page.getByTestId('konto-settings').scrollIntoViewIfNeeded();
        await shot(page, vp, scheme, '6-einstellungen');
      });

      test('„Später“: Karte weg, nur noch über die Einstellungen', async ({ page }) => {
        await importApp(page);
        await page.getByTestId('konto-invite-later').click();
        await expect(page.getByTestId('konto-invite')).toHaveCount(0);
        await page.reload();
        await appSettled(page);
        await expect(page.getByTestId('konto-invite')).toHaveCount(0);
        await expect(page.getByTestId('konto-tile')).toHaveCount(0);
        await goTo(page, 'einstellungen');
        await page.getByTestId('konto-enabled-switch').click();
        await goTo(page, 'monat');
        await expect(page.getByTestId('konto-tile')).toBeVisible();
      });

      for (const [country, currency, locale] of [
        ['AT', 'EUR', 'de-AT'],
        ['DE', 'EUR', 'de-DE'],
        ['CH', 'CHF', 'de-AT'],
      ] as const) {
        test.describe(`Sprache ${locale}`, () => {
          test.use({ locale });
          test(`Onboarding ${country}: Währung ${currency} → Vorlage mit eigenem Betrag → Monat mit Kachel`, async ({ page }) => {
            await page.clock.setFixedTime(TODAY);
            await page.goto('/');
            await expect(page.getByTestId('setup-dialog')).toBeVisible();
            if (country === 'AT') await shot(page, vp, scheme, '7-onboarding-start');
            await page.getByTestId('setup-new').click();
            // only the currency: exactly two options, no country
            await expect(page.getByTestId('setup-countries').getByRole('radio')).toHaveText(['Euro (€)', 'Schweizer Franken (CHF)']);
            await expect(page.getByText(/Österreich|Deutschland|Schweiz\b/)).toHaveCount(0);
            await page.getByTestId(`setup-currency-${currency}`).click();
            await expect(page.getByTestId(`setup-currency-${currency}`)).toHaveAttribute('aria-checked', 'true');
            if (country === 'AT') await shot(page, vp, scheme, '8-onboarding-waehrung');
            await page.getByTestId('setup-next').click();
            const first = page.getByTestId('setup-template').first();
            await first.getByTestId('setup-template-toggle').click();
            const amount = first.getByTestId('setup-template-amount');
            // the amount is ALWAYS empty: nothing is made up
            await expect(amount).toHaveValue('');
            await expect(page.getByTestId('setup-finish')).toBeDisabled();
            await amount.fill(country === 'CH' ? '335' : '120');
            await expect(page.getByTestId('setup-finish')).toBeEnabled();
            await shot(page, vp, scheme, `9-onboarding-vorlagen-${country}`);
            await page.getByTestId('setup-finish').click();

            await expect(page.getByTestId('setup-dialog')).toHaveCount(0);
            await appSettled(page);
            const tile = page.getByTestId('konto-tile');
            await expect(tile).toBeVisible();
            await expect(page.getByTestId('konto-invite')).toHaveCount(0);
            await setUpKonto(page);
            const value = (await page.getByTestId('tile-amount').textContent())!;
            // annual or quarterly template → monthly share, rounded up to 5
            if (country === 'CH') {
              expect(value).toMatch(/^CHF\s30$/); // Serafe 335 / 12 = 27,92 → 30
            } else if (country === 'DE') {
              expect(value).toMatch(/^40\s€$/); // Rundfunkbeitrag 120 / 3 = 40
            } else {
              expect(value).toMatch(/^€\s40$/); // ORF-Beitrag 120 / 3 = 40
            }
            await tile.scrollIntoViewIfNeeded();
            await shot(page, vp, scheme, `10-onboarding-fertig-${country}`);
          });
        });
      }
    });
  }
}

test('Position aufs Alltagskonto: Grundbetrag sinkt um ihren Monatsanteil', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await importApp(page);
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
  await page.getByTestId('konto-tile').click({ position: { x: 12, y: 12 } });
  const exact = async () => {
    const text = (await page.getByTestId('konto-order-exact').textContent())!;
    return amountOf(text.match(/€\s?\d[\d.]*(,\d+)?/)![0]);
  };
  const before = await exact();
  await page.keyboard.press('Escape');
  await goTo(page, 'positionen');
  await page.getByRole('button', { name: 'Miete – Details' }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByTestId('account-field').getByRole('radio', { name: 'Alltagskonto' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('position-form')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Miete' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-testid=position-list-row]', { hasText: 'Miete' }).first().getByTestId('account-chip')).toHaveText('Alltagskonto');
  await goTo(page, 'monat');
  await page.getByTestId('konto-tile').click({ position: { x: 12, y: 12 } });
  await expect.poll(exact).toBeLessThan(before);
  const miete = 1008; // seed: Miete € 1.008 monthly
  expect(Math.round((before - (await exact())) * 100) / 100).toBe(miete);
});
