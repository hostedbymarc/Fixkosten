import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup } from '../src/db/backup';
import { withSavings, type SavingsScenario } from '../tests/fixtures/savings';
import { appSettled, expandAll, expect, FIXTURE, TODAY } from './fixtures';

/** First start with the Sparquote data (today = 05.10.2026), optionally in dark mode. */
export async function importSavings(page: Page, scenario: SavingsScenario = 'history', dark = false) {
  if (dark) await page.emulateMedia({ colorScheme: 'dark' });
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = withSavings(parseBackup(JSON.parse(readFileSync(FIXTURE, 'utf8'))), scenario);
  await page.getByTestId('import-file').setInputFiles({
    name: 'sparquote.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await expandAll(page);
}
