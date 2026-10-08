import type { Locator, Page } from '@playwright/test';
import {
  burdenTrend,
  historyPeriods,
  monthCloseSeries,
  optimizationTimeline,
  planVsActual,
  type Range,
} from '../src/lib/analytics';
import { formatDelta, formatEUR } from '../src/lib/format';
import { periodLabel } from '../src/lib/period';
import { historyDataset, importHistory, openAnalyse, watchConsole } from './analyse-helpers';
import { eur, expect, goTo, isTouchProject, row, test } from './fixtures';
import { expectClean } from './measure';

const OCT = '2026-10';
const text = (s: string) => s.replace(/ /g, ' ');

/** Table alternative of a chart (always in the DOM, visually hidden until toggled). */
async function tableRows(section: Locator): Promise<string[][]> {
  return section.locator('tbody tr').evaluateAll((rows) =>
    rows.map((r) => Array.from(r.children).map((c) => (c.textContent ?? '').replace(/ /g, ' ').trim())),
  );
}

/** Axis tick labels and labels above bars must not overlap and must stay inside the chart. */
async function expectChartLabelsClean(page: Page) {
  const problems = await page.locator('[data-testid="analyse"]').evaluate((root) => {
    const out: string[] = [];
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    for (const wrapper of Array.from(root.querySelectorAll('.recharts-wrapper'))) {
      const box = wrapper.getBoundingClientRect();
      const card = wrapper.closest('.glass')!.getBoundingClientRect();
      if (box.width > card.width) out.push(`chart wider than card ${box.width} > ${card.width}`);
      const groups = [
        ...Array.from(wrapper.querySelectorAll('.recharts-xAxis-tick-labels, .recharts-yAxis-tick-labels')),
        ...Array.from(wrapper.querySelectorAll('[data-testid="group-labels"]')),
      ];
      for (const g of groups) {
        const texts = Array.from(g.querySelectorAll('text')).map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() }));
        // a value axis needs a scale (≥ 2 ticks), a time axis at least its one month
        if (g.classList.contains('recharts-yAxis-tick-labels') && texts.length < 2) out.push(`y axis with ${texts.length} ticks`);
        if (g.classList.contains('recharts-xAxis-tick-labels') && texts.length < 1) out.push('x axis without ticks');
        texts.forEach((a, i) => {
          if (a.r.left < box.left - 0.5 || a.r.right > box.right + 0.5) out.push(`label outside chart: ${a.t}`);
          texts.slice(i + 1).forEach((b) => {
            if (intersects(a.r, b.r)) out.push(`overlap: "${a.t}" / "${b.t}"`);
          });
        });
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
}

test.describe('Analyse mit 1 Monat Daten (Seed)', () => {
  test('empty states, no empty axes, no console errors', async ({ app }) => {
    const logs = watchConsole(app);
    await openAnalyse(app);

    await expect(app.getByTestId('forecast-headline')).toHaveText(eur('Teuerster Monat: Februar 2027 · € 4.610 · € 1.658 über Schnitt'));
    await expect(app.getByTestId('distribution-headline')).toHaveText(/^Wohnen & Leben ist der größte Block: 54,3\s% deiner Fixkosten\.$/);
    await expect(app.getByTestId('monthclose-empty')).toContainText('Noch kein Monatsabschluss im Zeitraum.');
    await expect(app.getByTestId('trend-empty')).toHaveText(
      eur('Ab 3 Monaten siehst du hier die Entwicklung. Bisher: € 2.952,17 Ø pro Monat seit Okt 2026.'),
    );
    await expect(app.getByTestId('planactual-empty')).toContainText(eur('Oktober 2026 läuft noch: € 3.368 von € 3.403 abgebucht.'));
    await expect(app.getByTestId('optimizations-empty')).toHaveText(
      'Noch keine Änderungen. Wenn du einen Vertrag günstiger machst, siehst du hier, was es bringt.',
    );
    // only the forecast is a chart – empty sections never render empty axes
    await expect(app.locator('[data-testid="analyse"] .recharts-wrapper')).toHaveCount(1);
    await expect(app.getByTestId('forecast').locator('.recharts-bar-rectangle')).toHaveCount(12);
    await expectChartLabelsClean(app);
    await expectClean(app, 'main');
    expect(logs).toEqual([]);
  });

  test('forecast table: 12 months with control values', async ({ app }) => {
    await openAnalyse(app);
    const rows = await tableRows(app.getByTestId('forecast'));
    expect(rows.map((r) => r.slice(0, 2))).toEqual([
      ['November 2026', '€ 2.664'],
      ['Dezember 2026', '€ 3.013,02'],
      ['Jänner 2027', '€ 2.713'],
      ['Februar 2027', '€ 4.610'],
      ['März 2027', '€ 2.664'],
      ['April 2027', '€ 2.713'],
      ['Mai 2027', '€ 2.664'],
      ['Juni 2027', '€ 2.926,02'],
      ['Juli 2027', '€ 2.713'],
      ['August 2027', '€ 2.664'],
      ['September 2027', '€ 2.679'],
      ['Oktober 2027', '€ 3.403'],
    ]);
    expect(rows[3]!.slice(2)).toEqual(['–', 'Steuerberater € 1.260, Offi (Jahreskarte) € 686']);
    // „Als Tabelle anzeigen“ makes it visible
    const toggle = app.getByTestId('forecast').getByRole('button', { name: 'Als Tabelle anzeigen' });
    await toggle.click();
    await expect(app.getByTestId('forecast-table')).toBeVisible();
    await expect(app.getByTestId('forecast').getByRole('button', { name: 'Tabelle ausblenden' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('distribution: sorted bars, tap expands the positions', async ({ app }) => {
    await openAnalyse(app);
    const d = app.getByTestId('distribution');
    const names = await d.locator('li[data-category] > button span.truncate').allTextContents();
    expect(names).toEqual(['Wohnen & Leben', 'Meine Immos', 'Banking & Finanzen', 'Abos & Freizeit', 'Mobilität']);
    const banking = d.locator('li[data-category="cat-banking"] > button');
    await expect(banking).toContainText(eur('€ 180,08'));
    await expect(banking).toHaveAttribute('aria-expanded', 'false');
    await (isTouchProject() ? banking.tap() : banking.click());
    await expect(banking).toHaveAttribute('aria-expanded', 'true');
    const positions = d.getByTestId('distribution-positions');
    await expect(positions.locator('li > span:first-child > span:first-child')).toHaveText([
      'Steuerberater',
      'Amex Gebühr',
      'Depotentgelt',
      'Entgelt Kontoführung',
      'Amex Membership Rewards Turbo',
    ]);
    await expect(positions).toContainText(eur('€ 105'));
    await expectClean(app, 'main');
  });

  test('month close entered for October → control values in the chart', async ({ app }) => {
    await app.getByTestId('free-tile').click();
    await app.getByLabel('Netto-Gehalt').fill('5000');
    await app.getByLabel('Frei verfügbar (tatsächlich)').fill('650');
    await app.getByRole('button', { name: 'Speichern' }).click();
    await openAnalyse(app);
    const section = app.getByTestId('monthclose');
    await expect(app.getByTestId('monthclose-headline')).toHaveText(
      eur('Oktober 2026: € 147 weniger frei als rechnerisch · Sparquote 16,0 %'),
    );
    expect(await tableRows(section)).toEqual([['Oktober 2026', '€ 797', '€ 650', '−€ 147', '16,0 %']]);
    await expect(section.locator('[data-testid="group-labels"] text')).toHaveText(['−€ 147']);
    await expectChartLabelsClean(app);
  });

  test('optimisation Handy € 10 → € 8 from November', async ({ app }) => {
    await goTo(app, 'positionen');
    await app.getByRole('button', { name: 'Handy – Details' }).click();
    await app.getByRole('button', { name: 'Bearbeiten' }).click();
    await app.getByTestId('position-form').getByLabel('Betrag').fill('8');
    await app.getByTestId('change-mode').getByLabel('Gilt ab').selectOption({ label: 'November 2026' });
    await app.getByTestId('position-form').getByRole('button', { name: 'Speichern' }).click();
    await app.keyboard.press('Escape');
    await openAnalyse(app);
    // November lies after "today" (October): a planned change
    await expect(app.getByTestId('optimizations-headline')).toHaveText(eur('Geplant: −€ 24 / Jahr'));
    const planned = app.getByTestId('optimizations-planned');
    await expect(planned.locator('> li')).toHaveCount(1);
    await expect(planned).toContainText(eur('Handy € 10 → € 8'));
    await expect(planned).toContainText('geplant');
    await expect(planned).toContainText(eur('ab 01.11.2026'));
    await expect(planned).toContainText(eur('spart € 24/Jahr'));
    await expect(app.getByTestId('optimizations-list')).toHaveCount(0);
    // the forecast follows the change: November € 2.662
    expect((await tableRows(app.getByTestId('forecast')))[0]!.slice(0, 2)).toEqual(['November 2026', '€ 2.662']);
  });
});

test.describe('Analyse mit 24-Monats-Fixture', () => {
  test('range filter 6M / 12M / Alles changes the data', async ({ page }) => {
    const logs = watchConsole(page);
    await importHistory(page);
    await openAnalyse(page);
    const ds = historyDataset();
    const range = page.getByTestId('range');
    await expect(range.getByRole('radio', { name: 'Letzte 12 Monate' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Bisher 24 Monate Daten')).toBeVisible();

    for (const [r, name] of [
      ['12m', 'Letzte 12 Monate'],
      ['6m', 'Letzte 6 Monate'],
      ['all', 'Gesamter Zeitraum'],
    ] as [Range, string][]) {
      await range.getByRole('radio', { name }).click();
      await expect(range.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
      const periods = historyPeriods(ds, OCT, r);

      const trend = burdenTrend(ds, periods);
      const trendRows = await tableRows(page.getByTestId('trend'));
      expect(trendRows.map((row) => [row[0], row[row.length - 1]])).toEqual(
        trend.points.map((p) => [periodLabel(p.period), text(formatEUR(p.total))]),
      );

      const pva = planVsActual(ds, periods, OCT);
      expect(await tableRows(page.getByTestId('planactual'))).toEqual(
        pva.rows.map((x) => [
          periodLabel(x.period),
          text(formatEUR(x.planned)),
          text(formatEUR(x.actual)),
          x.running ? 'läuft' : text(formatDelta(x.delta!)),
        ]),
      );
      await expect(page.getByTestId('top-deviations').locator('li')).toHaveCount(5);
      await expect(page.getByTestId('top-deviations').locator('li').first()).toContainText(
        eur(formatDelta(pva.topDeviations[0]!.delta).replace(/ /g, ' ')),
      );

      const mc = monthCloseSeries(ds, periods);
      const mcRows = await tableRows(page.getByTestId('monthclose'));
      expect(mcRows).toHaveLength(periods.length);
      expect(mcRows.filter((x) => x[1] === '–').map((x) => x[0])).toEqual(
        mc.filter((x) => x.calculated === null).map((x) => periodLabel(x.period)),
      );
      // chart data points = months in range
      await expect(page.getByTestId('planactual').locator('.recharts-bar-rectangle')).toHaveCount(periods.length * 2);
    }
    expect(historyPeriods(ds, OCT, '6m')).toHaveLength(6);
    expect(historyPeriods(ds, OCT, 'all')).toHaveLength(24);
    expect(logs).toEqual([]);
  });

  test('running month marked „läuft“, never a deviation', async ({ page }) => {
    await importHistory(page);
    await openAnalyse(page);
    await page.getByTestId('range').getByRole('radio', { name: 'Letzte 6 Monate' }).click();
    const labels = page.getByTestId('planactual').locator('[data-testid="group-labels"] text');
    await expect(labels.last()).toHaveText('läuft');
    const rows = await tableRows(page.getByTestId('planactual'));
    expect(rows[rows.length - 1]).toEqual(['Oktober 2026', expect.any(String), expect.any(String), 'läuft']);
    for (const li of await page.getByTestId('top-deviations').locator('li').allTextContents()) expect(li).not.toContain('Okt 2026');
  });

  test('optimisations from the history: planned on top, implemented below, typo correction excluded', async ({ page }) => {
    await importHistory(page);
    await openAnalyse(page);
    const t = optimizationTimeline(historyDataset(), OCT);
    const plain = (v: number) => formatDelta(v).replace(/ /g, ' ');
    await expect(page.getByTestId('optimizations-headline')).toHaveText(
      eur(`Umgesetzt: ${plain(t.implementedAnnual)} / Jahr · Geplant: ${plain(t.plannedAnnual)} / Jahr`),
    );
    await expect(page.getByTestId('optimizations-planned').locator('> li')).toHaveCount(t.entries.filter((e) => e.planned).length);
    await expect(page.getByTestId('optimizations-planned')).toContainText(eur('Kredit 1220 € 735 → € 760'));
    await expect(page.getByTestId('optimizations-planned')).toContainText('Zinsanpassung');
    const list = page.getByTestId('optimizations-list');
    await expect(list.locator('> li')).toHaveCount(t.entries.filter((e) => !e.planned).length);
    await expect(list).toContainText('Tarifwechsel');
    await expect(list).toContainText(eur('Handy € 15 → € 10'));
    await expect(list).toContainText(eur('spart € 60/Jahr'));
    await expect(list).toContainText(eur('Gym € 32 → € 35'));
    await expect(list).toContainText(eur('+€ 36/Jahr'));
    await expect(list).not.toContainText(eur('€ 85')); // the typo entry
  });

  test('layout: no clipped text, no overflow, tap targets, labels never overlap (all ranges)', async ({ page }) => {
    await importHistory(page);
    await openAnalyse(page);
    for (const name of ['Letzte 6 Monate', 'Letzte 12 Monate', 'Gesamter Zeitraum']) {
      await page.getByTestId('range').getByRole('radio', { name }).click();
      await expectChartLabelsClean(page);
      await expectClean(page, 'main');
    }
    // charts use the full card width on every viewport
    for (const id of ['forecast', 'monthclose', 'trend', 'planactual']) {
      const card = (await page.getByTestId(id).locator('.glass').boundingBox())!;
      const chart = (await page.getByTestId(id).locator('.recharts-wrapper').first().boundingBox())!;
      expect(chart.width).toBeGreaterThan(card.width - 40);
      expect(chart.width).toBeLessThanOrEqual(card.width);
    }
    const width = await page.getByTestId('analyse').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(1100);
  });
});

test.describe('Tooltips', () => {
  async function tooltipOf(section: Locator) {
    return section.getByTestId('chart-tooltip');
  }

  /** Bounding box once layout has settled (web font swap, chart measuring, scrolling). */
  async function stableBox(locator: Locator) {
    let previous = await locator.boundingBox();
    for (let i = 0; i < 20; i++) {
      await locator.page().evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const next = await locator.boundingBox();
      if (previous && next && previous.x === next.x && previous.y === next.y && previous.width === next.width && previous.height === next.height) return next;
      previous = next;
    }
    return previous!;
  }

  /**
   * Taps until the tooltip shows (max. 3 tries). Under full-suite load the emulated
   * touch occasionally drops the mouse events Recharts listens to; on the device a
   * tap always opens it. The test still requires a tap to open the tooltip.
   */
  async function tapUntil(page: Page, point: { x: number; y: number }, tip: Locator) {
    await expect(async () => {
      await page.touchscreen.tap(point.x, point.y);
      await expect(tip).toBeVisible({ timeout: 1500 });
    }).toPass({ intervals: [300, 600], timeout: 8000 });
  }

  test('tap on iPhone/iPad, never under the finger', async ({ page }) => {
    test.skip(!isTouchProject(), 'touch only');
    await importHistory(page);
    await openAnalyse(page);
    await page.evaluate(() => document.fonts.ready);

    const forecast = page.getByTestId('forecast');
    const feb = forecast.locator('.recharts-bar-rectangle').nth(3);
    const box = await stableBox(feb);
    const finger = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const tip = await tooltipOf(forecast);
    await tapUntil(page, finger, tip);
    await expect(tip).toContainText(eur('Februar 2027: € 4.635')); // fixture: Kredit +€ 25 from Jan 2027
    await expect(tip).toContainText(eur('Steuerberater€ 1.260'));
    const tipBox = (await tip.boundingBox())!;
    expect(tipBox.y + tipBox.height, 'tooltip ends above the finger').toBeLessThan(finger.y);

    // a different spot per chart: centred charts end up at the same screen position, and a
    // second tap on identical coordinates sends no mouse move, so no tooltip (flaky before)
    for (const [id, fx] of [['monthclose', 0.6], ['trend', 0.7], ['planactual', 0.8]] as const) {
      const section = page.getByTestId(id);
      // centred, so the tap never lands under the fixed tab bar
      await section.locator('.recharts-wrapper').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const chart = await stableBox(section.locator('.recharts-wrapper').first());
      const point = { x: chart.x + chart.width * fx, y: chart.y + chart.height * 0.75 };
      const t = await tooltipOf(section);
      await tapUntil(page, point, t.first());
      await expect(t.first()).toContainText(/20(25|26)/);
      const tb = (await t.first().boundingBox())!;
      expect(tb.y + tb.height, `${id}: tooltip above the finger`).toBeLessThan(point.y);
    }
  });

  test('keyboard on desktop: Tab reaches the chart, arrows move the tooltip', async ({ page }) => {
    test.skip(isTouchProject(), 'desktop only');
    await importHistory(page);
    await openAnalyse(page);
    await page.locator('h1', { hasText: 'Analyse' }).click();
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="forecast"] .recharts-wrapper'));
    }
    expect(reached, 'forecast chart is reachable with Tab').toBe(true);
    await page.keyboard.press('ArrowRight');
    const tip = page.getByTestId('forecast').getByTestId('chart-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/2026|2027/);
    // walk to February with the arrow keys
    for (let i = 0; i < 12 && !/Februar 2027/.test(text((await tip.textContent()) ?? '')); i++) await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText(eur('Februar 2027: € 4.635')); // fixture: Kredit +€ 25 from Jan 2027
    await expect(tip).toContainText('Steuerberater');

    // hover works too
    const bar = page.getByTestId('planactual').locator('.recharts-bar-rectangle').first();
    await bar.hover();
    await expect(page.getByTestId('planactual').getByTestId('chart-tooltip')).toContainText('Plan');
  });
});

test.describe('Lazy loading', () => {
  test('the month screen does not load the analysis chunk', async ({ app, page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.reload();
    await expect(page.getByTestId('hero')).toBeVisible();
    await expect(row(page, 'pos-miete')).toBeVisible();
    expect(requests.filter((u) => /AnalyseScreen/.test(u))).toEqual([]);
    await openAnalyse(app);
    expect(requests.filter((u) => /AnalyseScreen/.test(u))).toHaveLength(1);
  });
});
