import type { Page } from '@playwright/test';
import { eur, expect, goTo, isTouchProject, test } from './fixtures';
import { importForecast } from './forecast-data';
import { expectClean } from './measure';

const DIR = 'docs/screenshots/jahresvorschau';

async function openForecast(page: Page) {
  await importForecast(page);
  await goTo(page, 'analyse');
  const card = page.getByTestId('forecast');
  await expect(card.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return card;
}

async function tap(locator: ReturnType<Page['locator']>) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

/** Text lines an element's content needs (1 = no wrap): tops of its text, decorative dots ignored. */
function lines(el: Element): number {
  const tops: number[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) if (r.width > 0) tops.push(r.top);
  }
  tops.sort((a, b) => a - b);
  // a new line starts more than half a line below the previous text
  return tops.reduce((count, top, i) => (i > 0 && top - tops[i - 1]! > 8 ? count + 1 : count), tops.length ? 1 : 0) || 1;
}

test.describe('Jahresvorschau', () => {
  test('Kopf in zwei Ebenen, Ø-Linie = Kachel „Ø pro Monat“, kein Vermögensaufbau', async ({ page }) => {
    const card = await openForecast(page);
    await expect(page.getByTestId('forecast-headline-label')).toHaveText('Teuerster Monat');
    await expect(page.getByTestId('forecast-headline-value')).toHaveText(eur('Nov 2026 · € 6.110'));
    await expect(page.getByTestId('forecast-headline-sub')).toHaveText(eur('€ 3.158 über dem 12-Monats-Ø'));
    await expect(card.getByTestId('avg-chip')).toHaveText('Ø 2.952');
    await expect(card).not.toContainText('Sondertilgung'); // one-time payment in Vermögensaufbau
    await expect(card).not.toContainText('Cash');
    await expect(page.getByTestId('forecast-footer')).toHaveText(eur('12 Monate € 39.832,04 · davon einmalig € 4.406'));

    await goTo(page, 'monat');
    await expect(page.getByTestId('kpi-value')).toHaveText(eur('€ 2.952,17'));
  });

  test('Chart: 12 Monate beschriftet ohne Überlappung, Legende einzeilig, Ø-Chip nie auf einem Balken', async ({ page }) => {
    const card = await openForecast(page);
    const m = await card.evaluate((root) => {
      const ticks = Array.from(root.querySelectorAll('.recharts-xAxis-tick-labels text')).map((t) => ({
        t: t.textContent,
        r: t.getBoundingClientRect(),
      }));
      const overlaps: string[] = [];
      ticks.forEach((a, i) => ticks.slice(i + 1).forEach((b) => {
        // at least 1.5 px air between neighbouring labels
        if (a.r.left < b.r.right + 1.5 && b.r.left < a.r.right + 1.5) overlaps.push(`${a.t}/${b.t}`);
      }));
      const chip = root.querySelector('[data-testid="avg-chip"] rect')!.getBoundingClientRect();
      const onBar = Array.from(root.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect'))
        .map((b) => b.getBoundingClientRect())
        .filter((b) => b.width > 0 && chip.left < b.right && b.left < chip.right && chip.top < b.bottom && b.top < chip.bottom).length;
      const wrapper = root.querySelector('.recharts-wrapper')!.getBoundingClientRect();
      const legend = root.querySelector('[data-testid="forecast-legend"]') as HTMLElement;
      const lh = parseFloat(getComputedStyle(legend).lineHeight);
      return {
        ticks: ticks.map((t) => t.t),
        overlaps,
        onBar,
        chipInside: chip.right <= wrapper.right + 0.5,
        legendLines: Math.round(legend.getBoundingClientRect().height / lh),
        legendClipped: legend.scrollWidth > legend.clientWidth + 1,
      };
    });
    expect(m.ticks).toEqual(['Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt']);
    expect(m.overlaps).toEqual([]);
    expect(m.onBar, 'Ø chip covers no bar').toBe(0);
    expect(m.chipInside).toBe(true);
    expect(m.legendLines).toBe(1);
    expect(m.legendClipped).toBe(false);
    await expectClean(page, 'main');
  });

  test('Details: Monat und Betrag einzeilig, „+2 weitere“ klappt auf und zu, Screenshots', async ({ page }, info) => {
    const card = await openForecast(page);
    await card.screenshot({ path: `${DIR}/${info.project.name}-nachher.png` });
    await tap(card.getByRole('button', { name: 'Details anzeigen' }));
    await expect(page.getByTestId('forecast-details')).toBeVisible();
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;

    if (wide) {
      // iPad landscape / desktop: 3-column table, items as a list
      await expect(page.getByTestId('forecast-list')).toBeHidden();
      const table = page.getByTestId('forecast-table');
      await expect(table).toBeVisible();
      await expect(table.locator('thead th')).toHaveText(['Monat', 'Fällig', 'Nicht monatlich']);
      const feb = table.locator('tbody tr', { hasText: 'Feb 2027' });
      await expect(feb.locator('td').nth(1).locator('li')).toHaveCount(4);
      const wraps = await table.evaluate((t, linesSrc) => {
        const count = new Function(`return ${linesSrc}`)() as (el: Element) => number;
        return Array.from(t.querySelectorAll('tbody tr')).flatMap((r) =>
          [r.children[0]!, r.children[1]!].filter((c) => count(c) > 1).map((c) => c.textContent),
        );
      }, lines.toString());
      expect(wraps).toEqual([]);
      await card.screenshot({ path: `${DIR}/${info.project.name}-nachher-details.png` });
    } else {
      await expect(page.getByTestId('forecast-table')).toBeHidden();
      const list = page.getByTestId('forecast-list');
      await expect(list.getByTestId('forecast-row')).toHaveCount(12);
      // month and amount on one line; preview line one line
      const wraps = await list.evaluate((l, linesSrc) => {
        const count = new Function(`return ${linesSrc}`)() as (el: Element) => number;
        return Array.from(l.querySelectorAll('[data-testid="forecast-month"], [data-testid="forecast-due"], [data-testid="forecast-preview"]'))
          .filter((e) => count(e) > 1)
          .map((e) => e.textContent);
      }, lines.toString());
      expect(wraps).toEqual([]);
      // dot only on months above Ø: Nov, Dez, Feb, Okt
      await expect(list.getByTestId('above-dot')).toHaveCount(4);
      const nov = list.locator('[data-period="2026-11"]');
      await expect(nov.getByTestId('forecast-preview')).toHaveText(eur('iPhones + Zubehör€ 2.826·Hotel Copenhagen€ 620'));
      await expect(list.locator('[data-period="2026-11"]').getByTestId('forecast-preview')).not.toContainText('einmalig');
      await expect(list.locator('[data-period="2027-03"]').getByTestId('forecast-preview')).toHaveCount(0);

      const feb = list.locator('[data-period="2027-02"]');
      await expect(feb.getByTestId('forecast-preview')).toContainText('+2 weitere');
      const febButton = feb.getByRole('button');
      await expect(febButton).toHaveAttribute('aria-expanded', 'false');
      await tap(febButton);
      await expect(febButton).toHaveAttribute('aria-expanded', 'true');
      await expect(feb.getByTestId('forecast-expanded').locator('li')).toHaveCount(4);
      await expect(feb.getByTestId('forecast-once-sum')).toHaveText(eur('davon einmalig€ 830'));
      await card.screenshot({ path: `${DIR}/${info.project.name}-nachher-details.png` });
      await tap(febButton);
      await expect(febButton).toHaveAttribute('aria-expanded', 'false');
      await expect(feb.getByTestId('forecast-expanded')).toHaveCount(0);
      await expect(feb.getByTestId('forecast-preview')).toContainText('+2 weitere');
    }
    await expect(page.getByTestId('forecast-footer')).toBeVisible();
    await expectClean(page, 'main');
  });
});
