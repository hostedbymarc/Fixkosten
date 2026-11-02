// Renders the Erbse icons in public/ from the real <Logo> component (Luxe 2): a Vite dev server
// serves dev/peas/?icon=<px>[&bleed=1] and Playwright screenshots the logo (run after changing it):
//   node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const outputs = [
  // iOS home screen: opaque, full bleed, no own rounding (iOS rounds itself)
  { file: 'apple-touch-icon.png', size: 180, bleed: true },
  // manifest "any": with the logo's rounding, transparent corners
  { file: 'icon-192.png', size: 192, bleed: false },
  { file: 'icon-512.png', size: 512, bleed: false },
  // manifest "maskable": full bleed, the peas span 60 % of the width – inside the 80 % safe zone
  { file: 'icon-maskable-512.png', size: 512, bleed: true },
  // browser tab
  { file: 'favicon.png', size: 64, bleed: false },
];

const server = await createServer({ server: { port: 4399, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, bleed } of outputs) {
  await page.setViewportSize({ width: size + 40, height: size + 40 });
  await page.goto(`http://localhost:4399/dev/peas/?theme=light&icon=${size}${bleed ? '&bleed=1' : ''}`);
  const logo = page.getByTestId('logo');
  await logo.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await logo.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !bleed });
  console.log(`public/${file} (${size}×${size}${bleed ? ', full bleed' : ''})`);
}
await browser.close();
await server.close();
