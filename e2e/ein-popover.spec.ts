import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, setUpKonto, test, TODAY } from './fixtures';

// Only one popover at a time (every ⓘ; the chart „Verlauf mit Plan“ has no popup, its month is in the card), and the reworded ⓘ texts.
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots of the
// changed ⓘ texts to docs/screenshots/info-texte/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/info-texte';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const TILE_INFO = 'Dieser Betrag deckt alle Fixkosten der nächsten 12 Monate. Vor großen Rechnungen kommt bis dahin ein Extra dazu.';
const CHART_INFO = 'So entwickelt sich dein Geld, wenn du den Betrag immer am 1. zur Seite legst. Diesen Monat zählen nur noch offene Rechnungen.';

/** every open ⓘ popover on the page (screen and sheet) */
const popovers = (page: Page) => page.locator('[role=tooltip]');

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 80 });
}

async function start(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Ein Popover · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(120_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('zwei ⓘ nacheinander: nur das zweite ist offen; Diagrammpunkt füllt die Karte, kein Popup', async ({ page }) => {
        await start(page);

        // screen: tile ⓘ, then the ⓘ of „Abzüge vom Netto“
        const tileInfo = page.getByTestId('konto-tile-info');
        await tileInfo.scrollIntoViewIfNeeded();
        await tap(tileInfo);
        await expect(popovers(page)).toHaveCount(1);
        await expect(page.getByTestId('konto-tile-info-popover')).toContainText('Nächsten Monat zur Seite legen');
        await expect(page.getByTestId('konto-tile-info-popover')).toContainText(TILE_INFO);
        await shot(page, `${tag}-kachel`);
        const heroInfo = page.getByTestId('hero-deductions-info');
        await heroInfo.scrollIntoViewIfNeeded();
        await tap(heroInfo);
        await expect(page.getByTestId('hero-deductions-info-popover')).toBeVisible();
        await expect(page.getByTestId('konto-tile-info-popover')).toHaveCount(0);
        await expect(popovers(page)).toHaveCount(1);

        // sheet: ⓘ „Verlauf mit Plan“, then a point of the chart → only the chart popup
        await page.keyboard.press('Escape');
        await expect(popovers(page)).toHaveCount(0);
        const card = page.getByTestId('konto-tile');
        await card.scrollIntoViewIfNeeded();
        await (use.hasTouch ? card.tap({ position: { x: 12, y: 12 } }) : card.click({ position: { x: 12, y: 12 } }));
        const sheet = page.getByTestId('konto-sheet');
        await expect(sheet).toBeVisible();
        await animationsDone(page, 'bottom-sheet');
        const chartInfo = sheet.getByTestId('konto-assumption');
        await chartInfo.scrollIntoViewIfNeeded();
        await tap(chartInfo);
        await expect(page.getByTestId('konto-assumption-popover')).toHaveText(`Verlauf mit Plan${CHART_INFO}`);
        await shot(page, `${tag}-verlauf-mit-plan`);
        // the chart has no popup any more: a tapped point fills the card under the chart (one month info)
        await page.keyboard.press('Escape');
        await expect(popovers(page)).toHaveCount(0);
        const dot = sheet.getByTestId('konto-dot').nth(3);
        const period = await dot.getAttribute('data-period');
        await tap(dot);
        await expect(sheet.getByTestId('konto-selected')).toHaveAttribute('data-period', period!);
        await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
        await expect(popovers(page)).toHaveCount(0);
        // the ⓘ opens over it; the card stays
        await tap(chartInfo);
        await expect(page.getByTestId('konto-assumption-popover')).toBeVisible();
        await expect(popovers(page)).toHaveCount(1);
        await expect(sheet.getByTestId('konto-selected')).toHaveAttribute('data-period', period!);

        // ⓘ „Eingeplante Rechnungen“ (in the fold), then the chart ⓘ: only the second
        await page.keyboard.press('Escape');
        const fold = sheet.getByTestId('konto-positions');
        await fold.locator('summary').scrollIntoViewIfNeeded();
        await tap(fold.locator('summary'));
        const posInfo = sheet.getByTestId('konto-positions-info');
        await posInfo.scrollIntoViewIfNeeded();
        await tap(posInfo);
        await expect(page.getByTestId('konto-positions-info-popover')).toContainText('Diese Rechnungen deckt dein Monatsbetrag.');
        await shot(page, `${tag}-eingeplante-rechnungen`);
        await chartInfo.scrollIntoViewIfNeeded();
        await tap(chartInfo);
        await expect(page.getByTestId('konto-assumption-popover')).toBeVisible();
        await expect(page.getByTestId('konto-positions-info-popover')).toHaveCount(0);
        await expect(popovers(page)).toHaveCount(1);
      });

      test('Einstellungen: geänderte ⓘ-Texte', async ({ page }) => {
        await start(page);
        await goTo(page, 'einstellungen');
        const cases: [string, string, string][] = [
          ['Fixkosten einplanen', 'Erbse nennt dir jeden Monat einen Betrag zum Zurücklegen.', 'einstellungen-fixkosten-einplanen'],
          ['Schon zur Seite gelegt', 'So viel hast du schon für deine Fixkosten zur Seite gelegt.', 'einstellungen-schon-zur-seite-gelegt'],
          ['Neuer Monat beginnt am', 'Praktisch, wenn dein Gehalt am Monatsende kommt.', 'einstellungen-neuer-monat'],
          ['Sicherung', 'Mit einer Sicherung holst du sie zurück.', 'einstellungen-sicherung'],
        ];
        let before: string | null = null;
        for (const [title, text, name] of cases) {
          const button = page.getByRole('button', { name: `Erklärung: ${title}`, exact: true });
          await button.scrollIntoViewIfNeeded();
          await tap(button);
          const pop = popovers(page);
          await expect(pop).toHaveCount(1);
          await expect(pop).toContainText(title);
          await expect(pop).toContainText(text);
          if (before) await expect(pop).not.toContainText(before);
          await shot(page, `${tag}-${name}`);
          before = text;
        }
      });
    });
  }
}
