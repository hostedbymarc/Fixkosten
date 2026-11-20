import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { animationsDone, appSettled, closeWalkthrough, expect, FIXTURE, goTo, setUpKonto, test, TODAY } from './fixtures';

// spielgeld-planer (seed data, today 5 October 2026 → October active):
// - „Dein Spielgeld“ (only the active month, only with „Fixkosten einplanen“): without a salary the hint
//   with a button; with it „Bis {Monat} möglich“ / „Ab {Monat} möglich“ while the extra runs. A tap on the
//   big amount makes it editable (Enter or a tap outside saves, Esc cancels); typing and the slider change
//   the status at once („Passt.“ / „Zu viel.“). Kept after a reload, the same value in the settings.
// - „Auf einmal“: the one-time amount is taken off in the month it is due by; confirmed, it is gone.
// - Every amount field shows the thousands dot while typing; pasting „1200“ or „1.200,50“ works.
// - „Nicht einplanen“ in the edit dialog: the hero's sum drops at once, the position stays visible and
//   tickable with a chip „nicht eingeplant“; switched off again it is „Direkt“ and counts again.
// iPhone SE, iPhone 15, iPad portrait/landscape, desktop 1440 × light/dark; screenshots to
// docs/screenshots/spielgeld-planer/. Runs in the desktop project; every viewport is its own context.

const DIR = 'docs/screenshots/spielgeld-planer';
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
const EUR = '€\\s[\\d.]+,\\d{2}';

async function shot(page: Page, name: string, target?: Locator) {
  if (await page.getByTestId('bottom-sheet').isVisible()) await animationsDone(page, 'bottom-sheet');
  if (target) await target.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

async function sheetIn(page: Page) {
  await expect(page.getByTestId('bottom-sheet').last()).toBeVisible();
  await expect(page.getByTestId('bottom-sheet').last()).not.toHaveAttribute('data-animating', '');
}

async function start(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await page.getByTestId('konto-invite-enable').click();
}

for (const [vp, use] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${vp}-${scheme === 'light' ? 'hell' : 'dunkel'}`;
    test.describe(`Spielgeld-Planer · ${vp} · ${scheme}`, () => {
      test.use({ ...use, colorScheme: scheme });
      test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'eigene Viewports, läuft im Projekt desktop'));
      test.setTimeout(180_000);
      const tap = (l: Locator) => (use.hasTouch ? l.tap() : l.click());

      test('„Dein Spielgeld“: ohne Netto, passt, zu viel; Regler und Betragsfeld ändern den Status sofort', async ({ page }) => {
        await start(page);
        // set up without an account, € 184,21, spread: an extra runs until February
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

        // without a salary: the hint and a button
        const card = page.getByTestId('spielgeld-plan');
        await expect(card).toHaveAttribute('data-state', 'no-salary');
        await expect(page.getByTestId('spielgeld-plan-empty')).toHaveText('Trag dein Netto-Gehalt ein, dann rechnet Erbse dein Spielgeld.');
        await shot(page, `${tag}-01-dein-spielgeld-ohne-netto`, card);
        await tap(page.getByTestId('spielgeld-plan-enter'));
        const close = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
        await sheetIn(page);
        await close.getByLabel('Netto-Gehalt').fill('8.302');
        await tap(close.getByRole('button', { name: 'Speichern' }));
        await expect(close).toBeHidden();

        // with the salary: two lines while the extra runs, the tip, the calculation of the first month
        await expect(card).toHaveAttribute('data-state', 'none');
        await expect(page.getByTestId('spielgeld-plan-until')).toHaveText(new RegExp(`^Bis [A-ZÄÖÜ][a-zäöü]+ möglich: ${EUR}$`));
        await expect(page.getByTestId('spielgeld-plan-from')).toHaveText(new RegExp(`^Ab [A-ZÄÖÜ][a-zäöü]+ möglich: ${EUR}$`));
        await expect(page.getByTestId('spielgeld-plan-tip')).toHaveText(/^Bis [A-ZÄÖÜ][a-zäöü]+ kannst du dir bis zu €\s[\d.]+ Spielgeld erlauben\. Ab [A-ZÄÖÜ][a-zäöü]+ bis zu €\s[\d.]+\.$/);
        await expect(page.getByTestId('spielgeld-plan-calc')).toContainText(/^Gerechnet mit: Netto €\s8\.302,00 − Zur Seite €\s[\d.]+,\d{2} − Direkt €\s[\d.]+,\d{2} − Vermögensaufbau €\s[\d.]+,\d{2}/);
        const until = amountOf((await page.getByTestId('spielgeld-plan-until').textContent())!.split(':')[1]!);
        // the tip: rounded down to € 50
        const tip = amountOf((await page.getByTestId('spielgeld-plan-tip').textContent())!.match(/bis zu (€\s[\d.]+)/)![1]!);
        expect(tip).toBe(Math.floor(until / 50) * 50);

        // a tap on the big amount makes it editable (no second field in the card): typed digit by digit the
        // thousands dot comes at once, the status follows while typing, Enter saves
        await expect(card.getByLabel('Spielgeld pro Monat', { exact: true }).and(page.locator('input:not([type=range])'))).toHaveCount(0);
        const amount = page.getByTestId('spielgeld-plan-amount');
        await tap(amount);
        const input = page.getByTestId('spielgeld-plan-input');
        await expect(input).toBeFocused();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('1200');
        await expect(input).toHaveValue('1.200');
        const status = page.getByTestId('spielgeld-plan-status');
        await expect(status).toHaveAttribute('data-status', 'ok', { timeout: 200 });
        await shot(page, `${tag}-06-betrag-bearbeiten`, card);
        await page.keyboard.press('Enter');
        await expect(input).toHaveCount(0);
        await expect(amount).toHaveText(/^€\s1\.200,00$/);
        await expect(status).toHaveText(new RegExp(`^Passt\\. Du schaffst jeden Monat die ${EUR} bis [A-ZÄÖÜ][a-zäöü]+\\. Es bleiben dir ${EUR} übrig\\.$`));
        const left = amountOf((await status.textContent())!.match(/Es bleiben dir (€\s[\d.]+,\d{2})/)![1]!);
        expect(left).toBeCloseTo(until - 1200, 2);
        await shot(page, `${tag}-02-dein-spielgeld-passt`, card);

        // the slider (keyboard: to the end) → „Zu viel.“ at once
        const slider = page.getByTestId('spielgeld-plan-slider');
        const max = Number(await slider.getAttribute('max'));
        await slider.focus();
        await page.keyboard.press('End');
        await expect(status).toHaveAttribute('data-status', 'over', { timeout: 200 });
        await expect(status).toHaveText(new RegExp(`^Zu viel\\. Bis [A-ZÄÖÜ][a-zäöü]+ fehlen dir jeden Monat ${EUR} für deine Rücklage\\.$`));
        // the range stays the same while dragging (it does not grow with the value)
        expect(Number(await slider.getAttribute('max'))).toBe(max);
        await expect.poll(async () => amountOf((await amount.textContent())!)).toBe(max);
        // one step back: € 50 less
        await page.keyboard.press('ArrowLeft');
        await expect.poll(async () => amountOf((await amount.textContent())!)).toBe(max - 50);
        await shot(page, `${tag}-03-dein-spielgeld-zu-viel`, card);

        // Esc: nothing changes
        await tap(amount);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('9');
        await expect(status).toHaveAttribute('data-status', 'ok');
        await page.keyboard.press('Escape');
        await expect(input).toHaveCount(0);
        await expect.poll(async () => amountOf((await amount.textContent())!)).toBe(max - 50);
        await expect(status).toHaveAttribute('data-status', 'over');

        // pasted with cents, saved by a tap outside; kept after a reload, the same value in the settings
        await tap(amount);
        await input.fill('1.200,50');
        await expect(input).toHaveValue('1.200,50');
        await expect(status).toHaveAttribute('data-status', 'ok');
        await tap(page.getByRole('heading', { level: 1 }));
        await expect(input).toHaveCount(0);
        await expect(amount).toHaveText(/^€\s1\.200,50$/);
        await page.waitForTimeout(300);
        await page.reload();
        await expect(page.getByTestId('hero')).toBeVisible();
        await appSettled(page);
        await expect(page.getByTestId('spielgeld-plan-amount')).toHaveText(/^€\s1\.200,50$/);
        await expect(page.getByTestId('spielgeld-plan-status')).toHaveAttribute('data-status', 'ok');
        // the split shows the planned Spielgeld
        await expect(page.getByTestId('split-spielgeld-value')).toHaveText(/^€\s1\.200,50$/);
        await goTo(page, 'einstellungen');
        const setting = page.getByTestId('konto-spielgeld');
        await expect(setting).toHaveValue('1.200,50');
        // every amount field: the thousands dot while typing; pasting „1200“ works
        await setting.focus();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('25000');
        await expect(setting).toHaveValue('25.000');
        await setting.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await shot(page, `${tag}-08-eingabe-tausenderpunkt`);
        await setting.fill('1200');
        await expect(setting).toHaveValue('1.200');
        // another month: no card
        await goTo(page, 'monat');
        await tap(page.getByRole('button', { name: 'Nächster Monat' }));
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('November 2026');
        await expect(page.getByTestId('spielgeld-plan')).toHaveCount(0);
      });

      test('„Auf einmal“: Einmalbetrag im Fälligkeitsmonat; bestätigt fällt er weg', async ({ page }) => {
        test.skip(scheme === 'dark' && vp !== 'iphone-15' && vp !== 'desktop-1440', 'Logik, Screenshot in dunkel nur iPhone 15 und Desktop');
        await start(page);
        // set up without an account, € 184,21, „auf einmal“
        await tap(page.getByTestId('konto-tile-start'));
        await sheetIn(page);
        await tap(page.getByTestId('konto-setup-account-no'));
        await page.getByTestId('konto-setup-balance').fill('184,21');
        await tap(page.getByTestId('konto-setup-next'));
        await expect(page.getByTestId('konto-setup')).toHaveAttribute('data-step', 'gap');
        await tap(page.getByTestId('konto-setup-gap-lump'));
        await tap(page.getByTestId('konto-setup-finish'));
        await closeWalkthrough(page);
        await expect(page.getByTestId('konto-setup')).toHaveCount(0);
        await tap(page.getByTestId('spielgeld-plan-enter'));
        const close = page.getByRole('dialog', { name: 'Monatsabschluss Oktober 2026' });
        await sheetIn(page);
        await close.getByLabel('Netto-Gehalt').fill('8.302');
        await tap(close.getByRole('button', { name: 'Speichern' }));
        await expect(close).toBeHidden();

        // „Bis {Monat} möglich“ with the one-time amount, „Ab {Folgemonat}“ without it
        const card = page.getByTestId('spielgeld-plan');
        const until = page.getByTestId('spielgeld-plan-until');
        await expect(until).toContainText(new RegExp(`^Bis [A-ZÄÖÜ][a-zäöü]+ möglich: ${EUR}`));
        await expect(page.getByTestId('spielgeld-plan-lump')).toHaveText(new RegExp(`^Darin: einmalig ${EUR} bis .+\\.$`));
        await expect(page.getByTestId('spielgeld-plan-from')).toHaveText(new RegExp(`^Ab [A-ZÄÖÜ][a-zäöü]+ möglich: ${EUR}$`));
        const lump = amountOf((await page.getByTestId('spielgeld-plan-lump').textContent())!.match(new RegExp(EUR))![0]);
        const a = amountOf((await until.textContent())!.match(new RegExp(`möglich: (${EUR})`))![1]!);
        const b = amountOf((await page.getByTestId('spielgeld-plan-from').textContent())!.split(':')[1]!);
        // the month with the one-time amount: exactly that much less (the same salary and parts)
        expect(b - a).toBeCloseTo(lump, 2);
        await tap(page.getByTestId('spielgeld-plan-amount'));
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('1200');
        await page.keyboard.press('Enter');
        const status = page.getByTestId('spielgeld-plan-status');
        await expect(status).toHaveText(new RegExp(`^Passt\\. Du schaffst die ${EUR} auf einmal bis [A-ZÄÖÜ][a-zäöü]+\\. Es bleiben dir ${EUR} übrig\\.$`));
        await shot(page, `${tag}-07-dein-spielgeld-auf-einmal`, card);

        // confirmed as set aside: gone, one line „Möglich“ as without a gap
        const confirm = page.getByTestId('tile-confirm');
        for (let i = 0; i < 2 && (await confirm.getAttribute('data-confirm')) !== 'lump'; i++) await tap(confirm);
        await expect(confirm).toHaveAttribute('data-confirm', 'lump');
        await tap(confirm);
        await expect(page.getByTestId('spielgeld-plan-lump')).toHaveCount(0);
        await expect(page.getByTestId('spielgeld-plan-until')).toHaveCount(0);
        await expect(page.getByTestId('spielgeld-plan-from')).toHaveText(new RegExp(`^Möglich: ${EUR}$`));
        expect(amountOf((await page.getByTestId('spielgeld-plan-from').textContent())!.split(':')[1]!)).toBeCloseTo(b, 2);
      });

      test('„Nicht einplanen“ ändert die Hero-Summe sofort; sichtbar, abhakbar, Chip; aus → „Direkt“', async ({ page }) => {
        test.skip(scheme === 'dark' && vp !== 'iphone-15' && vp !== 'desktop-1440', 'Logik, Screenshot in dunkel nur iPhone 15 und Desktop');
        await start(page);
        await setUpKonto(page);
        const total = amountOf((await page.getByTestId('hero-planned').textContent())!);

        // Miete (€ 1.008, paid in October) → „Nicht einplanen“
        await goTo(page, 'positionen');
        await tap(page.getByRole('button', { name: 'Miete – Details' }));
        await sheetIn(page);
        await tap(page.getByRole('button', { name: 'Bearbeiten' }));
        await sheetIn(page);
        const unplanned = page.getByTestId('unplanned-field');
        await unplanned.scrollIntoViewIfNeeded();
        await expect(unplanned).toContainText('Nicht einplanen');
        await tap(page.getByTestId('unplanned-field-switch'));
        await expect(page.getByTestId('unplanned-field-switch')).toHaveAttribute('aria-checked', 'true');
        // not planned: no „Rücklage | Direkt“
        await expect(page.getByTestId('account-field')).toHaveCount(0);
        await shot(page, `${tag}-04-nicht-einplanen`, unplanned);
        await tap(page.getByRole('button', { name: 'Speichern' }));
        await expect(page.getByTestId('position-form')).toHaveCount(0);
        await sheetIn(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const row = page.locator('[data-testid=position-list-row]', { hasText: 'Miete' }).first();
        await expect(row.getByTestId('account-chip')).toHaveText('nicht eingeplant');

        // month: the sum without the Miete, at once; the row stays, muted, with the chip, and can be ticked
        await goTo(page, 'monat');
        await expect.poll(async () => amountOf((await page.getByTestId('hero-planned').textContent())!)).toBeCloseTo(total - 1008, 2);
        const sum = await page.getByTestId('hero-sources').locator('[data-testid$="-value"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
        expect(sum.reduce((a, x) => a + amountOf(x), 0)).toBeCloseTo(total - 1008, 2);
        const miete = page.locator('[data-position="pos-miete"]').first();
        // „Wohnen & Leben“ is fully paid: it starts collapsed
        const wohnen = page.getByRole('region', { name: 'Wohnen & Leben' });
        if (!(await miete.getByTestId('toggle-paid').isVisible())) await tap(wohnen.getByRole('button', { name: /^Wohnen & Leben/ }).first());
        await expect(miete).toHaveAttribute('data-unplanned', 'true');
        await expect(miete.getByTestId('unplanned-chip')).toHaveText('nicht eingeplant');
        await miete.scrollIntoViewIfNeeded();
        await tap(miete.getByTestId('toggle-paid'));
        await expect(miete).toHaveAttribute('data-status', 'open');
        // ticking it does not move the hero
        await expect.poll(async () => amountOf((await page.getByTestId('hero-planned').textContent())!)).toBeCloseTo(total - 1008, 2);
        await shot(page, `${tag}-05-monat-nicht-eingeplant`, miete);

        // switched off again: „Direkt“, it counts again
        await goTo(page, 'positionen');
        await tap(page.getByRole('button', { name: 'Miete – Details' }));
        await sheetIn(page);
        await tap(page.getByRole('button', { name: 'Bearbeiten' }));
        await sheetIn(page);
        await tap(page.getByTestId('unplanned-field-switch'));
        await expect(page.getByTestId('account-field').getByRole('radio', { name: 'Direkt' })).toHaveAttribute('aria-checked', 'true');
        await tap(page.getByRole('button', { name: 'Speichern' }));
        await expect(page.getByTestId('position-form')).toHaveCount(0);
        await sheetIn(page);
        await page.keyboard.press('Escape');
        await expect(row.getByTestId('account-chip')).toHaveText('Direkt');
        await goTo(page, 'monat');
        await expect.poll(async () => amountOf((await page.getByTestId('hero-planned').textContent())!)).toBeCloseTo(total, 2);
        await expect(page.getByTestId('hero-source-salary')).toContainText('Direkt bezahlt');
      });
    });
  }
}
