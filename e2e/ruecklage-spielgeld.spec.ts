import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, closeWalkthrough, expect, FIXTURE, goTo, test, TODAY } from './fixtures';

// ruecklage-spielgeld (seed data, today 5 October 2026 → October active; Miete € 1.008 monthly):
// - without „Fixkosten einplanen“: „Ø pro Monat“ and „Frei verfügbar“ as before, no source lines in the hero
// - with it: „So teilt sich dein Gehalt“ instead of both, the hero says what pays the Fixkosten
// - Miete → „Spielgeld“ in the edit dialog: chip „Spielgeld“, hero line „aus Spielgeld“
// - Spielgeld € 500 in the settings: the card on the month screen, € 508 above it, „Woher kommt der Rest?“
//   – „Aus dem Überschuss“ (default) is a line of the split, „Andere Quelle“ removes it, at once
// - the tile with „auf einmal“: two fields and the advice
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/ruecklage-spielgeld/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/ruecklage-spielgeld';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  'desktop-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

/** „€ 1.008,00“ → 1008 */
const amountOf = (text: string) => Number(text.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.'));
const money = (s: string) => new RegExp(`^${s.replace(/ /g, '\\s').replace(/[.]/g, '\\.')}$`);

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  if (target) await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

/** the sheet rests (a tap while it slides in can land on the scrim) */
async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Rücklage und Spielgeld · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('Gehalts-Aufteilung, Spielgeld, Überzug, Hero nach Quelle, Kachel mit Empfehlung', async ({ page }) => {
        await page.clock.setFixedTime(TODAY);
        await page.goto('/');
        await expect(page.getByTestId('setup-dialog')).toBeVisible();
        await page.getByTestId('import-file').setInputFiles(FIXTURE);
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);

        // without „Fixkosten einplanen“: everything as before
        await expect(page.getByTestId('free-tile')).toBeVisible();
        await expect(page.getByTestId('kpi-hint')).toBeVisible();
        await expect(page.getByTestId('hero-sources')).toHaveCount(0);
        await expect(page.getByTestId('salary-split')).toHaveCount(0);

        // on, set up (no account, € 184,21, spread)
        await page.getByTestId('konto-invite-enable').click();
        await tap(page.getByTestId('konto-tile-start'));
        await sheetIn(page);
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'gap');
        await tap(page.getByTestId('konto-setup-gap-spread'));
        await tap(page.getByTestId('konto-setup-finish'));
        await closeWalkthrough(page);
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);

        // „Frei verfügbar“ and „Ø pro Monat“ are gone, the split asks for the salary
        await expect(page.getByTestId('free-tile')).toHaveCount(0);
        await expect(page.getByTestId('kpi-hint')).toHaveCount(0);
        const split = page.getByTestId('salary-split');
        await expect(page.getByTestId('salary-split-empty')).toBeVisible();
        await tap(page.getByTestId('salary-split-enter'));
        const close = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
        await sheetIn(page);
        await close.getByLabel('Netto-Gehalt').fill('8.302');
        await tap(close.getByRole('button', { name: 'Speichern' }));
        await expect(close).toBeHidden();
        await expect(page.getByTestId('split-salary')).toHaveText(money('€ 8.302,00'));
        await expect(split).toContainText('Gehalt am 1. Oktober');
        await expect(split).toContainText('= Bleibt dir');
        // hero: everything from the Rücklage, A + B + C = Fixkosten
        await expect(page.getByTestId('hero-source-reserve')).toHaveText(/^aus deiner Rücklage €\s[\d.]+,\d{2}$/);
        await expect(page.getByTestId('hero-source-spielgeld')).toHaveCount(0);

        // Miete → Spielgeld (edit dialog): chip „Spielgeld“
        await goTo(page, 'positionen');
        await tap(page.getByRole('button', { name: 'Miete – Details' }));
        await sheetIn(page);
        await tap(page.getByRole('button', { name: 'Bearbeiten' }));
        await sheetIn(page);
        const field = page.getByTestId('account-field');
        await expect(field).toContainText('Woraus zahlst du das?');
        await field.scrollIntoViewIfNeeded();
        await tap(field.getByRole('radio', { name: 'Spielgeld' }));
        await expect(field.getByRole('radio', { name: 'Spielgeld' })).toHaveAttribute('aria-checked', 'true');
        await shot(page, `${tag}-01-woraus-zahlst-du`);
        await tap(page.getByRole('button', { name: 'Speichern' }));
        await expect(page.getByTestId('position-form')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const chip = page.locator('[data-testid=position-list-row]', { hasText: 'Miete' }).first().getByTestId('account-chip');
        await expect(chip).toHaveText('Spielgeld');
        await shot(page, `${tag}-02-chip-spielgeld`, chip);

        // Spielgeld € 500 in the settings
        await goTo(page, 'einstellungen');
        const spiel = page.getByLabel('Spielgeld pro Monat');
        await spiel.scrollIntoViewIfNeeded();
        await spiel.fill('500,00');
        await shot(page, `${tag}-03-einstellungen-spielgeld`, spiel);

        // month: the card, € 508 above it, default „Aus dem Überschuss“
        await goTo(page, 'monat');
        const card = page.getByTestId('spielgeld-card');
        await expect(card).toContainText('Spielgeld Oktober');
        await expect(page.getByTestId('spielgeld-spent')).toHaveText(money('€ 1.008,00'));
        await expect(page.getByTestId('spielgeld-limit')).toHaveText(money('€ 500,00'));
        await expect(page.getByTestId('spielgeld-items')).toContainText('Miete');
        await expect(page.getByTestId('spielgeld-over-text')).toHaveText(money('€ 508,00 über dem Spielgeld'));
        const overflow = page.getByTestId('spielgeld-overflow');
        await expect(overflow).toContainText('Woher kommt der Rest?');
        await expect(overflow.getByRole('radio', { name: 'Aus dem Überschuss' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('hero-source-spielgeld')).toHaveText(/^aus Spielgeld €\s1\.008,00$/);
        await expect(page.getByTestId('split-overflow-value')).toHaveText(money('€ 508,00'));
        await expect(split).toContainText('= Überschuss');
        const restSurplus = amountOf((await page.getByTestId('split-rest').textContent())!);
        await shot(page, `${tag}-04-gehalt-aufteilung`, split);
        await shot(page, `${tag}-05-spielgeld-ueberzug`, card);

        // „Andere Quelle“: the overflow line goes, the Überschuss rises by € 508 – at once
        await tap(overflow.getByRole('radio', { name: 'Andere Quelle (z. B. Mieteinnahmen)' }));
        await expect(overflow.getByRole('radio', { name: 'Andere Quelle (z. B. Mieteinnahmen)' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('split-overflow')).toHaveCount(0);
        await expect.poll(async () => amountOf((await page.getByTestId('split-rest').textContent())!)).toBeCloseTo(restSurplus + 508, 2);

        // the tile: „auf einmal“ → two fields, the reason, the advice after the Spielgeld
        const tile = page.getByTestId('konto-tile-card');
        await tile.scrollIntoViewIfNeeded();
        if ((await tile.getAttribute('data-view')) === 'spread') await tap(page.getByTestId('tile-switch'));
        await expect(tile).toHaveAttribute('data-view', 'lump');
        await expect(page.getByTestId('tile-monthly')).toContainText('jeden Monat am 1.');
        await expect(page.getByTestId('tile-once')).toContainText(/einmalig/);
        await expect(page.getByTestId('tile-lump-done')).toHaveText('Einmalbetrag zur Seite gelegt');
        const advice = page.getByTestId('tile-advice');
        await expect(advice).toHaveText(/^Nach deinem Spielgeld bleiben €\s[\d.]+,\d{2}\. (Du kannst die €\s[\d.]+,\d{2} auf einmal zur Seite legen\.|Leg die €\s[\d.]+,\d{2} lieber verteilt zur Seite\.)$/);
        await shot(page, `${tag}-06-kachel-auf-einmal`, tile);
        await shot(page, `${tag}-07-hero-quellen`, page.getByTestId('hero'));
      });
    });
  }
}
