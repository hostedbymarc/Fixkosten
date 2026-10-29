import { eur, expect, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';
import { expectClean } from './measure';

const DEZ_TODAY = new Date('2026-12-10T10:00:00+01:00');

async function toMonth(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.describe('Banner „Offen aus …“', () => {
  test('heute = Okt 2026: November und Dezember zeigen kein Banner', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await expect(page.getByTestId('open-previous')).toHaveCount(0);
    await toMonth(page, 'November 2026');
    await expect(page.getByTestId('open-previous')).toHaveCount(0);
    await toMonth(page, 'Dezember 2026');
    await expect(page.getByTestId('open-previous')).toHaveCount(0);
  });

  test('heute = Dez 2026, November offen: 14 · € 5.199 wie der November-Hero, Detail „+ 1 Vermögensaufbau · € 400“', async ({ page }) => {
    await importLive(page, DEZ_TODAY);
    await expect(page.getByRole('heading', { level: 1, name: 'Dezember 2026' })).toBeVisible();
    const banner = page.getByTestId('open-previous');
    await expect(banner).toHaveAttribute('aria-label', 'Offen aus November');
    await expect(banner.getByTestId('open-previous-sum')).toHaveText(eur('14 · € 5.199'));
    await banner.getByRole('button', { name: /Offen aus November/ }).click();
    await expect(banner.getByTestId('open-previous-savings')).toHaveText(eur('+ 1 Vermögensaufbau · € 400'));
    await expect(banner.locator('[data-testid="open-item"][data-position]').filter({ hasText: 'ETF Sparplan' })).toHaveCount(1);
    await expectClean(page, '[data-testid="open-previous"]');
    // the same figure as the November hero
    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'November 2026' })).toBeVisible();
    await expect(page.getByTestId('hero-open')).toHaveText(eur('14 offen · € 5.199'));
  });
});

test.describe('Feinschliff', () => {
  test('„Kommt bald“: Titel + Betrag, darunter Monats-Chip und Rhythmus nebeneinander (bricht er um: alle darunter) – auf jedem Viewport', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const rows = page.getByTestId('upcoming-row');
    expect(await rows.count()).toBeGreaterThan(2);
    // iPhone: first 3 entries, the rest after „Alle anzeigen (n)“
    const more = page.getByTestId('upcoming-more');
    if (await more.isVisible()) await more.click();
    const stacked = (await page.getByTestId('upcoming-list').getAttribute('data-stacked')) === 'true';
    for (const row of await rows.all()) {
      const r = await row.evaluate((li) => {
        const box = (el: Element | null) => el!.getBoundingClientRect();
        const title = box(li.querySelector('.line-clamp-2'));
        const amount = box(li.querySelector('.num'));
        const chip = box(li.querySelector('[data-testid="upcoming-month"]'));
        const rhythm = li.querySelector('[data-testid="upcoming-rhythm"]');
        return { title, amount, chip, rhythm: rhythm ? box(rhythm) : null };
      });
      expect(r.chip.top, 'chip below the title').toBeGreaterThanOrEqual(r.title.bottom - 1);
      expect(Math.abs(r.amount.top - r.title.top), 'amount on the title line').toBeLessThanOrEqual(2);
      if (r.rhythm && stacked) {
        expect(r.rhythm.top, 'rhythm below the chip').toBeGreaterThanOrEqual(r.chip.bottom - 1);
        expect(Math.abs(r.rhythm.left - r.chip.left), 'chip and rhythm aligned').toBeLessThanOrEqual(1);
      } else if (r.rhythm) {
        expect(r.rhythm.left, 'rhythm right of the chip').toBeGreaterThanOrEqual(r.chip.right);
        expect(Math.abs(r.rhythm.top + r.rhythm.height / 2 - (r.chip.top + r.chip.height / 2)), 'one line').toBeLessThanOrEqual(3);
      }
    }
  });

  test('Frei-Kachel ohne Netto: „Netto-Gehalt“ wird nicht am Bindestrich getrennt', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await toMonth(page, 'November 2026');
    await toMonth(page, 'Dezember 2026');
    const word = page.getByTestId('free-sub').getByText('Netto-Gehalt', { exact: true });
    await expect(word).toBeVisible();
    const [h, lh] = await word.evaluate((el) => [el.getBoundingClientRect().height, parseFloat(getComputedStyle(el.parentElement!).lineHeight)]);
    expect(Math.round(h / lh)).toBe(1);
    expect(await word.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  });
});
