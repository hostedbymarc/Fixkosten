import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup } from '../src/db/backup';
import { withNovember } from '../tests/fixtures/november';
import { appSettled, eur, expect, FIXTURE, isTouchProject, test } from './fixtures';
import { expectClean } from './measure';

const DIR = 'docs/screenshots/audit';
/** Today = 10.11.2026: the app opens November. */
const NOV_TODAY = new Date('2026-11-10T10:00:00+01:00');

async function importNovember(page: Page, netSalary?: number) {
  await page.clock.setFixedTime(NOV_TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = withNovember(parseBackup(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
  if (netSalary !== undefined) backup.data.monthClose.find((m) => m.period === '2026-11')!.netSalary = netSalary;
  await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
}

const group = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('Audit: November 2026 (Golden Fixture)', () => {
  test('Hero, Kacheln und Kategorie-Header: auf jedem Viewport dieselben Zahlen', async ({ page }, info) => {
    await importNovember(page);
    await expect(page.getByTestId('hero-paid')).toHaveText(eur('€ 450'));
    await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 5.649'));
    await expect(page.getByTestId('hero-open')).toHaveText(eur('14 offen · € 5.199'));
    await expect(page.getByRole('img', { name: '8 Prozent abgebucht' })).toBeVisible();
    await expect(page.getByTestId('salary-value')).toHaveText(eur('€ 7.819'));
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 1.370')); // 7.819 − 5.649 − Vermögensaufbau 800
    await expect(page.getByTestId('wealth-value')).toHaveText(eur('€ 800'));
    await expect(page.getByTestId('wealth-sub')).toHaveText(eur('Sparquote 10,2 %'));
    await expect(page.getByTestId('kpi-value')).toHaveText(eur('€ 2.952,17'));

    const header = async (name: string) => [
      await group(page, name).getByTestId('group-progress').textContent(),
      await group(page, name).getByTestId('group-sum').textContent(),
    ];
    expect(await header('Wohnen & Leben')).toEqual(['1/6 bezahlt', expect.stringMatching(eur('€ 1.572'))]);
    expect(await header('Meine Immos')).toEqual(['0/3 bezahlt', expect.stringMatching(eur('€ 991'))]);
    expect(await header('Abos & Freizeit')).toEqual(['0/4 bezahlt', expect.stringMatching(eur('€ 71'))]);
    expect(await header('Sonstiges')).toEqual(['0/2 bezahlt', expect.stringMatching(eur('€ 3.015'))]);
    expect(await header('Investing')).toEqual(['Vermögensaufbau · 1/2 bezahlt', expect.stringMatching(eur('€ 800'))]);

    // rounding rule: spread (Ø) amounts always with cents, month amounts without „,00“
    await expect(page.getByTestId('kpi-hint')).toHaveText(eur('davon € 288,17 nicht monatlich'));
    await expect(page.getByTestId('free-average')).toHaveText(/^im Ø-Monat €[\s\u00a0]4\.066,83$/);
    await expect(group(page, 'Wohnen & Leben').getByTestId('group-spread')).toHaveText(/^Ø €[\s\u00a0]1\.602,00$/);
    await expect(group(page, 'Meine Immos').getByTestId('group-sum')).toHaveText(/^€[\s\u00a0]991$/);

    await expectClean(page, 'main');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/${info.project.name}-november-nachher.png`, fullPage: true });
  });

  test('Lebensmittel: Ist 450 in der Zeile, Notiz bleibt, Chip „−€ 30“ brand-grün mit Vorzeichen (U+2212)', async ({ page }) => {
    await importNovember(page);
    const row = page.locator('[data-position="pos-lebensmittel"]');
    await expect(row).toContainText('€30 vom Vormonat abgehoben');
    await expect(row).toContainText(eur('€ 450'));
    const chip = row.getByTestId('delta-chip');
    await expect(chip).toHaveText('\u2212€\u00a030');
    await expect(chip).toHaveAttribute('aria-label', /Weniger als geplant: \u2212€/);
    await expect(chip).toHaveAttribute('data-tone', 'paid');
    expect(await chipColors(chip)).toEqual(await probeColors(page, 'bg-paid-soft text-paid-ink'));
  });

  test('Chip „+€ …“ rot, wenn mehr abgebucht wurde als geplant', async ({ page }) => {
    await importNovember(page);
    // tick Miete with more than planned (UI flow, nothing stored by hand)
    const miete = page.locator('[data-position="pos-miete"]');
    await miete.getByRole('button', { name: 'Miete als bezahlt markieren' }).click();
    await miete.getByRole('button', { name: 'Miete – Details' }).click();
    await page.getByLabel('Tatsächlich abgebucht').fill('1.020');
    await page.getByRole('button', { name: 'Speichern' }).click();
    const chip = miete.getByTestId('delta-chip');
    await expect(chip).toHaveText('+€\u00a012');
    await expect(chip).toHaveAttribute('aria-label', /Mehr als geplant: \+€/);
    await expect(chip).toHaveAttribute('data-tone', 'over');
    expect(await chipColors(chip)).toEqual(await probeColors(page, 'bg-over-soft text-over'));
  });

  test('Kommt bald: Quartal mit Fälligkeitsmonaten, umbrechend aber nie abgeschnitten', async ({ page }) => {
    await importNovember(page);
    const upcoming = page.getByRole('region', { name: 'Kommt bald' }).or(page.locator('section[aria-labelledby="upcoming-title"]'));
    for (const name of ['Entgelt Kontoführung', 'Depotentgelt']) {
      const li = upcoming.locator('li', { hasText: name });
      await expect(li).toContainText('Quartal · Jän, Apr, Jul, Okt');
      await expect(li).toContainText('Jänner');
    }
    await expect(upcoming.locator('li', { hasText: 'Baurechtszins' })).toContainText('Halbjährlich · Jun, Dez');
    await expectClean(page, 'section[aria-labelledby="upcoming-title"]');
    const clipped = await upcoming.locator('li span').evaluateAll((els) =>
      els.filter((e) => !e.classList.contains('truncate') && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    );
    expect(clipped).toEqual([]);
  });

  for (const dark of [false, true]) {
    test(`Screenshot Monat-Screen November ${dark ? 'dunkel' : 'hell'} (Chip, Kategorie-Punkte, Kommt bald)`, async ({ page }, info) => {
      if (dark) await page.emulateMedia({ colorScheme: 'dark' });
      await importNovember(page);
      await expect(page.locator('[data-position="pos-lebensmittel"]').getByTestId('delta-chip')).toBeVisible();
      // the dots of Investing (Mokka) and Sonstiges (Pflaume) are different colours
      const dots = await page.getByTestId('category-group').evaluateAll((els) =>
        Object.fromEntries(els.map((e) => [e.getAttribute('aria-label'), getComputedStyle(e.querySelector('[data-testid="group-toggle"] span[aria-hidden="true"].rounded-full')!).backgroundColor])),
      );
      expect(new Set(Object.values(dots)).size, JSON.stringify(dots)).toBe(Object.keys(dots).length);
      await expectClean(page, 'main');
      await page.addStyleTag({ content: '[data-testid="tabbar"] { visibility: hidden !important; }' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${info.project.name}-monat-${dark ? 'dunkel' : 'hell'}.png`, fullPage: true });
    });
  }

  test('Monatswechsel überträgt keinen Haken; Oktober behält seine eigenen', async ({ page }) => {
    await importNovember(page);
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dezember 2026');
    await expect(page.locator('[data-testid="position-row"][data-paid="true"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oktober 2026');
    await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 3.403'));
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(page.getByTestId('hero-open')).toHaveText(eur('14 offen · € 5.199'));
  });
});

/** Colour of the red text token (text-over) in the current theme. */
async function overColor(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-over';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
}

/** Amount fully visible on one line (no truncation, no wrap inside the amount). */
async function expectWhole(locator: ReturnType<Page['getByTestId']>) {
  const m = await locator.evaluate((el) => ({
    clipped: el.scrollWidth > el.clientWidth + 1,
    lines: el.getClientRects().length,
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(m.clipped, 'clipped').toBe(false);
  expect(m.height, 'one line').toBeLessThan(m.lineHeight * 1.5);
}

test.describe('Frei verfügbar positiv und negativ', () => {
  test('positiv: € 1.370 · im Ø-Monat € 4.066,83 · ⓘ mit allen drei Werten und dem neuen Text', async ({ page }, info) => {
    await importNovember(page);
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 1.370'));
    await expect(page.getByTestId('free-value')).toHaveAttribute('data-negative', 'false');
    await expect(page.getByTestId('free-average')).toHaveText(eur('im Ø-Monat € 4.066,83'));
    const icon = page.getByRole('button', { name: 'Erklärung: im Ø-Monat' });
    await (isTouchProject() ? icon.tap() : icon.hover());
    await expect(page.getByTestId('free-average-formula')).toHaveText(eur('Netto € 7.819 − Ø Fixkosten € 2.952,17 − Ø Vermögensaufbau € 800,00 = € 4.066,83'));
    await expect(page.getByRole('tooltip')).toContainText(
      'So viel bleibt dir im Schnitt pro Monat, wenn du Jahres- und Quartalszahlungen anteilig zurücklegst und deinen Vermögensaufbau abziehst.',
    );
    // tap / hover next to it (the month title would open the month grid)
    await (isTouchProject() ? page.getByTestId('hero-paid').tap() : page.getByTestId('hero-paid').hover());
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.getByTestId('salary-tile').locator('..').screenshot({ path: `${DIR}/${info.project.name}-frei-positiv.png` });
  });

  test('negativ (Netto 3.000): Minus U+2212 und Rot, vollständig, Ring heil; Monatsabschluss ebenso', async ({ page }, info) => {
    await importNovember(page, 3000);
    const value = page.getByTestId('free-value');
    await expect(value).toHaveText('\u2212€\u00a03.449');
    await expect(value).toHaveAttribute('data-negative', 'true');
    const red = await overColor(page);
    expect(await value.evaluate((el) => getComputedStyle(el).color)).toBe(red);
    await expectWhole(value);
    const avg = page.getByTestId('free-average').locator('.num');
    await expect(avg).toHaveText('\u2212€\u00a0752,17');
    expect(await avg.evaluate((el) => getComputedStyle(el).color)).toBe(red);
    await expectWhole(avg);
    // the ring does not care about „Frei verfügbar“
    await expect(page.getByRole('img', { name: '8 Prozent abgebucht' })).toBeVisible();
    await expect(page.getByTestId('hero-open')).toHaveText(eur('14 offen · € 5.199'));
    // one minus sign everywhere on the screen
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/[-\u2010-\u2014][\s\u00a0]?€/);
    expect(text).not.toMatch(/€[\s\u00a0]?[-\u2010-\u2014]\d/);
    await expectClean(page, 'main');
    await page.waitForTimeout(300);
    await page.getByTestId('salary-tile').locator('..').screenshot({ path: `${DIR}/${info.project.name}-frei-negativ.png` });

    await page.getByTestId('free-tile').click();
    const sheet = page.getByRole('dialog', { name: 'Monatsabschluss November 2026' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('close-average')).toHaveText(
      eur('Rechnerisch frei diesen Monat \u2212€ 3.449 · im Ø-Monat \u2212€ 752,17, jeweils nach den Fixkosten und dem Vermögensaufbau'),
    );
    for (const id of ['close-calculated', 'close-average-value']) {
      expect(await sheet.getByTestId(id).evaluate((el) => getComputedStyle(el).color)).toBe(red);
      await expectWhole(sheet.getByTestId(id));
    }
  });
});

async function chipColors(chip: ReturnType<Page['getByTestId']>) {
  return chip.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
}

async function probeColors(page: Page, className: string) {
  return page.evaluate((cls) => {
    const probe = document.createElement('span');
    probe.className = cls;
    document.body.append(probe);
    const s = { bg: getComputedStyle(probe).backgroundColor, fg: getComputedStyle(probe).color };
    probe.remove();
    return s;
  }, className);
}
