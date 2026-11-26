import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, closePlan, expect, setUpKonto, settled, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// polster-ziel (Design-Canvas „Erbse – Polster-Ziel Mockups“, Screens 1–5; data like yours, rebuilt; „Neuer Monat
// beginnt am“ 25, today 10 November → November active):
// - Ziel € 20.000 and Stand € 14.000 in „Dein Polster“ → the card of the month, the sheet and „Dein Plan“ show the same
// - „Polster aufgefüllt“ → Stand, bar, the celebration at 75 % (once); „Rückgängig“; a second confirmation celebrates
//   nothing
// - a weak month (Spielgeld above the Überschuss): „Aus Polster genommen“
// - goal reached → „Polster voll · …“; a later month: a muted preview without a button
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots of the five
// screens to docs/screenshots/polster-ziel/.

const DIR = 'docs/screenshots/polster-ziel';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const plain = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ').trim();
const textOf = async (l: Locator) => plain(await l.textContent());
const cents = (text: string) => {
  const negative = /−|-/.test(text);
  const v = Math.round(Number(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return negative ? -v : v;
};
const centsOf = async (l: Locator) => cents((await l.textContent())!);
type Tap = (l: Locator) => Promise<void>;

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page, '0');
}

async function sheetOpen(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

async function closeSheet(page: Page, testId: string) {
  // an Esc right while the sheet takes the focus can get lost (WebKit): pressed again until it is closed
  await expect(async () => {
    if ((await page.getByTestId(testId).count()) > 0) await page.keyboard.press('Escape');
    await expect(page.getByTestId(testId)).toHaveCount(0, { timeout: 1000 });
  }).toPass({ intervals: [200, 500], timeout: 10000 });
}

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.press('Enter');
}

async function shot(page: Page, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  await settled(page);
  if (target) await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Polster-Ziel · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap: Tap = (l) => (use.hasTouch ? l.tap() : l.click());

      test('Ziel und Stand → Karte, Screen und Plan gleich; auffüllen mit Feier, Rückgängig; schwacher Monat; Ziel erreicht; Vorschau', async ({ page }) => {
        await start(page);
        const card = page.getByTestId('polster-card');
        // without a goal: „Leg dein Polster-Ziel fest ›“
        await expect(page.getByTestId('polster-card-set-goal')).toHaveText('Leg dein Polster-Ziel fest ›');
        await expect(page.getByTestId('cushion-split')).toHaveCount(0);

        // Screen 1: „Dein Polster“
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-goal-input'), '20000');
        await expect(page.getByTestId('polster-goal')).toHaveText('Ziel € 20.000');
        await enter(page.getByTestId('polster-balance-input'), '14000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 14.000');
        await expect(page.getByTestId('polster-progress')).toHaveText('70 % · fehlt € 6.000');
        await expect(page.getByTestId('polster-next')).toHaveText('Nächstes Etappenziel 75 %');
        await expect(page.getByTestId('polster-bar')).toHaveAttribute('data-next', '75');
        await expect(page.getByTestId('polster-nudge')).toContainText('Noch € 1.000 bis 75 %.');
        const months = await textOf(page.getByTestId('polster-pays-fixed-n'));
        expect(months).toMatch(/^\d+,\d$/);
        await shot(page, `${tag}-1-polster`, page.getByTestId('bottom-sheet'));
        await closeSheet(page, 'polster-sheet');

        // Screen 5: the card shows the same
        await expect(page.getByTestId('polster-card-balance')).toHaveText('€ 14.000');
        await expect(page.getByTestId('polster-card-goal')).toHaveText('von € 20.000');
        await expect(page.getByTestId('polster-card-progress')).toHaveText('70 % · fehlt € 6.000');
        await expect(page.getByTestId('polster-card-months')).toHaveText(`${months} Monate Fixkosten`);
        await shot(page, `${tag}-5-monat-polster`);

        // Screen 4: „Dein Plan“ the same
        await tap(page.getByTestId('next-salary'));
        await sheetOpen(page, 'plan-sheet');
        await expect(page.getByTestId('plan-cushion-today')).toHaveText(`Heute € 14.000 · 70 % · ${months} Monate Fixkosten`);
        await expect(page.getByTestId('plan-cushion-head')).toHaveText('Polster');
        const first = page.getByTestId('plan-salary-row').first();
        const left = await centsOf(first.getByTestId('plan-salary-left'));
        const delta = Number(await first.getByTestId('plan-salary-cushion-delta').getAttribute('data-cents'));
        expect(Number(await first.getByTestId('plan-salary-cushion').getAttribute('data-cents'))).toBe(1400000 + delta);
        expect(delta).toBe(left > 0 ? Math.min(left, 600000) : -Math.min(-left, 1400000));
        await expect(page.getByTestId('plan-answer')).toHaveAttribute('data-kind', /^cushion-(missing|reached)$/);
        await shot(page, `${tag}-4-plan`, page.getByTestId('bottom-sheet'));
        await closePlan(page);

        // Screen 2: the Überschuss of November goes into the Polster
        const month = page.getByTestId('dein-monat');
        const surplus = await centsOf(page.getByTestId('dein-monat-free-value'));
        expect(surplus).toBeGreaterThan(100000);
        const split = page.getByTestId('cushion-split');
        await expect(split).toHaveAttribute('data-kind', 'fill');
        await expect.poll(() => centsOf(page.getByTestId('cushion-split-amount'))).toBe(Math.min(surplus, 600000));
        const after = 1400000 + Math.min(surplus, 600000);
        const pct = Math.floor((after * 100) / 2000000);
        await expect(page.getByTestId('cushion-split-after')).toContainText(`70 % → ${pct} %`);
        await shot(page, `${tag}-2-ueberschuss-verteilen`, month);
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await expect.poll(() => centsOf(page.getByTestId('polster-card-balance'))).toBe(after);
        await expect(page.getByTestId('polster-card-bar')).toHaveAttribute('data-percent', String(pct));
        // 75 % crossed: the confetti falls once
        await expect(month.locator('[data-testid=hero-confetti][data-falling]')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Rückgängig' }).first()).toBeVisible();
        // no second confirmation of the same month
        await expect(page.getByTestId('cushion-split-confirm')).toHaveCount(0);

        // „Rückgängig“: back to € 14.000, the proposal again; confirming once more celebrates nothing
        await tap(page.getByTestId('cushion-split-undo'));
        await expect(page.getByTestId('polster-card-balance')).toHaveText('€ 14.000');
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'fill');
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await expect(month.locator('[data-testid=hero-confetti][data-falling]')).toHaveCount(0);
        await tap(page.getByTestId('cushion-split-undo'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'fill');

        // Screen 3: a weak month – the Spielgeld above the Überschuss
        await tap(page.getByTestId('next-salary'));
        await sheetOpen(page, 'plan-sheet');
        await tap(page.getByTestId('plan-spielgeld-amount'));
        await enter(page.getByTestId('plan-spielgeld-input'), String(Math.ceil(surplus / 100) + 500));
        await closePlan(page);
        await expect(split).toHaveAttribute('data-kind', 'take');
        const gap = -(await centsOf(page.getByTestId('dein-monat-free-value')));
        expect(gap).toBeGreaterThan(0);
        await expect.poll(() => centsOf(page.getByTestId('cushion-split-amount'))).toBe(Math.min(gap, 1400000));
        await expect(page.getByTestId('cushion-split-salary')).toContainText('Gehalt brauchst du den Polster nicht.');
        await shot(page, `${tag}-3-schwacher-monat`, month);
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split-confirmed')).toContainText('aus dem Polster genommen.');
        await expect.poll(() => centsOf(page.getByTestId('polster-card-balance'))).toBe(1400000 - Math.min(gap, 1400000));
        await tap(page.getByTestId('cushion-split-undo'));
        await expect(page.getByTestId('polster-card-balance')).toHaveText('€ 14.000');

        // goal reached: „Polster voll · Überschuss frei zum Investieren“ (Spielgeld back off)
        await tap(page.getByTestId('next-salary'));
        await sheetOpen(page, 'plan-sheet');
        await tap(page.getByTestId('plan-spielgeld-amount'));
        await enter(page.getByTestId('plan-spielgeld-input'), '');
        await closePlan(page);
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-balance-input'), '20000');
        await expect(page.getByTestId('polster-reached')).toHaveText('Polster-Ziel erreicht');
        await closeSheet(page, 'polster-sheet');
        await expect(split).toHaveAttribute('data-kind', 'full');
        await expect(split).toHaveText('Polster voll · Überschuss frei zum Investieren');

        // a later month: a muted preview, no button
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-balance-input'), '14000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 14.000');
        await closeSheet(page, 'polster-sheet');
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(page.getByTestId('dein-monat')).toHaveAttribute('data-when', 'future');
        await expect(page.getByTestId('polster-card')).toHaveCount(0);
        const preview = page.getByTestId('cushion-split');
        if ((await preview.count()) > 0) {
          await expect(preview).toHaveAttribute('data-preview', '');
          await expect(page.getByTestId('cushion-split-confirm')).toHaveCount(0);
        }
      });
    });
  }
}
