import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Schote · Phase A on the dev page /dev/schote/ (built for the e2e build and deploy previews only):
// the pod in every state, the four tile states, „Erledigt, eingezahlt“ and the setup in all three
// answers incl. „Dein Plan“. Every viewport light and dark; screenshots to docs/screenshots/schote/.
// Runs in the desktop project; every viewport is its own context. SCHOTE_VIDEO=1 records the setup.

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
/** screenshots for the PR: these viewports (iPad portrait and iPhone SE are only checked) */
const SHOTS = new Set(['iphone-15', 'ipad-landscape', 'desktop-1440']);
const DIR = 'docs/screenshots/schote';

const url = (theme: string, q = '') => `/dev/schote/?theme=${theme}${q}`;

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(450); // snap-in and sheet animations
  await page.screenshot({ path: `${DIR}/${name}.jpg`, quality: 82, fullPage, animations: 'disabled' });
}

/** no horizontal scroll, the pod never wider than its max width */
async function expectNoOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pods: [...document.querySelectorAll<HTMLElement>('.pod')].map((p) => p.getBoundingClientRect().width),
  }));
  expect(r.scroll).toBeLessThanOrEqual(0);
  for (const w of r.pods) expect(w).toBeLessThanOrEqual(461);
}

for (const [name, use] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark'] as const) {
    const tag = `${name}-${theme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Schote A · ${tag}`, () => {
      test.use({ ...use, colorScheme: theme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));

      test('Schote: alle Zustände, Text sichtbar, Einrasten 8 → 12', async ({ page }) => {
        await page.goto(url(theme, '&view=pod'));
        const texts = page.getByTestId('dev-pod-large-text');
        await expect(texts).toHaveText(['0 von 12 Monaten gedeckt', '8 von 12 Monaten gedeckt', '11 von 12 Monaten gedeckt', 'Gedeckt bis Oktober 2027']);
        // never colour alone: an uncovered slot is a dashed slot with a minus
        const eight = page.getByTestId('dev-pod-8-von-12').getByTestId('dev-pod-large');
        await expect(eight.locator('[data-testid="pod-slot"]:not([data-covered]) .pod-empty svg')).toHaveCount(4);
        await expect(eight.locator('[data-testid="pod-slot"][data-covered] .pea')).toHaveCount(8);
        const months = eight.getByTestId('pod-month');
        await expect(months).toHaveText(['N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O']);
        // the initials never overlap and stay inside the pod (iPhone SE too)
        const boxes = await months.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right] as [number, number]));
        const pod = (await eight.boundingBox())!;
        for (const [i, [l, r]] of boxes.entries()) {
          expect(l, `month ${i} inside`).toBeGreaterThanOrEqual(pod.x - 0.5);
          expect(r, `month ${i} inside`).toBeLessThanOrEqual(pod.x + pod.width + 0.5);
          if (i > 0) expect(l, `month ${i} after month ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1]![1]);
        }
        // tap an initial: the full month name, below the pod; tap again: gone
        const tapM = (n: number) => (use.hasTouch ? months.nth(n).tap() : months.nth(n).click());
        await tapM(3);
        await expect(eight.getByTestId('dev-pod-large-month')).toHaveText('Februar 2027: nicht gedeckt');
        await tapM(0);
        await expect(eight.getByTestId('dev-pod-large-month')).toHaveText('November 2026: gedeckt');
        await expect(months.nth(0)).toHaveAttribute('aria-pressed', 'true');
        if (SHOTS.has(name) && theme === 'light') await shot(page, `${tag}-1b-schote-monat`);
        await tapM(0);
        await expect(eight.getByTestId('dev-pod-large-month')).toBeEmpty();
        await expectNoOverflow(page);
        if (SHOTS.has(name)) await shot(page, `${tag}-1-schote`, true);

        const snapper = page.getByTestId('dev-pod-snapper');
        await page.getByTestId('dev-pod-toggle').click();
        // pea by pea: not all at once
        await expect(snapper).toHaveAttribute('data-full', 'true');
        await expect(snapper.locator('[data-testid="pod-slot"][data-covered]')).toHaveCount(12);
        await expect(page.getByTestId('dev-pod-snapper-text')).toHaveText('Gedeckt bis Oktober 2027');
      });

      test('Kachel: 4 Zustände; „Erledigt, eingezahlt“ → Erbsen rasten ein → Gedeckt', async ({ page }) => {
        await page.goto(url(theme, '&view=tiles'));
        const cards = page.getByTestId('konto-tile-card');
        await expect(cards.nth(0)).toHaveAttribute('data-state', 'setup');
        await expect(cards.nth(0).getByTestId('konto-tile-progress')).toHaveText('0 von 3 Schritten');
        await expect(cards.nth(1)).toHaveAttribute('data-state', 'gap');
        await expect(cards.nth(1).getByTestId('konto-tile-sub')).toHaveText('Noch € 580 einzahlen, dann ist alles gedeckt');
        await expect(cards.nth(2)).toHaveAttribute('data-state', 'covered');
        await expect(cards.nth(2).getByTestId('tile-pod-text')).toHaveText('Gedeckt bis Oktober 2027');
        await expect(cards.nth(2).getByTestId('konto-tile-sub')).toHaveText('Dauerauftrag € 2.955 am 1.');
        await expect(cards.nth(3)).toHaveAttribute('data-state', 'cushion');
        await expect(cards.nth(3).getByTestId('konto-tile-cushion')).toHaveText('Polster: +1,4 Monate');
        await expect(cards.nth(4).getByTestId('konto-tile-streak')).toHaveText('4 Monate in Folge');
        await expectNoOverflow(page);
        if (SHOTS.has(name)) await shot(page, `${tag}-2-kachel`, true);

        const gap = cards.nth(1);
        const paid = gap.getByTestId('konto-tile-paid');
        const box = (await paid.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        await (use.hasTouch ? paid.tap() : paid.click());
        await expect(gap).toHaveAttribute('data-state', 'covered');
        await expect(gap.getByTestId('tile-pod')).toHaveAttribute('data-full', 'true');
        await expect(gap.getByTestId('tile-pod-text')).toHaveText('Gedeckt bis Oktober 2027');
      });

      for (const variant of ['ja', 'noch-nicht', 'weiss-nicht'] as const) {
        test(`Einrichtung: ${variant} → Dein Plan → alles erledigt → Schote voll`, async ({ page }) => {
          await page.goto(url(theme, '&view=setup'));
          const tap = (testId: string) => {
            const el = page.getByTestId(testId);
            return use.hasTouch ? el.tap() : el.click();
          };
          await tap('dev-setup-open');
          const setup = page.getByTestId('konto-setup');
          await expect(setup).toHaveAttribute('data-step', 'account');
          await expect(page.getByTestId('konto-setup-progress')).toContainText('Schritt 1 von 3');
          await expect(page.getByTestId('konto-setup-question')).toHaveText('Hast du ein eigenes Konto nur für Rechnungen?');
          if (SHOTS.has(name) && variant === 'ja') await shot(page, `${tag}-3-einrichtung-1-konto`);

          if (variant === 'noch-nicht') {
            await tap('konto-setup-no-account-button');
            await expect(page.getByTestId('konto-setup-no-account')).toHaveText('Kein Problem. Erbse rechnet trotzdem aus, wie viel du brauchst.');
            if (SHOTS.has(name)) await shot(page, `${tag}-3-einrichtung-1b-kein-konto`);
            await tap('konto-setup-next');
          } else {
            await tap('konto-setup-has-account');
            await expect(setup).toHaveAttribute('data-step', 'balance');
            await expect(page.getByTestId('konto-setup-balance')).toHaveAttribute('inputmode', 'decimal');
            await expect(page.getByTestId('konto-setup-balance-hint')).toHaveText('Nur einmal eintragen. Danach rechnet Erbse selbst weiter.');
            if (variant === 'ja') {
              await expect(page.getByTestId('konto-setup-next')).toBeDisabled();
              await page.getByTestId('konto-setup-balance').fill('0');
              if (SHOTS.has(name)) await shot(page, `${tag}-3-einrichtung-2-kontostand`);
              await tap('konto-setup-next');
            } else {
              await tap('konto-setup-balance-unknown');
            }
            await expect(setup).toHaveAttribute('data-step', 'order');
            await expect(page.getByTestId('konto-setup-question')).toHaveText('Ist der Dauerauftrag für November schon eingegangen?');
            if (SHOTS.has(name) && variant === 'ja') await shot(page, `${tag}-3-einrichtung-3-dauerauftrag`);
            await tap(variant === 'ja' ? 'konto-setup-order-no' : 'konto-setup-order-none');
          }

          await expect(setup).toHaveAttribute('data-step', 'plan');
          const plan = page.getByTestId('konto-setup-plan');
          const covered = page.getByTestId('plan-pod').locator('[data-testid="pod-slot"][data-covered]');
          // before any point: no standing order on the account yet, balance 0 → nothing covered
          await expect(page.getByTestId('plan-pending')).toHaveText('Erledige die Punkte, dann füllt sich die Schote.');
          await expect(page.getByTestId('plan-pod-text')).toHaveText('0 von 12 Monaten gedeckt');
          await expect(covered).toHaveCount(0);
          // balance 0 and November still coming (ja): gap € 580; no standing order this month: € 3.535
          const gap = variant === 'ja' ? '€ 580' : '€ 3.535';
          await expect(page.getByTestId('plan-order')).toContainText(
            variant === 'ja' ? 'Dauerauftrag prüfen: € 2.955 monatlich am 1.' : 'Dauerauftrag einrichten: € 2.955 monatlich am 1.',
          );
          await expect(page.getByTestId('plan-gap')).toContainText(`Einmalig ${gap} überweisen`);
          // „Noch nicht“: the plan starts with opening the account, before the standing order
          const items = page.getByTestId('konto-setup-plan').locator('li');
          await expect(items).toHaveCount(variant === 'noch-nicht' ? 3 : 2);
          if (variant === 'noch-nicht') {
            await expect(items.first()).toHaveAttribute('data-testid', 'plan-account');
            await expect(items.first()).toContainText('Fixkostenkonto eröffnen');
          } else await expect(page.getByTestId('plan-account')).toHaveCount(0);
          if (SHOTS.has(name) && variant !== 'weiss-nicht') await shot(page, `${tag}-4-plan${variant === 'noch-nicht' ? '-kein-konto' : ''}`);

          if (variant === 'noch-nicht') {
            await tap('plan-account-done');
            await expect(page.getByTestId('plan-pending')).toHaveCount(0);
            await expect(covered).toHaveCount(0); // an account alone covers nothing yet
          }
          // reward per step: the standing order covers 8 months right away (ja); without this month's
          // deposit (Ich habe noch keinen) every month stays short until the one-time transfer
          await tap('plan-order-done');
          await expect(covered).toHaveCount(variant === 'ja' ? 8 : 0);
          await expect(page.getByTestId('plan-pod-text')).toHaveText(variant === 'ja' ? '8 von 12 Monaten gedeckt' : '0 von 12 Monaten gedeckt');
          await expect(plan).not.toHaveAttribute('data-done');
          if (SHOTS.has(name) && variant === 'ja') await shot(page, `${tag}-4b-plan-dauerauftrag-erledigt`);
          await tap('plan-gap-done');
          await expect(plan).toHaveAttribute('data-done', 'true');
          await expect(page.getByTestId('plan-pod')).toHaveAttribute('data-full', 'true');
          await expect(covered).toHaveCount(12);
          await expect(page.getByTestId('plan-pod-text')).toHaveText('Alles gedeckt bis Oktober 2027');
          await expectNoOverflow(page);
          if (SHOTS.has(name) && variant === 'ja') await shot(page, `${tag}-5-plan-erledigt`);

          await tap('konto-setup-finish');
          await expect(setup).toHaveCount(0);
          const result = JSON.parse((await page.getByTestId('dev-setup-result').textContent())!);
          expect(result).toMatchObject(
            {
              ja: { hasAccount: true, balance: 0, balanceUnknown: false, order: 'no', accountDone: false, orderDone: true, gapDone: true },
              'noch-nicht': { hasAccount: false, balance: 0, balanceUnknown: false, order: 'none', accountDone: true, orderDone: true, gapDone: true },
              'weiss-nicht': { hasAccount: true, balance: 0, balanceUnknown: true, order: 'none', orderDone: true, gapDone: true },
            }[variant],
          );
        });
      }
    });
  }
}

test.describe('Schote A · Bewegung reduzieren', () => {
  test.use({ ...VIEWPORTS['iphone-15'], contextOptions: { reducedMotion: 'reduce' } });
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
  test('ohne Animation, alle Infos da', async ({ page }) => {
    await page.goto(url('light', '&view=pod'));
    await page.getByTestId('dev-pod-toggle').tap();
    // at once, no pop class
    await expect(page.getByTestId('dev-pod-snapper').locator('[data-testid="pod-slot"][data-covered]')).toHaveCount(12, { timeout: 50 });
    await expect(page.getByTestId('dev-pod-snapper').locator('.pod-snap')).toHaveCount(0);
    await expect(page.getByTestId('dev-pod-snapper-text')).toHaveText('Gedeckt bis Oktober 2027');
  });
});

test.describe('Schote A · Video der Einrichtung', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop' || !process.env.SCHOTE_VIDEO, 'nur mit SCHOTE_VIDEO=1'));
  test('Einrichtung durchklicken', async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const size = { width: 393, height: 852 };
    const context = await browser.newContext({
      ...VIEWPORTS['iphone-15'],
      deviceScaleFactor: 2,
      baseURL,
      recordVideo: { dir: 'test-results/schote-video', size },
    });
    const page = await context.newPage();
    const slow = (ms = 900) => page.waitForTimeout(ms);
    await page.goto(url('light', '&view=setup'));
    await slow();
    await page.getByTestId('dev-setup-open').tap();
    await slow(1200);
    await page.getByTestId('konto-setup-has-account').tap();
    await slow();
    await page.getByTestId('konto-setup-balance').pressSequentially('0', { delay: 120 });
    await slow();
    await page.getByTestId('konto-setup-next').tap();
    await slow(1200);
    await page.getByTestId('konto-setup-order-no').tap();
    await slow(1800);
    await page.getByTestId('plan-order-done').tap();
    await slow(2000);
    await page.getByTestId('plan-gap-done').tap();
    await slow(2800);
    await page.getByTestId('konto-setup-finish').tap();
    await slow(1200);
    const video = page.video()!;
    await context.close();
    await video.saveAs(`${DIR}/einrichtung-iphone-15.webm`);
  });
});
