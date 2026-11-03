import type { Locator, Page } from '@playwright/test';
import { liveBackup } from '../tests/fixtures/live';
import { animationsDone, appSettled, expandAll, expect, goTo, test } from './fixtures';
import { NEVER_IN_TOOLTIP, TOOLTIP_TEXTS } from './help-texts';
import { OKT_TODAY } from './live';

// Tooltips statt Erklärtexte: every ⓘ (InfoTip) on every screen opens and closes by tap (iPhone SE,
// iPhone 15), by hover and keyboard (iPad portrait/landscape, desktop 1440; iPad also by tap). The
// popover is always fully inside the viewport and nothing lies on top of it, at the right edge and in
// sheets too. Every tooltip text of the Bestandsaufnahme (e2e/help-texts.ts) is found in a tooltip,
// no warning or error is. Runs in the desktop project; every viewport is its own context.

const VIEWPORTS = {
  'iphone-se': { use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, tap: true, hover: false },
  'iphone-15': { use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, tap: true, hover: false },
  'ipad-portrait': { use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true }, tap: true, hover: true },
  'ipad-landscape': { use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true }, tap: true, hover: true },
  'desktop-1440': { use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, tap: false, hover: true },
} as const;

type Mode = { tap: boolean; hover: boolean };

/** Popover fully inside the viewport, opaque, and nothing (tab bar, sheet) on top of it. */
async function expectInViewport(pop: Locator) {
  const r = await pop.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const points = [
      [b.left + 14, b.top + 14],
      [b.right - 14, b.top + 14],
      [b.left + 14, b.bottom - 14],
      [b.right - 14, b.bottom - 14],
      [b.left + b.width / 2, b.top + b.height / 2],
    ];
    return {
      box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
      inside: b.left >= 0 && b.top >= 0 && b.right <= document.documentElement.clientWidth + 0.5 && b.bottom <= window.innerHeight + 0.5,
      covered: points.filter(([x, y]) => !el.contains(document.elementFromPoint(x!, y!))).length,
    };
  });
  expect(r.inside, `inside the viewport ${r.box.join(',')}`).toBe(true);
  expect(r.covered, 'nothing on top').toBe(0);
}

class Collector {
  texts: string[] = [];
}

/**
 * One ⓘ through every way it opens and closes. `sheet`: it sits in a sheet – Esc closes only the
 * tooltip and the sheet stays.
 */
async function exercise(page: Page, button: Locator, mode: Mode, seen: Collector, sheet?: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.width, 'hit area ≥ 44 px').toBeGreaterThanOrEqual(44);
  expect(box.height, 'hit area ≥ 44 px').toBeGreaterThanOrEqual(44);
  const pop = page.getByRole('tooltip');
  const name = (await button.getAttribute('aria-label')) ?? '';

  if (mode.tap) {
    await button.tap();
    await expect(pop, `${name}: tap opens`).toBeVisible();
    await expect(button).toHaveAttribute('aria-describedby', (await pop.getAttribute('id'))!);
    await expectInViewport(pop);
    seen.texts.push((await pop.textContent()) ?? '');
    await page.waitForTimeout(300); // stays open
    await expect(pop).toBeVisible();
    await button.tap();
    await expect(pop, `${name}: tap again closes`).toHaveCount(0);
    await button.tap();
    await expect(pop).toBeVisible();
    // a tap elsewhere: on the popover's title it stays, next to it it closes
    await pop.locator('p').first().tap();
    await expect(pop).toBeVisible();
    const out = await outsidePoint(page, button, sheet);
    await page.touchscreen.tap(out.x, out.y);
    await expect(pop, `${name}: tap elsewhere closes`).toHaveCount(0);
    if (sheet) await expect(sheet).toBeVisible();
  }

  if (mode.hover) {
    await button.hover();
    await expect(pop, `${name}: hover opens`).toBeVisible();
    await expectInViewport(pop);
    seen.texts.push((await pop.textContent()) ?? '');
    const out = await outsidePoint(page, button, sheet);
    await page.mouse.move(out.x, out.y);
    await expect(pop, `${name}: leaving closes`).toHaveCount(0);

    // keyboard: Tab onto the ⓘ opens, Esc closes, focus stays (and a sheet stays open)
    await focusByTab(page, button);
    await expect(pop, `${name}: keyboard focus opens`).toBeVisible();
    await expectInViewport(pop);
    await page.keyboard.press('Escape');
    await expect(pop, `${name}: Esc closes`).toHaveCount(0);
    await expect(button).toBeFocused();
    if (sheet) await expect(sheet, 'Esc closes the tooltip, not the sheet').toBeVisible();
    // Enter toggles it like a tap; leaving the icon (blur) closes it
    await page.keyboard.press('Enter');
    await expect(pop, `${name}: Enter opens`).toBeVisible();
    await button.evaluate((el) => (el as HTMLElement).blur());
    await expect(pop, `${name}: blur closes`).toHaveCount(0);
  }
}

/**
 * The nearest spot to the button that is not interactive (no button, link, field, tile, tooltip),
 * inside the sheet when there is one (the scrim would close the sheet).
 */
async function outsidePoint(page: Page, button: Locator, sheet?: Locator): Promise<{ x: number; y: number }> {
  const b = (await button.boundingBox())!;
  const vp = page.viewportSize()!;
  const area = sheet ? (await sheet.boundingBox())! : { x: 0, y: 0, width: vp.width, height: vp.height };
  const point = await page.evaluate(
    ({ b, area, vp }) => {
      const interactive = 'button, a, input, select, textarea, summary, label, nav, [role="tooltip"], [role="switch"], [role="radio"], [role="dialog"] [data-sheet-handle]';
      let best: { x: number; y: number; d: number } | null = null;
      const x0 = Math.max(area.x + 4, 2);
      const y0 = Math.max(area.y + 4, 2);
      const x1 = Math.min(area.x + area.width - 4, vp.width - 2);
      const y1 = Math.min(area.y + area.height - 4, vp.height - 2);
      for (let y = y0; y <= y1; y += 12) {
        for (let x = x0; x <= x1; x += 12) {
          // not on the icon itself
          if (x >= b.x - 4 && x <= b.x + b.width + 4 && y >= b.y - 4 && y <= b.y + b.height + 4) continue;
          // touch adjustment snaps a tap to a nearby target: the whole neighbourhood must be neutral
          const around = [
            [0, 0], [-20, 0], [20, 0], [0, -20], [0, 20], [-14, -14], [14, -14], [-14, 14], [14, 14],
          ].map(([dx, dy]) => document.elementFromPoint(x + dx!, y + dy!));
          if (around.some((el) => !el || el.closest(interactive) || el.closest('.glass-tile, [data-testid="hero"]'))) continue;
          const d = Math.hypot(x - (b.x + b.width / 2), y - (b.y + b.height / 2));
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best;
    },
    { b, area, vp },
  );
  if (!point) throw new Error('no neutral spot next to the ⓘ');
  return { x: point.x, y: point.y };
}

/** Tab through the page until `target` has the focus (keyboard focus, :focus-visible). */
async function focusByTab(page: Page, target: Locator) {
  const handle = await target.elementHandle();
  // start from no focus: a focus left by a tap is not keyboard focus
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate((el) => document.activeElement === el, handle)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('ⓘ not reachable by Tab');
}

const info = (scope: Page | Locator, name: string) => scope.getByRole('button', { name: `Erklärung: ${name}`, exact: true });

for (const [vp, { use, tap, hover }] of Object.entries(VIEWPORTS)) {
  test.describe(`Tooltips · ${vp}`, () => {
    test.use(use);
    test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));

    test('jedes ⓘ öffnet und schließt, Popover im Viewport; Tabelle: Tooltip-Texte im Tooltip, keine Warnung', async ({ page }) => {
      test.setTimeout(300_000);
      const mode = { tap, hover };
      const seen = new Collector();

      // --- Einrichtung (empty database): three steps
      await page.clock.setFixedTime(OKT_TODAY);
      await page.goto('/');
      const setup = page.getByTestId('setup-dialog');
      await expect(setup).toBeVisible();
      await exercise(page, info(page, 'Daten importieren'), mode, seen);
      await page.getByTestId('setup-new').click();
      await exercise(page, info(page, 'Wo wohnst du?'), mode, seen);
      await page.getByTestId('setup-next').click();
      await exercise(page, info(page, 'Was zahlst du nicht monatlich?'), mode, seen);

      // --- live data, Fixkostenkonto on
      await page.goto('/');
      await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(liveBackup())) });
      await expect(page.getByTestId('hero')).toBeVisible();
      await appSettled(page);
      await page.getByTestId('konto-invite-enable').click();
      await expect(page.getByTestId('konto-tile')).toBeVisible();

      // --- Monat
      await exercise(page, info(page, 'Abzüge vom Netto'), mode, seen);
      if (await info(page, 'im Ø-Monat').count()) await exercise(page, info(page, 'im Ø-Monat'), mode, seen);
      await exercise(page, info(page, 'Dauerauftrag'), mode, seen);

      // --- Fixkostenkonto-Sheet
      await page.getByTestId('konto-tile').click();
      const kontoSheet = page.getByTestId('bottom-sheet');
      await animationsDone(page, 'bottom-sheet');
      await exercise(page, info(kontoSheet, 'Kontostand am Monatsende'), mode, seen, kontoSheet);
      await kontoSheet.getByTestId('konto-settings-inline').locator('summary').click();
      await exercise(page, info(kontoSheet, 'Kontostand heute'), mode, seen, kontoSheet);
      await kontoSheet.getByTestId('konto-positions').locator('summary').click();
      await exercise(page, info(kontoSheet, 'Im Dauerauftrag'), mode, seen, kontoSheet);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // one-time Vermögensaufbau on the month screen: „Von ‚Frei verfügbar‘ abziehen“
      const form = page.getByTestId('bottom-sheet');
      await expandAll(page);
      await page.getByRole('button', { name: 'Miete Nord – Details', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
      await expect(page.getByTestId('position-form')).toBeVisible();
      await animationsDone(page, 'bottom-sheet');
      await exercise(page, info(form, 'Von ‚Frei verfügbar‘ abziehen'), mode, seen, form);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Einmalbetrag
      await page.getByRole('button', { name: 'Strom – Details', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Einmalbetrag hinzufügen' }).click();
      await animationsDone(page, 'bottom-sheet');
      await exercise(page, info(form, 'Betrag'), mode, seen, form);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // --- Bearbeiten-Dialog: account, Startmonat, Fälligkeitstag (annual position)
      await goTo(page, 'positionen');
      await expandAll(page);
      await page.getByRole('button', { name: 'Steuerberater – Details' }).click();
      await page.getByRole('button', { name: 'Bearbeiten' }).click();
      await expect(page.getByTestId('position-form')).toBeVisible();
      await animationsDone(page, 'bottom-sheet');
      await exercise(page, info(form, 'Von welchem Konto geht das weg?'), mode, seen, form);
      await exercise(page, info(form, 'Startmonat'), mode, seen, form);
      await exercise(page, info(form, 'Fälligkeitstag'), mode, seen, form);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // --- Analyse
      await goTo(page, 'analyse');
      await exercise(page, info(page.getByTestId('konto-analyse'), 'Kontostand am Monatsende'), mode, seen);

      // --- Einstellungen
      await goTo(page, 'einstellungen');
      for (const name of ['Neuer Monat beginnt am', 'Fixkostenkonto verwenden', 'Kontostand heute', 'Design', 'Erbse wie eine App öffnen', 'Sicherung', 'Land und Währung']) {
        await exercise(page, info(page, name), mode, seen);
      }

      // --- Tabelle: every tooltip text is in a tooltip, no warning or error is
      const all = seen.texts.join('\n');
      for (const row of TOOLTIP_TEXTS) {
        expect(row.texts.some((t) => all.includes(t)), `${row.screen}: „${row.texts[0]}“ im Tooltip`).toBe(true);
      }
      for (const warning of NEVER_IN_TOOLTIP) {
        expect(all.includes(warning), `Warnung/Fehler „${warning}“ nicht im Tooltip`).toBe(false);
      }
      // and none of those explanations is still visible as text on its screen (spot check on the settings)
      await expect(page.getByTestId('month-settings')).not.toContainText('Ab diesem Tag öffnet Erbse');
      await expect(page.getByTestId('backup-section')).not.toContainText('Deine Daten liegen nur auf diesem Gerät');
    });

    test('Popover am rechten Rand und über der Tab-Bar: komplett im Viewport, nichts darüber', async ({ page }) => {
      await page.clock.setFixedTime(OKT_TODAY);
      await page.goto('/');
      await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(liveBackup())) });
      await expect(page.getByTestId('hero')).toBeVisible();
      await appSettled(page);
      await page.getByTestId('konto-invite-enable').click();
      const pop = page.getByRole('tooltip');
      const open = async (button: Locator) => (tap ? button.tap() : button.hover());
      // the tile ⓘ moved to the very right edge, then to the bottom right corner (over the tab bar)
      for (const where of ['right: 0; top: 40%', 'right: 0; bottom: 0']) {
        const style = await page.addStyleTag({
          content: `[data-testid="konto-tile-info"] { position: fixed !important; ${where.replace(/;/g, ' !important;')} !important; left: auto !important; margin: 0 !important; z-index: 70 !important; }`,
        });
        const button = page.getByTestId('konto-tile-info');
        await open(button);
        await expect(pop).toBeVisible();
        await expectInViewport(pop);
        await page.keyboard.press('Escape');
        await expect(pop).toHaveCount(0);
        await style.evaluate((el) => (el as Element).remove());
      }
      // in a sheet: the ⓘ at the right edge of the sheet
      await page.getByTestId('konto-tile').click();
      await animationsDone(page, 'bottom-sheet');
      const sheet = page.getByTestId('bottom-sheet');
      await page.addStyleTag({
        content: '[data-testid="konto-assumption"] { position: fixed !important; right: 0 !important; bottom: 0 !important; margin: 0 !important; z-index: 70 !important; }',
      });
      await open(sheet.getByTestId('konto-assumption'));
      await expect(pop).toBeVisible();
      await expectInViewport(pop);
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
      await expect(sheet).toBeVisible();
    });
  });
}
