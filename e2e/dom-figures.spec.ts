// DOM-Abgleich: every figure on the Monat and Analyse screens is read from the DOM and compared
// (1) with calc/analytics and (2) with the target values of the sprint document, to the cent.
// At the end no number on screen may be left unchecked (names, dates and axis ticks aside).
import type { Locator, Page } from '@playwright/test';
import { liveDataset, MIETE_1220, NOV, OKT, withMieteNotFromNet } from '../tests/fixtures/live';
import {
  categoryDistribution,
  forecastRange,
  forecastSummary,
  historyPeriods,
  optimizationTimeline,
  planVsActual,
  savingsCard,
  trendTooShortText,
  yearForecast,
} from '../src/lib/analytics';
import {
  dueItems,
  fixedCostsAvg,
  freeAfterFixedAvg,
  monthFigures,
  nextPlannedChange,
  effectiveDate,
  progressPercent,
  reserveNeeded,
  shownOpen,
  sumMonthlyEquivalent,
  sameMoney,
  upcomingDue,
} from '../src/lib/calc';
import { deductionsExplanation } from '../src/lib/explain';
import { formatAvg, formatDelta, formatEUR, formatEURSet, formatPercent } from '../src/lib/format';
import { monthName, periodLabel } from '../src/lib/period';
import type { Dataset, Period } from '../src/lib/types';
import { eur, expect, goTo, test } from './fixtures';
import { importLive, NOV_TODAY, OKT_TODAY } from './live';

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Target values of the sprint document (Live-Daten). */
const SOLL: Record<string, Record<string, string>> = {
  'Oktober (Default)': {
    'salary-value': '€ 4.788',
    'hero-planned': '€ 3.488,50',
    'hero-paid': '€ 3.488,50',
    'hero-deductions-value': '€ 5.348,50',
    'free-value': '−€ 560,50',
    'free-average': 'im Ø-Monat € 1.035,83',
    'kpi-value': '€ 2.952,17',
    'kpi-hint': 'davon € 288,17 nicht monatlich',
    'wealth-value': '€ 1.860',
    'wealth-sub': 'Sparquote 38,8 %',
    'group:Wohnen & Leben': '€ 1.651,50',
    'group:Immo': '€ 991',
    'group:Abos': '€ 776',
    'group:Investieren': '€ 1.860',
    'group:Sonstiges': '€ 70',
  },
  'Oktober (Miete 1220 nicht vom Netto)': {
    'hero-planned': '€ 3.488,50',
    'hero-deductions-value': '€ 4.288,50',
    'free-value': '€ 499,50',
    'free-average': 'im Ø-Monat € 1.035,83',
    'wealth-value': '€ 1.860',
    'wealth-sub': 'Sparquote 16,7 % · € 1.060 nicht vom Netto',
    'group:Investieren': '€ 1.860',
  },
  November: {
    'salary-value': '€ 7.819',
    'hero-planned': '€ 5.649',
    'hero-paid': '€ 450',
    'hero-open': '14 offen · € 5.199',
    'ring': '8%',
    'hero-deductions-value': '€ 6.449',
    'hero-deductions-breakdown': '€ 5.649 Fixkosten + € 800 Vermögensaufbau',
    'free-value': '€ 1.370',
    'free-average': 'im Ø-Monat € 4.066,83',
    'kpi-value': '€ 2.952,17',
    'kpi-hint': 'davon € 288,17 nicht monatlich',
    'wealth-value': '€ 800',
    'wealth-sub': 'Sparquote 10,2 %',
    'group:Wohnen & Leben': '€ 1.572',
    'progress:Wohnen & Leben': '1/6 bezahlt',
    'spread:Wohnen & Leben': 'Ø € 1.675,50',
    'group:Immo': '€ 991',
    'progress:Immo': '0/3 bezahlt',
    'spread:Immo': 'Ø € 1.034,67',
    'group:Abos': '€ 71',
    'progress:Abos': '0/4 bezahlt',
    'spread:Abos': 'Ø € 137,00',
    'group:Investieren': '€ 800',
    'progress:Investieren': 'Vermögensaufbau · 1/2 bezahlt',
    'group:Sonstiges': '€ 3.015',
    'progress:Sonstiges': '0/2 bezahlt',
    'spread:Sonstiges': 'Ø € 105,00',
  },
  'Analyse (heute = Oktober)': {
    'forecast-period': 'Okt 2026 – Sep 2027',
    'forecast-headline-value': 'Nov 2026 · € 5.649',
    'forecast-headline-sub': '€ 2.697 über Ø',
    'distribution-total': 'Summe € 2.952,17 Ø pro Monat (heute)',
    'dist:Wohnen & Leben': '€ 1.675,50 56,8 %',
    'dist:Immo': '€ 1.034,67 35,0 %',
    'dist:Abos': '€ 137,00 4,6 %',
    'dist:Sonstiges': '€ 105,00 3,6 %',
    'savings-headline-label': 'Oktober 2026',
    'savings-headline-value': '38,8 % · € 1.860',
    'planactual-running': 'Ist € 3.488,50 · Plan € 3.488,00.',
  },
};

/** Reads, compares with calc and the Soll table, marks the element as verified. */
async function check(target: Locator, expected: string, soll?: string, label = '') {
  if (soll !== undefined) expect(norm(expected), `calc = Soll ${label}`).toBe(norm(soll));
  await expect(target, label).toHaveCount(1);
  // SVG (the Ø chip) has no innerText
  const text = await target.evaluate((el) => (el instanceof HTMLElement ? el.innerText : el.textContent ?? ''));
  expect(norm(text), `DOM = calc ${label}`).toBe(norm(expected));
  await target.evaluate((el) => el.setAttribute('data-verified', ''));
}

function isoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Text nodes with a digit that are visible and not inside a verified element (or an allowed non-figure). */
async function uncheckedNumbers(page: Page, allowed: string[]): Promise<string[]> {
  return page.evaluate((allow) => {
    const root = document.querySelector('main') ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out: string[] = [];
    const visible = (el: Element) => {
      if (el.closest('.sr-only, [hidden], [aria-hidden="true"] svg')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
      if (!/\d/.test(text)) continue;
      const el = n.parentElement!;
      if (!visible(el) || el.closest('[data-verified]')) continue;
      // chart scale labels (axis ticks) and month labels are not figures
      if (el.closest('.recharts-cartesian-axis-tick, .recharts-xAxis-tick-labels, .recharts-yAxis-tick-labels')) continue;
      if (allow.some((a) => (a.startsWith('/') ? new RegExp(a.slice(1, -1)).test(text) : a === text))) continue;
      out.push(text);
    }
    return out;
  }, allowed);
}

/** Non-figures that contain digits: names, notes, period labels, due dates in chips. */
function allowList(ds: Dataset): string[] {
  return [
    ...ds.positions.map((p) => p.name),
    ...ds.categories.map((c) => c.name),
    ...ds.monthClose.flatMap((m) => (m.note ? [m.note] : [])),
    '/^(Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \\d{4}$/',
    '/^(Einmalig|Jährlich|Halbjährlich|Quartal)( · .*)?$/', // schedule chips: rhythm and due dates
    '/^\\d{1,2}\\.\\d{1,2}\\.$/',
    'Verlauf ab 3 Monaten',
  ];
}

async function checkMonth(page: Page, ds: Dataset, period: Period, soll: Record<string, string>) {
  const f = monthFigures(ds, period);
  // the coverage scan works: before the checks it sees the figures
  expect((await uncheckedNumbers(page, allowList(ds))).length, 'scan finds figures').toBeGreaterThan(20);
  const s = (k: string) => soll[k];
  await check(page.getByTestId('hero-paid'), formatEUR(f.paid), s('hero-paid'), 'hero-paid');
  await check(page.getByTestId('hero-planned'), formatEUR(f.total), s('hero-planned'), 'hero-planned');
  if (f.openCount > 0) {
    await check(page.getByTestId('hero-open'), `${f.openCount} offen · ${formatEUR(shownOpen(f))}`, s('hero-open'), 'hero-open');
    await check(page.getByTestId('hero').getByText(/^\d+%$/), `${progressPercent(f)}%`, s('ring'), 'ring');
  } else {
    await expect(page.getByRole('img', { name: '100 Prozent abgebucht' })).toBeVisible();
  }
  const e = deductionsExplanation(f);
  await check(page.getByTestId('hero-deductions-value'), formatEUR(f.deductions), s('hero-deductions-value'), 'Abzüge');
  await check(page.getByTestId('hero-deductions-breakdown'), e.breakdown, s('hero-deductions-breakdown'), 'Aufschlüsselung');
  await check(page.getByTestId('salary-value'), formatEUR(f.netSalary!), s('salary-value'), 'Netto');
  await check(page.getByTestId('kpi-value'), formatAvg(fixedCostsAvg(ds, period)), s('kpi-value'), 'Ø pro Monat');
  await check(page.getByTestId('kpi-hint'), `davon ${formatAvg(reserveNeeded(ds, period))} nicht monatlich`, s('kpi-hint'), 'nicht monatlich');
  await check(page.getByTestId('free-value'), formatEUR(f.free!), s('free-value'), 'Frei');
  await check(page.getByTestId('free-average'), `im Ø-Monat ${formatAvg(freeAfterFixedAvg(ds, period)!)}`, s('free-average'), 'im Ø-Monat');
  await check(page.getByTestId('wealth-value'), formatEUR(f.wealth), s('wealth-value'), 'Vermögensaufbau');
  const other = Math.round(f.wealthNotFromNet * 100) > 0;
  await check(
    page.getByTestId('wealth-sub'),
    `Sparquote ${formatPercent(f.savingsRate!)}${other ? ` · ${formatEUR(f.wealthNotFromNet)} nicht vom Netto` : ''}`,
    s('wealth-sub'),
    'Sparquote',
  );

  // category headers
  for (const c of f.categories) {
    const group = page.getByRole('region', { name: c.category.name, exact: true });
    const all = c.count > 0 && c.openCount === 0;
    const status = `${c.category.kind === 'savings' ? 'Vermögensaufbau · ' : ''}${all ? '✓ bezahlt' : `${c.paidCount}/${c.count} bezahlt`}`;
    await check(group.getByTestId('group-sum'), formatEUR(c.total), s(`group:${c.category.name}`), `Summe ${c.category.name}`);
    await check(group.getByTestId('group-progress'), status, s(`progress:${c.category.name}`), `Status ${c.category.name}`);
    const spread = sumMonthlyEquivalent(ds, period, { categoryId: c.category.id });
    if (!sameMoney(spread, c.total)) await check(group.getByTestId('group-spread'), `Ø ${formatAvg(spread)}`, s(`spread:${c.category.name}`), `Ø ${c.category.name}`);
    else await expect(group.getByTestId('group-spread')).toHaveCount(0);
  }

  // every position row: amount, delta, planned change
  for (const i of dueItems(ds, period).filter((x) => x.due)) {
    const row = page.locator(`[data-testid="position-row"][data-position="${i.position.id}"]`);
    const amount = i.status === 'paid' ? i.payment!.actualAmount : i.planned;
    await check(row.getByTestId('position-amount'), formatEUR(amount), undefined, `Zeile ${i.position.name}`);
    if (i.delta !== null && Math.round(i.delta * 100) !== 0) await check(row.getByTestId('delta-chip'), formatDelta(i.delta), undefined, `Delta ${i.position.name}`);
    const next = nextPlannedChange(i.position, period);
    if (next) await check(row.getByTestId('next-change'), `ab ${isoDate(effectiveDate(next))} · ${formatEUR(next.amount)}`, undefined, `Änderung ${i.position.name}`);
    if (!i.fromNet) await check(row.getByTestId('not-from-net'), 'nicht vom Netto', undefined, `Chip ${i.position.name}`);
  }

  // Kommt bald
  const upcoming = upcomingDue(ds, period, 2);
  await expect(page.getByTestId('upcoming-row')).toHaveCount(upcoming.length);
  for (const [n, i] of upcoming.entries()) {
    const row = page.getByTestId('upcoming-row').nth(n);
    await check(row.locator('.num').last(), formatEUR(i.planned), undefined, `Kommt bald ${i.position.name}`);
    await check(row.getByText(monthName(i.period), { exact: true }), monthName(i.period), undefined, `Monat ${i.position.name}`);
  }
  expect(await uncheckedNumbers(page, allowList(ds)), 'every number checked').toEqual([]);
}

async function checkAnalyse(page: Page, ds: Dataset, today: Period, soll: Record<string, string>) {
  const s = (k: string) => soll[k];
  await goTo(page, 'analyse');
  await expect(page.getByTestId('forecast-period')).toBeVisible();
  expect((await uncheckedNumbers(page, allowList(ds))).length, 'scan finds figures').toBeGreaterThan(10);
  const f = yearForecast(ds, today);
  const head = forecastSummary(f);
  await check(page.getByTestId('forecast-period'), forecastRange(f), s('forecast-period'), 'Zeitraum');
  await check(page.getByTestId('forecast-headline-value'), head.value, s('forecast-headline-value'), 'Teuerster Monat');
  await check(page.getByTestId('forecast-headline-sub'), head.sub, s('forecast-headline-sub'), 'über Ø');
  await check(page.getByTestId('avg-chip'), `Ø ${formatEUR(Math.round(f.average)).replace(/^€\s/, '')}`, undefined, 'Ø-Chip');
  // y-axis: ascending scale that covers the highest bar
  const ticks = await page.getByTestId('forecast').locator('.recharts-yAxis-tick-labels text').evaluateAll((els) => [...new Set(els.map((e) => e.textContent ?? ''))].filter(Boolean));
  expect(ticks.length).toBeGreaterThan(2);
  const values = ticks.map((t) => Number(norm(t).replace(/[€\s]/g, '').replace('k', '').replace(',', '.')) * (t.includes('k') ? 1000 : 1));
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(Math.max(...values)).toBeGreaterThanOrEqual(Math.max(...f.months.map((m) => m.due)));

  const d = categoryDistribution(ds, today);
  await check(page.getByTestId('distribution-total'), `Summe ${formatAvg(d.total)} Ø pro Monat (heute)`, s('distribution-total'), 'Summe Verteilung');
  for (const r of d.rows) {
    const li = page.locator(`[data-testid="distribution-list"] > li[data-category="${r.category.id}"] button`).first();
    const text = norm(await li.innerText()).replace(r.category.name, '').trim();
    const expected = `${formatAvg(r.monthly)} ${formatPercent(r.share)}`;
    expect(norm(expected), `calc = Soll ${r.category.name}`).toBe(norm(s(`dist:${r.category.name}`) ?? expected));
    expect(norm(text), `DOM = calc ${r.category.name}`).toBe(norm(expected));
    await li.evaluate((el) => el.setAttribute('data-verified', ''));
  }

  const card = savingsCard(ds, today)!;
  await check(page.getByTestId('savings-headline-label'), periodLabel(card.period), s('savings-headline-label'), 'Sparquote Monat');
  await check(page.getByTestId('savings-headline-value'), `${formatPercent(card.rate)} · ${formatEUR(card.wealthFromNet)}`, s('savings-headline-value'), 'Sparquote');
  const [w, net] = formatEURSet(card.wealthFromNet, card.netSalary);
  await check(page.getByTestId('savings-saved'), `${w} aus dem Netto gespart`, undefined, 'gespart');
  await check(page.getByTestId('savings-net'), `Netto ${net}`, undefined, 'Netto');
  if (card.wealthNotFromNet > 0) await check(page.getByTestId('savings-other'), `+ ${formatEUR(card.wealthNotFromNet)} aus anderen Quellen`, undefined, 'andere Quellen');
  await check(page.getByTestId('savings-parts-toggle').locator('.num'), formatEUR(card.wealth), undefined, 'Zusammensetzung');

  const periods = historyPeriods(ds, today, '12m');
  if (periods.length < 3) {
    const lines = trendTooShortText(ds, today);
    await check(page.getByTestId('trend-empty'), lines.join(' '), undefined, 'Entwicklung leer');
  }
  const pva = planVsActual(ds, periods, today);
  if (pva.closedMonths === 0) {
    const running = pva.rows[pva.rows.length - 1]!;
    const [ist, plan] = formatEURSet(running.actual, running.planned);
    await check(page.getByTestId('planactual-running'), `Ist ${ist} · Plan ${plan}.`, s('planactual-running'), 'Plan vs. Ist');
  }
  for (const e of optimizationTimeline(ds, today).entries) {
    const li = page.getByTestId('optimizations').locator('li', { hasText: e.position.name });
    await check(li.locator('.num').first(), `${formatEUR(e.from.amount)} → ${formatEUR(e.to.amount)}`, undefined, `Änderung ${e.position.name}`);
    await check(li.locator('.num').last(), `${formatDelta(e.annualDelta)} / Jahr`, undefined, `Änderung/Jahr ${e.position.name}`);
    await check(li.getByText(/^ab \d/), `ab ${isoDate(e.changedOn)}`, undefined, `ab ${e.position.name}`);
  }
  expect(await uncheckedNumbers(page, allowList(ds)), 'every number checked').toEqual([]);
}

test.describe('DOM-Abgleich: jede Zahl = calc = Soll (Live-Export)', () => {
  test('Monat Oktober 2026, Schalter Default', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await checkMonth(page, liveDataset(), OKT, SOLL['Oktober (Default)']!);
  });

  test('Monat Oktober 2026, „Miete 1220“ nicht vom Netto (nur im Test)', async ({ page }) => {
    await importLive(page, OKT_TODAY, (b) => ({ ...b, data: withMieteNotFromNet(b.data) }));
    const ds = withMieteNotFromNet(liveDataset());
    expect(ds.positions.find((p) => p.id === MIETE_1220)!.fromNet).toBe(false);
    await checkMonth(page, ds, OKT, SOLL['Oktober (Miete 1220 nicht vom Netto)']!);
  });

  test('Monat November 2026', async ({ page }) => {
    await importLive(page, NOV_TODAY);
    await checkMonth(page, liveDataset(), NOV, SOLL.November!);
  });

  test('Analyse, heute = Oktober 2026', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await checkAnalyse(page, liveDataset(), OKT, SOLL['Analyse (heute = Oktober)']!);
  });

  test('Analyse, heute = Oktober 2026, „Miete 1220“ nicht vom Netto', async ({ page }) => {
    await importLive(page, OKT_TODAY, (b) => ({ ...b, data: withMieteNotFromNet(b.data) }));
    await checkAnalyse(page, withMieteNotFromNet(liveDataset()), OKT, {
      'savings-headline-value': '16,7 % · € 800',
    });
    await expect(page.getByTestId('savings-other')).toHaveText(eur('+ € 1.060 aus anderen Quellen'));
  });
});
