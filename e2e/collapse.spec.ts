import type { Locator, Page } from '@playwright/test';
import { eur, expect, goTo, isSidebarLayout, isTouchProject, test } from './fixtures';
import { expectClean } from './measure';
import { importSprint } from './sprint-data';

const DIR = 'docs/screenshots/kategorien-einklappen';

async function tap(locator: Locator) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

const group = (page: Page, name: string) => page.getByRole('region', { name });
const toggleOf = (page: Page, name: string) => group(page, name).getByTestId('group-toggle');

/** Headings and amounts never wrap: each element needs exactly one text line. */
async function expectNoWrap(page: Page, selector: string) {
  const wrapped = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => {
        const tops: number[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) if (r.width > 0) tops.push(r.top);
        }
        tops.sort((a, b) => a - b);
        return tops.some((t, i) => i > 0 && t - tops[i - 1]! > 8);
      })
      .map((el) => el.textContent),
  );
  expect(wrapped, `wrapped: ${selector}`).toEqual([]);
}

/** Every figure of the month screen that must not depend on collapsed groups. */
async function figures(page: Page) {
  return {
    hero: await page.getByTestId('hero').textContent(),
    salary: await page.getByTestId('salary-tile').textContent(),
    avg: await page.getByTestId('kpi-value').textContent(),
    free: await page.getByTestId('free-tile').textContent(),
    sums: await page.getByTestId('group-sum').allTextContents(),
  };
}

test.describe('Kategorien einklappen (Monat)', () => {
  test('einklappen: Positionen weg, Kopf mit Summe + Fortschritt; Monat wechseln und Reload behalten den Zustand', async ({ page }, info) => {
    await importSprint(page);
    const immos = group(page, 'Meine Immos');
    await expect(immos.getByTestId('position-row')).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-monat-nachher-offen.png` });

    const before = await figures(page);
    await tap(toggleOf(page, 'Meine Immos'));
    await expect(toggleOf(page, 'Meine Immos')).toHaveAttribute('aria-expanded', 'false');
    await expect(immos.getByTestId('position-row')).toHaveCount(0);
    await expect(immos.getByTestId('group-sum')).toHaveText(eur('€ 991'));
    await expect(immos.getByTestId('group-progress')).toHaveText('✓ bezahlt');
    await expect(group(page, 'Banking & Finanzen').getByTestId('group-progress')).toHaveText(/^\d+\/\d+ bezahlt$/);
    expect(await figures(page)).toEqual(before); // sums and KPIs unchanged

    await tap(toggleOf(page, 'Banking & Finanzen'));
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-monat-nachher-teilweise.png` });

    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'November 2026' })).toBeVisible();
    await expect(toggleOf(page, 'Meine Immos')).toHaveAttribute('aria-expanded', 'false');
    await expect(group(page, 'Meine Immos').getByTestId('position-row')).toHaveCount(0);
    await page.reload();
    await expect(toggleOf(page, 'Meine Immos')).toHaveAttribute('aria-expanded', 'false');
    await expect(toggleOf(page, 'Wohnen & Leben')).toHaveAttribute('aria-expanded', 'true');

    // expand again: ticking works as before
    await tap(toggleOf(page, 'Meine Immos'));
    await expect(group(page, 'Meine Immos').getByTestId('position-row')).toHaveCount(3);
    await expectNoWrap(page, '[data-testid="group-name"], [data-testid="group-sum"], [data-testid="group-progress"]');
    await expectClean(page, 'main');
  });

  test('„Alle einklappen“ / „Alle ausklappen“; Summen und KPIs bleiben gleich', async ({ page }, info) => {
    await importSprint(page);
    const before = await figures(page);
    await tap(page.getByTestId('collapse-all'));
    await expect(page.getByTestId('collapse-all')).toHaveText('Alle ausklappen');
    await expect(page.getByTestId('position-row')).toHaveCount(0);
    for (const t of await page.getByTestId('group-toggle').all()) await expect(t).toHaveAttribute('aria-expanded', 'false');
    expect(await figures(page)).toEqual(before);
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-monat-nachher-zu.png` });
    await expectNoWrap(page, '[data-testid="group-name"], [data-testid="group-sum"], [data-testid="group-progress"]');
    await expectClean(page, 'main');

    await tap(page.getByTestId('collapse-all'));
    await expect(page.getByTestId('collapse-all')).toHaveText('Alle einklappen');
    for (const t of await page.getByTestId('group-toggle').all()) await expect(t).toHaveAttribute('aria-expanded', 'true');
    expect(await figures(page)).toEqual(before);
  });

  test('Tastatur: Enter und Leertaste, aria-expanded, Fokus bleibt auf dem Kopf (Desktop)', async ({ page }) => {
    test.skip(isTouchProject(), 'desktop only');
    await importSprint(page);
    const t = toggleOf(page, 'Wohnen & Leben');
    await t.focus();
    await page.keyboard.press('Enter');
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    await expect(t).toBeFocused();
    await expect(group(page, 'Wohnen & Leben').getByTestId('position-row')).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expect(t).toBeFocused();
    await expect(group(page, 'Wohnen & Leben').getByTestId('position-row')).not.toHaveCount(0);
  });

  test('eingeklappte Kategorie sortieren: Reihenfolge und Zustand bleiben nach Reload (Desktop)', async ({ page }) => {
    test.skip(!isSidebarLayout(page), 'desktop keyboard flow');
    await importSprint(page);
    await tap(toggleOf(page, 'Meine Immos'));
    await expect(toggleOf(page, 'Meine Immos')).toHaveAttribute('aria-expanded', 'false');
    const order = () => page.getByTestId('category-group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect((await order())[0]).toBe('Meine Immos');

    await goTo(page, 'positionen');
    await page.getByRole('button', { name: 'Kategorien' }).click();
    await page.getByRole('button', { name: 'Kategorie „Meine Immos“ verschieben' }).focus();
    const live = page.getByText(/„Meine Immos“ (aufgenommen|ist jetzt an Position)/);
    await page.keyboard.press('Space');
    // the drag has started only once dnd-kit announced the start position: keys before that are lost
    await expect(live).toContainText('ist jetzt an Position 1');
    await page.keyboard.press('ArrowDown');
    await expect(live).toContainText('ist jetzt an Position 2');
    await page.keyboard.press('Space');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const req = indexedDB.open('fixkosten');
              req.onsuccess = () => {
                const all = req.result.transaction('categories').objectStore('categories').getAll();
                all.onsuccess = () => {
                  req.result.close();
                  resolve((all.result as { id: string; sortOrder: number }[]).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id));
                };
              };
            }),
        ),
      )
      .toEqual(expect.arrayContaining(['cat-immos']));
    await page.keyboard.press('Escape');
    await page.reload();
    await goTo(page, 'monat');
    await expect.poll(async () => (await order()).indexOf('Meine Immos')).toBe(1);
    await expect(toggleOf(page, 'Meine Immos')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('„Frei verfügbar (tatsächlich)“ entfernt', () => {
  test('keine UI mehr: Kachel, Monatsabschluss, Analyse', async ({ page }, info) => {
    await importSprint(page);
    const tile = page.getByTestId('free-tile');
    await expect(tile).not.toContainText('tatsächlich');
    await expect(tile).not.toContainText('Diff');
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 1.385'));
    await tap(page.getByTestId('salary-tile'));
    const sheet = page.getByTestId('bottom-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Netto-Gehalt')).toHaveValue('4788');
    await expect(sheet.getByLabel('Frei verfügbar (tatsächlich)')).toHaveCount(0);
    await expect(sheet).not.toContainText('tatsächlich');
    await page.waitForTimeout(400);
    await sheet.screenshot({ path: `${DIR}/${info.project.name}-abschluss-nachher.png` });
    await page.keyboard.press('Escape');
    await goTo(page, 'analyse');
    await expect(page.getByTestId('forecast')).toBeVisible();
    await expect(page.getByTestId('monthclose')).toHaveCount(0);
    await expect(page.getByText('Frei verfügbar & Sparquote')).toHaveCount(0);
    await expect(page.getByTestId('range')).toHaveCount(0); // 1 month of data: no range toggle
    await expect(page.getByText('Bisher 1 Monat Daten')).toBeVisible();
  });
});

test.describe('Verteilung', () => {
  test('Balkenbreite = angezeigtes Prozent (Kategorien und Unterzeilen), keine Detail-Tabelle, Summe bündig', async ({ page }, info) => {
    await importSprint(page);
    await goTo(page, 'analyse');
    const dist = page.getByTestId('distribution');
    await expect(dist).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(dist.getByRole('button', { name: 'Details anzeigen' })).toHaveCount(0);
    await expect(dist.locator('.sr-only table')).toHaveCount(1); // screen readers only

    const measure = () =>
      dist.locator('[data-testid="share-bar"]').evaluateAll((bars) =>
        bars.map((bar) => {
          const track = bar.parentElement!.getBoundingClientRect().width;
          const row = bar.closest('li')!;
          const pct = row.querySelector('[data-testid="share"]')!.textContent!.replace(/\s/g, '').replace('%', '').replace(',', '.');
          return { shown: parseFloat(pct), bar: (bar.getBoundingClientRect().width / track) * 100 };
        }),
      );
    for (const m of await measure()) expect(Math.abs(m.shown - m.bar)).toBeLessThanOrEqual(0.5);
    await expect(dist.locator('[data-category="cat-immos"] [data-testid="share"]').first()).toHaveText(/^35,0\s%$/);
    await page.waitForTimeout(300);
    await dist.screenshot({ path: `${DIR}/${info.project.name}-verteilung-nachher.png` });

    await tap(dist.locator('[data-category="cat-wohnen"] button').first());
    const sub = dist.getByTestId('distribution-positions');
    await expect(sub).toContainText('Anteil an Wohnen & Leben');
    await expect(sub.locator('li', { hasText: 'Miete' }).getByTestId('share')).toHaveText(/^62,9\s%$/);
    const all = await measure();
    expect(all.length).toBeGreaterThan(5);
    for (const m of all) expect(Math.abs(m.shown - m.bar)).toBeLessThanOrEqual(0.5);
    await page.waitForTimeout(300);
    await dist.screenshot({ path: `${DIR}/${info.project.name}-verteilung-offen-nachher.png` });

    // „Summe …“ starts where the rows' content starts (no extra indent)
    const lefts = await dist.evaluate((card) => {
      const total = card.querySelector('[data-testid="distribution-total"]')!.getBoundingClientRect().left;
      const head = card.querySelector('[data-testid="distribution-headline-label"]')!.getBoundingClientRect().left;
      return { total, head };
    });
    expect(Math.abs(lefts.total - lefts.head)).toBeLessThanOrEqual(0.5);
    await expectClean(page, 'main');
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-analyse-nachher.png` });
  });

  test('Touch: nach dem Antippen bleibt kein Hover-Hintergrund hängen', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('iphone'), 'iPhone profiles');
    await importSprint(page);
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
    await goTo(page, 'analyse');
    const row = page.getByTestId('distribution').locator('[data-category="cat-immos"] button').first();
    await row.tap();
    await row.tap(); // open and close again: not selected any more
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(250);
    const bg = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.backgroundImage];
    });
    expect(bg).toEqual(['rgba(0, 0, 0, 0)', 'none']);
    // the month screen too: a tapped category header keeps no grey background
    await goTo(page, 'monat');
    const head = toggleOf(page, 'Wohnen & Leben');
    await head.tap();
    await head.tap();
    await page.waitForTimeout(250);
    expect(await head.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).backgroundImage])).toEqual([
      'rgba(0, 0, 0, 0)',
      'none',
    ]);
  });
});
