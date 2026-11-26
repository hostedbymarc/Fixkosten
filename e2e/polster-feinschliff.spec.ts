import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { appSettled, closePlan, expect, FIXTURE, setUpKonto, settled, test, TODAY, animationsDone } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// polster-feinschliff (data like yours, rebuilt, plus an invented „Xmas“ of € 400 every December from the salary;
// „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - „Anders aufteilen“: opens, „Abbrechen“ closes it, a second tap closes it, after „Polster aufgefüllt“ it is closed
// - confirmed: „Rückgängig“ is a real button (≥ 44 px), nothing lies over it; the confetti has a strip of its own
//   under every text – in „Dein Monat“, in „Dein Polster“ and in the hero of a month „erledigt“
// - „+ Einzahlen“ / „− Entnehmen“ → the card, the screen, „Dein Plan“ and „Verlauf“
// - Xmas only in December changed → the Überschuss and the Polster preview at once
// - after the confirmation the Überschuss rises → „Differenz in den Polster“
// - „Spielgeld für Dezember“ only for December → January unchanged
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/polster-feinschliff/.

const DIR = 'docs/screenshots/polster-feinschliff';
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

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
    const category = b.data.categories.find((c) => c.name === 'Wohnen & Leben')!;
    b.data.positions.push({
      id: 'pos-xmas',
      name: 'Xmas',
      categoryId: category.id,
      history: [{ validFrom: '2026-01', amount: 400, frequency: 'annual', dueMonths: [12], dueDay: 20 }],
      createdAt: '2026-01-01T08:00:00.000Z',
      sortOrder: 999,
      account: 'girokonto',
    });
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page, '0');
}

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

async function shot(page: Page, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  await settled(page);
  if (target) await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
  else await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

/**
 * The confetti strip of `host` and every text and button in it: no box overlaps it. Each pea lies inside the strip.
 * Returns how many boxes were compared.
 */
async function confettiClear(host: Locator) {
  const r = await host.evaluate((el) => {
    const layer = el.querySelector(':scope > .hero-confetti');
    if (!layer) return { layer: false, overlaps: [] as string[], boxes: 0, peas: 0, outside: 0 };
    const strip = layer.getBoundingClientRect();
    const hit = (b: DOMRect) => b.width > 0 && b.height > 0 && b.left < strip.right && b.right > strip.left && b.top < strip.bottom && b.bottom > strip.top;
    const overlaps: string[] = [];
    let boxes = 0;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode;
      if (!node.textContent?.trim() || layer.contains(node)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const b of range.getClientRects()) {
        boxes++;
        if (hit(b)) overlaps.push(node.textContent.trim());
      }
    }
    for (const b of el.querySelectorAll('button')) {
      boxes++;
      if (hit(b.getBoundingClientRect())) overlaps.push(`button ${b.textContent?.trim()}`);
    }
    const peas = [...layer.querySelectorAll('.confetti-pea')].map((p) => p.getBoundingClientRect());
    // a resting pea: inside the strip (a falling one may still be above it, clipped)
    const outside = peas.filter((p) => p.bottom > strip.bottom + 1).length;
    return { layer: true, overlaps, boxes, peas: peas.length, outside };
  });
  expect(r.layer, 'confetti strip').toBe(true);
  expect(r.overlaps, 'text or buttons over the confetti strip').toEqual([]);
  expect(r.peas).toBeGreaterThan(0);
  expect(r.outside).toBe(0);
  return r.boxes;
}

/** the stored Polster (IndexedDB „fixkosten“, meta „fixkostenkonto“): what a failing check of the card reports */
const storedCushion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('fixkosten');
        open.onsuccess = () => {
          const get = open.result.transaction('meta').objectStore('meta').get('fixkostenkonto');
          get.onsuccess = () => {
            const v = (get.result?.value ?? {}) as Record<string, unknown>;
            resolve(JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('cushion')))));
          };
        };
      }),
  );

/** the card shows `cents` (waiting for it); else the failure carries what is stored */
async function cardShows(page: Page, cents: number) {
  try {
    await expect.poll(() => centsOf(page.getByTestId('polster-card-balance'))).toBe(cents);
  } catch (e) {
    throw new Error(`${(e as Error).message}\nstored: ${await storedCushion(page)}`);
  }
}

/** the element at the middle of `button` is the button itself (nothing lies over it) */
async function reachable(page: Page, button: Locator) {
  await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await button.boundingBox())!;
  expect(box.height, 'at least 44 px').toBeGreaterThanOrEqual(44);
  const testId = await button.getAttribute('data-testid');
  const top = await page.evaluate(
    ([x, y, id]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest(`[data-testid="${id}"]`) ? 'button' : (el?.className.toString() ?? 'nothing');
    },
    [box.x + box.width / 2, box.y + box.height / 2, testId] as const,
  );
  expect(top).toBe('button');
}

/** „So teilt sich dein Gehalt“ and one of its rows open (each only when it is closed) */
async function openRow(page: Page, tap: Tap, row: string) {
  const fold = page.getByTestId('dein-monat-split-toggle');
  await expect(async () => {
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await tap(fold);
    await expect(fold).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  const toggle = page.getByTestId(`${row}-toggle`);
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await tap(toggle);
    await expect(page.getByTestId(`${row}-list`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Polster-Feinschliff · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(420_000);
      const tap: Tap = (l) => (use.hasTouch ? l.tap() : l.click());

      test('Anders aufteilen, Rückgängig frei, Einzahlen/Entnehmen mit Verlauf, Differenz, Betrag und Spielgeld für Dezember', async ({ page }) => {
        await start(page);
        const card = page.getByTestId('polster-card-open');
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-goal-input'), '20000');
        await enter(page.getByTestId('polster-balance-input'), '14000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 14.000');
        await closeSheet(page, 'polster-sheet');

        // 1 „Anders aufteilen“: open → „Abbrechen“ closes; open → a second tap closes; nothing saved
        const month = page.getByTestId('dein-monat');
        const other = page.getByTestId('cushion-split-other');
        const field = page.getByTestId('cushion-split-input');
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'fill');
        await tap(other);
        await expect(field).toBeVisible();
        await expect(other).toHaveAttribute('aria-expanded', 'true');
        await tap(page.getByTestId('cushion-split-cancel'));
        await expect(field).toHaveCount(0);
        await tap(other);
        await expect(field).toBeVisible();
        await tap(other);
        await expect(field).toHaveCount(0);
        await expect(other).toHaveAttribute('aria-expanded', 'false');
        await cardShows(page, 1400000);
        // an own amount: € 1.000 → 75 % reached, the field is closed after „Polster aufgefüllt“
        await tap(other);
        await field.fill('1000');
        await expect.poll(() => centsOf(page.getByTestId('cushion-split-amount'))).toBe(100000);
        await shot(page, `${tag}-1-anders-aufteilen`, month);
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await expect(field).toHaveCount(0);
        await expect(page.getByTestId('cushion-split-confirmed')).toHaveText('€ 1.000 in den Polster gelegt.');
        await cardShows(page, 1500000);

        // 2 the confetti under the text, „Rückgängig“ free and ≥ 44 px
        const block = page.getByTestId('cushion-split');
        await expect(block.locator('[data-testid=hero-confetti]')).toHaveCount(1);
        await animationsDone(page, 'cushion-split');
        expect(await confettiClear(block)).toBeGreaterThan(1);
        await reachable(page, page.getByTestId('cushion-split-undo'));
        await shot(page, `${tag}-2-rueckgaengig`, month);
        await tap(page.getByTestId('cushion-split-undo'));
        await cardShows(page, 1400000);
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'fill');

        // 3 „+ Einzahlen“ / „− Entnehmen“ from the card: the screen, the card, „Dein Plan“, „Verlauf“
        await tap(card);
        await sheetOpen(page, 'polster-sheet');
        await enter(page.getByTestId('polster-balance-input'), '9000');
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 9.000');
        await closeSheet(page, 'polster-sheet');
        await tap(page.getByTestId('polster-card-in'));
        await sheetOpen(page, 'polster-sheet');
        await expect(page.getByTestId('polster-move-form')).toHaveAttribute('data-dir', 'in');
        await page.getByTestId('polster-move-amount').fill('1500');
        await page.getByTestId('polster-move-note').fill('Bonus');
        await tap(page.getByTestId('polster-move-save'));
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 10.500');
        await expect(page.getByTestId('polster-move-form')).toHaveCount(0);
        // 50 % crossed by a move: the confetti in the strip of the green card
        const goalCard = page.getByTestId('polster-goal-card');
        await expect(goalCard.locator('[data-testid=hero-confetti]')).toHaveCount(1);
        await animationsDone(page, 'polster-goal-card');
        expect(await confettiClear(goalCard)).toBeGreaterThan(3);
        await shot(page, `${tag}-3-einzahlen`, page.getByTestId('bottom-sheet'));
        await tap(page.getByTestId('polster-out'));
        await page.getByTestId('polster-move-amount').fill('500');
        await page.getByTestId('polster-move-note').fill('Zahnarzt');
        await tap(page.getByTestId('polster-move-save'));
        await expect(page.getByTestId('polster-balance')).toHaveText('€ 10.000');
        const rows = page.getByTestId('polster-history-row');
        await expect(rows.first()).toContainText('Zahnarzt');
        await expect(rows.first()).toContainText('−€ 500');
        await expect(rows.nth(1)).toContainText('Bonus');
        await expect(rows.nth(1)).toContainText('+€ 1.500');
        await expect(rows.nth(2)).toContainText('Stand eingetragen');
        // the hint („Entnommen: € 500 · Rückgängig“) is gone after 5 s: the list in full view
        await expect(page.locator('.anim-toast')).toHaveCount(0, { timeout: 10_000 });
        await page.getByTestId('polster-history').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-4-verlauf`, page.getByTestId('bottom-sheet'));
        await closeSheet(page, 'polster-sheet');
        await cardShows(page, 1000000);
        await tap(page.getByTestId('next-salary'));
        await sheetOpen(page, 'plan-sheet');
        await expect(page.getByTestId('plan-cushion-today')).toContainText('Heute € 10.000');
        await closePlan(page);

        // 4 after the confirmation the Überschuss rises: „Differenz in den Polster“
        const before = await centsOf(page.getByTestId('dein-monat-free-value'));
        const confirmed = 1000000 + Math.min(before, 1000000);
        await tap(page.getByTestId('cushion-split-confirm'));
        await expect(page.getByTestId('cushion-split')).toHaveAttribute('data-kind', 'confirmed');
        await cardShows(page, confirmed);
        // ③ Vermögensaufbau counts against the Überschuss directly: one of its lines € 50 lower, only November
        await openRow(page, tap, 'dein-monat-wealth');
        const line = page.getByTestId('dein-monat-wealth-item-edit').first();
        await expect(line).toBeVisible();
        const was = await centsOf(line.getByTestId('dein-monat-wealth-item-amount'));
        await tap(line);
        await sheetOpen(page, 'amount-sheet');
        await expect(page.getByTestId('amount-scope')).toHaveAttribute('data-scope', 'only');
        await page.getByTestId('amount-input').fill(String((was - 5000) / 100).replace('.', ','));
        await tap(page.getByTestId('amount-save'));
        await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(before + 5000);
        await expect(page.getByTestId('cushion-diff-text')).toHaveText('Dein Überschuss ist € 50 höher.');
        await shot(page, `${tag}-6-differenz`, month);
        await tap(page.getByTestId('cushion-diff-move'));
        await expect(page.getByTestId('cushion-diff')).toHaveCount(0);
        await cardShows(page, confirmed + 5000);

        // 5 Xmas only in December: the Überschuss and the Polster preview of December at once
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(month).toHaveAttribute('data-when', 'future');
        const decFree = await centsOf(page.getByTestId('dein-monat-free-value'));
        const preview = page.getByTestId('cushion-split');
        const decKind = await preview.getAttribute('data-kind');
        const oldAmount = decKind === 'fill' ? await centsOf(page.getByTestId('cushion-split-amount')) : null;
        await openRow(page, tap, 'dein-monat-direct');
        const xmas = page.getByTestId('dein-monat-direct-item-edit').filter({ hasText: 'Xmas' });
        await expect(xmas).toContainText('€ 400');
        await tap(xmas);
        await sheetOpen(page, 'amount-sheet');
        await expect(page.getByRole('heading', { name: 'Betrag für Dezember' })).toBeVisible();
        await page.getByTestId('amount-input').fill('600');
        await tap(page.getByTestId('amount-scope-only'));
        await shot(page, `${tag}-5-betrag-dezember`, page.getByTestId('bottom-sheet'));
        await tap(page.getByTestId('amount-save'));
        await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
        await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(decFree - 20000);
        if (oldAmount !== null && decFree - 20000 > 0) {
          const expected = oldAmount < decFree ? Math.min(oldAmount, decFree - 20000) : decFree - 20000;
          await expect.poll(() => centsOf(page.getByTestId('cushion-split-amount'))).toBe(expected);
        }
        // 6 „Spielgeld für Dezember“ only: January keeps its Spielgeld (the Spielgeld is set in „Dein Plan“ of November)
        await tap(page.getByRole('button', { name: 'Vorheriger Monat' }));
        await expect(month).toHaveAttribute('data-when', 'active');
        await tap(page.getByTestId('next-salary'));
        await sheetOpen(page, 'plan-sheet');
        await tap(page.getByTestId('plan-spielgeld-amount'));
        await enter(page.getByTestId('plan-spielgeld-input'), '300');
        await closePlan(page);
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(month).toHaveAttribute('data-period', '2026-12');
        await expect(page.getByTestId('dein-monat-unplanned-value')).toContainText('€ 300');
        await openRow(page, tap, 'dein-monat-unplanned');
        await tap(page.getByTestId('dein-monat-unplanned-spielgeld'));
        await sheetOpen(page, 'amount-sheet');
        await expect(page.getByRole('heading', { name: 'Spielgeld für Dezember' })).toBeVisible();
        await page.getByTestId('amount-input').fill('500');
        await tap(page.getByTestId('amount-save'));
        await expect(page.getByTestId('dein-monat-unplanned-value')).toContainText('€ 500');
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(month).toHaveAttribute('data-period', '2027-01');
        await expect(page.getByTestId('dein-monat-unplanned-value')).toContainText('€ 300');
      });

      test('Monat erledigt: die Erbsen liegen in ihrem Streifen, unter jedem Text', async ({ page }) => {
        await page.clock.setFixedTime(TODAY);
        await page.goto('/');
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        await tap(page.getByTestId('hero-open-filter'));
        await tap(page.locator('[data-position="pos-depotentgelt"]').getByTestId('toggle-paid').first());
        await expect(page.getByTestId('hero-done')).toBeVisible();
        await animationsDone(page, 'hero');
        expect(await confettiClear(page.getByTestId('hero'))).toBeGreaterThan(3);
      });
    });
  }
}
