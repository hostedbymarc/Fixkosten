import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, openInfo, test, TODAY } from './fixtures';

// „Fixkosten einplanen“ (seed data, today 5 October 2026 → active month October):
// - for everyone: with an own account (standing order) and without („Nein, ich plane nur“)
// - one truth: monthly amount, one-time amount and status identical in tile, sheet, „Dein Plan“, settings
// - status only in words, three states; never „eingeplant“ while a point of the plan is open
// - setup one question per screen; „Dein Plan“ with a progress bar, the next point primary
// - sheet: month list with Einzahlung · Abbuchungen · Stand and signs, folds closed by default
// - monthly check (with and without account) and series
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/fixkosten-einplanen/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/fixkosten-einplanen';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const day = (iso: string) => new Date(`${iso}T09:00:00+01:00`);
const EURO = /€\s?[\d.]+(?:,\d{2})?/g;
const euros = (text: string) => text.match(EURO) ?? [];

async function shot(page: Page, name: string) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(350); // pop
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

async function openOn(page: Page, date: Date) {
  await page.clock.setFixedTime(date);
  await page.reload();
  await appSettled(page);
}

const text = async (l: Locator) => ((await l.textContent()) ?? '').replace(/\s+/g, ' ').trim();

/** The status sentence, the action sentence and the two amounts as each place shows them. */
interface Seen {
  status: string;
  action: string | null;
  order: string;
  gap: string | null;
}

async function seenIn(scope: Locator, prefix: string, order: Locator): Promise<Seen> {
  const action = scope.getByTestId(`${prefix}-action`);
  const actionText = (await action.count()) ? await text(action) : null;
  return {
    status: await text(scope.getByTestId(`${prefix}-text`)),
    action: actionText,
    order: await text(order),
    gap: actionText ? euros(actionText)[0]! : null,
  };
}

/** The tile shows the monthly amount only once everything is planned; before that the next task is its content. */
async function seenInTile(page: Page): Promise<Seen> {
  const card = page.getByTestId('konto-tile-card');
  const value = card.getByTestId('konto-tile-value');
  const seen = await seenIn(card, 'tile-status', value.or(card.getByTestId('tile-status')).first());
  return (await value.count()) ? seen : { ...seen, order: '' };
}

async function seenInSheet(page: Page, tap: (l: Locator) => Promise<void>): Promise<Seen> {
  await tap(page.getByTestId('konto-tile'));
  const sheet = page.getByTestId('konto-sheet');
  await expect(sheet).toBeVisible();
  const seen = await seenIn(sheet, 'sheet-status', sheet.getByTestId('konto-order-value'));
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  return seen;
}

async function seenInPlan(page: Page): Promise<Seen> {
  const seen = await seenIn(page.getByTestId('konto-setup'), 'plan-status', page.getByTestId('plan-order-value'));
  // the plan's point says the same sentence as the status line
  if (seen.action) {
    await expect(page.getByTestId('plan-gap')).toContainText(seen.action);
    expect(await text(page.getByTestId('plan-gap-value'))).toBe(seen.gap);
  }
  return seen;
}

async function seenInSettings(page: Page): Promise<Seen> {
  await goTo(page, 'einstellungen');
  const seen = await seenIn(page.getByTestId('konto-settings'), 'settings-status', page.getByTestId('konto-summary-order'));
  if (seen.gap) {
    // „€ 1.087,34 bis 24. Jänner“: the amount with the same date as the action sentence
    await expect(page.getByTestId('konto-summary-gap')).toHaveText(seen.gap);
    const by = /^Leg (bis .+|jetzt) einmalig/.exec(seen.action!)![1]!;
    await expect(page.getByTestId('konto-summary-gap-by')).toHaveText(by);
  }
  await goTo(page, 'monat');
  return seen;
}

const GAP_STATUS = /^Ab \S+ \d{4} reicht das Geld nicht\.$/;
// „bis 24. Jänner“: the date without the year (within the 12 months shown)
const GAP_ACTION = /^Leg (bis \d{1,2}\. [A-Za-zäÄ]+|jetzt) einmalig €\s[\d.]+,\d{2} zur Seite\.$/;
const COVERED = 'Alles eingeplant bis September 2027.';
/** the point in „Dein Plan“ also holds its „Erledigt“ button */
const GAP_POINT = new RegExp(GAP_ACTION.source.replace(/\$$/, ''));

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Fixkosten einplanen · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      // four places, reloads and screenshots in one test
      test.setTimeout(120_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('mit Konto (Betrag, Dauerauftrag läuft): eine Wahrheit an allen vier Stellen, nie „eingeplant“ bei offenem Punkt', async ({ page }) => {
        await startApp(page);
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-state', 'setup');
        // no question answered: the small heading, one sentence, „Jetzt starten“ – no repeated title
        await expect(card).toHaveAttribute('data-view', 'start');
        await expect(card.getByTestId('tile-status-text')).toHaveText('Fixkosten einplanen');
        // screen readers only (sr-only: 1 × 1 px)
        expect((await card.getByTestId('tile-status-text').boundingBox())!.width).toBeLessThanOrEqual(1);
        await expect(card.getByText('Fixkosten einplanen', { exact: true })).toHaveCount(2); // heading + screen-reader status
        await expect(card.getByTestId('konto-tile-start')).toHaveText('Jetzt starten');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-01-kachel-einplanen`);

        // one question per screen
        await tap(page.getByTestId('konto-tile'));
        const setup = page.getByTestId('konto-setup');
        await expect(setup).toHaveAttribute('data-step', 'account');
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Hast du ein eigenes Konto für Fixkosten?');
        await expect(page.getByTestId('konto-setup-progress')).toContainText('Frage 1 von 3');
        await shot(page, `${tag}-02-frage-konto`);
        await tap(page.getByTestId('konto-setup-account-yes'));
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Wie viel hast du heute schon für Fixkosten zur Seite gelegt?');
        await expect(page.getByTestId('konto-setup-nothing')).toHaveText('Noch nichts');
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await shot(page, `${tag}-03-frage-betrag`);
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Läuft dein Dauerauftrag schon?');
        await expect(page.getByTestId('konto-setup-progress')).toContainText('Frage 3 von 3');
        await tap(page.getByTestId('konto-setup-order-yes'));

        // „Dein Plan“: standing order to check (primary), one-time amount (secondary)
        await expect(setup).toHaveAttribute('data-step', 'plan');
        await expect(page.getByTestId('plan-account')).toHaveCount(0);
        await expect(page.getByTestId('plan-order')).toContainText(/^Dauerauftrag prüfen: €\s[\d.]+ monatlich am 1\. auf dein Fixkostenkonto/);
        await expect(page.getByTestId('plan-order-copy')).toHaveText('Betrag kopieren');
        await expect(page.getByTestId('plan-gap')).toContainText(GAP_POINT);
        await expect(page.getByTestId('plan-order-done')).toHaveAttribute('data-primary', 'true');
        await expect(page.getByTestId('plan-gap-done')).not.toHaveAttribute('data-primary');
        await expect(page.getByTestId('plan-status-text')).toHaveText('Fixkosten einplanen');
        await expect(page.getByTestId('plan-status-progress')).toHaveText('0 von 2 erledigt');
        await shot(page, `${tag}-04-plan-mit-konto`);
        const planOpen = await seenIn(setup, 'plan-status', page.getByTestId('plan-order-value'));
        const gapOpen = await text(page.getByTestId('plan-gap-value'));

        // closed with points open: the same status everywhere, never „eingeplant“
        await page.keyboard.press('Escape');
        await expect(setup).toHaveCount(0);
        await expect(card).toHaveAttribute('data-state', 'setup');
        // questions answered, points open: the next task with amount, date and „Erledigt“, then the bar
        await expect(card).toHaveAttribute('data-view', 'task');
        await expect(card.getByTestId('tile-status-action')).toHaveText(`Dauerauftrag prüfen: ${planOpen.order} am 1.`);
        await expect(card.getByTestId('tile-status-done')).toHaveText('Erledigt');
        await expect(card.getByTestId('tile-status-progress')).toHaveText('0 von 2 erledigt');
        await expect(page.getByText(/Alles eingeplant/)).toHaveCount(0);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('settings-status-text')).toHaveText('Fixkosten einplanen');
        await expect(page.getByTestId('settings-status-progress')).toHaveText('0 von 2 erledigt');
        await expect(page.getByTestId('konto-summary-order')).toHaveText(planOpen.order);
        await expect(page.getByTestId('konto-summary-gap')).toHaveText(gapOpen);
        // the analysis shows amount, chart and month list only, no setup progress
        await goTo(page, 'analyse');
        await expect(page.getByTestId('konto-analyse-order')).toBeVisible();
        await expect(page.getByTestId('konto-analyse').getByText(/von 2 erledigt/)).toHaveCount(0);
        await expect(page.getByTestId('analyse-status')).toHaveCount(0);
        await goTo(page, 'monat');

        // the tile opens „Dein Plan“ again; standing order checked → only the one-time amount is left
        await tap(page.getByTestId('konto-tile'));
        await expect(setup).toHaveAttribute('data-step', 'plan');
        await tap(page.getByTestId('plan-order-done'));
        await expect(page.getByTestId('plan-order')).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('plan-order').locator('.anim-check')).toHaveCount(1); // the pop
        await expect(page.getByTestId('plan-gap-done')).toHaveAttribute('data-primary', 'true');
        await expect(page.getByTestId('plan-status-progress')).toHaveCount(0);
        await expect(page.getByTestId('plan-status-text')).toHaveText(GAP_STATUS);
        await expect(page.getByTestId('plan-status-action')).toHaveText(GAP_ACTION);
        const plan = await seenInPlan(page);
        await page.keyboard.press('Escape');

        // ---- one truth: tile, sheet, „Dein Plan“, settings
        const tile = await seenInTile(page);
        const sheet = await seenInSheet(page, tap);
        const settings = await seenInSettings(page);
        expect(tile).toEqual({ ...plan, order: '' }); // the tile shows the task, not the monthly amount
        expect(sheet).toEqual(plan);
        expect(settings).toEqual(plan);
        expect(planOpen.order).toBe(plan.order);
        expect(gapOpen).toBe(plan.gap);
        await expect(card.getByTestId('tile-status-paid')).toHaveText('Erledigt, zur Seite gelegt');
        await expect(card.getByTestId('tile-status-progress')).toHaveText('1 von 2 erledigt');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-05-kachel-luecke`);

        // sheet: status first, folds closed, month list with columns and signs
        await tap(page.getByTestId('konto-tile'));
        const s = page.getByTestId('konto-sheet');
        for (const id of ['konto-months', 'konto-positions', 'konto-settings-inline']) await expect(s.getByTestId(id)).not.toHaveAttribute('open');
        await expect(s.getByTestId('konto-settings-inline').locator('summary')).toHaveText(/Zur Seite gelegt und Rundung/);
        await shot(page, `${tag}-06-sheet`);
        await s.getByTestId('konto-months').locator('summary').click();
        await expect(s.getByTestId('konto-month-head')).toHaveText(/Monat\s*Einzahlung\s*Abbuchungen\s*Stand/);
        const rows = s.getByTestId('konto-month-row');
        await expect(rows).toHaveCount(12);
        await expect(rows.nth(0).getByTestId('konto-month-deposit')).toHaveText('€ 0'); // October: arrived at the start
        await expect(rows.nth(1).getByTestId('konto-month-deposit')).toHaveText(`+${plan.order}`);
        await expect(rows.nth(1).getByTestId('konto-month-debits')).toHaveText(/^−€\s[\d.]+/);
        // the four columns fit: nothing in the list sticks out of it, the page has no horizontal scroll
        const fits = await s.getByTestId('konto-month-list').evaluate((el) => {
          const right = el.getBoundingClientRect().right + 0.5;
          return el.scrollWidth <= el.clientWidth && [...el.querySelectorAll('*')].every((n) => n.getBoundingClientRect().right <= right);
        });
        expect(fits).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.keyboard.press('Escape');

        // „Erledigt, zur Seite gelegt“ on the tile → planned, everywhere
        await tap(card.getByTestId('tile-status-paid'));
        await expect(card).toHaveAttribute('data-state', 'covered');
        await expect(card.getByTestId('tile-status-text')).toHaveText(COVERED);
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft: Zum ersten Mal alles eingeplant' })).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-07-kachel-eingeplant`);
        const coveredTile = await seenInTile(page);
        expect(coveredTile).toEqual({ status: COVERED, action: null, order: plan.order, gap: null });
        expect(await seenInSheet(page, tap)).toEqual(coveredTile);
        expect(await seenInSettings(page)).toEqual(coveredTile);
        await page.reload();
        await appSettled(page);
        await expect(card).toHaveAttribute('data-state', 'covered');
      });

      test('ohne Konto („Nein, ich plane nur“, „Noch nichts“): 0 von 2, jede Reihenfolge, Erfolgs-Moment, Monats-Check', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
        await tap(page.getByTestId('konto-setup-account-no'));
        await expect(page.getByTestId('konto-setup-progress')).toContainText('Frage 2 von 2');
        await tap(page.getByTestId('konto-setup-nothing'));
        // no standing order question: straight to the plan
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'plan');
        await expect(page.getByTestId('plan-status-progress')).toHaveText('0 von 2 erledigt');
        await expect(page.getByTestId('plan-status-bar')).toHaveAttribute('aria-valuenow', '0');
        await expect(page.getByTestId('plan-order')).toContainText(/^Leg jeden Monat €\s[\d.]+ für Fixkosten zur Seite\./);
        await expect(page.getByTestId('plan-order-copy')).toHaveCount(0);
        await expect(page.getByText(/Dauerauftrag|Fixkostenkonto/)).toHaveCount(0);
        const info = await openInfo(page, page.getByTestId('plan-order-info'));
        await expect(info).toHaveText(/Mit einem eigenen Konto und Dauerauftrag passiert das automatisch\./);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('plan-gap')).toContainText(GAP_POINT);
        const gap = await text(page.getByTestId('plan-gap-value'));
        await shot(page, `${tag}-08-plan-ohne-konto`);

        // the secondary point first: allowed, still not „eingeplant“ (the monthly amount is open)
        await expect(page.getByTestId('plan-gap-done')).not.toHaveAttribute('data-primary');
        await tap(page.getByTestId('plan-gap-done'));
        await expect(page.getByTestId('plan-gap')).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('plan-gap')).toContainText('Kein Extra-Betrag nötig.');
        await expect(page.getByTestId('plan-gap').locator('.anim-check')).toHaveCount(1);
        await expect(page.getByTestId('plan-status-progress')).toHaveText('1 von 2 erledigt');
        await expect(page.getByTestId('plan-status-bar')).toHaveAttribute('aria-valuenow', '1');
        await expect(page.getByTestId('plan-status-text')).toHaveText('Fixkosten einplanen');
        await expect(page.getByTestId('plan-success')).toHaveCount(0);
        await expect(page.getByText(/Alles eingeplant/)).toHaveCount(0);
        await shot(page, `${tag}-09-plan-1-von-2`);
        await tap(page.getByTestId('plan-order-done'));

        // all done: the success moment, then „Fertig“
        await expect(page.getByTestId('plan-success')).toHaveText(COVERED);
        await expect(page.getByTestId('plan-success').locator('.anim-check')).toHaveCount(1);
        await shot(page, `${tag}-10-erfolg`);
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft:' })).toHaveCount(0); // no toast over the success moment
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft: Zum ersten Mal alles eingeplant' })).toBeVisible();
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-state', 'covered');
        await expect(card.getByTestId('konto-tile-sub')).toHaveText(/^Monatlich €\s[\d.]+ am 1\.$/);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-summary-balance')).toHaveText(gap);
        await expect(page.getByTestId('konto-summary')).toContainText('Schon zur Seite gelegt');
        await expect(page.getByTestId('konto-summary')).toContainText('Monatlich zur Seite');
        await expect(page.getByTestId('settings-status-text')).toHaveText(COVERED);
        await expect(page.getByTestId('konto-enabled-text')).toHaveText(
          'Erbse sagt dir, wie viel du monatlich zur Seite legst. Und warnt, bevor es knapp wird.',
        );
        await page.getByTestId('konto-settings').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-11-einstellungen`);
        // „Einrichtung ändern“ starts with question 1 again
        await tap(page.getByTestId('konto-setup-edit'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'account');
        await page.keyboard.press('Escape');

        // monthly check without an account
        await goTo(page, 'monat');
        await openOn(page, day('2026-11-02'));
        await expect(page.getByTestId('konto-check-title')).toHaveText(/^Neuer Monat\. Hast du €\s[\d.]+ zur Seite gelegt\?$/);
        await shot(page, `${tag}-12-check-ohne-konto`);
      });

      test('Monats-Check mit Konto über den Monatswechsel und Serie; „Anderer Betrag“ = neuer Anker', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
        await tap(page.getByTestId('konto-setup-account-yes'));
        await page.getByTestId('konto-setup-balance').fill('5000');
        await tap(page.getByTestId('konto-setup-next'));
        await tap(page.getByTestId('konto-setup-order-yes')); // October: arrived
        await tap(page.getByTestId('plan-order-done'));
        if (await page.getByTestId('plan-gap-done').count()) await tap(page.getByTestId('plan-gap-done'));
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-check')).toHaveCount(0);

        await openOn(page, day('2026-11-02'));
        const check = page.getByTestId('konto-check');
        await expect(check).toHaveAttribute('data-card', 'month');
        await expect(page.getByTestId('konto-check-title')).toHaveText('Neuer Monat. Ist dein Dauerauftrag eingegangen?');
        await tap(page.getByTestId('konto-check-no'));
        await expect(check).toHaveCount(0);
        await openOn(page, day('2026-11-02'));
        await expect(check).toHaveCount(0);
        await openOn(page, day('2026-11-03'));
        await expect(page.getByTestId('konto-check-title')).toHaveText('Ist dein Dauerauftrag für November eingegangen?');
        await tap(page.getByTestId('konto-check-yes'));
        await expect(check).toHaveCount(0);
        await expect(page.getByTestId('konto-tile-streak')).toHaveText('2 Monate in Folge');

        await openOn(page, day('2027-01-04'));
        await tap(page.getByTestId('konto-check-yes'));
        await expect(page.getByTestId('konto-tile-streak')).toHaveText('Neue Serie startet.');
        await expect(check).toHaveAttribute('data-card', 'balance');
        await tap(page.getByTestId('konto-check-other'));
        await page.getByTestId('konto-check-amount').fill('777');
        await tap(page.getByTestId('konto-check-save'));
        await expect(check).toHaveCount(0);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-summary-balance')).toHaveText('€ 777');
        await expect(page.getByTestId('konto-summary-asof')).toHaveText('Stand vom 04.01.2027');
      });

      test('Einstellungen „Währung“ und (iPad, Desktop) Seitenmenü-Kopf', async ({ page }) => {
        await startApp(page);
        await goTo(page, 'einstellungen');
        const currency = page.getByTestId('country-settings');
        await expect(page.getByRole('heading', { name: 'Währung' })).toBeVisible();
        await expect(currency.getByRole('radio')).toHaveText(['Euro (€)', 'Schweizer Franken (CHF)']);
        await expect(currency.getByRole('radio', { name: 'Euro (€)' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByText('Land und Währung')).toHaveCount(0);
        await currency.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-13-waehrung`);
        await currency.getByRole('radio', { name: 'Schweizer Franken (CHF)' }).click();
        await expect(currency.getByRole('radio', { name: 'Schweizer Franken (CHF)' })).toHaveAttribute('aria-checked', 'true');
        await goTo(page, 'monat');
        await expect(page.getByTestId('kpi-value').first()).toHaveText(/^CHF\s/);
        const sidebar = page.getByTestId('sidebar');
        if (await sidebar.isVisible()) {
          await expect(sidebar.getByTestId('logo')).toHaveAttribute('aria-label', 'Erbse');
          await expect(sidebar.getByText('Erbse', { exact: true })).toHaveCount(0);
          await sidebar.screenshot({ path: `${DIR}/${tag}-14-seitenmenue.png` });
        }
      });
    });
  }
}

test.describe('Fixkosten einplanen · Neuer Monat beginnt am 25.', () => {
  test.use(VIEWPORTS['iphone-15']);
  test.setTimeout(90_000);
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
  test('Tag im Plan, in der Kachel und in den Einstellungen: „am 25.“; Datum der Lücke; ab dem 25. ist der Folgemonat aktiv', async ({ page }) => {
    await startApp(page);
    await goTo(page, 'einstellungen');
    await page.getByLabel('Neuer Monat beginnt am').selectOption('25');
    await expect(page.getByTestId('active-month')).toHaveText(/Oktober 2026/);
    await goTo(page, 'monat');
    await page.getByTestId('konto-tile').tap();
    await page.getByTestId('konto-setup-account-yes').tap();
    await page.getByTestId('konto-setup-balance').fill('0');
    await page.getByTestId('konto-setup-next').tap();
    await page.getByTestId('konto-setup-order-no').tap();
    await expect(page.getByTestId('plan-order')).toContainText(/monatlich am 25\./);
    // a one-time amount before a later month: the day before the 25th
    const gapText = await text(page.getByTestId('plan-gap'));
    if (/^Leg bis/.test(gapText)) expect(gapText).toMatch(/^Leg bis 24\. /);
    await page.getByTestId('plan-order-done').tap();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tile-status-action')).toHaveText(/^Leg (bis 24\. |jetzt)/);
    const gapTile = euros(await text(page.getByTestId('tile-status-action')))[0];
    // the sheet's list starts with the active month and has no deposit there (the order starts next month)
    await page.getByTestId('konto-tile').tap();
    const s = page.getByTestId('konto-sheet');
    await s.getByTestId('konto-months').locator('summary').click();
    await expect(s.getByTestId('konto-month-row').first()).toHaveAttribute('data-period', '2026-10');
    await expect(s.getByTestId('konto-month-row').first().getByTestId('konto-month-deposit')).toHaveText('€ 0');
    await page.keyboard.press('Escape');
    // 25 October: November is active; the gap is computed for the new window
    await openOn(page, new Date('2026-10-25T09:00:00+02:00'));
    await expect(page.getByTestId('konto-tile-card')).toBeVisible();
    await page.getByTestId('konto-tile').tap();
    await s.getByTestId('konto-months').locator('summary').click();
    await expect(s.getByTestId('konto-month-row').first()).toHaveAttribute('data-period', '2026-11');
    await page.keyboard.press('Escape');
    await goTo(page, 'einstellungen');
    await expect(page.getByTestId('konto-summary-order')).toBeVisible();
    await expect(page.getByTestId('konto-summary-order').locator('..')).toHaveText(/am 25\.$/);
    expect(gapTile).toBeTruthy();
  });
});

test.describe('Icons (Stand rebrand-erbse)', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'einmal, im Projekt desktop'));
  test('alle Icons auf einer Seite, hell und dunkel', async ({ page }) => {
    await page.goto('/');
    const icons = ['/favicon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
    for (const icon of icons) expect((await page.request.get(icon)).status(), icon).toBe(200);
    const cells = icons
      .map(
        (src) =>
          `<figure style="margin:0;text-align:center"><img src="${src}" width="128" height="128" style="display:block;margin:0 auto 8px"><figcaption>${src.slice(1)}</figcaption></figure>`,
      )
      .join('');
    for (const [name, bg, ink] of [
      ['hell', 'whitesmoke', 'black'],
      ['dunkel', 'black', 'white'],
    ] as const) {
      await page.setContent(
        `<body style="margin:0;padding:24px;background:${bg};color:${ink};font:14px system-ui"><div style="display:flex;gap:24px;flex-wrap:wrap">${cells.replaceAll('src="/', `src="${new URL(page.url()).origin}/`)}</div></body>`,
      );
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
      await page.screenshot({ path: `${DIR}/icons-${name}.png`, fullPage: true });
    }
  });
});
