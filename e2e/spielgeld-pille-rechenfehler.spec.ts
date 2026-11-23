import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, closePlan, expect, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// spielgeld-pille-rechenfehler (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November
// active, December future). Added (invented): a direct position € 8,03 every month and a purchase „nicht
// eingeplant“ of € 150 on 3 December; Spielgeld € 100; only € 300 saved, so what is saved runs out.
// - the Spielgeld pill is gone in every month
// - „Spielgeld € 50,00 drüber“ under „Vor Spielgeld frei“ only in December (over the limit)
// - ticking December (future) completely and back again: ①–④, „Vor Spielgeld frei“ and the Überschuss stay
// - ② keeps its cents in every month
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots of the
// December card with the line „drüber“ to docs/screenshots/spielgeld-pille-rechenfehler/.

const DIR = 'docs/screenshots/spielgeld-pille-rechenfehler';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const plain = (s: string | null) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ');
const NUMBERS = ['dein-monat-transfer-value', 'dein-monat-direct-value', 'dein-monat-wealth-value', 'dein-monat-unplanned-value', 'dein-monat-before', 'dein-monat-free-value'];
const numbers = (page: Page) => Promise.all(NUMBERS.map(async (id) => `${id}: ${plain(await page.getByTestId(id).textContent())}`));

async function start(page: Page, tap: (l: Locator) => Promise<void>) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
    const monthly = b.data.positions.find((p) => p.history.at(-1)!.frequency === 'monthly')!;
    b.data.positions.push(
      { ...monthly, id: 'spr-parken', name: 'Parkplatz', sortOrder: 990, account: 'girokonto', history: [{ ...monthly.history.at(-1)!, validFrom: '2026-01', amount: 8.03, dueDay: 7 }] },
      {
        ...monthly,
        id: 'spr-jacke',
        name: 'Winterjacke',
        sortOrder: 991,
        account: 'spielgeld',
        history: [{ validFrom: '2026-12', amount: 150, frequency: 'once', dueMonths: [12], dueDay: 3, dueDate: '2026-12-03' }],
      },
    );
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page, '300');
  // Spielgeld € 100 through „Plan ansehen“ (the pill is gone)
  await tap(page.getByTestId('next-salary'));
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
  await page.getByTestId('plan-spielgeld-amount').scrollIntoViewIfNeeded();
  await tap(page.getByTestId('plan-spielgeld-amount'));
  const input = page.getByTestId('plan-spielgeld-input');
  await expect(input).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await closePlan(page);
}

const ORDER = ['Oktober', 'November', 'Dezember'];
async function toMonth(page: Page, name: string, tap: (l: Locator) => Promise<void>) {
  const title = page.getByTestId('month-title');
  for (let i = 0; i < 3; i++) {
    const text = (await title.textContent()) ?? '';
    const here = ORDER.findIndex((m) => text.includes(m));
    const want = ORDER.indexOf(name);
    if (here === want) break;
    await tap(page.getByRole('button', { name: here > want ? 'Vorheriger Monat' : 'Nächster Monat' }));
    await expect(title).not.toHaveText(text);
  }
  await expect(title).toContainText(name);
  await expect(page.getByTestId('dein-monat')).toBeVisible();
  await appSettled(page);
  const toggle = page.getByTestId('dein-monat-split-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await tap(toggle);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** ticks (or unticks) every position of the month shown */
async function tickAll(page: Page, tap: (l: Locator) => Promise<void>, status: 'open' | 'paid') {
  const main = page.locator('main > :not([data-tab-hidden])');
  if (await main.getByRole('button', { name: 'Alle ausklappen' }).isVisible()) await tap(main.getByRole('button', { name: 'Alle ausklappen' }));
  const rows = main.locator(`[data-testid="position-row"][data-status="${status}"]`).getByTestId('toggle-paid');
  for (let n = await rows.count(); n > 0; n = await rows.count()) {
    await rows.first().scrollIntoViewIfNeeded();
    await tap(rows.first());
    await expect(rows).toHaveCount(n - 1);
  }
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Spielgeld-Pille und Rechenfehler · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('keine Pille; „drüber“ nur über dem Limit; Dezember ganz abhaken und zurück: alle Zahlen gleich; Cent in ②', async ({ page }) => {
        await start(page, tap);
        for (const month of ORDER) {
          await toMonth(page, month, tap);
          await expect(page.getByTestId('dein-monat-pill'), month).toHaveCount(0);
          await expect(page.getByText(/übrig$/), month).toHaveCount(0);
          // ② with its cents: the Parkplatz € 8,03 is in every month
          await expect(page.getByTestId('dein-monat-direct-value'), month).toHaveText(/,\d3$/);
          if (month === 'Dezember') {
            // € 150 of € 100: the subline of ④ in the warn chip, the line under „Vor Spielgeld frei“
            expect(plain(await page.getByTestId('dein-monat-unplanned-sub').textContent())).toBe('€ 150,00 ausgegeben · € 50,00 drüber');
            await expect(page.getByTestId('dein-monat-over')).toHaveText(/^Spielgeld €\s50,00 drüber$/);
            await expect(page.getByTestId('dein-monat-over')).toHaveClass(/hero-warn/);
            const [before, over] = await Promise.all([page.getByTestId('dein-monat-before').boundingBox(), page.getByTestId('dein-monat-over').boundingBox()]);
            expect(over!.y).toBeGreaterThanOrEqual(before!.y + before!.height - 1);
          } else {
            await expect(page.getByTestId('dein-monat-over'), month).toHaveCount(0);
          }
        }

        // December (future): everything ticked, then everything back – the numbers of the card stay
        const card = page.getByTestId('dein-monat');
        await card.scrollIntoViewIfNeeded();
        await animationsDone(page, 'dein-monat');
        await page.evaluate(() => document.fonts.ready);
        await card.screenshot({ path: `${DIR}/${tag}-dezember-drueber.jpg`, type: 'jpeg', quality: 78 });
        const untouched = await numbers(page);
        await tickAll(page, tap, 'open');
        await expect(page.getByTestId('dein-monat-bills-done')).toBeVisible();
        expect(await numbers(page), 'alles abgehakt').toEqual(untouched);
        await tickAll(page, tap, 'paid');
        await expect(page.getByTestId('dein-monat-bills-done')).toHaveCount(0);
        expect(await numbers(page), 'wieder zurück').toEqual(untouched);
      });
    });
  }
}
