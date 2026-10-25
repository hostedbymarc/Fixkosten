// Live export of 25.10.2026 in the browser: Oktober (today 25.10.) or November (today 10.11.).
import type { Page } from '@playwright/test';
import type { BackupFile } from '../src/db/backup';
import { liveBackup } from '../tests/fixtures/live';
import { appSettled, expect } from './fixtures';

export const OKT_TODAY = new Date('2026-10-25T12:00:00+01:00');
export const NOV_TODAY = new Date('2026-11-10T10:00:00+01:00');

export async function importLive(page: Page, today: Date = OKT_TODAY, edit: (b: BackupFile) => BackupFile | void = () => {}) {
  await page.clock.setFixedTime(today);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  const backup = liveBackup();
  const file = edit(backup) ?? backup;
  await page.getByTestId('import-file').setInputFiles({ name: 'erbse-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
}
