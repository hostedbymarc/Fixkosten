// Renders the Erbse icons in public/ from scripts/brand/*.svg (run after changing the logo):
//   node scripts/make-icons.mjs
// Uses the Playwright Chromium that the e2e tests already need.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const source = (name) => readFileSync(new URL(`./brand/${name}`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
const outputs = [
  // iOS home screen: opaque, no own rounding
  { file: 'apple-touch-icon.png', size: 180, svg: 'icon-fullbleed.svg' },
  // manifest "any": with the logo's rounding
  { file: 'icon-192.png', size: 192, svg: 'icon-rounded.svg' },
  { file: 'icon-512.png', size: 512, svg: 'icon-rounded.svg' },
  // manifest "maskable": full bleed, peas inside the 80 % safe zone
  { file: 'icon-maskable-512.png', size: 512, svg: 'icon-fullbleed.svg' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  const markup = source(svg).replace('width="28" height="28"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true });
  console.log(`public/${file} (${size}×${size}, ${svg})`);
}
await browser.close();
