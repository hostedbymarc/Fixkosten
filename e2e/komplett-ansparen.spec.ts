import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, checkRadio, closePlan, expect, settled, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// komplett-ansparen (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - „Große Zahlungen“ → „ändern“ → „Komplett vom November-Gehalt“ (period December) for the Steuerberater due in
//   February: December ① rises, February ① falls by the same amount at once; ① of December lists
//   „Steuerberater · für Februar“, February „€ … aus Rücklage“; every list adds up to ①
// - „Teilbetrag vom November-Gehalt: € 500“: December ① + 500, „€ 500,00 vom November-Gehalt, Rest bei Fälligkeit“
// - „Nächster großer Monat“ in a future month (December → February), not in a past one; everything of February
//   saved up before: „✓ Schon angespart“
// - ④ has no subline in any month; back to „im Februar zahlen“: as before
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/komplett-ansparen/.

const DIR = 'docs/screenshots/komplett-ansparen';
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

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  // nothing saved yet: every big payment still needs its full amount
  await setUpKonto(page, '0');
}

const ORDER = ['Oktober', 'November', 'Dezember', 'Jänner', 'Februar'];
async function toMonth(page: Page, name: string, tap: (l: Locator) => Promise<void>) {
  const title = page.getByTestId('month-title');
  for (let i = 0; i < 5; i++) {
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

async function openPlan(page: Page, tap: (l: Locator) => Promise<void>) {
  await toMonth(page, 'November', tap);
  await tap(page.getByTestId('next-salary'));
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

/** „ändern“ of a big payment (its first one in the plan); returns its editor */
async function editPayment(page: Page, name: string, tap: (l: Locator) => Promise<void>) {
  const pay = page.getByTestId('plan-payment').filter({ has: page.locator(`[data-testid="plan-payment-edit"]`) }).and(page.locator(`[data-name="${name}"]`)).first();
  await pay.scrollIntoViewIfNeeded();
  await tap(pay.getByTestId('plan-payment-edit'));
  const editor = pay.getByTestId('plan-payment-editor');
  await expect(editor).toBeVisible();
  return { pay, editor };
}

const reserve = (page: Page) => centsOf(page.getByTestId('dein-monat-transfer-value'));

/** ① open: the counted lines add up to ① */
async function reserveList(page: Page, tap: (l: Locator) => Promise<void>) {
  const toggle = page.getByTestId('dein-monat-transfer-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await tap(toggle);
  const list = page.getByTestId('dein-monat-transfer-list');
  await expect(list).toBeVisible();
  let total = 0;
  for (const a of await list.locator('[data-testid=dein-monat-transfer-item]:not([data-muted])').getByTestId('dein-monat-transfer-item-amount').allTextContents()) total += cents(a);
  expect(total).toBe(-(await reserve(page)));
  return list;
}

async function openSplit(page: Page, tap: (l: Locator) => Promise<void>) {
  const toggle = page.getByTestId('dein-monat-split-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await tap(toggle);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function shot(page: Page, name: string, target?: Locator) {
  await settled(page);
  if (target) await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Komplett ansparen · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(300_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('vom Gehalt ansparen: Dezember-① und Februar sofort; Teilbetrag; Nächster großer Monat künftig; ④ ohne Unterzeile', async ({ page }) => {
        await start(page);

        // „Bei Fälligkeit“ as the starting point
        await openPlan(page, tap);
        await checkRadio(page.getByTestId('plan-mode-due'));
        await expect(page.getByTestId('plan-sheet')).toHaveAttribute('data-mode', 'due');
        await closePlan(page);

        // ④: no subline in a past, the active and a future month; „Nächster großer Monat“ not in the past
        for (const month of ['Oktober', 'November', 'Dezember']) {
          await toMonth(page, month, tap);
          await openSplit(page, tap);
          await expect(page.getByTestId('dein-monat-unplanned-value')).toBeVisible();
          await expect(page.getByTestId('dein-monat-unplanned-sub'), month).toHaveCount(0);
          await expect(page.getByTestId('big-month'), month).toHaveCount(month === 'Oktober' ? 0 : 1);
        }
        // December (future): from December on → February
        await expect(page.getByTestId('big-month')).toHaveAttribute('data-period', '2027-02');
        await expect(page.getByTestId('big-month-head')).toContainText('Februar');
        const dec0 = await reserve(page);
        await toMonth(page, 'Februar', tap);
        await openSplit(page, tap);
        const feb0 = await reserve(page);
        // what is saved already (the balance of the setup) goes to the next big payments: maybe some of February
        const note = page.getByTestId('dein-monat-transfer-note');
        const noted0 = (await note.count()) ? await centsOf(note) : 0;

        // „Komplett vom November-Gehalt“ for the Steuerberater (due in February)
        await openPlan(page, tap);
        let { pay, editor } = await editPayment(page, 'Steuerberater', tap);
        await editor.getByTestId('plan-payment-all-salary').selectOption('2026-12');
        await checkRadio(editor.getByTestId('plan-payment-all'));
        // plan-optionen: only „Übernehmen“ saves
        await tap(editor.getByTestId('plan-payment-apply'));
        await expect(pay.getByTestId('plan-payment-state')).toHaveText('komplett vom November-Gehalt');
        await expect(pay).toHaveAttribute('data-mode', 'once');
        await shot(page, `${tag}-plan-komplett`);
        await closePlan(page);

        // at once, without a reload: December ① up, February ① down by the same amount
        await toMonth(page, 'Dezember', tap);
        await openSplit(page, tap);
        await expect.poll(() => reserve(page)).toBeLessThan(dec0);
        const moved = dec0 - (await reserve(page));
        // the Steuerberater: € 1.260,00
        expect(moved).toBe(126000);
        let list = await reserveList(page, tap);
        const line = list.locator('[data-kind="for"]').filter({ hasText: 'Steuerberater' });
        await expect(line).toHaveCount(1);
        expect(await textOf(line)).toContain('Steuerberater · für Februar');
        expect(-(await centsOf(line.getByTestId('dein-monat-transfer-item-amount')))).toBe(-moved);
        await page.getByTestId('dein-monat').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-dezember`, page.getByTestId('dein-monat'));

        await toMonth(page, 'Februar', tap);
        await openSplit(page, tap);
        await expect.poll(() => reserve(page)).toBe(feb0 + moved);
        await expect(note).toHaveText(/aus Rücklage$/);
        expect(await centsOf(note)).toBe(noted0 + moved);
        list = await reserveList(page, tap);
        const due = list.locator('[data-kind="due"]').filter({ hasText: 'Steuerberater' });
        expect(await textOf(due)).toContain('Steuerberater · fällig Februar');
        expect(await textOf(due.getByTestId('dein-monat-transfer-item-saved'))).toMatch(/\(€.1\.260,00 schon angespart\)/);
        await page.getByTestId('dein-monat').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-februar`, page.getByTestId('dein-monat'));

        // „Teilbetrag vom November-Gehalt: € 500“: the rest when due
        await openPlan(page, tap);
        ({ pay, editor } = await editPayment(page, 'Steuerberater', tap));
        await checkRadio(editor.getByTestId('plan-payment-part'));
        const amount = editor.getByTestId('plan-payment-part-amount');
        await expect(amount).toBeFocused();
        await amount.fill('500');
        await amount.press('Enter');
        await expect(pay.getByTestId('plan-payment-state')).toHaveText('€ 500,00 vom November-Gehalt, Rest bei Fälligkeit');
        await closePlan(page);
        await toMonth(page, 'Dezember', tap);
        await openSplit(page, tap);
        await expect.poll(() => reserve(page)).toBe(dec0 - 50000);
        await reserveList(page, tap);

        // Öffis and the Steuerberater komplett: February saved up before → „✓ Schon angespart“ in December
        await openPlan(page, tap);
        for (const name of ['Steuerberater', 'Öffis']) {
          ({ pay, editor } = await editPayment(page, name, tap));
          await editor.getByTestId('plan-payment-all-salary').selectOption('2026-12');
          await checkRadio(editor.getByTestId('plan-payment-all'));
          await tap(editor.getByTestId('plan-payment-apply'));
          await expect(pay.getByTestId('plan-payment-state')).toHaveText('komplett vom November-Gehalt');
        }
        await closePlan(page);
        await toMonth(page, 'Dezember', tap);
        const big = page.getByTestId('big-month');
        await expect(big).toHaveAttribute('data-saved', 'true');
        await expect(big.getByTestId('big-month-status')).toHaveText('Schon angespart');
        await big.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-grosser-monat`, big);

        // back to „im Februar zahlen“: as before
        await openPlan(page, tap);
        for (const name of ['Steuerberater', 'Öffis']) {
          ({ pay, editor } = await editPayment(page, name, tap));
          await checkRadio(editor.getByTestId('plan-payment-due'));
          await tap(editor.getByTestId('plan-payment-apply'));
          await expect(pay.getByTestId('plan-payment-state')).toHaveText('im Februar zahlen');
        }
        await closePlan(page);
        await toMonth(page, 'Dezember', tap);
        await openSplit(page, tap);
        await expect.poll(() => reserve(page)).toBe(dec0);
        await toMonth(page, 'Februar', tap);
        await openSplit(page, tap);
        await expect.poll(() => reserve(page)).toBe(feb0);
      });
    });
  }
}
