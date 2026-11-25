import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { appSettled, closePlan, expect, settled, setUpKonto, test } from './fixtures';
import { importLive, NOV_TODAY } from './live';

// alle-monate-gleich (data like yours, rebuilt; „Neuer Monat beginnt am“ 25, today 10 November → November active):
// - Oktober (past), November (active), Dezember (future): the same card „Dein Monat“, the same DOM structure;
//   no hero, no salary tile, no Vermögensaufbau tile in any month
// - head: „September-Gehalt · ausgezahlt am 25. September“ / … / „November-Gehalt · geplant · kommt am 25.11.“
// - „Nächstes Gehalt … Plan ansehen“ and „Nächster großer Monat“ only in the active month; one line on the iPhone SE
// - ④ „Spielgeld“ = max(limit, spent), „Überschuss in diesem Monat“ = Netto − ① − ② − ③ − ④
// - salary entered in December: the Überschuss follows at once
// - ticking December (future) completely: no live celebration; November done later: exactly one
// iPhone SE, iPhone 15, iPhone Pro Max, iPad portrait/landscape, desktop 1440 × light/dark; screenshots of
// Oktober, November, Dezember, folded and open, to docs/screenshots/alle-monate-gleich/.

const DIR = 'docs/screenshots/alle-monate-gleich';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

const cents = (text: string) => {
  const negative = /−|-/.test(text);
  const v = Math.round(Number(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return negative ? -v : v;
};
const centsOf = async (l: Locator) => cents((await l.textContent())!);
const plain = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');

const ROWS = ['dein-monat-transfer', 'dein-monat-direct', 'dein-monat-wealth', 'dein-monat-unplanned'] as const;
/** the parts of the card every month has, in order */
const STRUCTURE = [
  'dein-monat-salary',
  'dein-monat-salary-title',
  'dein-monat-salary-when',
  'dein-monat-salary-value',
  'dein-monat-split-toggle',
  'dein-monat-split',
  ...ROWS.flatMap((r) => [r, `${r}-toggle`, `${r}-value`]),
  'dein-monat-free',
  'dein-monat-free-value',
  'dein-monat-before',
  'dein-monat-bills',
];

async function structure(page: Page): Promise<string[]> {
  const ids = await page.getByTestId('dein-monat').evaluate((card) => [...card.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')!));
  return ids.filter((id) => STRUCTURE.includes(id));
}

async function start(page: Page) {
  await importLive(page, NOV_TODAY, (b) => {
    b.settings = { ...(b.settings ?? {}), monthStartDay: 25 };
  });
  await page.getByTestId('konto-invite-enable').click();
  await setUpKonto(page);
}

const ORDER = ['September', 'Oktober', 'November', 'Dezember', 'Jänner'];
async function toMonth(page: Page, name: string, tap: (l: Locator) => Promise<void>) {
  const title = page.getByTestId('month-title');
  for (let i = 0; i < 4; i++) {
    const text = (await title.textContent()) ?? '';
    const here = ORDER.findIndex((m) => text.includes(m));
    const want = ORDER.indexOf(name);
    if (here === want) break;
    await tap(page.getByRole('button', { name: here > want ? 'Vorheriger Monat' : 'Nächster Monat' }));
    await expect(title).not.toHaveText(text);
  }
  await expect(title).toContainText(name);
  await expect(page.getByTestId('dein-monat')).toBeVisible();
  await appSettled(page);
}

async function shot(page: Page, name: string, target: Locator) {
  await settled(page);
  await target.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

/** counts every confetti that starts falling (live celebration) from now on */
async function watchFalls(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __falls: number; __fallObs?: MutationObserver };
    w.__falls = 0;
    w.__fallObs?.disconnect();
    const seen = new WeakSet<Element>();
    const check = () => {
      for (const el of document.querySelectorAll('[data-testid="hero-confetti"][data-falling]')) {
        if (!seen.has(el)) {
          seen.add(el);
          w.__falls++;
        }
      }
    };
    w.__fallObs = new MutationObserver(check);
    w.__fallObs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-falling'] });
    check();
  });
}
const falls = (page: Page) => page.evaluate(() => (window as unknown as { __falls: number }).__falls);

/** ticks every open (planned) position of the month shown */
async function tickAll(page: Page, tap: (l: Locator) => Promise<void>) {
  const main = page.locator('main > :not([data-tab-hidden])');
  if (await main.getByRole('button', { name: 'Alle ausklappen' }).isVisible()) await tap(main.getByRole('button', { name: 'Alle ausklappen' }));
  const open = main.locator('[data-testid="position-row"][data-status="open"]:not([data-unplanned])').getByTestId('toggle-paid');
  for (let n = await open.count(); n > 0; n = await open.count()) {
    await open.first().scrollIntoViewIfNeeded();
    await tap(open.first());
    await expect(open).toHaveCount(n - 1);
  }
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Alle Monate gleich · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(240_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Oktober, November, Dezember: dieselbe Karte, kein Hero, keine Kacheln; Kopf; Zeilen nur im aktiven Monat', async ({ page }) => {
        await start(page);
        const card = page.getByTestId('dein-monat');
        const shapes: Record<string, string[]> = {};
        const HEAD = {
          Oktober: ['September-Gehalt', 'ausgezahlt am 25. September', 'past'],
          November: ['Oktober-Gehalt', 'ausgezahlt am 25. Oktober', 'active'],
          // gehalt-zum-planen: no entry for December → the planned salary, „geplant · kommt am …“
          Dezember: ['November-Gehalt', 'geplant · kommt am 25.11.', 'future'],
        } as const;
        for (const month of ['Oktober', 'November', 'Dezember'] as const) {
          await toMonth(page, month, tap);
          const [title, when, kind] = HEAD[month];
          await expect(card).toHaveAttribute('data-when', kind);
          await expect(page.getByTestId('dein-monat-salary-title')).toHaveText(title);
          expect(plain(await page.getByTestId('dein-monat-salary-when').textContent())).toBe(when);
          for (const gone of ['hero', 'salary-tile', 'wealth-tile', 'free-tile', 'kpi-value', 'hero-sources']) await expect(page.getByTestId(gone), gone).toHaveCount(0);
          // the next salary: only in the active month; the next big month (komplett-ansparen): never in a past one
          await expect(page.getByTestId('next-salary')).toHaveCount(kind === 'active' ? 1 : 0);
          if (kind !== 'future') await expect(page.getByTestId('big-month')).toHaveCount(kind === 'active' ? 1 : 0);
          await expect(page.getByTestId('dein-monat-bills')).toHaveCount(1);
          if (kind === 'active') {
            // one line, down to the iPhone SE
            const line = page.getByTestId('next-salary');
            expect(plain(await page.getByTestId('next-salary-text').textContent())).toBe('November-Gehalt · kommt am 25.11.');
            const [scroll, client] = await line.evaluate((e) => [e.scrollWidth, e.clientWidth]);
            expect(scroll).toBeLessThanOrEqual(client);
            const text = (await page.getByTestId('next-salary-text').boundingBox())!;
            expect(text.height).toBeLessThan(24);
          }
          // folded: the screenshot of the month
          if ((await page.getByTestId('dein-monat-split-toggle').getAttribute('aria-expanded')) === 'true') await tap(page.getByTestId('dein-monat-split-toggle'));
          await card.scrollIntoViewIfNeeded();
          await shot(page, `${tag}-${month.toLowerCase()}-zu`, card);
          // open: ① – ④ and their lists; the lists add up to the rows, Überschuss = Netto − ① − ② − ③ − ④
          await tap(page.getByTestId('dein-monat-split-toggle'));
          await expect(page.getByTestId('dein-monat-split-toggle')).toHaveAttribute('aria-expanded', 'true');
          shapes[month] = await structure(page);
          for (const id of ROWS) {
            await tap(page.getByTestId(`${id}-toggle`));
            const items = page.getByTestId(id).locator(`[data-testid=${id}-item]:not([data-muted])`);
            let total = 0;
            for (const a of await items.getByTestId(`${id}-item-amount`).allTextContents()) total += cents(a);
            expect(total, `${month} ${id}`).toBe(-(await centsOf(page.getByTestId(`${id}-value`))));
          }
          const net = await centsOf(page.getByTestId('dein-monat-salary-value'));
          const parts = await Promise.all(ROWS.map((id) => centsOf(page.getByTestId(`${id}-value`))));
          expect(await centsOf(page.getByTestId('dein-monat-free-value'))).toBe(net + parts.reduce((a, b) => a + b, 0));
          await shot(page, `${tag}-${month.toLowerCase()}-auf`, card);
          for (const id of ROWS) await tap(page.getByTestId(`${id}-toggle`));
        }
        expect(shapes.Oktober).toEqual(STRUCTURE);
        expect(shapes.November).toEqual(STRUCTURE);
        expect(shapes.Dezember).toEqual(STRUCTURE);
      });
    });
  }
}

test.describe('Alle Monate gleich · Abläufe', () => {
  test.use(VIEWPORTS['desktop-1440']);
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'läuft im Projekt desktop'));
  test.setTimeout(240_000);
  const tap = (l: Locator) => l.click();

  test('④ Spielgeld und Überschuss; Gehalt im Dezember eintragen → Überschuss sofort; Dezember abhaken → keine Feier, November erledigt → genau eine', async ({ page }) => {
    await start(page);
    // Spielgeld € 300 (through „Plan ansehen“): ④ is at least the limit; ④ has no subline (komplett-ansparen)
    await expect(page.getByTestId('dein-monat-unplanned-sub')).toHaveCount(0);
    const without = await centsOf(page.getByTestId('dein-monat-free-value'));
    const spent = -(await centsOf(page.getByTestId('dein-monat-unplanned-value')));
    await tap(page.getByTestId('next-salary'));
    await expect(page.getByTestId('bottom-sheet')).not.toHaveAttribute('data-animating', '');
    await tap(page.getByTestId('plan-spielgeld-amount'));
    const input = page.getByTestId('plan-spielgeld-input');
    await expect(input).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('300');
    await page.keyboard.press('Enter');
    await expect(input).toHaveCount(0);
    await closePlan(page);
    const booked = Math.max(30000, spent);
    await expect.poll(() => centsOf(page.getByTestId('dein-monat-unplanned-value'))).toBe(-booked);
    expect(await centsOf(page.getByTestId('dein-monat-free-value'))).toBe(without - (booked - spent));
    await expect(page.getByTestId('dein-monat-unplanned-sub')).toHaveCount(0);

    // December (future): the salary is the last one (muted); entering it moves the Überschuss at once
    await toMonth(page, 'Dezember', tap);
    const value = page.getByTestId('dein-monat-salary-value');
    await expect(value).toHaveAttribute('data-fallback');
    const before = await centsOf(page.getByTestId('dein-monat-free-value'));
    const old = await centsOf(value);
    await tap(value);
    const field = page.getByTestId('dein-monat-salary-input');
    await expect(field).toBeFocused();
    await field.fill('5000');
    await page.keyboard.press('Enter');
    await expect(value).not.toHaveAttribute('data-fallback');
    await expect.poll(() => centsOf(page.getByTestId('dein-monat-free-value'))).toBe(before + 500000 - old);

    // ticking December completely: the bills row says done, the peas lie – no live celebration
    await watchFalls(page);
    await tickAll(page, tap);
    await expect(page.getByTestId('dein-monat-bills-done')).toBeVisible();
    await expect(page.getByTestId('hero-confetti')).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(await falls(page), 'no live celebration in a future month').toBe(0);
    await expect(page.getByTestId('hero-confetti')).not.toHaveAttribute('data-falling', '');

    // November (active) done later: exactly one live celebration
    await toMonth(page, 'November', tap);
    await watchFalls(page);
    await tickAll(page, tap);
    await expect(page.getByTestId('dein-monat-bills-done')).toBeVisible();
    await expect.poll(() => falls(page)).toBe(1);
    await page.waitForTimeout(1500);
    expect(await falls(page)).toBe(1);
  });
});
