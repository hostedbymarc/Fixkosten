// Sprint A „Aktiver Monat + UX-Vereinfachungen“: active month (setting, start month, return from the
// background), navigation (month grid, pill, swipe), Monat screen (collapse by status, open filter,
// Kommt bald) and the golden values from the live export of 29.10.2026.
import { readFileSync } from 'node:fs';
import type { Download, Locator, Page } from '@playwright/test';
import type { BackupFile } from '../src/db/backup';
import { LIVE_FILE, live29Backup } from '../tests/fixtures/live';
import { appSettled, eur, expect, goTo, isTouchProject, test, touchSwipe } from './fixtures';
import { expectClean } from './measure';

/** 26.10.2026: with „Neuer Monat beginnt am 25.“ the app is already in November. */
const OCT_26 = new Date('2026-10-26T10:00:00+01:00');

async function importLive29(page: Page, opts: { today?: Date; start?: BackupFile['settings'] } = {}) {
  await page.clock.setFixedTime(opts.today ?? OCT_26);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = live29Backup();
  const file = opts.start ? { ...backup, settings: opts.start } : backup;
  await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
}

async function tap(locator: Locator) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });

async function backToForeground(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test.describe('Aktiver Monat: Einstellung und Startmonat', () => {
  test('Einstellungen → „Monat“: Optionen, Hinweis, 25. → Wiederöffnen zeigt November', async ({ page }) => {
    await importLive29(page);
    await expect(title(page)).toHaveText('Oktober 2026'); // default: calendar month
    await goTo(page, 'einstellungen');
    const section = page.getByTestId('month-settings');
    await expect(page.getByRole('heading', { name: 'Monat', exact: true })).toBeVisible();
    const select = section.getByLabel('Neuer Monat beginnt am');
    await expect(select).toHaveValue('1');
    const options = await select.locator('option').allTextContents();
    expect(options).toEqual(['1. (Kalendermonat)', ...Array.from({ length: 14 }, (_, i) => `${15 + i}.`), 'Monatsletzter']);
    await expect(section).toContainText('Ab diesem Tag öffnet Erbse schon den Folgemonat, z. B. wenn dein Gehalt am Monatsende kommt.');
    await expect(section.getByTestId('active-month')).toHaveText('Aktiver Monat: Oktober 2026');
    await select.selectOption('25');
    await expect(section.getByTestId('active-month')).toHaveText('Aktiver Monat: November 2026');
    await expectClean(page, 'main');

    // open the app again
    await page.goto('/');
    await expect(page.locator('main[data-screen="monat"]')).toHaveCount(1);
    await appSettled(page);
    await expect(title(page)).toHaveText('November 2026');
    await goTo(page, 'einstellungen');
    await expect(page.getByTestId('month-settings').getByLabel('Neuer Monat beginnt am')).toHaveValue('25');
  });

  test('Monatsletzter: 27.02.2027 → Februar, 28.02.2027 → März', async ({ page }) => {
    await importLive29(page, { today: new Date('2027-02-27T10:00:00+01:00'), start: { monthStartDay: 'last' } });
    await expect(title(page)).toHaveText('Februar 2027');
    await page.clock.setFixedTime(new Date('2027-02-28T10:00:00+01:00'));
    await backToForeground(page);
    await expect(title(page)).toHaveText('März 2027');
  });

  test('Rückkehr aus dem Hintergrund: folgt dem aktiven Monat, außer nach manueller Navigation in den letzten 30 Min.', async ({ page }) => {
    await importLive29(page, { today: new Date('2026-10-24T10:00:00+02:00'), start: { monthStartDay: 25 } });
    await expect(title(page)).toHaveText('Oktober 2026');
    // next day: the active month moves on
    await page.clock.setFixedTime(new Date('2026-10-25T08:00:00+02:00'));
    await backToForeground(page);
    await expect(title(page)).toHaveText('November 2026');

    // manual navigation holds the shown month for 30 minutes
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(title(page)).toHaveText('Oktober 2026');
    await page.clock.setFixedTime(new Date('2026-10-25T08:20:00+02:00'));
    await backToForeground(page);
    await expect(title(page)).toHaveText('Oktober 2026');
    await page.clock.setFixedTime(new Date('2026-10-25T08:31:00+02:00'));
    await backToForeground(page);
    await expect(title(page)).toHaveText('November 2026');
  });
});

test.describe('Golden aktiver Monat (Live-Export 29.10.2026, heute 26.10.2026, Monatsbeginn 25.)', () => {
  test('App öffnet November; Sparquote, Jahresvorschau, kein Banner', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await expect(title(page)).toHaveText('November 2026');
    await expect(page.getByTestId('open-previous')).toHaveCount(0);
    await expect(page.getByTestId('to-active-month')).toHaveCount(0);
    await expect(page.getByTestId('hero-open')).toHaveText(eur('5 offen · € 3.084,45'));

    await goTo(page, 'analyse');
    await expect(page.getByTestId('savings-headline-label')).toHaveText('November 2026');
    await expect(page.getByTestId('savings-headline-value')).toHaveText(eur('10,2 % · € 800'));
    await expect(page.getByTestId('savings-other')).toHaveText(eur('+ € 860 aus anderen Quellen'));
    await expect(page.getByTestId('forecast-period')).toHaveText('Nov 2026 – Okt 2027');
    await expect(page.getByTestId('forecast-footer')).toHaveText(eur('12 Monate € 43.182,25 · davon einmalig € 3.158,45'));
    const card = page.getByTestId('forecast');
    await tap(card.getByRole('button', { name: 'Details anzeigen' }));
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    const oct27 = wide
      ? page.getByTestId('forecast-table').locator('tr[data-period="2027-10"] td').first()
      : page.getByTestId('forecast-list').locator('[data-period="2027-10"]').getByTestId('forecast-due');
    await expect(oct27).toHaveText(eur('€ 3.905,80'));
    await expect(page.getByText('Ø pro Monat (aktiver Monat)').first()).toBeVisible();
    await expectClean(page, 'main');
  });

  test('mit Monatsbeginn 1. bleibt Oktober der aktive Monat (bisherige Werte)', async ({ page }) => {
    await importLive29(page);
    await expect(title(page)).toHaveText('Oktober 2026');
    await goTo(page, 'analyse');
    await expect(page.getByTestId('forecast-period')).toHaveText('Okt 2026 – Sep 2027');
    await expect(page.getByTestId('savings-headline-label')).toHaveText('Oktober 2026');
  });
});

test.describe('Navigation: Monatsraster, Pill, Wischen', () => {
  test('Tippen auf den Titel öffnet das Monatsraster: Oktober ✓, November 5 offen, aktiver Monat markiert', async ({ page }, info) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await tap(page.getByTestId('month-title'));
    const sheet = page.getByRole('dialog', { name: 'Monat wählen' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Aktiver Monat: November 2026');
    await expect(sheet.getByTestId('picker-year')).toHaveText('2026');
    const grid = sheet.getByTestId('month-grid');
    await expect(grid.getByTestId('month-cell')).toHaveCount(12);
    const cell = (p: string) => grid.locator(`[data-period="${p}"]`);
    await expect(cell('2026-10').getByTestId('month-cell-status')).toHaveText('✓');
    await expect(cell('2026-11').getByTestId('month-cell-status')).toHaveText('5 offen');
    await expect(cell('2026-12').getByTestId('month-cell-status')).toHaveText(''); // future, nothing ticked
    await expect(cell('2026-11')).toHaveAttribute('data-active', 'true');
    await expect(cell('2026-11').getByTestId('month-cell-active')).toHaveText('aktiv');
    await expect(grid.locator('[data-active]')).toHaveCount(1);
    await expect(cell('2026-11')).toHaveAttribute('aria-current', 'date');
    await expect(cell('2026-11')).toHaveAccessibleName('November 2026, 5 offen, aktiver Monat');
    await sheet.screenshot({ path: `docs/screenshots/aktiver-monat/test-${info.project.name}-monatsraster.png` });

    // year switch, then pick a month
    await tap(sheet.getByRole('button', { name: 'Vorheriges Jahr' }));
    await expect(sheet.getByTestId('picker-year')).toHaveText('2025');
    await expect(grid.locator('[data-active]')).toHaveCount(0);
    await tap(sheet.getByRole('button', { name: 'Nächstes Jahr' }));
    await tap(cell('2026-10'));
    await expect(sheet).toBeHidden();
    await expect(title(page)).toHaveText('Oktober 2026');
    await expect(page.getByTestId('month-title')).toBeFocused();

    // pill back to the active month
    const pill = page.getByTestId('to-active-month');
    await expect(pill).toHaveText('Zum aktiven Monat (November)');
    await tap(pill);
    await expect(title(page)).toHaveText('November 2026');
    await expect(pill).toHaveCount(0);
    await expectClean(page, 'main');
  });

  test('Wischen: ab 60 px und unter 30° wechselt der Monat; senkrechtes Scrollen nie; aus bei offenem Sheet', async ({ page }) => {
    test.skip(!isTouchProject(), 'touch only (iPhone, iPad)');
    await importLive29(page, { start: { monthStartDay: 25 } });
    const screen = page.getByTestId('month-screen');
    await expect(title(page)).toHaveText('November 2026');
    await touchSwipe(page, screen, -58); // below the threshold
    await expect(title(page)).toHaveText('November 2026');
    await touchSwipe(page, screen, -64);
    await expect(title(page)).toHaveText('Dezember 2026');
    await touchSwipe(page, screen, 100, 50); // 26.6°: still a swipe
    await expect(title(page)).toHaveText('November 2026');
    await touchSwipe(page, screen, 100, 62); // 31.8°: too steep
    await expect(title(page)).toHaveText('November 2026');
    for (const dy of [-200, 200, 400]) {
      await touchSwipe(page, screen, 0, dy); // vertical scroll
      await touchSwipe(page, screen, -20, dy); // scroll with a little sideways drift
    }
    await expect(title(page)).toHaveText('November 2026');

    // real vertical scrolling by touch never switches the month
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await screen.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 600 }] });
    for (let i = 1; i <= 10; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 2, y: 600 - i * 40 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await expect(title(page)).toHaveText('November 2026');

    // an open sheet switches swiping off
    await page.evaluate(() => window.scrollTo(0, 0));
    await tap(page.getByTestId('month-title'));
    await expect(page.getByRole('dialog', { name: 'Monat wählen' })).toBeVisible();
    await touchSwipe(page, screen, -160);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(title(page)).toHaveText('November 2026');
  });
});

test.describe('Monat-Screen einfacher', () => {
  const group = (page: Page, name: string) => page.getByRole('region', { name });

  test('Einklappen nach Status: bezahlte Kategorien zu, offene auf; Zustand bleibt pro Monat, solange die App läuft', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await expect(group(page, 'Immo')).toHaveAttribute('data-collapsed', 'true'); // 3/3 bezahlt
    for (const name of ['Investieren', 'Abos', 'Sonstiges', 'Wohnen & Leben']) await expect(group(page, name)).toHaveAttribute('data-collapsed', 'false');
    // ticking the last open row keeps the card open: the status counts when the month opens
    const handy = group(page, 'Wohnen & Leben').locator('li[data-position]', { hasText: 'Handy' });
    await tap(handy.getByTestId('toggle-paid'));
    await expect(handy).toHaveAttribute('data-status', 'paid');
    await expect(group(page, 'Wohnen & Leben').getByTestId('group-progress')).toHaveText('✓ bezahlt');
    await expect(group(page, 'Wohnen & Leben')).toHaveAttribute('data-collapsed', 'false');
    const all = page.getByTestId('collapse-all');
    await expect(all).toHaveText('Alle einklappen');
    await tap(all);
    await expect(page.locator('[data-testid="category-group"][data-collapsed="false"]')).toHaveCount(0);
    await expect(all).toHaveText('Alle ausklappen');
    await tap(all);
    await expect(page.locator('[data-testid="category-group"][data-collapsed="true"]')).toHaveCount(0);
    await expect(all).toHaveText('Alle einklappen');

    // manual: Abos zu (Immo stays open from „Alle ausklappen“) → other month and back keeps it
    await tap(group(page, 'Abos').getByTestId('group-toggle'));
    await expect(group(page, 'Abos')).toHaveAttribute('data-collapsed', 'true');
    await expect(group(page, 'Immo')).toHaveAttribute('data-collapsed', 'false');
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(title(page)).toHaveText('Oktober 2026');
    // October: everything paid, everything collapsed
    await expect(page.locator('[data-testid="category-group"][data-collapsed="false"]')).toHaveCount(0);
    await expect(page.getByTestId('collapse-all')).toHaveText('Alle ausklappen');
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(group(page, 'Abos')).toHaveAttribute('data-collapsed', 'true');
    await expect(group(page, 'Immo')).toHaveAttribute('data-collapsed', 'false');
    // a new start of the app: by status again
    await page.reload();
    await appSettled(page);
    await expect(group(page, 'Abos')).toHaveAttribute('data-collapsed', 'false');
    await expect(group(page, 'Immo')).toHaveAttribute('data-collapsed', 'true');
  });

  test('„5 offen“ ist ein Filter: nur offene Positionen, „Alle anzeigen“, erneutes Tippen hebt auf', async ({ page }, info) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    const chip = page.getByTestId('hero-open-filter');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    const rows = page.locator('[data-testid="category-group"] li[data-position]');
    const before = await rows.count();
    await tap(chip);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('categories-label')).toHaveText('Nur offene');
    await expect(page.getByTestId('show-all')).toHaveText('Alle anzeigen');
    await expect(page.getByTestId('collapse-all')).toHaveCount(0);
    // 5 open fixed costs + 1 open Vermögensaufbau, nothing paid, nothing collapsed
    await expect(rows).toHaveCount(6);
    await expect(rows.and(page.locator('[data-status="paid"]'))).toHaveCount(0);
    await expect(page.locator('[data-testid="category-group"][data-collapsed="true"]')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Immo' })).toHaveCount(0);
    await page.screenshot({ path: `docs/screenshots/aktiver-monat/test-${info.project.name}-filter.png` });
    await tap(chip);
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(await rows.count()).toBe(before);
    await tap(chip);
    await tap(page.getByTestId('show-all'));
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('show-all')).toHaveCount(0);

    // everything paid (October): no filter chip
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(page.getByTestId('hero-open-filter')).toHaveCount(0);
    await expect(page.getByTestId('hero')).toContainText('Alles abgebucht');
  });

  test('Kommt bald: iPhone 3 Einträge + „Alle anzeigen (5)“, iPad/Desktop alle; zwei Zeilen, Rhythmus einheitlich', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    const list = page.getByTestId('upcoming-list');
    const rows = list.getByTestId('upcoming-row');
    await expect(rows).toHaveCount(5);
    const phone = (page.viewportSize()?.width ?? 0) < 768;
    const visible = async () => rows.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);
    if (phone) {
      expect(await visible()).toBe(3);
      await expect(page.getByTestId('upcoming-more')).toHaveText('Alle anzeigen (5)');
      await tap(page.getByTestId('upcoming-more'));
      expect(await visible()).toBe(5);
      await expect(page.getByTestId('upcoming-more')).toHaveCount(0);
    } else {
      expect(await visible()).toBe(5);
      await expect(page.getByTestId('upcoming-more')).toBeHidden();
    }
    // line 1 title + amount, line 2 chip + rhythm side by side; if one rhythm would wrap, all move to line 3
    const layout = await list.evaluate((ul) =>
      Array.from(ul.querySelectorAll<HTMLElement>('[data-testid="upcoming-row"]'))
        .filter((r) => r.offsetParent !== null)
        .map((r) => {
          const chip = r.querySelector('[data-testid="upcoming-month"]')!.getBoundingClientRect();
          const rhythm = r.querySelector('[data-testid="upcoming-rhythm"]')?.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(r.querySelector('[data-testid="upcoming-rhythm"]') ?? r).lineHeight) || 20;
          return {
            same: rhythm ? Math.abs(rhythm.top + rhythm.height / 2 - (chip.top + chip.height / 2)) < 4 : null,
            rhythmLines: rhythm ? Math.round(rhythm.height / lh) : 0,
            below: rhythm ? rhythm.top >= chip.bottom - 1 : null,
          };
        }),
    );
    const stacked = (await list.getAttribute('data-stacked')) === 'true';
    for (const r of layout) {
      expect(r.rhythmLines).toBeLessThanOrEqual(1);
      if (r.same === null) continue;
      expect(r.same).toBe(!stacked);
      expect(r.below).toBe(stacked);
    }
    await expectClean(page, 'main');
  });
});

test.describe('Analyse: Achse, aktiver Balken, Tooltip, Details', () => {
  test('x-Achse: unter 430 px einbuchstabig, sonst dreibuchstabig, Label-Boxen mindestens 6 px auseinander; aktiver Monat nur am Label (Brand-Farbe, fett)', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await goTo(page, 'analyse');
    const card = page.getByTestId('forecast');
    await expect(card.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await card.evaluate((root) => {
      const ticks = Array.from(root.querySelectorAll<SVGTextElement>('[data-testid="forecast-tick"]')).map((t) => ({
        t: t.textContent,
        r: t.getBoundingClientRect(),
        active: t.hasAttribute('data-active'),
        fill: getComputedStyle(t).fill,
        weight: Number(getComputedStyle(t).fontWeight),
      }));
      // horizontal gap between neighbouring label boxes
      const gaps = ticks.slice(1).map((b, i) => b.r.left - ticks[i]!.r.right);
      const probe = document.createElement('span');
      probe.style.color = 'rgb(var(--c-accent-ink))';
      document.body.appendChild(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { ticks: ticks.map((t) => t.t), gaps, active: ticks.filter((t) => t.active).map((t) => ({ t: t.t, fill: t.fill, weight: t.weight })), others: ticks.filter((t) => !t.active).map((t) => ({ fill: t.fill, weight: t.weight })), brand };
    });
    const narrow = (page.viewportSize()?.width ?? 0) < 430;
    expect(m.ticks).toEqual(
      narrow ? ['N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O'] : ['Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt'],
    );
    expect(Math.min(...m.gaps), `gaps ${m.gaps.map((g) => g.toFixed(1)).join(' ')}`).toBeGreaterThanOrEqual(6);
    // November (the active month): brand colour, bold; all other labels plain
    expect(m.active).toEqual([{ t: narrow ? 'N' : 'Nov', fill: m.brand, weight: 700 }]);
    expect(m.others.every((o) => o.fill !== m.brand && o.weight < 600)).toBe(true);
  });

  test('kein Rand an Balken (Jahresvorschau, Verteilung, Sparquote): kein stroke/outline/border, im Ruhezustand und nach Antippen', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await goTo(page, 'analyse');
    const forecast = page.getByTestId('forecast');
    await expect(forecast.locator('.recharts-bar-rectangle').first()).toBeVisible();
    const edges = () =>
      page.evaluate(() => {
        const bars = [
          ...document.querySelectorAll('[data-testid="forecast"] .recharts-bar-rectangle path, [data-testid="forecast"] .recharts-active-bar path'),
          ...document.querySelectorAll('[data-testid="share-bar"]'),
          ...document.querySelectorAll('[data-testid="savings-column-bar"]'),
        ];
        const found: string[] = [];
        for (const b of bars) {
          const cs = getComputedStyle(b);
          const stroke = b.getAttribute('stroke');
          if ((stroke && stroke !== 'none') || (cs.stroke !== 'none' && Number.parseFloat(cs.strokeWidth) > 0 && b instanceof SVGElement)) found.push(`${b.getAttribute('data-testid') ?? 'forecast'} stroke ${stroke ?? cs.stroke}`);
          if (cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0) found.push(`${b.getAttribute('data-testid') ?? 'forecast'} outline`);
          if (['Top', 'Right', 'Bottom', 'Left'].some((side) => cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' && Number.parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0)) found.push(`${b.getAttribute('data-testid') ?? 'forecast'} border`);
          if (cs.boxShadow !== 'none') found.push(`${b.getAttribute('data-testid') ?? 'forecast'} ring`);
        }
        return { count: bars.length, found };
      });
    const rest = await edges();
    expect(rest.count).toBeGreaterThan(12);
    expect(rest.found).toEqual([]);
    // tap the active month's bar and a Sparquote column: still no edge, no focus ring (only for the keyboard)
    const bar = forecast.locator('.bar-recurring .recharts-bar-rectangle').first();
    const box = (await bar.boundingBox())!;
    if (isTouchProject()) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(forecast.getByTestId('chart-tooltip')).toBeVisible();
    const column = page.getByTestId('savings-column').last();
    if (await column.count()) await tap(column);
    const tapped = await edges();
    expect(tapped.found).toEqual([]);
    const focusRings = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="analyse"] *')].filter((e) => {
        const cs = getComputedStyle(e);
        // the ring (.focus-ring) only exists under :focus-visible – never after touch or mouse
        return e.matches(':focus-visible') || (e.matches(':focus') && cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0);
      }).map((e) => `${e.tagName}.${e.getAttribute('class')}`),
    );
    expect(focusRings, 'no focus ring after touch or mouse').toEqual([]);
  });

  test('Tastatur (Desktop): die Jahresvorschau bekommt einen Fokusring (nur :focus-visible)', async ({ page }) => {
    test.skip(isTouchProject(), 'keyboard');
    await importLive29(page, { start: { monthStartDay: 25 } });
    await goTo(page, 'analyse');
    const chart = page.getByTestId('forecast').locator('[tabindex="0"]').first();
    await expect(chart).toBeAttached();
    // keyboard focus: Tab from the element before the chart
    await chart.evaluate((el) => {
      const all = [...document.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"]')].filter((e) => e.getClientRects().length);
      all[all.indexOf(el as HTMLElement) - 1]?.focus();
    });
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const f = document.activeElement as Element;
      const cs = getComputedStyle(f);
      return { inChart: !!f.closest('[data-testid="forecast"]'), visible: f.matches(':focus-visible'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
    });
    expect(ring).toEqual({ inChart: true, visible: true, outline: true });
  });

  test('Tippen auf einen Balken: Tooltip (Monat, Summe, davon einmalig, „aktiv“) und Zeile in „Details“ hervorgehoben', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await goTo(page, 'analyse');
    const card = page.getByTestId('forecast');
    await page.evaluate(() => document.fonts.ready);
    const tip = card.getByTestId('chart-tooltip');
    const bars = card.locator('.bar-recurring .recharts-bar-rectangle');
    let attempt = 0;
    const tapBar = async (n: number, texts: (string | RegExp)[]) => {
      await bars.nth(n).scrollIntoViewIfNeeded();
      await expect(async () => {
        const box = (await bars.nth(n).boundingBox())!;
        const x = box.x + box.width / 2 + (attempt++ % 3) - 1;
        const y = box.y + box.height / 2;
        if (isTouchProject()) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await expect(tip).toBeVisible({ timeout: 1500 });
        for (const t of texts) await expect(tip).toContainText(t, { timeout: 500 });
      }).toPass({ intervals: [300, 600], timeout: 10000 });
    };
    await tapBar(0, ['November 2026', eur('Summe€ 5.662,45'), eur('davon einmalig€ 3.028,45')]);
    await expect(tip.getByTestId('tooltip-badge')).toHaveText('aktiv');
    await tapBar(1, ['Dezember 2026', eur('Summe€ 3.143'), eur('davon einmalig€ 130')]);
    await expect(tip.getByTestId('tooltip-badge')).toHaveCount(0);

    await tap(card.getByRole('button', { name: 'Details anzeigen' }));
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    const details = wide ? page.getByTestId('forecast-table') : page.getByTestId('forecast-list');
    await expect(details.locator('[data-selected]')).toHaveCount(1);
    await expect(details.locator('[data-selected]')).toHaveAttribute('data-period', '2026-12');
  });

  test('Details: Namen nicht abgeschnitten (höchstens 2 Zeilen), Punkt nur bei einmaligen Positionen', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await goTo(page, 'analyse');
    const card = page.getByTestId('forecast');
    await tap(card.getByRole('button', { name: 'Details anzeigen' }));
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    const details = wide ? page.getByTestId('forecast-table') : page.getByTestId('forecast-list');
    const m = await details.evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>('[data-testid="forecast-item"]'))
        .filter((i) => i.offsetParent !== null)
        .map((i) => {
          const name = i.querySelector<HTMLElement>('[data-testid="forecast-item-name"]')!;
          const lh = parseFloat(getComputedStyle(name).lineHeight);
          return {
            name: name.textContent,
            once: i.hasAttribute('data-once'),
            dot: !!i.querySelector('[data-testid="once-dot"]'),
            lines: Math.round(name.getBoundingClientRect().height / lh),
            clipped: name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1,
            ellipsis: getComputedStyle(name).textOverflow === 'ellipsis' && getComputedStyle(name).whiteSpace === 'nowrap',
          };
        }),
    );
    expect(m.length).toBeGreaterThan(0);
    expect(m.filter((i) => i.once).length).toBeGreaterThan(0);
    expect(m.filter((i) => !i.once).length).toBeGreaterThan(0);
    for (const i of m) {
      expect(i.dot, i.name ?? '').toBe(i.once);
      expect(i.lines, i.name ?? '').toBeLessThanOrEqual(2);
      expect(i.clipped, i.name ?? '').toBe(false);
      expect(i.ellipsis, i.name ?? '').toBe(false);
    }
  });
});

test.describe('Export und Import mit und ohne Einstellung', () => {
  async function readDownload(download: Download) {
    return JSON.parse(readFileSync((await download.path())!, 'utf8'));
  }

  test('Export trägt „Neuer Monat beginnt am“ mit; Ersetzen mit altem Export → 1.; Datei mit Wert setzt ihn', async ({ page }) => {
    await importLive29(page, { start: { monthStartDay: 25 } });
    await expect(title(page)).toHaveText('November 2026');
    await goTo(page, 'einstellungen');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren' }).click()]);
    const exported = await readDownload(download);
    expect(exported.settings).toEqual({ monthStartDay: 25 });
    expect(exported.schemaVersion).toBe(4);

    const importFile = async (json: unknown) => {
      await page.getByTestId('backup-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
      const sheet = page.getByTestId('import-sheet');
      await expect(sheet).toBeVisible();
      await sheet.getByRole('radio', { name: /Ersetzen/ }).check();
      await sheet.getByRole('button', { name: 'Ersetzen', exact: true }).click();
      await expect(sheet).toBeHidden();
    };
    const select = page.getByTestId('month-settings').getByLabel('Neuer Monat beginnt am');
    // old export without the setting (25.10.2026): default 1
    await importFile(JSON.parse(readFileSync(LIVE_FILE, 'utf8')));
    await expect(select).toHaveValue('1');
    await expect(page.getByTestId('active-month')).toHaveText('Aktiver Monat: Oktober 2026');
    // the export with the setting brings it back
    await importFile(exported);
    await expect(select).toHaveValue('25');
    await expect(page.getByTestId('active-month')).toHaveText('Aktiver Monat: November 2026');
  });
});
