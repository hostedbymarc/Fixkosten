import { mkdirSync, readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, checkRadio, closePlan, expect, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// gehalt-zum-planen (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active,
// December future without a salary entry):
// - „Leg dein Gehalt zum Planen fest ›“ in the active month opens the settings; the value changes December and
//   „Dein Plan“ at once („geplant“, „Ohne Eintrag geplant mit € X.“)
// - a salary entered in December and removed again: „Gehalt entfernen“ and an empty field; € 0 stays an entry
// - too little planned: „{Monat} geht sich nicht aus. Dir fehlen € X.“ without a button; „Nächster großer Monat“ alike
// - export with the field, import with and without it (desktop)
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/gehalt-zum-planen/.

const DIR = 'docs/screenshots/gehalt-zum-planen';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const plain = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');
const textOf = async (l: Locator) => plain(await l.textContent());
/** „3.200,00“ / „3200“ → „3200“ */
const digits = (v: string) => v.replace(/\./g, '').replace(/,00$/, '');

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
}

/** to a tab without a reload: what changes must show at once */
async function toTab(page: Page, route: 'monat' | 'einstellungen') {
  await page.evaluate((r) => (window.location.hash = `#${r}`), route);
  await expect(page.locator(`main[data-screen="${route}"]`)).toBeVisible();
  await appSettled(page);
}

async function setPlanSalary(page: Page, value: string) {
  await toTab(page, 'einstellungen');
  const field = page.getByTestId('plan-salary');
  await field.scrollIntoViewIfNeeded();
  await field.fill(value);
  // the field groups the thousands while typing („3.500“)
  await expect.poll(async () => digits(await field.inputValue())).toBe(digits(value));
  await toTab(page, 'monat');
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
}

/** the salary of the card shown: its text and whether it is the planned one */
async function salary(page: Page) {
  const value = page.getByTestId('dein-monat-salary-value');
  return { text: await textOf(value), planned: (await value.getAttribute('data-fallback')) !== null, when: await textOf(page.getByTestId('dein-monat-salary-when')) };
}

async function editSalary(page: Page, tap: (l: Locator) => Promise<void>) {
  await tap(page.getByTestId('dein-monat-salary-value'));
  const input = page.getByTestId('dein-monat-salary-input');
  await expect(input).toBeFocused();
  return input;
}

async function openPlan(page: Page, tap: (l: Locator) => Promise<void>) {
  await toMonth(page, 'November', tap);
  await tap(page.getByTestId('next-salary'));
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Gehalt zum Planen · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Hinweis → Einstellung; künftige Monate und „Dein Plan“ sofort; Gehalt eintragen und entfernen; € 0; Fehlbetrag', async ({ page }) => {
        await start(page);

        // December without an entry: the last salary entered, „geplant“
        await toMonth(page, 'Dezember', tap);
        const before = await salary(page);
        expect(before.planned).toBe(true);
        expect(before.when).toBe('geplant · kommt am 25.11.');
        await expect(page.getByTestId('dein-monat-plan-salary-hint')).toHaveCount(0);

        // the hint: only in the active month, while nothing is set; it opens the settings at „Gehalt zum Planen“
        await toMonth(page, 'November', tap);
        const hint = page.getByTestId('dein-monat-plan-salary-hint');
        await expect(hint).toHaveText('Leg dein Gehalt zum Planen fest');
        await tap(hint);
        await expect(page.locator('main[data-screen="einstellungen"]')).toBeVisible();
        const field = page.getByTestId('plan-salary');
        await expect(field).toBeInViewport();
        await expect(field).toBeFocused();
        await expect(page.getByTestId('salary-settings')).toContainText('Gehalt zum Planen');
        await field.fill('3000');
        await toTab(page, 'monat');
        await expect(hint).toHaveCount(0);

        // December at once: € 3.000 planned
        await toMonth(page, 'Dezember', tap);
        await expect.poll(() => salary(page)).toEqual({ text: '€ 3.000,00', planned: true, when: 'geplant · kommt am 25.11.' });
        const card = page.getByTestId('dein-monat');
        await card.scrollIntoViewIfNeeded();
        await animationsDone(page, 'dein-monat');
        await page.evaluate(() => document.fonts.ready);
        await card.screenshot({ path: `${DIR}/${tag}-dezember-geplant.jpg`, type: 'jpeg', quality: 78 });

        // „Dein Plan“: the planned months marked, the note under the table
        await openPlan(page, tap);
        await expect(page.getByTestId('plan-planned-note')).toHaveText(/^Ohne Eintrag geplant mit €\s3\.000,00\.$/);
        const rows = page.getByTestId('plan-salary-row');
        await expect(rows.first().getByTestId('plan-salary-planned')).toHaveText('geplant');
        await closePlan(page);

        // another value: December and „Dein Plan“ follow at once
        await setPlanSalary(page, '3500');
        await toMonth(page, 'Dezember', tap);
        await expect.poll(async () => (await salary(page)).text).toBe('€ 3.500,00');
        await openPlan(page, tap);
        await expect(page.getByTestId('plan-planned-note')).toHaveText(/^Ohne Eintrag geplant mit €\s3\.500,00\.$/);
        await closePlan(page);

        // December: enter a salary – not planned any more; „Gehalt entfernen“ brings the planned one back
        await toMonth(page, 'Dezember', tap);
        let input = await editSalary(page, tap);
        await expect(page.getByTestId('dein-monat-salary-remove')).toHaveCount(0); // no entry yet
        await input.fill('4200');
        await input.press('Enter');
        await expect.poll(() => salary(page)).toEqual({ text: '€ 4.200,00', planned: false, when: 'kommt am 25. November' });
        await editSalary(page, tap);
        const remove = page.getByTestId('dein-monat-salary-remove');
        await expect(remove).toHaveText('Gehalt entfernen');
        await tap(remove);
        await expect.poll(() => salary(page)).toEqual({ text: '€ 3.500,00', planned: true, when: 'geplant · kommt am 25.11.' });

        // the same with an empty field, confirmed
        input = await editSalary(page, tap);
        await input.fill('4200');
        await input.press('Enter');
        await expect.poll(async () => (await salary(page)).planned).toBe(false);
        input = await editSalary(page, tap);
        await input.fill('');
        await input.press('Enter');
        await expect.poll(() => salary(page)).toEqual({ text: '€ 3.500,00', planned: true, when: 'geplant · kommt am 25.11.' });

        // € 0 is an entry
        input = await editSalary(page, tap);
        await input.fill('0');
        await input.press('Enter');
        await expect.poll(() => salary(page)).toEqual({ text: '€ 0,00', planned: false, when: 'kommt am 25. November' });
        await editSalary(page, tap);
        await tap(page.getByTestId('dein-monat-salary-remove'));
        await expect.poll(async () => (await salary(page)).planned).toBe(true);

        // too little planned: the largest amount missing, no button; „Nächster großer Monat“ alike
        await setPlanSalary(page, '1000');
        await openPlan(page, tap);
        // a Spielgeld (€ 100): only with one „Dein Plan“ answers
        await page.getByTestId('plan-spielgeld-amount').scrollIntoViewIfNeeded();
        await tap(page.getByTestId('plan-spielgeld-amount'));
        const sg = page.getByTestId('plan-spielgeld-input');
        await expect(sg).toBeFocused();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('100');
        await page.keyboard.press('Enter');
        await expect(sg).toHaveCount(0);
        const answer = page.getByTestId('plan-answer');
        // plan-optionen: red names the first month that misses its fixed costs, with month and year
        await expect(answer).toHaveAttribute('data-kind', 'short');
        await expect(answer).toHaveText(/^[A-ZÄÖÜ][a-zäöü]+ \d{4} geht sich nicht aus\. Dir fehlen €\s[\d.]+,\d{2}\.$/);
        await expect(page.getByTestId('plan-set-max')).toHaveCount(0);
        await answer.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${DIR}/${tag}-plan-fehlt.jpg`, type: 'jpeg', quality: 78 });
        await closePlan(page);
        // „Nächster großer Monat“: the same two steps for its month alone – as its row in „Dein Plan“
        const big = page.getByTestId('big-month');
        const bigPeriod = (await big.getAttribute('data-period'))!;
        const bigLevel = (await big.getAttribute('data-level'))!;
        await expect(big).toHaveAttribute('data-ready', String(bigLevel === 'ok'));
        if (bigLevel === 'short') expect(await textOf(big.getByTestId('big-month-status'))).toMatch(/^Geht sich nicht aus\. Dir fehlen €\s[\d.]+,\d{2}\.$/);
        await openPlan(page, tap);
        await tap(page.getByTestId('plan-salaries-more'));
        await expect(page.locator(`[data-testid=plan-salary-row][data-period="${bigPeriod}"]`)).toHaveAttribute('data-level', bigLevel);
        await closePlan(page);
      });
    });
  }
}

test.describe('Gehalt zum Planen · Sicherung', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'läuft im Projekt desktop'));

  async function importFile(page: Page, json: unknown) {
    await toTab(page, 'einstellungen');
    await page.getByTestId('backup-file').setInputFiles({ name: 'fixkosten-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    const sheet = page.getByTestId('import-sheet');
    await expect(sheet).toBeVisible();
    await checkRadio(sheet.getByRole('radio', { name: /Ersetzen/ }));
    await sheet.getByRole('button', { name: 'Ersetzen', exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  test('Export enthält „Gehalt zum Planen“; Import mit und ohne Feld', async ({ page }) => {
    await start(page);
    await setPlanSalary(page, '3200');
    await toTab(page, 'einstellungen');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren' }).click()]);
    const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(file.settings.fixkostenkonto.planSalary).toBe(3200);

    // without the field (an older backup): not set – December plans with the last salary entered
    const older = structuredClone(file);
    delete older.settings.fixkostenkonto.planSalary;
    await importFile(page, older);
    await expect(page.getByTestId('plan-salary')).toHaveValue('');
    await toTab(page, 'monat');
    const tap = (l: Locator) => l.click();
    await toMonth(page, 'Dezember', tap);
    const last = await salary(page);
    expect(last.planned).toBe(true);
    expect(last.text).not.toBe('€ 3.200,00');

    // with the field: € 3.200 again
    await importFile(page, file);
    await expect.poll(async () => digits(await page.getByTestId('plan-salary').inputValue())).toBe('3200');
    await toTab(page, 'monat');
    await toMonth(page, 'Dezember', tap);
    await expect.poll(async () => (await salary(page)).text).toBe('€ 3.200,00');
  });
});
