import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseBackup } from '../src/db/backup';
import type { Position } from '../src/lib/types';
import { expect, FIXTURE, TODAY } from './fixtures';

function once(id: string, name: string, categoryId: string, amount: number, dueDate: string): Position {
  const [y, m, d] = dueDate.split('-').map(Number) as [number, number, number];
  return {
    id,
    name,
    categoryId,
    history: [{ validFrom: dueDate.slice(0, 7), amount, frequency: 'once', dueMonths: [m], dueDay: d, dueDate }],
    createdAt: `${y}-10-05T08:00:00.000Z`,
    sortOrder: 100,
  };
}

/**
 * Seed plus one-time payments like the live data: November with two big ones,
 * February with four non-monthly items („+2 weitere“), a one-time payment in
 * Vermögensaufbau that must never show up in the forecast.
 */
export function forecastBackup() {
  const backup = parseBackup(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  backup.data.positions.push(
    once('pos-iphones', 'iPhones + Zubehör', 'cat-abos', 2826, '2026-11-03'),
    once('pos-hotel-cph', 'Hotel Copenhagen', 'cat-abos', 620, '2026-11-01'),
    once('pos-hotel-muc', 'Hotel MUC', 'cat-wohnen', 130, '2026-12-01'),
    once('pos-ski', 'Skiurlaub', 'cat-abos', 450, '2027-02-10'),
    once('pos-service', 'Kfz-Service', 'cat-mobilitaet', 380, '2027-02-20'),
    once('pos-invest-once', 'Sondertilgung Depot', 'cat-investing', 5000, '2026-11-15'),
  );
  return backup;
}

/** First start with the forecast data, today = 05.10.2026. */
export async function importForecast(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
  await expect(page.getByTestId('setup-dialog')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles({
    name: 'forecast.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(forecastBackup())),
  });
  await expect(page.getByTestId('hero')).toBeVisible();
}
