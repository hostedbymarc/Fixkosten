import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup } from '../src/db/backup';
import type { Dataset } from '../src/lib/types';
import { expect, goTo, TODAY } from './fixtures';

export const HISTORY = 'tests/fixtures/history-24m.json';

export function historyDataset(): Dataset {
  return parseBackup(JSON.parse(readFileSync(HISTORY, 'utf8'))).data as Dataset;
}

/** Console errors and warnings of the page (Recharts warns about e.g. zero-size containers). */
export function watchConsole(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  return logs;
}

/** First start with the 24-month fixture (or a derived file). */
export async function importHistory(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = HISTORY) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(file);
  await expect(page.getByTestId('hero')).toBeVisible();
}

export async function openAnalyse(page: Page) {
  await goTo(page, 'analyse');
  await expect(page.getByTestId('analyse')).toBeVisible();
  await expect(page.getByTestId('forecast').locator('.recharts-bar-rectangle').first()).toBeVisible();
}
