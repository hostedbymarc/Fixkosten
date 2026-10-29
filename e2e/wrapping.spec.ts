// No unwanted breaks: category headers and amounts on iPhone SE 375, iPhone 15, iPad portrait and
// landscape, Desktop 1440 and 2560 – with a long category name that must end in an ellipsis.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

const SIZES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 15', width: 393, height: 852 },
  { name: 'iPad hoch', width: 820, height: 1180 },
  { name: 'iPad quer', width: 1180, height: 820 },
  { name: 'Desktop 1440', width: 1440, height: 900 },
  { name: 'Desktop 2560', width: 2560, height: 1440 },
];
const LONG = 'Versicherungen & Vorsorge';

/** Lines of an element's text: its height over its line-height. */
async function lines(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return { text: (el.textContent ?? '').trim(), lines: Math.round(el.getBoundingClientRect().height / lh), overflow: el.scrollWidth > el.clientWidth + 1, clipped: el.scrollWidth > el.clientWidth };
    }),
  );
}

test.describe('Umbrüche: Kategorie-Header, Beträge, Chips', () => {

  for (const size of SIZES) {
    test(`${size.name} (${size.width} px): Header einzeilig je Spalte, Beträge und Chips nie umgebrochen, langer Name mit Ellipse`, async ({ page }) => {
      test.skip(test.info().project.name !== 'desktop', 'one project sets every size itself');
      await page.setViewportSize({ width: size.width, height: size.height });
      // the long name replaces „Wohnen & Leben“ (6 positions, Ø ≠ Summe): the worst case of the header
      await importLive(page, NOV_TODAY, (b) => {
        b.data.categories.find((c) => c.name === 'Wohnen & Leben')!.name = LONG;
      });
      await expect(page.getByRole('region', { name: LONG })).toBeVisible();
      // phones: every „Kommt bald“ entry shown, so all of them are measured
      const more = page.getByTestId('upcoming-more');
      if (await more.isVisible()) await more.click();

      // header: every cell one line, nothing outside the card
      for (const id of ['group-name', 'group-sum', 'group-progress', 'group-spread']) {
        for (const l of await lines(page, `[data-testid="${id}"]`)) expect(l.lines, `${id} „${l.text}“`).toBe(1);
      }
      const long = page.getByRole('region', { name: LONG }).getByTestId('group-name');
      const ell = await long.evaluate((el) => ({ ellipsis: getComputedStyle(el).textOverflow, full: el.scrollWidth <= el.clientWidth }));
      expect(ell.ellipsis).toBe('ellipsis'); // too long → ellipsis instead of overflow
      const header = await page.getByTestId('group-toggle').evaluateAll((els) => els.map((el) => el.scrollWidth <= el.clientWidth + 1));
      expect(header.every(Boolean), 'no header overflows').toBe(true);

      // amounts: one line everywhere on the month screen
      for (const sel of ['position-amount', 'hero-paid', 'hero-planned', 'hero-deductions-value', 'salary-value', 'kpi-value', 'free-value', 'wealth-value']) {
        for (const l of await lines(page, `[data-testid="${sel}"]`)) expect(l.lines, `${sel} „${l.text}“`).toBe(1);
      }
      for (const l of await lines(page, '.num')) {
        if (/^[−+]?€ [\d.,]+$/.test(l.text.replace(/ /g, ' '))) expect(l.lines, `Betrag „${l.text}“`).toBe(1);
      }
      // chips: never broken inside (they wrap only as a whole)
      const chips = await page.locator('main span.rounded-md').evaluateAll((els) =>
        els.map((el) => ({ text: (el.textContent ?? '').trim(), h: el.getBoundingClientRect().height })),
      );
      for (const c of chips) expect(c.h, `Chip „${c.text}“`).toBeLessThanOrEqual(24);
      // nothing wider than the page
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
