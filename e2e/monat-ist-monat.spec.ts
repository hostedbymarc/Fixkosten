import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, closePlan, expandAll, expect, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// monat-ist-monat (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - „Dein Monat“ shows the active period: the Oktober-Gehalt (paid 25 October) and ① – ④ of November
// - every row opens its items; the counted items add up to the row
// - a one-time payment „nicht eingeplant“: ④ (Spielgeld) and „Überschuss“ change at once, the Spielgeld pill turns to „drüber“;
//   set to „Andere Quelle“ it no longer counts (listed muted)
// - under the card: „November-Gehalt · kommt am 25.11. · Plan ansehen“ opens „Dein Plan“
// - in the categories: „in diesem Monat € 450 statt € 480“ (Lebensmittel, debited less)
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/monat-ist-monat/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/monat-ist-monat';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const cents = (text: string) => {
  const negative = /−|-/.test(text);
  const v = Math.round(Number(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return negative ? -v : v;
};
const centsOf = async (l: Locator) => cents((await l.textContent())!);
const plain = (s: string | null) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ');

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  if (target) await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
}

async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
}

/** the counted items of a row (not the muted ones) add up to the row's amount */
async function expectListIsRow(page: Page, testId: string) {
  const row = page.getByTestId(testId);
  const items = row.locator(`[data-testid=${testId}-item]:not([data-muted])`);
  let total = 0;
  for (const amount of await items.getByTestId(`${testId}-item-amount`).allTextContents()) total += cents(amount);
  expect(total).toBe(-(await centsOf(row.getByTestId(`${testId}-value`))));
}

const ROWS = ['dein-monat-transfer', 'dein-monat-direct', 'dein-monat-wealth', 'dein-monat-unplanned'] as const;

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Monat ist Monat · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('aktiver Zeitraum, Zeilen aufklappen, Einmalzahlung nicht eingeplant, andere Quelle, nächstes Gehalt', async ({ page }) => {
        await start(page);
        const card = page.getByTestId('dein-monat');

        // the salary at the start of November (25 October), the next one under the card
        await expect(page.getByTestId('dein-monat-salary-title')).toHaveText('Oktober-Gehalt');
        expect(plain(await page.getByTestId('dein-monat-salary-when').textContent())).toBe('ausgezahlt am 25. Oktober');
        expect(plain(await page.getByTestId('next-salary-text').textContent())).toBe('November-Gehalt · kommt am 25.11.');
        await expect(page.getByTestId('next-salary')).toContainText('Plan ansehen');

        // a Spielgeld of € 300 through the pill
        await tap(page.getByTestId('dein-monat-pill'));
        await sheetIn(page);
        const input = page.getByTestId('plan-spielgeld-input');
        await expect(input).toBeFocused();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('300');
        await page.keyboard.press('Enter');
        await expect(input).toHaveCount(0);
        await closePlan(page);
        await expect(page.getByTestId('dein-monat-pill')).toHaveAttribute('data-status', 'ok');

        // ① – ④: open, every list adds up to its row
        if ((await page.getByTestId('dein-monat-split-toggle').getAttribute('aria-expanded')) !== 'true') await tap(page.getByTestId('dein-monat-split-toggle'));
        await expect(page.getByTestId('dein-monat-split-toggle')).toHaveAttribute('aria-expanded', 'true');
        for (const id of ROWS) {
          await tap(page.getByTestId(`${id}-toggle`));
          await expect(page.getByTestId(`${id}-toggle`)).toHaveAttribute('aria-expanded', 'true');
          await expect(page.getByTestId(`${id}-list`)).toBeVisible();
          await expectListIsRow(page, id);
        }
        // Überschuss = Netto − ① − ② − ③ − ④, „Vor Spielgeld frei“ = Netto − ① − ② − ③ (alle-monate-gleich: ④ = max(Spielgeld, ausgegeben))
        const net = await centsOf(page.getByTestId('dein-monat-salary-value'));
        const parts = await Promise.all(ROWS.map((id) => centsOf(page.getByTestId(`${id}-value`))));
        const left = await centsOf(page.getByTestId('dein-monat-free-value'));
        expect(left).toBe(net + parts.reduce((a, b) => a + b, 0));
        expect(await centsOf(page.getByTestId('dein-monat-before'))).toBe(left - parts[3]!);
        const spielgeld = -parts[3]!;
        expect(spielgeld).toBeGreaterThanOrEqual(30000);
        await shot(page, `${tag}-01-zeilen-offen`, card);

        // a one-time payment „nicht eingeplant“ of € 450 in November: ④ and Überschuss follow at once, the pill turns
        await page.getByTestId('add-once').scrollIntoViewIfNeeded();
        await tap(page.getByTestId('add-once'));
        await sheetIn(page);
        const form = page.getByTestId('position-form');
        await form.getByLabel('Name').fill('Konzert');
        await form.getByLabel('Betrag').fill('450');
        await form.getByLabel('Kategorie').selectOption({ label: 'Sonstiges' });
        await form.getByLabel('Fällig am').fill('2026-11-14');
        await tap(page.getByTestId('unplanned-field-switch'));
        await expect(page.getByTestId('source-field')).toBeVisible();
        await tap(form.getByRole('button', { name: 'Zahlung anlegen' }));
        await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
        await expect(page.getByTestId('dein-monat-unplanned-value')).toHaveText(/450,00/);
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(left - (45000 - spielgeld));
        await expect(page.getByTestId('dein-monat-unplanned-sub')).toHaveAttribute('data-over', '');
        expect(plain(await page.getByTestId('dein-monat-unplanned-sub').textContent())).toBe('€ 450,00 ausgegeben · € 150,00 drüber');
        await expect(page.getByTestId('dein-monat-pill')).toHaveAttribute('data-status', 'over');
        expect(plain(await page.getByTestId('dein-monat-pill').textContent())).toBe('Spielgeld: € 450,00 von € 300,00 · € 150,00 drüber');
        await expect(card).toHaveAttribute('data-state', 'short');
        await expect(page.getByTestId('dein-monat-unplanned-list')).toContainText('Konzert');
        await expectListIsRow(page, 'dein-monat-unplanned');
        await page.getByTestId('dein-monat').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-02-spielgeld-drueber`, card);

        // „Andere Quelle“: listed muted, no longer counted
        const row = page.locator('main > :not([data-tab-hidden])').getByTestId('position-row').filter({ hasText: 'Konzert' });
        await row.scrollIntoViewIfNeeded();
        await tap(row.getByRole('button', { name: /Details/ }));
        await sheetIn(page);
        await tap(page.getByRole('button', { name: 'Zahlung bearbeiten' }));
        await sheetIn(page);
        await tap(page.getByTestId('source-field').getByRole('radio', { name: 'Andere Quelle' }));
        await tap(page.getByTestId('position-form').getByRole('button', { name: 'Speichern' }));
        await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-unplanned-value'))).toBe(-spielgeld);
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(left);
        await expect(page.getByTestId('dein-monat-pill')).toHaveAttribute('data-status', 'ok');
        await expect(page.getByTestId('dein-monat-unplanned-sub')).toContainText('von € 300,00 ausgegeben');
        await expect(page.getByTestId('dein-monat-unplanned-list').locator('[data-muted]')).toContainText('Konzert');
        await page.getByTestId('dein-monat').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-03-andere-quelle`, card);

        // the next salary opens „Dein Plan“ (unchanged: from the next salary)
        await tap(page.getByTestId('next-salary'));
        await expect(page.getByTestId('plan-sheet')).toBeVisible();
        await closePlan(page);

        // the categories: Lebensmittel was debited for less this month
        await expandAll(page);
        const food = page.locator('main > :not([data-tab-hidden])').getByTestId('position-row').filter({ hasText: 'Lebensmittel' });
        expect(plain(await food.getByTestId('month-deviation').textContent())).toBe('in diesem Monat € 450 statt € 480');
        await food.scrollIntoViewIfNeeded();
        await appSettled(page);
        await shot(page, `${tag}-04-abweichung`);
      });
    });
  }
}
