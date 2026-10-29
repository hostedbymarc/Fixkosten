import type { Page } from '@playwright/test';
import { forecastBackup } from './forecast-data';
import { appSettled, expandAll, expect, TODAY } from './fixtures';

/**
 * Like the live data: forecast demo data plus net salary in October and a planned
 * price rise (Amex € 690 → € 717,80 from 06.10.2027).
 */
export function sprintBackup() {
  const backup = forecastBackup();
  backup.data.monthClose.push({ period: '2026-10', netSalary: 4788, updatedAt: '2026-10-05T08:00:00.000Z' });
  const amex = backup.data.positions.find((p) => p.id === 'pos-amex-gebuehr')!;
  amex.history.push({
    ...amex.history[amex.history.length - 1]!,
    validFrom: '2027-10',
    amount: 717.8,
    changedOn: '2027-10-06',
    recordedAt: '2026-10-05T08:00:00.000Z',
  });
  return backup;
}

export async function importSprint(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles({
    name: 'sprint.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sprintBackup())),
  });
  await expect(page.getByTestId('hero')).toBeVisible();
  await appSettled(page);
  await expandAll(page);
}
