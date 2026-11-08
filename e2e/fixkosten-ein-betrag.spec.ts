import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// „Fixkosten einplanen“ with ONE amount per month (seed data, today 5 October 2026 → October active):
// - base € 2.955; with € 184,21 set aside the money is short in February (Steuerberater, Offi):
//   € 1.030,81 – spread over November … February (€ 257,71 extra) or set aside at once
// - with nothing set aside the money is short at once: one-time amount, no question (special case)
// - tile verteilt / auf einmal / Sonderfall / gedeckt, „Lieber auf einmal?“ and back, the short sheet,
//   the settings with cents, the monthly check, the milestone never while a gap is open
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/fixkosten-ein-betrag/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/fixkosten-ein-betrag';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

/** € amounts as the app writes them (narrow space after the sign) */
const E = (s: string) => s.replace(/ /g, '\\s');
const BASE = '€ 2.955';
const EXTRA = '€ 257,71';
const GAP = '€ 1.030,81';
const REASON = 'Im Februar kommen Steuerberater und Offi (Jahreskarte).';

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

async function openOn(page: Page, date: Date) {
  await page.clock.setFixedTime(date);
  await page.reload();
  await appSettled(page);
}

/** Setup without an own account: „Nein, ich plane nur“, the amount typed (or „Noch nichts“). */
async function setUp(page: Page, tap: (l: Locator) => Promise<void>, balance: string | null) {
  await tap(page.getByTestId('konto-tile-start'));
  // the sheet is in before the first answer (a tap while it slides in can get lost)
  await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'account');
  await animationsDone(page, 'bottom-sheet');
  await tap(page.getByTestId('konto-setup-account-no'));
  await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'balance');
  if (balance === null) await tap(page.getByTestId('konto-setup-nothing'));
  else {
    await page.getByTestId('konto-setup-balance').fill(balance);
    await tap(page.getByTestId('konto-setup-next'));
  }
}

const milestoneToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Zum ersten Mal alles eingeplant' });

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Ein Betrag pro Monat · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(120_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());
      // the card itself is tapped in its corner: its middle holds the button and the link
      const tapTile = (page: Page) => (use.hasTouch ? page.getByTestId('konto-tile').tap({ position: { x: 12, y: 12 } }) : page.getByTestId('konto-tile').click({ position: { x: 12, y: 12 } }));

      test('Lücke verteilt: Frage in der Einrichtung, Kachel, „Lieber auf einmal?“ und zurück, kurzes Sheet, Einstellungen mit Cent', async ({ page }) => {
        await startApp(page);
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-view', 'start');
        await setUp(page, tap, '184,21');

        // the gap question: reason, how much, the two ways
        const setup = page.getByTestId('konto-setup');
        await expect(setup).toHaveAttribute('data-step', 'gap');
        await expect(page.getByTestId('konto-setup-question')).toHaveText(REASON);
        await expect(page.getByTestId('konto-setup-gap-text')).toHaveText(new RegExp(`^Dafür fehlen dir ${E(GAP)}\\. Wie willst du das lösen\\?$`));
        await expect(page.getByTestId('konto-setup-gap-spread')).toHaveText(new RegExp(`^Auf 4 Monate verteilen \\(${E(EXTRA)} extra pro Monat\\)$`));
        await expect(page.getByTestId('konto-setup-gap-lump')).toHaveText('Auf einmal zur Seite legen');
        await expect(page.getByTestId('konto-setup-progress')).toContainText('Frage 3 von 3');
        await shot(page, `${tag}-01-frage-luecke`);
        await tap(page.getByTestId('konto-setup-gap-spread'));

        // „Dein Plan“: the one amount with its reason
        await expect(setup).toHaveAttribute('data-step', 'plan');
        await expect(page.getByTestId('setup-amount')).toHaveText(/^€\s3\.212,71$/);
        await expect(page.getByTestId('setup-when')).toHaveText('am 1. November, wenn dein Gehalt kommt');
        await expect(page.getByTestId('setup-hint')).toHaveText(new RegExp(`^${REASON.replace(/[().]/g, '\\$&')} Darum bis dahin ${E(EXTRA)} extra, ab März ${E(BASE)}\\.$`));
        await shot(page, `${tag}-02-dein-plan`);
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(setup).toHaveCount(0);

        // tile „verteilt“: no checklist, no bar
        await expect(card).toHaveAttribute('data-view', 'spread');
        await expect(page.getByTestId('konto-tile-title')).toHaveText('Nächsten Monat zur Seite legen');
        await expect(page.getByTestId('tile-amount')).toHaveText(/^€\s3\.212,71$/);
        await expect(page.getByTestId('tile-when')).toHaveText('am 1. November, wenn dein Gehalt kommt');
        await expect(page.getByTestId('tile-reason')).toHaveText(REASON);
        await expect(page.getByTestId('tile-how')).toHaveText(new RegExp(`^Darum bis dahin ${E(EXTRA)} extra, ab März ${E(BASE)}\\.$`));
        await expect(card.getByText(/von 2 erledigt/)).toHaveCount(0);
        await expect(card.getByRole('progressbar')).toHaveCount(0);
        // this month came with the setup: nothing to confirm now
        await expect(page.getByTestId('tile-confirm')).toHaveCount(0);
        await expect(page.getByTestId('tile-switch')).toHaveText('Lieber auf einmal?');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-03-kachel-verteilt`);

        // „Lieber auf einmal?“ → one-time amount, the same reason; and back
        await tap(page.getByTestId('tile-switch'));
        await expect(card).toHaveAttribute('data-view', 'lump');
        await expect(page.getByTestId('tile-amount')).toHaveText(new RegExp(`^${E(BASE)}$`));
        await expect(page.getByTestId('tile-reason')).toHaveText(REASON);
        await expect(page.getByTestId('tile-how')).toHaveText(new RegExp(`^Leg bis 31\\. Jänner ${E(GAP)} extra zur Seite\\.$`));
        await expect(page.getByTestId('tile-confirm')).toHaveText('Zur Seite gelegt');
        await expect(page.getByTestId('tile-switch')).toHaveText('Lieber verteilen?');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-04-kachel-auf-einmal`);
        await tap(page.getByTestId('tile-switch'));
        await expect(card).toHaveAttribute('data-view', 'spread');

        // the short sheet: „Warum € X?“, status, „Verlauf mit Plan“ (never below 0, no warning marks)
        await tapTile(page);
        const sheet = page.getByTestId('konto-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId('konto-why')).toContainText(/^Warum €\s3\.212,71\?/);
        await expect(sheet.getByTestId('konto-why-base')).toHaveText(new RegExp(`^${E(BASE)}$`));
        await expect(sheet.getByTestId('konto-why')).toContainText('Extra für Februar');
        await expect(sheet.getByTestId('konto-why-extra')).toHaveText(new RegExp(`^\\+ ${E(EXTRA)}$`));
        await expect(sheet.getByTestId('konto-why-bills')).toContainText('Steuerberater');
        await expect(sheet.getByTestId('konto-why-sum')).toHaveText(/^€\s3\.212,71$/);
        await expect(sheet.getByTestId('konto-plan-status')).toHaveText('Mit diesem Plan nie im Minus.');
        await expect(sheet.getByTestId('konto-chart')).toBeVisible();
        await expect(sheet.getByTestId('konto-dot')).toHaveCount(12);
        await expect(sheet.locator('[data-testid=konto-below-zero], [data-negative]')).toHaveCount(0);
        await expect(sheet.getByTestId('konto-months').locator('summary')).toHaveText(/Alle Monate/);
        await expect(sheet.getByTestId('konto-positions').locator('summary')).toHaveText(/Eingeplante Rechnungen \(\d+\)/);
        await expect(sheet.getByTestId('konto-balance')).toHaveCount(0); // in the settings now
        await expect(sheet.getByTestId('konto-settings-link')).toHaveText('Einstellungen ändern');
        await shot(page, `${tag}-05-sheet`);
        // tap on February: deposit with the extra, debits, balance ≥ 0
        await sheet.getByTestId('konto-dot').nth(4).click();
        await expect(sheet.getByTestId('konto-selected')).toContainText('Einzahlung');
        await expect(sheet.getByTestId('konto-selected')).toContainText('Abbuchungen');
        await tap(sheet.getByTestId('konto-settings-link'));

        // settings: switch, amount set aside with cents, gap mode, rounding, change setup
        const settings = page.getByTestId('konto-settings');
        await expect(settings).toBeVisible();
        await expect(page.getByTestId('konto-balance')).toHaveValue('184,21');
        await expect(page.getByTestId('konto-balance')).toHaveAttribute('inputmode', 'decimal');
        await expect(page.getByTestId('konto-gap-mode').getByRole('radio', { name: 'Verteilt' })).toHaveAttribute('aria-checked', 'true');
        await expect(settings.getByRole('radio', { name: '€ 5' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('konto-setup-edit')).toHaveText('Einrichtung ändern');
        // cents pasted with thousands dot: € 1.087,43 → shown with a comma
        await page.getByTestId('konto-balance').fill('1.087,43');
        await expect(page.getByTestId('settings-amount')).not.toHaveText(/^€\s3\.212,71$/);
        await settings.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-06-einstellungen`);
        await page.reload();
        await appSettled(page);
        await expect(page.getByTestId('konto-balance')).toHaveValue('1087,43');
        // a gap is open: never „Zum ersten Mal alles eingeplant“
        await expect(milestoneToast(page)).toHaveCount(0);
      });

      test('Lücke auf einmal: „Zur Seite gelegt“ → gedeckt; Monats-Check; Meilenstein erst mit bestätigtem Monat', async ({ page }) => {
        await startApp(page);
        await setUp(page, tap, '184,21');
        await tap(page.getByTestId('konto-setup-gap-lump'));
        await expect(page.getByTestId('setup-how')).toHaveText(new RegExp(`^Leg bis 31\\. Jänner ${E(GAP)} extra zur Seite\\.$`));
        await tap(page.getByTestId('konto-setup-finish'));
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-view', 'lump');
        await expect(milestoneToast(page)).toHaveCount(0);
        await tap(page.getByTestId('tile-confirm'));
        // set aside: covered, but no month confirmed yet – no milestone
        await expect(card).toHaveAttribute('data-view', 'covered');
        await expect(page.getByTestId('tile-status-text')).toHaveText(/^Alles eingeplant bis September 2027\.$/);
        await expect(page.getByTestId('tile-switch')).toHaveCount(0);
        await page.waitForTimeout(500);
        await expect(milestoneToast(page)).toHaveCount(0);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-07-kachel-gedeckt`);

        // a new month: the only recurring action
        await openOn(page, new Date('2026-11-02T09:00:00+01:00'));
        const check = page.getByTestId('konto-check');
        await expect(check).toHaveAttribute('data-card', 'month');
        await expect(page.getByTestId('konto-check-title')).toHaveText(new RegExp(`^Neuer Monat\\. Hast du ${E(BASE)} zur Seite gelegt\\?$`));
        await expect(page.getByTestId('konto-tile-title')).toHaveText('Diesen Monat zur Seite legen');
        await expect(page.getByTestId('tile-confirm')).toHaveAttribute('data-confirm', 'month');
        await shot(page, `${tag}-08-monats-check`);
        await tap(page.getByTestId('konto-check-yes'));
        await expect(check).toHaveCount(0);
        // covered and a month confirmed: now the milestone
        await expect(milestoneToast(page)).toBeVisible();
        await expect(page.getByTestId('konto-tile-title')).toHaveText('Nächsten Monat zur Seite legen');
      });

      test('Sonderfall: nichts zur Seite gelegt, das Geld fehlt schon jetzt → auf einmal, ohne Frage und ohne Wechsel', async ({ page }) => {
        await startApp(page);
        await setUp(page, tap, null);
        // no gap question: no deposit is left before the money is short
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'plan');
        await expect(page.getByTestId('konto-setup-plan')).toHaveAttribute('data-mode', 'lump');
        await expect(page.getByTestId('setup-reason')).toHaveText('Diesen Monat reicht das Geld nicht.');
        await expect(page.getByTestId('setup-how')).toHaveText(/^Leg jetzt €\s[\d.]+,\d{2} extra zur Seite\.$/);
        await tap(page.getByTestId('konto-setup-finish'));
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-view', 'lump');
        await expect(page.getByTestId('tile-switch')).toHaveCount(0);
        await expect(page.getByTestId('tile-confirm')).toHaveAttribute('data-confirm', 'lump');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-09-kachel-sonderfall`);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-gap-mode-note')).toHaveText('Bis dahin kommt keine Einzahlung mehr. Darum auf einmal.');
      });
    });
  }
}

test.describe('Ein Betrag pro Monat · Neuer Monat beginnt am 25.', () => {
  test.use(VIEWPORTS['iphone-15']);
  test.setTimeout(90_000);
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
  test('Zeiträume mit Datum: „am 25. Oktober“, „ab 25. Februar“; Rechnungen mit Monatsnamen', async ({ page }) => {
    await startApp(page);
    await goTo(page, 'einstellungen');
    await page.getByLabel('Neuer Monat beginnt am').selectOption('25');
    await goTo(page, 'monat');
    await setUp(page, (l) => l.tap(), '184,21');
    await expect(page.getByTestId('konto-setup-question')).toHaveText(/^Im \S+ kommen? /);
    await page.getByTestId('konto-setup-gap-spread').tap();
    await expect(page.getByTestId('setup-when')).toHaveText('am 25. Oktober, wenn dein Gehalt kommt');
    await expect(page.getByTestId('setup-how')).toHaveText(/, ab 25\. \S+ €/);
    await page.getByTestId('konto-setup-finish').tap();
    await expect(page.getByTestId('tile-when')).toHaveText('am 25. Oktober, wenn dein Gehalt kommt');
    await page.getByTestId('konto-tile-card').scrollIntoViewIfNeeded();
    await shot(page, 'iphone-15-hell-10-tag-25');
  });
});
