import { mkdirSync, readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, checkRadio, closePlan, expect, goTo, settled, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// plan-optionen (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - „Große Zahlungen“ → „ändern“ → „Aufteilen: vom November- bis Dezember-Gehalt“ for the Steuerberater (€ 1.260,
//   due in February): the preview shows December and January − € 630 each, February + € 1.260 (worse ones in the
//   warn token); nothing is saved before „Übernehmen“; after it the table shows the previewed Überschüsse
// - a row of „Deine nächsten Gehälter“ shows its month; its Überschuss is the large amount of that month's card
// (the switch „Überschuss als Polster mitnehmen“ is gone with polster-ziel: e2e/polster-ziel.spec.ts)
// - export/import with and without the new fields (desktop only)
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/plan-optionen/.

const DIR = 'docs/screenshots/plan-optionen';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const plain = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');
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
  // nothing saved yet: every big payment still needs its full amount
  await setUpKonto(page, '0');
}

async function openPlan(page: Page, tap: Tap) {
  // „Plan ansehen“ under the card of the active month; in another month: from the settings
  const next = page.getByTestId('next-salary');
  if (await next.isVisible()) await tap(next);
  else {
    await goTo(page, 'einstellungen');
    await tap(page.getByTestId('settings-open-plan'));
  }
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

/** „ändern“ of the Steuerberater; returns the payment and its editor */
async function editSteuerberater(page: Page, tap: Tap) {
  const pay = page.locator('[data-testid=plan-payment][data-name="Steuerberater"]').first();
  await pay.scrollIntoViewIfNeeded();
  await tap(pay.getByTestId('plan-payment-edit'));
  const editor = pay.getByTestId('plan-payment-editor');
  await expect(editor).toBeVisible();
  return { pay, editor };
}

/** the Überschuss of every row of „Deine nächsten Gehälter“ (all 12) by period */
async function tableLeft(page: Page, tap: Tap): Promise<Map<string, number>> {
  const more = page.getByTestId('plan-salaries-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await tap(more);
  const out = new Map<string, number>();
  for (const row of await page.getByTestId('plan-salary-row').all()) out.set((await row.getAttribute('data-period'))!, await centsOf(row.getByTestId('plan-salary-left')));
  return out;
}

async function shot(page: Page, name: string, target?: Locator) {
  await settled(page);
  if (target) await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Plan-Optionen · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap: Tap = (l) => (use.hasTouch ? l.tap() : l.click());

      test('Aufteilen mit Vorschau, erst „Übernehmen“ speichert; Zeile springt zum Monat; Polster an und aus', async ({ page }) => {
        await start(page);
        await openPlan(page, tap);
        await checkRadio(page.getByTestId('plan-mode-due'));
        await expect(page.getByTestId('plan-sheet')).toHaveAttribute('data-mode', 'due');
        const before = await tableLeft(page, tap);

        // „Aufteilen: vom November- bis Dezember-Gehalt“ (periods December and January)
        const { pay, editor } = await editSteuerberater(page, tap);
        await checkRadio(editor.getByTestId('plan-payment-range'));
        await editor.getByTestId('plan-payment-range-from').selectOption('2026-12');
        await editor.getByTestId('plan-payment-range-to').selectOption('2027-01');
        await expect(editor.getByTestId('plan-payment-range-from')).toContainText('November-Gehalt');

        // the preview, live: December and January − € 630 (warn token), February + € 1.260; at most 4 lines
        const preview = editor.getByTestId('plan-preview');
        await expect(preview).toContainText('Überschuss vorher → nachher');
        const rows = preview.getByTestId('plan-preview-row');
        await expect(rows).toHaveCount(3);
        const seen = new Map<string, { was: number; now: number; worse: boolean }>();
        for (const row of await rows.all()) {
          const [was, now] = (await textOf(row.locator('span').nth(1))).split('→').map(cents);
          seen.set((await row.getAttribute('data-period'))!, { was: was!, now: now!, worse: (await row.getAttribute('data-worse')) === 'true' });
        }
        expect(seen.get('2026-12')).toEqual({ was: before.get('2026-12'), now: before.get('2026-12')! - 63000, worse: true });
        expect(seen.get('2027-01')).toEqual({ was: before.get('2027-01'), now: before.get('2027-01')! - 63000, worse: true });
        expect(seen.get('2027-02')).toEqual({ was: before.get('2027-02'), now: before.get('2027-02')! + 126000, worse: false });
        expect(await textOf(rows.first())).toMatch(/^Dez€/);
        expect(await textOf(rows.nth(1))).toMatch(/^Jän 27€/);
        // the worse line in the warn token: another color than the better one
        const color = (l: Locator) => l.evaluate((e) => getComputedStyle(e).color);
        expect(await color(rows.first())).not.toBe(await color(rows.nth(2)));
        await editor.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-vorschau`, editor);

        // nothing saved yet
        await expect(pay).toHaveAttribute('data-mode', 'due');
        expect((await tableLeft(page, tap)).get('2026-12')).toBe(before.get('2026-12'));

        // „Übernehmen“: saved, the table shows the previewed numbers
        await tap(editor.getByTestId('plan-payment-apply'));
        await expect(editor).toHaveCount(0);
        await expect(pay).toHaveAttribute('data-mode', 'range');
        await expect(pay.getByTestId('plan-payment-state')).toHaveText('aufgeteilt vom November- bis Dezember-Gehalt');
        await expect.poll(async () => (await tableLeft(page, tap)).get('2026-12')).toBe(seen.get('2026-12')!.now);
        const after = await tableLeft(page, tap);
        for (const [period, v] of seen) expect(after.get(period), period).toBe(v.now);
        // the table: Monat (+ „geplant“) · zur Seite · Überschuss; another year with its year
        await expect(page.locator('[data-testid=plan-salary-row][data-period="2027-01"] [data-testid=plan-salary-jump]')).toHaveText('Jän 27');
        await page.getByTestId('plan-salaries').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-tabelle`, page.getByTestId('plan-salaries'));

        // a row shows its month: the card's Überschuss is the row's
        await page.locator('[data-testid=plan-salary-row][data-period="2027-01"]').scrollIntoViewIfNeeded();
        await tap(page.locator('[data-testid=plan-salary-row][data-period="2027-01"] [data-testid=plan-salary-jump]'));
        await expect(page.getByTestId('plan-sheet')).toHaveCount(0);
        await expect(page.getByTestId('month-title')).toContainText('Jänner');
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(after.get('2027-01'));
        await appSettled(page);

        await closePlan(page);
      });
    });
  }
}

test.describe('Plan-Optionen · Sicherung', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'läuft im Projekt desktop'));

  async function importFile(page: Page, json: unknown) {
    await goTo(page, 'einstellungen');
    await page.getByTestId('backup-file').setInputFiles({ name: 'fixkosten-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    const sheet = page.getByTestId('import-sheet');
    await expect(sheet).toBeVisible();
    await checkRadio(sheet.getByRole('radio', { name: /Ersetzen/ }));
    await sheet.getByRole('button', { name: 'Ersetzen', exact: true }).click();
    await expect(sheet).toBeHidden();
    // the toast comes after the commit: no reload (goTo) while the import still writes
    await expect(page.getByText('Sicherung importiert')).toBeVisible();
  }

  async function planState(page: Page) {
    await goTo(page, 'einstellungen');
    await page.getByTestId('settings-open-plan').click();
    await expect(page.getByTestId('plan-sheet')).toBeVisible();
    const mode = await page.locator('[data-testid=plan-payment][data-name="Steuerberater"]').first().getAttribute('data-mode');
    await closePlan(page);
    return { mode };
  }

  test('Export enthält „Aufteilen“; Import mit und ohne das Feld', async ({ page }) => {
    const click: Tap = (l) => l.click();
    await start(page);
    await openPlan(page, click);
    const { editor } = await editSteuerberater(page, click);
    await checkRadio(editor.getByTestId('plan-payment-range'));
    await editor.getByTestId('plan-payment-range-from').selectOption('2026-12');
    await editor.getByTestId('plan-payment-range-to').selectOption('2027-01');
    await click(editor.getByTestId('plan-payment-apply'));
    await closePlan(page);

    await goTo(page, 'einstellungen');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren' }).click()]);
    const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    const steuer = file.data.positions.find((p: { name: string }) => p.name === 'Steuerberater');
    expect(steuer.saving).toEqual({ mode: 'range', fromSalaryMonth: '2026-12', toSalaryMonth: '2027-01' });

    // without the field (an older backup): paid when due
    const older = structuredClone(file);
    for (const p of older.data.positions) delete p.saving;
    await importFile(page, older);
    expect(await planState(page)).toEqual({ mode: 'due' });

    // with the field: split again
    await importFile(page, file);
    expect(await planState(page)).toEqual({ mode: 'range' });
  });
});
