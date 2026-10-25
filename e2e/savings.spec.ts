import type { Locator, Page } from '@playwright/test';
import { eur, expect, goTo, isTouchProject, test } from './fixtures';
import { expectClean } from './measure';
import { importSavings } from './savings-data';

const DIR = 'docs/screenshots/sparquote';

async function tap(locator: Locator) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

async function openAnalyse(page: Page) {
  await goTo(page, 'analyse');
  await expect(page.getByTestId('savings')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

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

const NO_WRAP = [
  '[data-testid="savings"] h2',
  '[data-testid^="savings-headline-"]',
  '[data-testid="savings-saved"]',
  '[data-testid="savings-net"]',
  '[data-testid="savings-parts-toggle"]',
  '[data-testid="savings-part"] .num',
].join(', ');

async function shot(page: Page, name: string, testId = 'savings') {
  // the floating tab bar would cover the lower part of an element screenshot
  await page.addStyleTag({ content: '[data-testid="tabbar"] { visibility: hidden !important; }' });
  await page.waitForTimeout(250);
  await page.getByTestId(testId).screenshot({ path: `${DIR}/${test.info().project.name}-${name}.png` });
}

/** Width of an element relative to another, 0–1. */
async function ratio(part: Locator, whole: Locator): Promise<number> {
  const [a, b] = [(await part.boundingBox())!, (await whole.boundingBox())!];
  return a.width / b.width;
}

test.describe('Sparquote-Karte', () => {
  test('unter der Verteilung: Oktober 2026 · 38,8 % · € 1.860, Balken = Sparquote, Ø der Monate mit Netto', async ({ page }) => {
    await importSavings(page);
    await openAnalyse(page);
    const card = page.getByTestId('savings');
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('Sparquote');
    await expect(page.getByTestId('savings-headline-label')).toHaveText('Oktober 2026');
    await expect(page.getByTestId('savings-headline-value')).toHaveText(eur('38,8 % · € 1.860'));
    await expect(page.getByTestId('savings-headline-sub')).toHaveText(eur('Ø 42,8 % der letzten 3 Monate'));
    await expect(page.getByTestId('savings-saved')).toHaveText(eur('€ 1.860 aus dem Netto gespart'));
    await expect(page.getByTestId('savings-net')).toHaveText(eur('Netto € 4.788'));
    await expect(page.getByRole('img', { name: /Sparquote 38,8\s%: € 1\.860 von € 4\.788 Netto-Gehalt/ })).toBeVisible();

    // directly below the distribution, in the same column
    const dist = (await page.getByTestId('distribution').boundingBox())!;
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThan(dist.y + dist.height);
    expect(box.y - (dist.y + dist.height)).toBeLessThan(40);
    expect(Math.abs(box.x - dist.x)).toBeLessThan(1);

    // filled part = Sparquote (± 0,5 %)
    expect(Math.abs((await ratio(page.getByTestId('savings-fill'), page.getByTestId('savings-bar'))) - 1860 / 4788)).toBeLessThanOrEqual(0.005);
    expect((await page.getByTestId('savings-bar').boundingBox())!.height).toBe(14);
  });

  test('Zusammensetzung: zu → auf (Touch/Klick), Unterzeilen mit Balken = Prozent, Tastatur Enter/Space', async ({ page }) => {
    await importSavings(page);
    await openAnalyse(page);
    const toggle = page.getByTestId('savings-parts-toggle');
    await expect(toggle).toHaveText(eur('Zusammensetzung · € 1.860'));
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('savings-parts')).toHaveCount(0);

    await tap(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const parts = page.getByTestId('savings-parts');
    await expect(parts).toContainText('Anteil am Vermögensaufbau');
    await expect(page.getByTestId('savings-part')).toHaveText([eur('Investing€ 1.56083,9 %'), eur('Altersvorsorge€ 30016,1 %')]);
    await page.waitForTimeout(300);
    const rows = await page.getByTestId('savings-part').evaluateAll((els) =>
      els.map((el) => {
        const bar = el.querySelector('[data-testid="share-bar"]')!;
        const track = bar.parentElement!;
        const shown = parseFloat(el.querySelector('[data-testid="share"]')!.textContent!.replace(',', '.'));
        return { shown, width: (bar.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100 };
      }),
    );
    for (const r of rows) expect(Math.abs(r.width - r.shown), JSON.stringify(r)).toBeLessThanOrEqual(0.5);

    await tap(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('savings-parts')).toHaveCount(0);

    if (!isTouchProject()) {
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('Verlauf: Lücke ohne Netto, Ø-Linie = Mittel der Monate mit Netto, Wert nur über dem aktuellen Monat', async ({ page }) => {
    await importSavings(page);
    await openAnalyse(page);
    const history = page.getByTestId('savings-history');
    await expect(history).toContainText('Sparquote je Monat');
    await expect(page.getByTestId('savings-column')).toHaveCount(3);
    await expect(page.getByTestId('savings-gap')).toHaveCount(1);
    await expect(page.getByTestId('savings-gap')).toHaveAttribute('data-period', '2026-08');
    await expect(page.getByTestId('savings-gap').getByTestId('savings-column-bar')).toHaveCount(0);
    await expect(page.getByTestId('savings-value')).toHaveCount(1);
    await expect(page.locator('[data-current] [data-testid="savings-value"]')).toHaveText(eur('38,8 %'));

    const m = await history.evaluate((root) => {
      const bars = Array.from(root.querySelectorAll('[data-testid="savings-column"]')).map((c) => {
        const bar = c.querySelector('[data-testid="savings-column-bar"]')!.getBoundingClientRect();
        return { period: c.getAttribute('data-period'), height: bar.height, bottom: bar.bottom, colWidth: c.getBoundingClientRect().width, colHeight: c.getBoundingClientRect().height, current: c.hasAttribute('data-current'), fill: getComputedStyle(c.querySelector('[data-testid="savings-column-bar"]')!).backgroundColor };
      });
      const line = root.querySelector('[data-testid="savings-avg-line"]')!.getBoundingClientRect();
      return { bars, lineY: line.top };
    });
    const [jul, sep, oct] = m.bars;
    const rates = { jul: 2360 / 4650, sep: 1860 / 4788, oct: 1860 / 4788 };
    const avg = (rates.jul + rates.sep + rates.oct) / 3;
    // heights proportional to the rates; the Ø line sits at the mean of the months with Netto
    expect(Math.abs(sep!.height / jul!.height - rates.sep / rates.jul)).toBeLessThan(0.02);
    expect(Math.abs(jul!.bottom - m.lineY - (jul!.height * avg) / rates.jul)).toBeLessThanOrEqual(1);
    expect(oct!.current).toBe(true);
    expect(oct!.fill).not.toBe(sep!.fill);
    for (const b of m.bars) {
      expect(b.colWidth).toBeGreaterThanOrEqual(44);
      expect(b.colHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test('Tooltip: Tap (iPhone/iPad) bzw. Hover und Fokus (Desktop)', async ({ page }) => {
    await importSavings(page);
    await openAnalyse(page);
    const tip = page.getByTestId('savings-tooltip');
    const col = (p: string) => page.locator(`[data-testid="savings-column"][data-period="${p}"]`);
    await expect(tip).toHaveCount(0);

    if (isTouchProject()) {
      await col('2026-09').tap();
      await expect(tip).toHaveText(eur('Sep 2026 · 38,8 % · € 1.860 von € 4.788'));
      await col('2026-07').tap();
      await expect(tip).toHaveText(eur('Jul 2026 · 50,8 % · € 2.360 von € 4.650'));
      await page.waitForTimeout(400); // stays open without hover
      await expect(tip).toBeVisible();
      await page.getByTestId('savings-headline-label').tap();
      await expect(tip).toHaveCount(0);
    } else {
      await col('2026-07').hover();
      await expect(tip).toHaveText(eur('Jul 2026 · 50,8 % · € 2.360 von € 4.650'));
      await page.getByTestId('savings-headline-label').hover();
      await expect(tip).toHaveCount(0);
      // keyboard: Tab to the first month
      await page.getByTestId('savings-parts-toggle').focus();
      await page.keyboard.press('Tab');
      await expect(col('2026-07')).toBeFocused();
      await expect(tip).toHaveText(eur('Jul 2026 · 50,8 % · € 2.360 von € 4.650'));
      await page.keyboard.press('Tab');
      await expect(tip).toHaveText(eur('Sep 2026 · 38,8 % · € 1.860 von € 4.788'));
    }
    // inside the card, never wider than the chart
    await col('2026-10')[isTouchProject() ? 'tap' : 'hover']();
    const [t, chart] = [(await tip.boundingBox())!, (await page.getByTestId('savings-history').boundingBox())!];
    expect(t.x).toBeGreaterThanOrEqual(chart.x - 0.5);
    expect(t.x + t.width).toBeLessThanOrEqual(chart.x + chart.width + 0.5);
  });

  test('1 Monat mit Netto: kein Chart, „Verlauf ab 3 Monaten“', async ({ page }) => {
    await importSavings(page, 'one-month');
    await openAnalyse(page);
    await expect(page.getByTestId('savings-headline-sub')).toHaveText('deines Netto-Gehalts fließt in Vermögensaufbau');
    await expect(page.getByTestId('savings-history-hint')).toHaveText('Verlauf ab 3 Monaten');
    await expect(page.getByTestId('savings-history')).toHaveCount(0);
  });

  test('ohne Netto im aktuellen Monat: letzter Monat mit Netto', async ({ page }) => {
    await importSavings(page, 'fallback');
    await openAnalyse(page);
    await expect(page.getByTestId('savings-headline-label')).toHaveText('September 2026');
    await expect(page.getByTestId('savings-headline-value')).toHaveText(eur('38,8 % · € 1.860'));
  });

  test('Leerzustand: Link „Netto eintragen“ öffnet den Monatsabschluss, danach erscheint die Karte', async ({ page }) => {
    await importSavings(page, 'empty');
    await openAnalyse(page);
    const empty = page.getByTestId('savings-empty');
    await expect(empty).toContainText('Trag dein Netto-Gehalt im Monat ein, dann siehst du hier deine Sparquote.');
    await tap(empty.getByRole('button', { name: 'Netto eintragen' }));
    const sheet = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Netto-Gehalt').fill('4.788');
    await sheet.getByRole('button', { name: 'Speichern' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('savings-headline-value')).toHaveText(eur('38,8 % · € 1.860'));
  });
});

test.describe('Ø der Jahresvorschau = Ø pro Monat von heute', () => {
  test('Linie „Ø 2.952“ = Summe der Verteilung, Legende „Ø pro Monat“, kein „nächste 12 Monate“ / „12-Monats-Ø“', async ({ page }) => {
    await importSavings(page);
    await openAnalyse(page);
    const forecast = page.getByTestId('forecast');
    await forecast.getByRole('button', { name: 'Details anzeigen' }).click();
    await expect(forecast.getByTestId('forecast-details')).toBeVisible();
    await expect(forecast.getByTestId('avg-chip')).toHaveText('Ø 2.952');
    await expect(page.getByTestId('forecast-legend')).toContainText('Ø pro Monat (heute)');
    await expect(page.getByTestId('forecast-headline-sub')).toHaveText(eur('€ 1.658 über Ø'));
    await expect(forecast.getByRole('img')).toHaveAttribute('aria-label', /Ø pro Monat \(heute\) €[\s\u00a0]2\.952,17/);
    await expect(page.getByTestId('distribution-total')).toHaveText(eur('Summe € 2.952,17 Ø pro Monat (heute)'));
    await expect(forecast.getByTestId('forecast-gap')).toHaveCount(0);
    for (const route of ['analyse', 'monat', 'positionen', 'einstellungen'] as const) {
      await goTo(page, route);
      await page.waitForTimeout(300);
      await expect(page.locator('body')).not.toContainText('nächste 12 Monate');
      await expect(page.locator('body')).not.toContainText('12-Monats-Ø');
    }
  });
});

for (const dark of [false, true]) {
  const theme = dark ? 'dunkel' : 'hell';
  test.describe(`Messungen + Screenshots (${theme})`, () => {
    test(`Sparquote: Verlauf, Zusammensetzung offen, Jahresvorschau – sauber, ohne Umbruch`, async ({ page }) => {
      await importSavings(page, 'history', dark);
      await openAnalyse(page);
      await expectNoWrap(page, NO_WRAP);
      await expectClean(page, '[data-testid="savings"]');
      await shot(page, `verlauf-${theme}`);
      await tap(page.getByTestId('savings-parts-toggle'));
      await expect(page.getByTestId('savings-parts')).toBeVisible();
      await expectNoWrap(page, NO_WRAP);
      await expectClean(page, '[data-testid="savings"]');
      await shot(page, `zusammensetzung-${theme}`);
      await expectClean(page);
      await shot(page, `jahresvorschau-${theme}`, 'forecast');
      await shot(page, `verteilung-${theme}`, 'distribution');
    });

    test(`Sparquote: 1 Monat und Leerzustand`, async ({ page }) => {
      await importSavings(page, 'one-month', dark);
      await openAnalyse(page);
      await expectNoWrap(page, NO_WRAP);
      await expectClean(page, '[data-testid="savings"]');
      await shot(page, `1monat-${theme}`);
    });

    test(`Sparquote: Leerzustand`, async ({ page }) => {
      await importSavings(page, 'empty', dark);
      await openAnalyse(page);
      await expectClean(page, '[data-testid="savings"]');
      await shot(page, `leer-${theme}`);
    });
  });
}
