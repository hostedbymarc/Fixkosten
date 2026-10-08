import { readFileSync } from 'node:fs';
import { FIXTURE, eur, expect, goTo, isSidebarLayout, test } from './fixtures';

const seed = readFileSync(FIXTURE);

test.describe('Rebrand „Erbse“: Daten bleiben', () => {
  for (const name of ['fixkosten-2026-10-01.json', 'fixkosten-export-2026-09-30.json', 'erbse-backup-2026-10-08.json']) {
    test(`import of ${name} works (file name does not matter, format stays)`, async ({ fresh }) => {
      await fresh.getByTestId('import-file').setInputFiles({ name, mimeType: 'application/json', buffer: seed });
      await expect(fresh.getByTestId('hero-paid')).toHaveText(eur('€ 3.368'));
      // same IndexedDB as before the rename
      const names = await fresh.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
      expect(names).toContain('fixkosten');
      expect(names).not.toContain('erbse');
    });
  }

  test('export keeps the backup format, only the file name is new', async ({ app }) => {
    await goTo(app, 'einstellungen');
    const [download] = await Promise.all([
      app.waitForEvent('download'),
      app.getByRole('button', { name: 'Sicherung exportieren' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^erbse-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(json).toMatchObject({ format: 'fixkosten-backup', schemaVersion: 4 });
  });
});

test.describe('Rebrand „Erbse“: Name und Icons', () => {
  test('title, home-screen title, manifest and theme colour', async ({ app }) => {
    await expect(app).toHaveTitle('Erbse');
    await expect(app.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Erbse');
    await expect(app.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#5A7A2E');
    const manifest = await (await app.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'Erbse', short_name: 'Erbse', start_url: '/', theme_color: '#5A7A2E', background_color: '#F4F5F1' });
    for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), '/apple-touch-icon.png', '/favicon.svg']) {
      expect((await app.request.get(icon)).status(), icon).toBe(200);
    }
  });

  test('sidebar shows the logo and „Erbse“', async ({ app }) => {
    test.skip(!isSidebarLayout(app), 'sidebar only from 1024 px');
    await expect(app.getByTestId('sidebar')).toContainText('Erbse');
    await expect(app.getByTestId('sidebar').locator('svg rect[rx="8"]')).toHaveCount(1);
  });

  test('glass surfaces fall back to opaque with reduced transparency', async ({ app }) => {
    const cdp = await app.context().newCDPSession(app);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    const hero = app.getByTestId('hero');
    await expect(hero).toHaveCSS('backdrop-filter', 'none');
    await expect(hero).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});
