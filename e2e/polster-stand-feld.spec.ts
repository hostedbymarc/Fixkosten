import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, expect, setUpKonto, settled, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// polster-stand-feld (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - Ziel and Stand set, the month confirmed; „Dein Polster“ opened, both fields tapped without a change, tapped away,
//   closed, the page reloaded → Stand, Verlauf and the confirmation exactly as stored before (nothing written)
// - „Aktueller Stand“ shows the Stand (the sum of the moves, not the start value)
// - a new Stand and „Speichern“ → „Korrektur −€ 500“ in „Verlauf“, the earlier moves stay
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/polster-stand-feld/.

const DIR = 'docs/screenshots/polster-stand-feld';
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
type Tap = (l: Locator) => Promise<void>;

/** the stored Polster (IndexedDB „fixkosten“, meta „fixkostenkonto“): every cushion field, as stored */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('fixkosten');
        open.onsuccess = () => {
          const get = open.result.transaction('meta').objectStore('meta').get('fixkostenkonto');
          get.onsuccess = () => {
            const v = (get.result?.value ?? {}) as Record<string, unknown>;
            open.result.close();
            resolve(JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('cushion')))));
          };
        };
      }),
  );

async function sheetOpen(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

async function closeSheet(page: Page, testId: string) {
  await expect(async () => {
    if ((await page.getByTestId(testId).count()) > 0) await page.keyboard.press('Escape');
    await expect(page.getByTestId(testId)).toHaveCount(0, { timeout: 1000 });
  }).toPass({ intervals: [200, 500], timeout: 10000 });
}

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.press('Enter');
}

async function shot(page: Page, name: string, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await settled(page);
  await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Polster-Stand-Feld · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap: Tap = (l) => (use.hasTouch ? l.tap() : l.click());

      test('Felder ohne Änderung schreiben nichts (auch nicht nach Schließen und Neuladen); neuer Stand → Korrektur im Verlauf', async ({ page }) => {
        await importLive(page, NOV_TODAY, (b) => {
          b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
        });
        await page.getByTestId('konto-invite-enable').click();
        await setUpKonto(page, '0');

        // Ziel € 20.000, Stand € 14.000, the month confirmed
        const card = page.getByTestId('polster-card-open');
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-goal-input'), '20000');
        await expect(page.getByTestId('polster-goal')).toHaveText('Ziel € 20.000');
        await enter(page.getByTestId('polster-balance-input'), '14000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 14.000');
        await closeSheet(page, 'polster-sheet');
        const surplus = await centsOf(page.getByTestId('dein-monat-free-value'));
        const after = 1400000 + Math.min(surplus, 600000);
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await expect.poll(() => centsOf(page.getByTestId('polster-card-balance'))).toBe(after);
        const before = await stored(page);
        expect(JSON.parse(before)).toMatchObject({ cushionBalance: after, cushionGoal: 2000000 });

        // „Aktueller Stand“ shows the Stand (start + the month), not the start value
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        const goalField = page.getByTestId('polster-goal-input');
        const balanceField = page.getByTestId('polster-balance-input');
        await expect.poll(async () => cents(await balanceField.inputValue())).toBe(after);
        // both fields tapped, nothing changed, tapped away: no „Speichern“, nothing written
        await tap(goalField);
        await tap(balanceField);
        await tap(page.getByTestId('polster-rule'));
        await expect(page.getByTestId('polster-goal-input-save')).toHaveCount(0);
        await expect(page.getByTestId('polster-balance-input-save')).toHaveCount(0);
        const rows = page.getByTestId('polster-history-row');
        const count = await rows.count();
        expect(count).toBe(2);
        await closeSheet(page, 'polster-sheet');
        expect(await stored(page)).toBe(before);

        // reloaded: Stand, Verlauf and the confirmation unchanged
        await page.reload();
        // with „Fixkosten einplanen“ the month shows „Dein Monat“ (no hero)
        await expect(page.getByTestId('dein-monat')).toBeVisible({ timeout: 15_000 });
        await appSettled(page);
        expect(await stored(page)).toBe(before);
        await expect.poll(() => centsOf(page.getByTestId('polster-card-balance'))).toBe(after);
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await expect(rows).toHaveCount(count);
        await expect(rows.first()).toContainText('Polster aufgefüllt');

        // a new Stand (€ 500 less) and „Speichern“: „Korrektur −€ 500“, the earlier moves stay
        await balanceField.fill(String((after - 50000) / 100).replace('.', ','));
        await expect(page.getByTestId('polster-balance-input-save')).toBeVisible();
        await tap(page.getByTestId('polster-balance-input-save'));
        await expect(page.getByTestId('polster-balance-input-save')).toHaveCount(0);
        await expect.poll(() => centsOf(page.getByTestId('polster-balance'))).toBe(after - 50000);
        await expect(rows).toHaveCount(count + 1);
        await expect(rows.first()).toContainText('Korrektur');
        await expect(rows.first()).toContainText('−€ 500');
        await expect(rows.nth(1)).toContainText('Polster aufgefüllt');
        await expect(rows.nth(2)).toContainText('Stand eingetragen');
        await page.getByTestId('polster-history').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-korrektur`, page.getByTestId('bottom-sheet'));
        await closeSheet(page, 'polster-sheet');
        const now = JSON.parse(await stored(page)) as { cushionBalance: number; cushionMoves: { amount: number }[]; cushionConfirmed: Record<string, number> };
        expect(now.cushionBalance).toBe(after - 50000);
        expect(now.cushionMoves.reduce((a, m) => a + m.amount, 0)).toBe(now.cushionBalance);
        expect(now.cushionConfirmed).toEqual(JSON.parse(before).cushionConfirmed);
      });
    });
  }
}
