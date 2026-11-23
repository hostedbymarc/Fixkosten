import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, goTo, setUpKonto, test, closePlan } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// monat-feinschliff (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - the salary is named after the month it is paid in; no „geschätzt“ and no „nicht ausbezahlt“ anywhere
// - „So teilt sich dein Gehalt“ folds ① ② ③ away; the state is kept over a restart
// - the salary in „Dein Monat“: tap, change, „Frei für dich“ follows at once
// - confetti in October, November and December: the same component, lying in a month that is done, falling
//   once live at the last tick, never when a month is opened
// - a category with only positions „nicht eingeplant“: „nicht eingeplant“ without an amount
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/monat-feinschliff/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/monat-feinschliff';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const amountOf = (text: string) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
const valueOf = async (l: Locator) => amountOf((await l.textContent())!);
const shown = (page: Page) => page.locator('main > :not([data-tab-hidden])');

async function shot(page: Page, name: string) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
}

async function toMonth(page: Page, name: string) {
  const title = page.getByRole('heading', { level: 1 });
  const target = `${name} 2026`;
  for (let i = 0; i < 4 && (await title.textContent()) !== target; i++) {
    const order = ['Oktober 2026', 'November 2026', 'Dezember 2026'];
    const now = order.indexOf((await title.textContent())!);
    await page.getByRole('button', { name: order.indexOf(target) > now ? 'Nächster Monat' : 'Vorheriger Monat' }).click();
  }
  await expect(title).toHaveText(target);
  await appSettled(page);
}

/** every open position of the month shown ticked, one after the other (the last one celebrates) */
async function tickAll(page: Page) {
  if (await shown(page).getByRole('button', { name: 'Alle ausklappen' }).isVisible()) await shown(page).getByRole('button', { name: 'Alle ausklappen' }).click();
  const open = shown(page).locator('[data-testid=position-row][data-status=open]:not([data-unplanned=true]) [data-testid=toggle-paid]');
  for (let n = await open.count(); n > 0; n = await open.count()) {
    await open.first().scrollIntoViewIfNeeded();
    await open.first().click();
    await expect(open).toHaveCount(n - 1);
  }
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Monat-Feinschliff · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Gehalt nach Auszahlungsmonat, aufklappen gemerkt, Gehalt ändern, kein „geschätzt“ / „nicht ausbezahlt“', async ({ page }) => {
        await start(page);
        const card = page.getByTestId('dein-monat');
        // monat-ist-monat: November is active (25.10.–24.11.): the card shows the salary at its start, the
        // „Oktober-Gehalt“ paid on 25 October; the next one is the line under the card
        await expect(page.getByTestId('dein-monat-salary-title')).toHaveText('Oktober-Gehalt');
        await expect(page.getByTestId('dein-monat-salary-when')).toHaveText('ausgezahlt am 25. Oktober');
        await expect(page.getByTestId('next-salary-text')).toHaveText('November-Gehalt · kommt am 25.11.');
        await expect(card).not.toContainText('geschätzt');

        // folded by default: salary, „Frei für dich“; ① ② ③ hidden; no pill (spielgeld-pille-rechenfehler)
        const toggle = page.getByTestId('dein-monat-split-toggle');
        await expect(toggle).toHaveText('So teilt sich dein Gehalt');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByTestId('dein-monat-transfer')).toBeHidden();
        await expect(page.getByTestId('dein-monat-free-value')).toBeVisible();
        await expect(page.getByTestId('dein-monat-pill')).toHaveCount(0);
        await shot(page, `${tag}-november-zu`);
        await tap(toggle);
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByTestId('dein-monat-transfer')).toBeVisible();
        await expect(page.getByTestId('dein-monat-wealth')).toBeVisible();
        await page.waitForTimeout(400);
        await shot(page, `${tag}-november-auf`);
        // kept over a restart
        await page.reload();
        await appSettled(page);
        await expect(page.getByTestId('dein-monat-split-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByTestId('dein-monat-transfer')).toBeVisible();

        // the salary: tap, change → „Frei für dich“ follows at once
        const free = await valueOf(page.getByTestId('dein-monat-free-value'));
        const salary = await valueOf(page.getByTestId('dein-monat-salary-value'));
        await tap(page.getByTestId('dein-monat-salary-value'));
        const input = page.getByTestId('dein-monat-salary-input');
        await expect(input).toBeFocused();
        await expect(input).toHaveAttribute('inputmode', 'decimal');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('8302,50');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('dein-monat-salary-value')).toHaveText(/€\s8\.302,50/);
        await expect.poll(() => valueOf(page.getByTestId('dein-monat-free-value'))).toBeCloseTo(free + 8302.5 - salary, 2);
        await tap(page.getByTestId('dein-monat-split-toggle'));
        await expect(page.getByTestId('dein-monat-split-toggle')).toHaveAttribute('aria-expanded', 'false');

        // October (past) and December (future): the same card head (alle-monate-gleich), no Netto tile
        await toMonth(page, 'Oktober');
        await expect(page.getByTestId('salary-title')).toHaveCount(0);
        await expect(page.getByTestId('dein-monat-salary-title')).toHaveText('September-Gehalt');
        await expect(page.getByTestId('dein-monat-salary-when')).toHaveText(/^ausgezahlt am 25\.\sSeptember$/);
        await shot(page, `${tag}-oktober`);
        await toMonth(page, 'Dezember');
        await expect(page.getByTestId('dein-monat-salary-title')).toHaveText('November-Gehalt');
        await expect(page.getByTestId('dein-monat-salary-when')).toHaveText(/^kommt am 25\.\sNovember$/);
        await shot(page, `${tag}-dezember`);

        // the next salary is its own entry: the card in November keeps the Oktober-Gehalt
        await toMonth(page, 'November');
        await expect(page.getByTestId('dein-monat-salary-value')).toHaveText(/€\s8\.302,50/);

        // „Dein Plan“: the question above the switch, „Große Zahlungen“ only once, the table head
        await tap(page.getByTestId('next-salary'));
        await expect(page.getByTestId('plan-sheet')).toBeVisible();
        await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
        // the Spielgeld editable: Esc leaves the field, the sheet stays
        await page.getByTestId('plan-spielgeld-amount').scrollIntoViewIfNeeded();
        await tap(page.getByTestId('plan-spielgeld-amount'));
        await expect(page.getByTestId('plan-spielgeld-input')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('plan-spielgeld-input')).toHaveCount(0);
        await expect(page.getByTestId('plan-mode-title')).toHaveText('Wie zahlst du große Zahlungen?');
        await expect(page.getByTestId('plan-sheet').getByText('Große Zahlungen', { exact: true })).toHaveCount(1);
        await expect(page.getByTestId('plan-salaries').locator('th').nth(1)).toHaveText('aufs Konto');
        await shot(page, `${tag}-dein-plan`);
        await closePlan(page);

        // nowhere in the app: „geschätzt“, „nicht ausbezahlt“
        for (const route of ['monat', 'positionen', 'analyse', 'einstellungen'] as const) {
          await goTo(page, route);
          await expect(shown(page)).not.toContainText(/geschätzt|nicht ausbezahlt|Nicht markiert|Netto-Gehalt/);
        }
      });

      test('Konfetti in Oktober, November und Dezember: gleiche Komponente, liegt, einmal live, nie beim Öffnen', async ({ page }) => {
        test.skip(scheme === 'dark' && !['iphone-15', 'desktop-1440'].includes(vp), 'Logik, dunkel nur iPhone 15 und Desktop');
        await start(page);

        // October is done: the peas lie at the bottom of its card when it is opened – no celebration
        await toMonth(page, 'Oktober');
        const confetti = () => shown(page).getByTestId('hero-confetti');
        await expect(confetti()).toHaveCount(1);
        await expect(confetti()).not.toHaveAttribute('data-falling', '');
        // set one back to open: the peas are gone; ticked again (the first 100 % here): they fall once
        if (await shown(page).getByRole('button', { name: 'Alle ausklappen' }).isVisible()) await shown(page).getByRole('button', { name: 'Alle ausklappen' }).click();
        const first = shown(page).locator('[data-testid=position-row][data-status=paid] [data-testid=toggle-paid]').first();
        await first.scrollIntoViewIfNeeded();
        await tap(first);
        await expect(confetti()).toHaveCount(0);
        const again = shown(page).locator('[data-testid=position-row][data-status=open] [data-testid=toggle-paid]').first();
        await tap(again);
        await expect(confetti()).toHaveAttribute('data-falling', '');
        // once more open and done: lying, no second celebration (celebratedMonths)
        await tap(shown(page).locator('[data-testid=position-row][data-status=paid] [data-testid=toggle-paid]').first());
        await expect(confetti()).toHaveCount(0);
        await tap(shown(page).locator('[data-testid=position-row][data-status=open] [data-testid=toggle-paid]').first());
        await expect(confetti()).toHaveCount(1);
        await expect(confetti()).not.toHaveAttribute('data-falling', '');
        await page.reload();
        await appSettled(page);
        await toMonth(page, 'Oktober');
        await expect(confetti()).not.toHaveAttribute('data-falling', '');

        // November (active): the bills row, the same component; the last tick celebrates once
        await toMonth(page, 'November');
        await expect(confetti()).toHaveCount(0);
        await tickAll(page);
        // monat-feinschliff-2: in the green card, no white extra card
        await expect(page.getByTestId('bills-row')).toHaveCount(0);
        await expect(page.getByTestId('dein-monat').getByTestId('hero-confetti')).toHaveAttribute('data-falling', '');
        await expect(page.getByTestId('dein-monat-bills-title')).toHaveText('November erledigt');
        await page.waitForTimeout(3500);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `${tag}-november-erledigt-zu`);
        await tap(page.getByTestId('dein-monat-split-toggle'));
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `${tag}-november-erledigt-auf`);
        await tap(page.getByTestId('dein-monat-split-toggle'));
        await page.reload();
        await appSettled(page);
        await expect(page.getByTestId('dein-monat').getByTestId('hero-confetti')).not.toHaveAttribute('data-falling', '');

        // December (future, alle-monate-gleich): the same card; done → the peas only lie, no live celebration
        await toMonth(page, 'Dezember');
        await tickAll(page);
        await expect(confetti()).toHaveCount(1);
        await expect(confetti()).not.toHaveAttribute('data-falling', '');
        await page.reload();
        await appSettled(page);
        await toMonth(page, 'Dezember');
        await expect(confetti()).toHaveCount(1);
        await expect(confetti()).not.toHaveAttribute('data-falling', '');
        // never over text: the peas lie in the strip below the last line of the card
        const card = shown(page).getByTestId('dein-monat');
        const lastText = await card.getByTestId('dein-monat-bills-title').boundingBox();
        const peas = await confetti().locator('span').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
        expect(Math.min(...peas)).toBeGreaterThanOrEqual(lastText!.y + lastText!.height - 1);
      });
    });
  }
}

test.describe('Monat-Feinschliff · Kategorie nur mit nicht eingeplanten Posten', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'läuft im Projekt desktop'));
  test('„nicht eingeplant“ ohne Betrag, gedämpft; kein „0/0 bezahlt“', async ({ page }) => {
    await importLive(page, NOV_TODAY, (b) => {
      const abos = b.data.categories.find((c) => c.name === 'Abos')!.id;
      b.data.positions = b.data.positions.map((p) => (p.categoryId === abos ? { ...p, account: 'spielgeld' } : p));
    });
    const group = shown(page).locator('[data-testid=category-group]', { hasText: 'Abos' });
    await expect(group).toHaveAttribute('data-unplanned', 'true');
    await expect(group.getByTestId('group-progress')).toHaveText('nicht eingeplant');
    await expect(group.getByTestId('group-sum')).toHaveCount(0);
    await expect(group).not.toContainText('0/0 bezahlt');
    await expect(group).not.toContainText('€ 0');
  });
});
