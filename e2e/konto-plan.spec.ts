import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// Fixkostenkonto · Überarbeitung #40 (seed data, today 5 October 2026 → active month October):
// - one truth: Dauerauftrag, Startlücke and status are identical in tile, sheet, „Dein Plan“ and settings
// - status only in words, three states; never „gedeckt“ while a point of the plan is open
// - setup in two questions, both answer variants; „Dein Plan“ as a checklist with progress
// - sheet: month list with Einzahlung · Abbuchungen · Stand and signs, folds closed by default
// - monthly check and series unchanged
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/fixkostenkonto-plan/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/fixkostenkonto-plan';
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

/** The three numbers and the status sentence as each place shows them. */
interface Seen {
  status: string;
  order: string;
  gap: string | null;
}

async function seenInTile(page: Page): Promise<Seen> {
  const card = page.getByTestId('konto-tile-card');
  const status = await text(card.getByTestId('tile-status-text'));
  const action = card.getByTestId('tile-status-action');
  return {
    status,
    order: await text(card.getByTestId('konto-tile-value')),
    gap: (await action.count()) ? euros(await text(action))[0]! : null,
  };
}

async function seenInSheet(page: Page, tap: (l: Locator) => Promise<void>): Promise<Seen> {
  await tap(page.getByTestId('konto-tile'));
  const sheet = page.getByTestId('konto-sheet');
  await expect(sheet).toBeVisible();
  const action = sheet.getByTestId('sheet-status-action');
  const seen = {
    status: await text(sheet.getByTestId('sheet-status-text')),
    order: await text(sheet.getByTestId('konto-order-value')),
    gap: (await action.count()) ? euros(await text(action))[0]! : null,
  };
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  return seen;
}

async function seenInPlan(page: Page): Promise<Seen> {
  const gapValue = page.getByTestId('plan-gap-value');
  return {
    status: await text(page.getByTestId('plan-status-text')),
    order: await text(page.getByTestId('plan-order-value')),
    gap: (await gapValue.count()) ? await text(gapValue) : null,
  };
}

async function seenInSettings(page: Page): Promise<Seen> {
  await goTo(page, 'einstellungen');
  const gap = page.getByTestId('konto-summary-gap');
  const seen = {
    status: await text(page.getByTestId('settings-status-text')),
    order: await text(page.getByTestId('konto-summary-order')),
    gap: (await gap.count()) ? await text(gap) : null,
  };
  await goTo(page, 'monat');
  return seen;
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Fixkostenkonto-Plan · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      // four places, reloads and screenshots in one test
      test.setTimeout(120_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Variante A (Kontostand, Dauerauftrag läuft): eine Wahrheit an allen vier Stellen, nie „gedeckt“ bei offenem Punkt', async ({ page }) => {
        await startApp(page);
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-state', 'setup');
        await expect(card.getByTestId('tile-status-text')).toHaveText('Fixkostenkonto einrichten');
        await expect(card.getByTestId('tile-status-progress')).toHaveText('0 von 3 erledigt');
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-1-kachel-einrichten`);

        // two questions
        await tap(page.getByTestId('konto-tile'));
        const setup = page.getByTestId('konto-setup');
        await expect(setup).toHaveAttribute('data-step', 'balance');
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Wie viel liegt heute auf deinem Fixkostenkonto?');
        await expect(page.getByTestId('konto-setup-no-account')).toHaveText('Ich habe noch keins');
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await shot(page, `${tag}-2-frage-1`);
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Läuft dein Dauerauftrag schon?');
        await shot(page, `${tag}-3-frage-2`);
        await tap(page.getByTestId('konto-setup-order-yes'));

        // „Dein Plan“: account there, standing order to check, one-time transfer
        await expect(setup).toHaveAttribute('data-step', 'plan');
        await expect(page.getByTestId('plan-account')).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('plan-account')).toContainText('Fixkostenkonto ist da');
        await expect(page.getByTestId('plan-order')).toContainText(/^Dauerauftrag prüfen: €\s[\d.]+ monatlich am 1\./);
        await expect(page.getByTestId('plan-gap')).toContainText(/^Einmalig €\s[\d.]+,\d{2} einzahlen/);
        await expect(page.getByTestId('plan-status-text')).toHaveText('Fixkostenkonto einrichten');
        await expect(page.getByTestId('plan-status-progress')).toHaveText('1 von 3 erledigt');
        await shot(page, `${tag}-4-dein-plan`);
        const planOpen = await seenInPlan(page);

        // closed with points open: the same status everywhere, never „gedeckt“
        await page.keyboard.press('Escape');
        await expect(setup).toHaveCount(0);
        await expect(card).toHaveAttribute('data-state', 'setup');
        await expect(card.getByTestId('tile-status-progress')).toHaveText('1 von 3 erledigt');
        await expect(page.getByText(/Alles gedeckt/)).toHaveCount(0);
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('settings-status-text')).toHaveText('Fixkostenkonto einrichten');
        await expect(page.getByTestId('settings-status-progress')).toHaveText('1 von 3 erledigt');
        await expect(page.getByTestId('konto-summary-order')).toHaveText(planOpen.order);
        await expect(page.getByTestId('konto-summary-gap')).toHaveText(planOpen.gap!);
        await goTo(page, 'analyse');
        await expect(page.getByTestId('analyse-status-text')).toHaveText('Fixkostenkonto einrichten');
        await goTo(page, 'monat');

        // the tile opens „Dein Plan“ again; standing order checked → only the gap is left
        await tap(page.getByTestId('konto-tile'));
        await expect(setup).toHaveAttribute('data-step', 'plan');
        await tap(page.getByTestId('plan-order-done'));
        await expect(page.getByTestId('plan-order')).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('plan-order').locator('.anim-check')).toHaveCount(1); // the pop
        await expect(page.getByTestId('plan-status-progress')).toHaveCount(0);
        await expect(page.getByTestId('plan-status-text')).toHaveText(/^Im \S+ \d{4} fehlen €\s[\d.]+,\d{2}\.$/);
        const plan = await seenInPlan(page);
        await page.keyboard.press('Escape');

        // ---- one truth: tile, sheet, „Dein Plan“, settings
        const tile = await seenInTile(page);
        const sheet = await seenInSheet(page, tap);
        const settings = await seenInSettings(page);
        expect(tile).toEqual(plan);
        expect(sheet).toEqual(plan);
        expect(settings).toEqual(plan);
        expect(planOpen.order).toBe(plan.order);
        expect(planOpen.gap).toBe(plan.gap);
        // „Im Februar 2027 fehlen € 865,79.“ and „Zahl einmalig € 865,79 ein, dann passt alles.“: one amount
        expect(euros(plan.status)).toEqual([plan.gap]);
        await expect(card.getByTestId('tile-status-action')).toHaveText(`Zahl einmalig ${plan.gap} ein, dann passt alles.`);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-5-kachel-luecke`);

        // sheet: status first, folds closed, month list with columns and signs
        await tap(page.getByTestId('konto-tile'));
        const s = page.getByTestId('konto-sheet');
        for (const id of ['konto-months', 'konto-positions', 'konto-settings-inline']) await expect(s.getByTestId(id)).not.toHaveAttribute('open');
        await expect(s.getByTestId('konto-settings-inline').locator('summary')).toHaveText(/Kontostand und Rundung/);
        await shot(page, `${tag}-6-sheet`);
        await s.getByTestId('konto-months').locator('summary').click();
        await expect(s.getByTestId('konto-month-head')).toHaveText(/Monat\s*Einzahlung\s*Abbuchungen\s*Stand/);
        const rows = s.getByTestId('konto-month-row');
        await expect(rows).toHaveCount(12);
        await expect(rows.nth(0).getByTestId('konto-month-deposit')).toHaveText('€ 0'); // October: arrived at the start
        await expect(rows.nth(1).getByTestId('konto-month-deposit')).toHaveText(`+${plan.order}`);
        await expect(rows.nth(1).getByTestId('konto-month-debits')).toHaveText(/^−€\s[\d.]+/);
        await expect(s.getByText(/€\s?[\d.,]+ ab\b/)).toHaveCount(0);
        // the four columns fit: nothing in the list sticks out of it, the page has no horizontal scroll
        const fits = await s.getByTestId('konto-month-list').evaluate((el) => {
          const right = el.getBoundingClientRect().right + 0.5;
          return el.scrollWidth <= el.clientWidth && [...el.querySelectorAll('*')].every((n) => n.getBoundingClientRect().right <= right);
        });
        expect(fits).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await s.getByTestId('konto-months').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-7-sheet-monate`);
        await page.keyboard.press('Escape');

        // „Erledigt, eingezahlt“ on the tile → covered, everywhere
        await tap(card.getByTestId('tile-status-paid'));
        await expect(card).toHaveAttribute('data-state', 'covered');
        await expect(card.getByTestId('tile-status-text')).toHaveText('Alles gedeckt bis September 2027.');
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft: Zum ersten Mal alles gedeckt' })).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-8-kachel-gedeckt`);
        const coveredTile = await seenInTile(page);
        expect(coveredTile).toEqual({ status: 'Alles gedeckt bis September 2027.', order: plan.order, gap: null });
        expect(await seenInSheet(page, tap)).toEqual(coveredTile);
        expect(await seenInSettings(page)).toEqual(coveredTile);
        await page.reload();
        await appSettled(page);
        await expect(card).toHaveAttribute('data-state', 'covered');
      });

      test('Variante B („Ich habe noch keins“, Nein): 0 von 3, Pop je Punkt, Erfolgs-Moment', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
        await tap(page.getByTestId('konto-setup-no-account'));
        await expect(page.getByTestId('konto-setup-question')).toHaveText('Läuft dein Dauerauftrag schon?');
        await tap(page.getByTestId('konto-setup-order-no'));
        await expect(page.getByTestId('plan-status-progress')).toHaveText('0 von 3 erledigt');
        await expect(page.getByTestId('plan-account')).toContainText('Fixkostenkonto eröffnen');
        await expect(page.getByTestId('plan-order')).toContainText(/^Dauerauftrag einrichten: €\s[\d.]+ monatlich am 1\./);
        const gap = await text(page.getByTestId('plan-gap-value'));
        await shot(page, `${tag}-9-plan-ohne-konto`);

        // the transfer first: still not „gedeckt“, account and standing order are open
        await tap(page.getByTestId('plan-gap-done'));
        await expect(page.getByTestId('plan-gap')).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('plan-gap')).toContainText('Keine Einzahlung nötig');
        await expect(page.getByTestId('plan-status-progress')).toHaveText('1 von 3 erledigt');
        await expect(page.getByTestId('plan-status-text')).toHaveText('Fixkostenkonto einrichten');
        await expect(page.getByTestId('plan-success')).toHaveCount(0);
        await tap(page.getByTestId('plan-account-done'));
        await expect(page.getByTestId('plan-account').locator('.anim-check')).toHaveCount(1);
        await expect(page.getByTestId('plan-status-progress')).toHaveText('2 von 3 erledigt');
        await shot(page, `${tag}-10-plan-2-von-3`);
        await expect(page.getByText(/Alles gedeckt/)).toHaveCount(0);
        await tap(page.getByTestId('plan-order-done'));

        // all done: the success moment, then „Fertig“
        await expect(page.getByTestId('plan-success')).toHaveText('Alles gedeckt bis September 2027.');
        await expect(page.getByTestId('plan-success').locator('.anim-check')).toHaveCount(1);
        await shot(page, `${tag}-11-erfolg`);
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft:' })).toHaveCount(0); // no toast over the success moment
        await tap(page.getByTestId('konto-setup-finish'));
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: 'Geschafft: Zum ersten Mal alles gedeckt' })).toBeVisible();
        const card = page.getByTestId('konto-tile-card');
        await expect(card).toHaveAttribute('data-state', 'covered');
        await goTo(page, 'einstellungen');
        await expect(page.getByTestId('konto-summary-balance')).toHaveText(gap);
        await expect(page.getByTestId('settings-status-text')).toHaveText('Alles gedeckt bis September 2027.');
        await page.getByTestId('konto-settings').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-12-einstellungen`);
        // „Einrichtung ändern“ starts with question 1 again
        await tap(page.getByTestId('konto-setup-edit'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'balance');
      });

      test('Monats-Check über den Monatswechsel und Serie (wie gebaut); „Anderer Betrag“ = neuer Anker', async ({ page }) => {
        await startApp(page);
        await tap(page.getByTestId('konto-tile'));
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
    });
  }
}

test.describe('Fixkostenkonto-Plan · Neuer Monat beginnt am 25.', () => {
  test.use(VIEWPORTS['iphone-15']);
  test.setTimeout(90_000);
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
  test('Tag im Plan, in der Kachel und in den Einstellungen: „am 25.“; ab dem 25. ist der Folgemonat aktiv', async ({ page }) => {
    await startApp(page);
    await goTo(page, 'einstellungen');
    await page.getByLabel('Neuer Monat beginnt am').selectOption('25');
    await expect(page.getByTestId('active-month')).toHaveText(/Oktober 2026/);
    await goTo(page, 'monat');
    await page.getByTestId('konto-tile').tap();
    await page.getByTestId('konto-setup-balance').fill('0');
    await page.getByTestId('konto-setup-next').tap();
    await page.getByTestId('konto-setup-order-no').tap();
    await expect(page.getByTestId('plan-order')).toContainText(/monatlich am 25\./);
    await page.getByTestId('plan-order-done').tap();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('konto-tile-sub')).toHaveText(/am 25\.$/);
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
