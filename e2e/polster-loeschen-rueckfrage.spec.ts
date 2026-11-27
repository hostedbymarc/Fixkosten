import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, expect, setUpKonto, settled, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// polster-loeschen-rueckfrage (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November):
// - „Aktueller Stand“ emptied + „Speichern“ → „Polster und Verlauf löschen?“; „Abbrechen“ → the stored value is back
//   in the field, nothing written
// - „Polster-Ziel“ emptied + Enter → „Polster-Ziel löschen?“; „Abbrechen“ the same; „Löschen“ → only the goal goes
// - „Aktueller Stand“ emptied → „Löschen“ → Polster, Verlauf and the month confirmed gone; a new Stand saves again
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/polster-loeschen-rueckfrage/.

const DIR = 'docs/screenshots/polster-loeschen-rueckfrage';
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
    test.describe(`Polster löschen: Rückfrage · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap: Tap = (l) => (use.hasTouch ? l.tap() : l.click());

      test('leeres Feld fragt erst; Abbrechen stellt den Wert wieder her; Löschen entfernt', async ({ page }) => {
        await importLive(page, NOV_TODAY, (b) => {
          b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
        });
        await page.getByTestId('konto-invite-enable').click();
        await setUpKonto(page, '0');

        // Ziel € 20.000, Stand € 14.000, the month confirmed
        const card = page.getByTestId('polster-card-open');
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        const goalField = page.getByTestId('polster-goal-input');
        const balanceField = page.getByTestId('polster-balance-input');
        await enter(goalField, '20000');
        await expect(page.getByTestId('polster-goal')).toHaveText('Ziel € 20.000');
        await enter(balanceField, '14000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 14.000');
        await closeSheet(page, 'polster-sheet');
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        // the toast „Polster aufgefüllt“ gone (it would cover the screenshots)
        await expect(page.locator('[role="status"][aria-live="polite"] > *')).toHaveCount(0, { timeout: 15_000 });
        const before = await stored(page);
        const was = JSON.parse(before) as { cushionBalance: number };
        expect(Object.keys(JSON.parse(before).cushionConfirmed)).toHaveLength(1);

        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        const dialog = page.getByTestId('polster-clear');
        const rows = page.getByTestId('polster-history-row');
        await expect(rows).toHaveCount(2);

        // „Aktueller Stand“ emptied + „Speichern“: the question, nothing written yet
        await balanceField.fill('');
        await tap(page.getByTestId('polster-balance-input-save'));
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('data-which', 'balance');
        await expect(dialog.getByRole('heading')).toHaveText('Polster und Verlauf löschen?');
        await expect(page.getByTestId('polster-clear-confirm')).toHaveText('Löschen');
        await expect(page.getByTestId('polster-clear-cancel')).toHaveText('Abbrechen');
        expect(await stored(page)).toBe(before);
        await shot(page, `${tag}-frage-stand`, dialog);
        // „Abbrechen“: the stored value is back in the field, still nothing written
        await tap(page.getByTestId('polster-clear-cancel'));
        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => cents(await balanceField.inputValue())).toBe(was.cushionBalance);
        await expect(page.getByTestId('polster-balance-input-save')).toHaveCount(0);
        expect(await stored(page)).toBe(before);

        // „Polster-Ziel“ emptied + Enter: its own question; „Abbrechen“ the same
        await enter(goalField, '');
        await expect(dialog).toHaveAttribute('data-which', 'goal');
        await expect(dialog.getByRole('heading')).toHaveText('Polster-Ziel löschen?');
        await shot(page, `${tag}-frage-ziel`, dialog);
        await tap(page.getByTestId('polster-clear-cancel'));
        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => cents(await goalField.inputValue())).toBe(2000000);
        expect(await stored(page)).toBe(before);

        // „Polster-Ziel“ emptied → „Löschen“: only the goal goes
        await goalField.fill('');
        await tap(page.getByTestId('polster-goal-input-save'));
        await tap(page.getByTestId('polster-clear-confirm'));
        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => JSON.parse(await stored(page)).cushionGoal ?? null).toBeNull();
        const noGoal = JSON.parse(await stored(page));
        expect([noGoal.cushionBalance, noGoal.cushionMoves, noGoal.cushionConfirmed]).toEqual([was.cushionBalance, JSON.parse(before).cushionMoves, JSON.parse(before).cushionConfirmed]);
        await expect(rows).toHaveCount(2);

        // „Aktueller Stand“ emptied → „Löschen“: Polster, Verlauf and the month confirmed gone
        await balanceField.fill('');
        await tap(page.getByTestId('polster-balance-input-save'));
        await tap(page.getByTestId('polster-clear-confirm'));
        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => JSON.parse(await stored(page)).cushionBalance ?? null).toBeNull();
        const gone = JSON.parse(await stored(page));
        expect(gone.cushionMoves ?? []).toEqual([]);
        expect(gone.cushionConfirmed ?? {}).toEqual({});
        await expect(rows).toHaveCount(0);

        // a new Stand saves again
        await enter(balanceField, '5000');
        await expect.poll(async () => JSON.parse(await stored(page)).cushionBalance ?? null).toBe(500000);
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Stand eingetragen');
        await closeSheet(page, 'polster-sheet');
      });
    });
  }
}
