import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup, type BackupFile } from '../src/db/backup';
import { withNovember } from '../tests/fixtures/november';
import { eur, expect, FIXTURE, goTo, isTouchProject, test } from './fixtures';
import { expectClean } from './measure';

/** Today = 10.11.2026: the app opens November (golden fixture, Netto 7.819). */
const NOV_TODAY = new Date('2026-11-10T10:00:00+01:00');

async function importNovember(page: Page, edit: (b: BackupFile) => void = () => {}) {
  await page.clock.setFixedTime(NOV_TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = withNovember(parseBackup(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
  edit(backup);
  await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByTestId('hero')).toBeVisible();
}

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('Hero: Abzüge vom Netto', () => {
  test('€ 6.449 = € 5.649 Fixkosten + € 800 Vermögensaufbau; Ring, abgebucht, offen unverändert', async ({ page }) => {
    await importNovember(page);
    await expect(page.getByTestId('hero-deductions-value')).toHaveText(eur('€ 6.449'));
    await expect(page.getByTestId('hero-deductions-breakdown')).toHaveText(eur('€ 5.649 Fixkosten + € 800 Vermögensaufbau'));
    // unchanged: only Fixkosten
    await expect(page.getByTestId('hero-paid')).toHaveText(eur('€ 450'));
    await expect(page.getByTestId('hero-planned')).toHaveText(eur('€ 5.649'));
    await expect(page.getByTestId('hero-open')).toHaveText(eur('14 offen · € 5.199'));
    await expect(page.getByRole('img', { name: '8 Prozent abgebucht' })).toBeVisible();
    // Netto − Abzüge = Frei verfügbar
    await expect(page.getByTestId('salary-value')).toHaveText(eur('€ 7.819'));
    await expect(page.getByTestId('free-value')).toHaveText(eur('€ 1.370'));

    const icon = page.getByRole('button', { name: 'Erklärung: Abzüge vom Netto' });
    await (isTouchProject() ? icon.tap() : icon.hover());
    await expect(page.getByTestId('hero-deductions-formula')).toHaveText(eur('Netto € 7.819 − Abzüge € 6.449 = Frei verfügbar € 1.370'));
    const tip = await box(page, 'hero-deductions-info-popover');
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('ohne Netto: Zahl bleibt € 6.449, Rechnung im ⓘ ohne Netto', async ({ page }) => {
    await importNovember(page, (b) => {
      b.data.monthClose = b.data.monthClose.filter((m) => m.period !== '2026-11');
    });
    await expect(page.getByTestId('hero-deductions-value')).toHaveText(eur('€ 6.449'));
    await expect(page.getByTestId('free-value')).not.toHaveText(eur('€ 1.370'));
    const icon = page.getByRole('button', { name: 'Erklärung: Abzüge vom Netto' });
    await (isTouchProject() ? icon.tap() : icon.hover());
    await expect(page.getByTestId('hero-deductions-formula')).toHaveText(eur('€ 5.649 Fixkosten + € 800 Vermögensaufbau = € 6.449'));
  });

  for (const dark of [false, true]) {
    test(`Layout ${dark ? 'dunkel' : 'hell'}: iPhone eigene Zeile, ab iPad rechts; nichts abgeschnitten`, async ({ page }) => {
      if (dark) await page.emulateMedia({ colorScheme: 'dark' });
      await importNovember(page);
      const hero = await box(page, 'hero');
      const paid = await box(page, 'hero-open');
      const deductions = await box(page, 'hero-deductions');
      const value = await box(page, 'hero-deductions-value');
      const width = page.viewportSize()!.width;
      if (width < 768) {
        expect(deductions.y, 'below ring and amount').toBeGreaterThanOrEqual(paid.y + paid.height);
      } else {
        expect(deductions.x, 'right of ring and amount').toBeGreaterThan(paid.x + paid.width);
        expect(Math.abs(deductions.y + deductions.height / 2 - (hero.y + hero.height / 2)), 'vertically centred').toBeLessThan(12);
      }
      expect(value.x + value.width).toBeLessThanOrEqual(hero.x + hero.width);
      // breakdown on one line where it fits (always from iPad on)
      if (width >= 768) {
        const line = page.getByTestId('hero-deductions-breakdown');
        const [h, lh] = await line.evaluate((e) => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).lineHeight)]);
        expect(Math.round(h / lh)).toBe(1);
      }
      await expectClean(page, '[data-testid="hero"]');
    });
  }
});

test.describe('Analyse: Jahresvorschau, Plan vs. Ist, Geplante Änderungen', () => {
  test('Legende „regulär“ und „Ø pro Monat (heute)“, Zeitraum unter der Überschrift', async ({ page }) => {
    await importNovember(page);
    await goTo(page, 'analyse');
    const legend = page.getByTestId('forecast-legend');
    await expect(legend).toContainText('regulär');
    await expect(legend).toContainText('Ø pro Monat (heute)');
    await expect(legend).not.toContainText('über Ø');
    // today = November → November + 11
    await expect(page.getByTestId('forecast-period')).toHaveText(eur('Nov 2026 – Okt 2027'));
    const title = await page.locator('#forecast-title').boundingBox();
    const period = await box(page, 'forecast-period');
    expect(period.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1);
  });

  test('Plan vs. Ist: Plan und Ist einer Zeile in derselben Genauigkeit', async ({ page }) => {
    // Lebensmittel with cents: Ist € …,50 against a whole-euro plan
    await importNovember(page, (b) => {
      b.data.payments.find((p) => p.id === 'pay-lebensmittel-nov')!.actualAmount = 449.5;
    });
    await goTo(page, 'analyse');
    await expect(page.getByTestId('planactual-table').locator('tbody tr').first()).toBeAttached();
    const rows = await page
      .getByTestId('planactual-table')
      .locator('tbody tr')
      .evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent!.replace(/ /g, ' '))));
    expect(rows.length).toBeGreaterThan(0);
    for (const [, plan, ist] of rows) {
      const cents = [plan, ist].map((v) => /,\d\d$/.test(v!));
      expect(cents[0], `${plan} | ${ist}`).toBe(cents[1]);
    }
    expect(rows.some(([, plan, ist]) => /,\d\d$/.test(plan!) && /,50$/.test(ist!))).toBe(true);
  });

  test('Überschrift „Geplante Änderungen“', async ({ page }) => {
    await importNovember(page);
    await goTo(page, 'analyse');
    await expect(page.locator('#optimizations-title')).toHaveText('Geplante Änderungen');
    await expect(page.getByText('Optimierungen', { exact: true })).toHaveCount(0);
  });
});

test.describe('Hintergrund: Nebel ohne Kante', () => {
  for (const dark of [false, true]) {
    test(`weicher Verlauf ${dark ? 'dunkel' : 'hell'}, auch auf 1920 und 2560`, async ({ page }) => {
      test.skip(isTouchProject() && (page.viewportSize()?.width ?? 0) > 500, 'phone and desktop sizes cover it');
      if (dark) await page.emulateMedia({ colorScheme: 'dark' });
      const sizes = isTouchProject() ? [page.viewportSize()!] : [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }];
      await page.goto('/');
      await page.addStyleTag({ content: 'body > * { visibility: hidden } body::after { display: none }' });
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.waitForTimeout(700); // the Nebel repaints 150 ms after a resize has settled
        const kink = await page.evaluate(async (b64) => {
          const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext('2d')!;
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          const s = img.width / innerWidth;
          const L = (x: number, y: number) => {
            const i = (y * img.width + x) * 4;
            return 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          };
          // 16 px block means along rays from the top-left blob; kink = slope jump between 48 px segments
          const mean = (x: number, y: number) => {
            let t = 0;
            let n = 0;
            for (let j = -8; j < 8; j++)
              for (let i = -8; i < 8; i++) {
                const xx = Math.round((x + i) * s);
                const yy = Math.round((y + j) * s);
                if (xx >= 0 && yy >= 0 && xx < img.width && yy < img.height) (t += L(xx, yy)), n++;
              }
            return t / n;
          };
          let worst = 0;
          const cx = innerWidth * 0.12;
          const cy = innerHeight * 0.08;
          for (const a of [0, 25, 50, 75]) {
            const v: number[] = [];
            for (let t = 0; ; t += 48) {
              const x = cx + t * Math.cos((a * Math.PI) / 180);
              const y = cy + t * Math.sin((a * Math.PI) / 180);
              if (x >= innerWidth || y >= innerHeight) break;
              v.push(mean(x, y));
            }
            for (let i = 2; i < v.length; i++) worst = Math.max(worst, (Math.abs(v[i]! - 2 * v[i - 1]! + v[i - 2]!) * 100) / 48);
          }
          return worst;
        }, (await page.screenshot()).toString('base64'));
        // before: 6.6–23 (rim of a two-stop fade); now ≤ 8.5 on phones, ≤ 4 from 1440 px on
        expect(kink, `${size.width}×${size.height}`).toBeLessThan(size.width < 500 ? 10 : 5);
      }
    });
  }
});
