import type { Locator, Page } from '@playwright/test';
import { animationsDone, eur, expect, goTo, isTouchProject, test } from './fixtures';
import { expectClean } from './measure';
import { importSprint } from './sprint-data';

const DIR = 'docs/screenshots/sprint-analyse-notizen';
const phone = () => test.info().project.name.startsWith('iphone');

async function tap(locator: Locator) {
  await (isTouchProject() ? locator.tap() : locator.click());
}

async function openNote(page: Page) {
  await tap(page.getByTestId('note-card'));
  await expect(page.getByTestId('note-sheet')).toBeVisible();
  await animationsDone(page, 'bottom-sheet');
}

/** Headings and amounts never wrap: every element needs exactly one text line. */
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

test.describe('Monatsnotiz', () => {
  test('schreiben, Monat wechseln, zurück; ohne Gehalt keine Kennzahl; Screenshots', async ({ page }, info) => {
    await importSprint(page);
    await expect(page.getByTestId('note-empty')).toHaveText('Notiz für Oktober hinzufügen');
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-monat-nachher-leer.png` });

    // October: note, saved on „Fertig“
    await openNote(page);
    await expect(page.getByRole('dialog', { name: 'Notiz · Oktober 2026' })).toBeVisible();
    await page.getByTestId('note-field').fill('Bonus kommt im November.\nUrlaub Kopenhagen gebucht.\nStrom-Nachzahlung prüfen.\nAuto-Service im Feb.');
    await tap(page.getByRole('button', { name: 'Fertig' }));
    await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
    await expect(page.getByTestId('note-text')).toContainText('Bonus kommt im November.');
    await expect(page.getByTestId('note-more')).toHaveText('… mehr'); // 4 lines, 3 visible

    // November has no salary: a note alone changes no figure
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(page.getByTestId('note-empty')).toHaveText('Notiz für November hinzufügen');
    const before = await page.getByTestId('free-tile').textContent();
    await openNote(page);
    await page.getByTestId('note-field').fill('Nur eine Notiz');
    await page.keyboard.press('Escape'); // Esc closes and saves
    await expect(page.getByTestId('note-text')).toHaveText('Nur eine Notiz');
    await expect(page.getByTestId('salary-tile')).toContainText('Gehalt eintragen');
    await expect(page.getByTestId('free-tile')).toHaveText(before!);

    await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
    await expect(page.getByTestId('note-text')).toContainText('Bonus kommt im November.');
    await page.reload();
    await expect(page.getByTestId('note-text')).toContainText('Urlaub Kopenhagen gebucht.');
    await expect(page.getByTestId('salary-value')).toHaveText(eur('€ 4.788'));
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-monat-nachher-notiz.png` });
    await expectClean(page, 'main');
  });

  test('Entwurf wird beim Tippen gespeichert (App-Wechsel), Löschen mit Rückgängig, Zähler ab 1.800', async ({ page }) => {
    await importSprint(page);
    await openNote(page);
    await page.getByTestId('note-field').fill('Entwurf ohne Fertig');
    // no „Fertig“: the debounced draft is already in the database
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByTestId('note-text')).toHaveText('Entwurf ohne Fertig');

    await openNote(page);
    await expect(page.getByTestId('note-counter')).toHaveCount(0);
    await page.getByTestId('note-field').fill('x'.repeat(1850));
    await expect(page.getByTestId('note-counter')).toHaveText(/1\.850 \/ 2\.000/);
    await page.getByTestId('note-field').fill('x'.repeat(2100));
    await expect(page.getByTestId('note-field')).toHaveValue('x'.repeat(2000)); // max 2.000
    await tap(page.getByRole('button', { name: 'Löschen' }));
    await expect(page.getByTestId('note-empty')).toBeVisible();
    await tap(page.getByRole('button', { name: 'Rückgängig' }));
    await expect(page.getByTestId('note-text')).toContainText('xxxx');
  });

  test('Tastatur: Textfeld und „Fertig“ nie verdeckt (iPhone)', async ({ page }) => {
    test.skip(!phone(), 'iPhone profiles');
    await importSprint(page);
    await openNote(page);
    await page.getByTestId('note-field').fill(Array.from({ length: 12 }, (_, i) => `Zeile ${i + 1}`).join('\n'));
    // simulate the on-screen keyboard: the visual viewport shrinks by 336 px (iPhone keyboard)
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      const height = window.innerHeight - 336;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => height });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.getByTestId('note-field').focus();
    const visibleBottom = await page.evaluate(() => window.innerHeight - 336);
    await expect(async () => {
      const done = (await page.getByRole('button', { name: 'Fertig' }).boundingBox())!;
      expect(done.y + done.height, '„Fertig“ above the keyboard').toBeLessThanOrEqual(visibleBottom + 0.5);
      const field = (await page.getByTestId('note-field').boundingBox())!;
      expect(field.y, 'text field starts above the keyboard').toBeLessThan(visibleBottom - 40);
      expect(field.y).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
  });

  test('Desktop: Tab erreicht Textfeld und Fertig, Esc schließt und speichert', async ({ page }) => {
    test.skip(isTouchProject(), 'desktop only');
    await importSprint(page);
    await page.getByTestId('note-card').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('note-sheet')).toBeVisible();
    await page.getByTestId('note-field').focus();
    await page.keyboard.type('Per Tastatur');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fertig' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('note-text')).toHaveText('Per Tastatur');
    await expect(page.getByTestId('note-card')).toBeFocused();
  });

  test('Analyse: Monat mit Notiz zeigt Icon, Tap zeigt die Notiz', async ({ page }) => {
    await importSprint(page);
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await openNote(page);
    await page.getByTestId('note-field').fill('Bonus 1.200 netto');
    await tap(page.getByRole('button', { name: 'Fertig' }));
    await goTo(page, 'analyse');
    const card = page.getByTestId('forecast');
    await tap(card.getByRole('button', { name: 'Details anzeigen' }));
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const row = page.getByTestId('forecast-table').locator('tbody tr', { hasText: 'Nov 2026' });
      await expect(row.getByLabel('mit Notiz')).toBeVisible();
      await expect(row.getByTestId('forecast-note')).toHaveText('Bonus 1.200 netto');
    } else {
      const row = page.getByTestId('forecast-list').locator('[data-period="2026-11"]');
      await expect(row.getByTestId('forecast-note-icon')).toBeVisible();
      await tap(row.getByRole('button'));
      await expect(row.getByTestId('forecast-note')).toHaveText('Bonus 1.200 netto');
    }
  });
});

test.describe('Erinnerungen ausgeblendet (FEATURE_REMINDERS = false)', () => {
  test('keine Reminder-UI im DOM, keine Lücke', async ({ page }) => {
    await importSprint(page);
    await page.getByRole('button', { name: 'Nächster Monat' }).click(); // November has a reminder in the seed
    await expect(page.getByText('Erinnerungen', { exact: false })).toHaveCount(0);
    await expect(page.locator('#reminders-title')).toHaveCount(0);
    await expect(page.getByText('Jahresabrechnung Strom/Gas/Wiener Netze')).toHaveCount(0);
    // „Kommt bald“ is the first block of the side column now
    await expect(page.locator('aside > section').first()).toHaveAttribute('aria-labelledby', 'upcoming-title');
    await goTo(page, 'einstellungen');
    await expect(page.getByTestId('app-version')).toBeVisible();
    await expect(page.getByText('Erinnerungen', { exact: false })).toHaveCount(0);
  });
});

test.describe('Analyse', () => {
  test('Balkenfarben, Zahlenkarte, Optimierungen, einheitliche Köpfe; gemessen; Screenshots', async ({ page }, info) => {
    await importSprint(page);
    await goTo(page, 'analyse');
    const forecast = page.getByTestId('forecast');
    await expect(forecast.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // forecast: the regular part in one colour (legend „regulär“), the Ø line marks the expensive months
    const fills = await forecast.locator('.bar-recurring .recharts-bar-rectangle path').evaluateAll((ps) =>
      ps.map((p) => p.getAttribute('fill')),
    );
    expect(fills).toEqual(Array(12).fill('var(--chart-accent)'));

    // two-level heading on the forecast; the distribution has only its sum line on top
    await expect(page.getByTestId('forecast-headline-label')).toBeVisible();
    await expect(page.getByTestId('forecast-headline-value')).toBeVisible();
    await expect(page.getByTestId('distribution-headline')).toHaveCount(0);
    await expect(page.getByTestId('distribution-total')).toBeVisible();

    // „Frei verfügbar & Sparquote“ is gone (no actual values any more)
    await expect(page.getByTestId('monthclose')).toHaveCount(0);

    // optimisations („Geplante Änderungen“): „Geplant“ once inside the card, no chip, signed amount
    await expect(page.getByTestId('optimizations-planned-head')).toHaveText('Geplant');
    await expect(page.getByTestId('optimizations').locator('.glass').getByText('Geplant', { exact: false })).toHaveCount(1);
    const row = page.getByTestId('optimizations-planned').locator('li');
    await expect(row).toContainText(eur('Amex Gebühr € 690 → € 717,80'));
    await expect(row).toContainText('ab 06.10.2027');
    await expect(row).toContainText(eur('+€ 27,80 / Jahr'));
    await expect(row.locator('.text-over')).toHaveText(eur('+€ 27,80 / Jahr'));
    await expect(page.getByTestId('optimizations')).not.toContainText('geplant'); // no chip

    // „Details anzeigen“ everywhere, never „Als Tabelle anzeigen“
    await expect(page.getByText('Als Tabelle anzeigen')).toHaveCount(0);
    // empty states: all dashed, same padding and size
    const empties = await page.locator('[data-testid$="-empty"]').evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return [s.borderStyle, s.paddingTop, s.paddingLeft, s.fontSize].join(' ');
      }),
    );
    expect(new Set(empties).size).toBe(1);

    await expectNoWrap(page, '[data-testid$="-headline-label"], [data-testid$="-headline-value"], [data-testid$="-head"]');
    await expectClean(page, 'main');
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-analyse-nachher.png` });
  });
});

test.describe('Analyse ab 3 Monaten (24-Monats-Fixture)', () => {
  test('zweistufige Köpfe, Zeitraum-Umschalter da, runde Y-Achsen-Schritte in Plan vs. Ist', async ({ page }, info) => {
    const { importHistory, openAnalyse } = await import('./analyse-helpers');
    await importHistory(page);
    await openAnalyse(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('range')).toBeVisible();
    await expect(page.getByTestId('monthclose')).toHaveCount(0);
    const plan = page.getByTestId('planactual');
    // y axis: 0 and round steps (multiples of 1 / 2 / 2,5 / 5 × 10ⁿ)
    const ticks = await plan.locator('.recharts-yAxis-tick-labels').first().locator('text').allTextContents();
    const values = ticks.map((t) => {
      const m = t.replace(/\s/g, '').match(/^(−|-)?€?([\d.,]+)(k?)$/)!;
      return (m[1] ? -1 : 1) * parseFloat(m[2]!.replace(/\./g, '').replace(',', '.')) * (m[3] ? 1000 : 1);
    });
    expect(values).toContain(0);
    const step = values[1]! - values[0]!;
    const pow = 10 ** Math.floor(Math.log10(step));
    expect([1, 2, 2.5, 5, 10].map((x) => x * pow)).toContain(step);
    for (const id of ['trend', 'planactual']) {
      await expect(page.getByTestId(`${id}-headline-label`)).toBeVisible();
      await expect(page.getByTestId(`${id}-headline-value`)).toBeVisible();
    }
    await expectNoWrap(page, '[data-testid$="-headline-label"], [data-testid$="-headline-value"]');
    await expectClean(page, 'main');
    await page.waitForTimeout(300);
    await page.locator('main').screenshot({ path: `${DIR}/${info.project.name}-analyse-24m-nachher.png` });
  });
});
