// Renders scripts/brand/icon.svg into the PNG icons in public/ (run after changing the icon):
//   node scripts/make-icons.mjs
// Uses the Playwright Chromium that the e2e tests already need.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('./brand/icon.svg', import.meta.url), 'utf8');
const outputs = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: false });
  console.log(`public/${file} (${size}×${size})`);
}
await browser.close();
