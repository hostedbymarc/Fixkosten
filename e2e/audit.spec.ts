import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup } from '../src/db/backup';
import { withNovember } from '../tests/fixtures/november';
import { eur, expect, FIXTURE, test } from './fixtures';
import { expectClean } from './measure';

const DIR = 'docs/screenshots/audit';
/** Today = 10.11.2026: the app opens November. */
const NOV_TODAY = new Date('2026-11-10T10:00:00+01:00');

async function importNovember(page: Page) {
  await page.clock.setFixedTime(NOV_TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = withNovember(parseBackup(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
  await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByTestId('hero')).toBeVisible();
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
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 2.170'));
    await expect(page.getByTestId('free-wealth')).toHaveText(eur('Vermögensaufbau € 800 · Sparquote 10,2 %'));
    await expect(page.getByTestId('kpi-value')).toHaveText(eur('€ 2.952,17'));

    const header = async (name: string) => [
      await group(page, name).getByTestId('group-progress').textContent(),
      await group(page, name).getByTestId('group-sum').textContent(),
    ];
    expect(await header('Wohnen & Leben')).toEqual(['1/6 bezahlt', expect.stringMatching(eur('€ 1.572'))]);
    expect(await header('Meine Immos')).toEqual(['0/3 bezahlt', expect.stringMatching(eur('€ 991'))]);
    expect(await header('Abos & Freizeit')).toEqual(['0/4 bezahlt', expect.stringMatching(eur('€ 71'))]);
    expect(await header('Sonstiges')).toEqual(['0/2 bezahlt', expect.stringMatching(eur('€ 3.015'))]);
    expect(await header('Investing')).toEqual(['1/2 bezahlt', expect.stringMatching(eur('€ 800'))]);

    await expectClean(page, 'main');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/${info.project.name}-november-nachher.png`, fullPage: true });
  });

  test('Lebensmittel: Ist 450 in der Zeile, Notiz bleibt, Chip „−€ 30“ neutral grau', async ({ page }) => {
    await importNovember(page);
    const row = page.locator('[data-position="pos-lebensmittel"]');
    await expect(row).toContainText('€30 vom Vormonat abgehoben');
    await expect(row).toContainText(eur('€ 450'));
    const chip = row.getByTestId('delta-chip');
    await expect(chip).toHaveText(eur('−€ 30'));
    await expect(chip).toHaveAttribute('aria-label', /Abweichung vom Plan/);
    const [chipStyle, neutral] = await Promise.all([
      chip.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color })),
      page.evaluate(() => {
        const probe = document.createElement('span');
        probe.className = 'bg-zinc-100 text-ink-mute';
        document.body.append(probe);
        const s = { bg: getComputedStyle(probe).backgroundColor, fg: getComputedStyle(probe).color };
        probe.remove();
        return s;
      }),
    ]);
    expect(chipStyle).toEqual(neutral); // no green, no red
  });

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
