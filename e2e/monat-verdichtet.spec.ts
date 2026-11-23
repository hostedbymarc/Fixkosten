import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, FIXTURE, goTo, NOV_5, setUpKonto, test, TODAY, closePlan } from './fixtures';

// monat-verdichtet (seed data, today 5 October 2026 → October active, a rebuilt salary € 8.302):
// - „Dein Monat“ (only the active month, only with „Fixkosten einplanen“), for the next salary: Netto,
//   ① to the account, ② direct, ③ Vermögensaufbau, „Frei für dich“; the pill in every state (fits, missing,
//   not set, no salary); the pill opens „Dein Plan“ with the Spielgeld editable; the transfer confirmed.
// - „Dein Plan“: the three answers (passt so / ansparen with a proposal / geht nicht with the maximum),
//   „Übernehmen“, „Spielgeld auf € M setzen“, the switch, one payment changed on its own („Eigener Plan“).
// - The bills row: the confetti once live at the last tick, afterwards lying peas in the row.
// - Layout: on the iPhone card and bills row without scrolling; iPad/desktop card left, big month right.
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/monat-verdichtet/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/monat-verdichtet';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

/** „€ 1.008,00“ / „− € 1.008,00“ → 1008 */
const amountOf = (text: string) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
const valueOf = async (l: Locator) => amountOf((await l.textContent())!);

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  if (target) await target.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
}

async function closeSheet(page: Page) {
  await sheetIn(page);
  await closePlan(page);
}

async function start(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await page.getByTestId('konto-invite-enable').click();
}

/** The Spielgeld through the pill: „Dein Plan“ opens with the amount editable. */
async function spielgeldViaPill(page: Page, tap: (l: Locator) => Promise<void>, amount: string) {
  await tap(page.getByTestId('dein-monat-pill'));
  await sheetIn(page);
  const input = page.getByTestId('plan-spielgeld-input');
  await expect(input).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(amount);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    const phone = vp.startsWith('iphone');
    test.describe(`Monat verdichtet · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('„Dein Monat“: ohne Netto, passt, fehlt, festlegen; „Dein Plan“ mit drei Antworten', async ({ page }) => {
        await start(page);
        await setUpKonto(page, '500');
        const card = page.getByTestId('dein-monat');

        // without a salary: the hint and a button, no further rows
        await expect(card).toHaveAttribute('data-state', 'no-salary');
        await expect(page.getByTestId('dein-monat-no-salary')).toContainText('Trag dein Gehalt ein. Dann rechnet Erbse deinen Monat.');
        await expect(page.getByTestId('dein-monat-transfer')).toHaveCount(0);
        await shot(page, `${tag}-01-monat-ohne-netto`);
        await tap(page.getByTestId('dein-monat-enter-salary'));
        const close = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
        await sheetIn(page);
        await close.getByTestId('close-salary').fill('8.302');
        await tap(close.getByRole('button', { name: 'Speichern' }));
        await expect(close).toBeHidden();

        // monat-ist-monat: the active period October, paid by the Oktober-Gehalt; the statement adds up
        await expect(page.getByTestId('dein-monat-salary-title')).toHaveText('Oktober-Gehalt');
        await expect(page.getByTestId('dein-monat-salary-when')).toHaveText('ausgezahlt am 1. Oktober');
        // monat-feinschliff: no „geschätzt“ – the last salary is used without a hint
        await expect(page.getByTestId('dein-monat')).not.toContainText('geschätzt');
        await expect(page.getByTestId('dein-monat-salary-value')).toHaveText(/€\s8\.302,00/);
        await expect(page.getByTestId('dein-monat-transfer')).toContainText('Aufs Fixkostenkonto');
        const transfer = await valueOf(page.getByTestId('dein-monat-transfer-value'));
        const direct = await valueOf(page.getByTestId('dein-monat-direct-value'));
        const wealth = await valueOf(page.getByTestId('dein-monat-wealth-value'));
        const unplanned = await valueOf(page.getByTestId('dein-monat-unplanned-value'));
        const free = await valueOf(page.getByTestId('dein-monat-free-value'));
        expect(free).toBeCloseTo(8302 - transfer - direct - wealth - unplanned, 2);
        // no Spielgeld: „Spielgeld festlegen“
        const pill = page.getByTestId('dein-monat-pill');
        await expect(pill).toHaveAttribute('data-status', 'none');
        await expect(pill).toHaveText('Spielgeld festlegen');

        // the pill: „Dein Plan“ with the Spielgeld editable (the thousands dot while typing)
        await tap(pill);
        await sheetIn(page);
        const input = page.getByTestId('plan-spielgeld-input');
        await expect(input).toBeFocused();
        await page.keyboard.type('1200');
        await expect(input).toHaveValue('1.200');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('plan-spielgeld-amount')).toHaveText(/^€\s1\.200,00$/);
        // answer 1
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', 'ok');
        await expect(page.getByTestId('plan-answer')).toHaveText('Passt so. Dein Spielgeld bleibt jeden Monat übrig.');
        await shot(page, `${tag}-11-plan-passt`);
        await closeSheet(page);
        await expect(pill).toHaveAttribute('data-status', 'ok');
        // monat-ist-monat: ④ (nothing „nicht eingeplant“ in October) against the limit
        await expect(pill).toHaveText(/^Spielgeld: €\s0,00 von €\s1\.200,00 · €\s1\.200,00 übrig$/);
        await expect(pill.locator('svg')).toHaveCount(1);
        await expect(card).toHaveAttribute('data-state', 'ok');
        await shot(page, `${tag}-02-monat-passt`);
        // the iPhone: card and bills row without scrolling
        if (vp === 'iphone-15') {
          const bills = await page.getByTestId('dein-monat-bills').boundingBox();
          expect(bills!.y + bills!.height).toBeLessThanOrEqual(852);
        }

        // € 3.000 with „Bei Fälligkeit“: February misses it – answer 2 with a proposal; „Übernehmen“ → Eigener Plan
        await spielgeldViaPill(page, tap, '3000');
        await tap(page.getByTestId('plan-mode-due'));
        await expect(page.getByTestId('plan-mode-due')).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', 'save');
        await expect(page.getByTestId('plan-proposal').first()).toHaveText(/^Spar ab [A-ZÄÖÜ][a-zäöü]+ €\s[\d.]+,\d{2} im Monat für .+ an\.$/);
        await shot(page, `${tag}-12-plan-ansparen`);
        await tap(page.getByTestId('plan-apply'));
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', 'ok');
        await expect(page.getByTestId('plan-custom')).toHaveText('Eigener Plan');
        await expect(page.locator('[data-testid=plan-payment][data-mode=spread]')).not.toHaveCount(0);

        // one payment changed on its own: „vorher ansparen“ from a chosen month, then back to „im … zahlen“
        // a payment that still needs money (one already saved has no rates)
        const pay = page.locator('[data-testid=plan-payment][data-mode=due]').filter({ hasNot: page.getByTestId('plan-payment-saved') }).first();
        const name = (await pay.getAttribute('data-name'))!;
        await pay.getByTestId('plan-payment-edit').scrollIntoViewIfNeeded();
        await tap(pay.getByTestId('plan-payment-edit'));
        await tap(pay.getByTestId('plan-payment-spread'));
        const changed = page.locator(`[data-testid=plan-payment][data-name="${name}"]`).first();
        await expect(changed).toHaveAttribute('data-mode', 'spread');
        await expect(changed.getByTestId('plan-payment-state')).toHaveText(/^vorher ansparen: \d+ × €\s[\d.]+,\d{2} ab [A-ZÄÖÜ][a-zäöü]+$/);
        await tap(changed.getByTestId('plan-payment-due'));
        await expect(changed).toHaveAttribute('data-mode', 'due');
        await expect(changed.getByTestId('plan-payment-state')).toHaveText(/^im [A-ZÄÖÜ][a-zäöü]+ zahlen$/);
        await tap(changed.getByTestId('plan-payment-ready'));

        // € 6.000: no plan keeps it – answer 3 with the maximum; „Spielgeld auf € M setzen“
        await page.getByTestId('plan-spielgeld-amount').scrollIntoViewIfNeeded();
        await tap(page.getByTestId('plan-spielgeld-amount'));
        await expect(page.getByTestId('plan-spielgeld-input')).toBeFocused();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('6000');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', 'max');
        await expect(page.getByTestId('plan-answer')).toContainText(/^Geht nicht ganz\. Höchstens €\s[\d.]+,00 Spielgeld sind möglich\./);
        const max = amountOf((await page.getByTestId('plan-answer').locator('p').textContent())!.match(/€\s[\d.]+,\d{2}/)![0]);
        expect(max % 50).toBe(0);
        await expect(page.locator('[data-testid=plan-salary-row][data-short]').first()).toBeAttached();
        await shot(page, `${tag}-13-plan-geht-nicht`);
        await closeSheet(page);
        // monat-ist-monat: the card compares only ④ of this month with the limit – what the plan cannot keep is in „Dein Plan“
        await expect(pill).toHaveAttribute('data-status', 'ok');
        await expect(pill).toHaveText(/^Spielgeld: €\s0,00 von €\s6\.000,00 · €\s6\.000,00 übrig$/);
        await expect(pill.locator('svg')).toHaveCount(1);
        await shot(page, `${tag}-03-monat-fehlt`);
        await tap(pill);
        await sheetIn(page);
        await tap(page.getByTestId('plan-set-max'));
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', 'ok');
        await expect.poll(() => valueOf(page.getByTestId('plan-spielgeld-amount'))).toBe(max);
        // the switch back to „Gleichmäßig“
        await tap(page.getByTestId('plan-mode-even'));
        await expect(page.getByTestId('plan-mode-even')).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('plan-mode-info')).toHaveText('Du sparst alle großen Zahlungen vorher in gleichen Raten an.');
        await closeSheet(page);

        // another month (alle-monate-gleich): the same card, no hero, no status line, no next-salary line
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
        await expect(page.getByTestId('dein-monat')).toHaveAttribute('data-when', 'future');
        await expect(page.getByTestId('hero')).toHaveCount(0);
        await expect(page.getByTestId('next-salary')).toHaveCount(0);
      });

      test('„Überwiesen“ bestätigen; Rechnungen-Zeile: Konfetti einmal, dann liegende Erbsen', async ({ page }) => {
        test.skip(scheme === 'dark' && vp !== 'iphone-15' && vp !== 'desktop-1440', 'Logik, Screenshot in dunkel nur iPhone 15 und Desktop');
        await start(page);
        await setUpKonto(page);
        // the bills at the bottom of the green card (monat-feinschliff-2): 15 of 16 paid (the Depotentgelt is open)
        const bills = page.getByTestId('dein-monat');
        await expect(page.getByTestId('dein-monat-bills-open')).toHaveText('15 von 16 Rechnungen bezahlt');
        const depot = page.locator('[data-position="pos-depotentgelt"]').getByTestId('toggle-paid').first();
        if (!(await depot.isVisible())) await tap(page.getByRole('button', { name: 'Alle ausklappen' }));
        await depot.scrollIntoViewIfNeeded();
        await tap(depot);
        await expect(bills).toHaveAttribute('data-done', 'true');
        await expect(page.getByTestId('dein-monat-bills-title')).toHaveText('Oktober erledigt');
        await expect(page.getByTestId('bills-row')).toHaveCount(0);
        const confetti = bills.getByTestId('hero-confetti');
        await expect(confetti).toHaveAttribute('data-falling', '');
        // after a reload: lying still in the row (same place), no falling
        await page.reload();
        await appSettled(page);
        await expect(bills.getByTestId('hero-confetti')).toBeVisible();
        await expect(bills.getByTestId('hero-confetti')).not.toHaveAttribute('data-falling', '');
        expect(Number(await bills.getByTestId('hero-confetti').getAttribute('data-count'))).toBeGreaterThan(0);
        await shot(page, `${tag}-04-monat-erledigt`);

        // November: this month's transfer is open – the button replaces the monthly check
        await page.clock.setFixedTime(NOV_5);
        await page.reload();
        await appSettled(page);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
        await expect(page.getByTestId('konto-check')).toHaveCount(0);
        const confirm = page.getByTestId('dein-monat-confirm');
        await expect(confirm).toHaveText(/^€\s[\d.]+,\d{2} aufs Fixkostenkonto überwiesen$/);
        await tap(confirm);
        await expect(page.getByTestId('dein-monat-done')).toHaveText('Überwiesen. Erledigt am 5. November.');
        await expect(confirm).toHaveCount(0);
      });

      test('Layout: iPhone ohne Scrollen, iPad und Desktop Karte links, großer Monat rechts', async ({ page }) => {
        test.skip(scheme === 'dark' && vp !== 'desktop-1440', 'Layout, dunkel nur Desktop');
        await start(page);
        await setUpKonto(page);
        const card = (await page.getByTestId('dein-monat').boundingBox())!;
        const bills = (await page.getByTestId('dein-monat-bills').boundingBox())!;
        const big = (await page.getByTestId('big-month').boundingBox())!;
        const cats = (await page.getByTestId('categories-label').boundingBox())!;
        if (phone) {
          // one column: card (with the bills at its bottom), big month, categories
          expect(bills.y + bills.height).toBeLessThanOrEqual(card.y + card.height);
          expect(big.y).toBeGreaterThan(bills.y + bills.height - 1);
          expect(cats.y).toBeGreaterThan(big.y);
          expect(bills.y + bills.height).toBeLessThanOrEqual(use.viewport.height);
        } else {
          // the big month right of the card, at its top; the categories below the card, in its column
          expect(big.x).toBeGreaterThan(card.x + card.width);
          expect(Math.abs(big.y - card.y)).toBeLessThan(24);
          expect(cats.y).toBeGreaterThan(bills.y + bills.height - 1);
          expect(Math.abs(cats.x - card.x)).toBeLessThan(12);
          // no stretched surfaces: the card keeps a reading width
          expect(card.width).toBeLessThanOrEqual(820);
        }
        await shot(page, `${tag}-05-layout`);
      });
    });
  }
}

test.describe('Monat verdichtet · „Nicht einplanen“ und „Direkt“', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'läuft im Projekt desktop'));
  test('„Nicht einplanen“ senkt ① sofort; aus → „Direkt“ zählt unter ②', async ({ page }) => {
    await start(page);
    await setUpKonto(page);
    await page.getByTestId('dein-monat-enter-salary').click();
    const close = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
    await sheetIn(page);
    await close.getByTestId('close-salary').fill('8.302');
    await close.getByRole('button', { name: 'Speichern' }).click();
    await expect(close).toBeHidden();
    const transfer = await valueOf(page.getByTestId('dein-monat-transfer-value'));
    const direct = await valueOf(page.getByTestId('dein-monat-direct-value'));

    // Miete (€ 1.008 a month) → „Nicht einplanen“: ① drops by its monthly amount
    await goTo(page, 'positionen');
    await page.getByRole('button', { name: 'Miete – Details' }).click();
    await sheetIn(page);
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await sheetIn(page);
    await page.getByTestId('unplanned-field-switch').click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('position-form')).toHaveCount(0);
    await sheetIn(page);
    await page.keyboard.press('Escape');
    await goTo(page, 'monat');
    await expect.poll(() => valueOf(page.getByTestId('dein-monat-transfer-value'))).toBeCloseTo(transfer - 1008, 2);
    await expect.poll(() => valueOf(page.getByTestId('dein-monat-direct-value'))).toBeCloseTo(direct, 2);

    // switched off again: „Direkt“ – under ② with its name
    await goTo(page, 'positionen');
    await page.getByRole('button', { name: 'Miete – Details' }).click();
    await sheetIn(page);
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await sheetIn(page);
    await page.getByTestId('unplanned-field-switch').click();
    await expect(page.getByTestId('account-field').getByRole('radio', { name: 'Direkt' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('position-form')).toHaveCount(0);
    await sheetIn(page);
    await page.keyboard.press('Escape');
    await goTo(page, 'monat');
    await expect.poll(() => valueOf(page.getByTestId('dein-monat-direct-value'))).toBeCloseTo(direct + 1008, 2);
    // monat-ist-monat: the row opens its items – Miete is among them
    if ((await page.getByTestId('dein-monat-split-toggle').getAttribute('aria-expanded')) !== 'true') await page.getByTestId('dein-monat-split-toggle').click();
    await page.getByTestId('dein-monat-direct-toggle').click();
    await expect(page.getByTestId('dein-monat-direct-list')).toContainText('Miete');
  });

  test('Einstellungen: Spielgeld mit Tausenderpunkt, eigenes Konto nein → „Zur Seite legen“, „Dein Plan öffnen“', async ({ page }) => {
    await start(page);
    await setUpKonto(page);
    await goTo(page, 'einstellungen');
    const setting = page.getByTestId('konto-spielgeld');
    await setting.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('25000');
    await expect(setting).toHaveValue('25.000');
    await setting.fill('1.200,50');
    await expect(setting).toHaveValue('1.200,50');
    await expect(page.getByText('Lücke schließen')).toHaveCount(0);
    await page.getByRole('radiogroup', { name: 'Eigenes Konto für Fixkosten' }).getByRole('radio', { name: 'Nein' }).click();
    await page.getByTestId('settings-open-plan').click();
    await expect(page.getByTestId('plan-sheet')).toBeVisible();
    await expect(page.getByTestId('plan-salaries')).toContainText('zur Seite');
    await closeSheet(page);
    await goTo(page, 'monat');
    await expect(page.getByTestId('dein-monat')).toBeVisible();
    await expect(page.getByTestId('dein-monat-salary')).toBeVisible();
  });
});
