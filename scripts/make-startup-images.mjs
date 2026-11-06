// Renders the iOS start images (apple-touch-startup-image) of the installed app from the static start
// screen of index.html – the same markup and inline stylesheet the browser paints first
// (src/lib/bootSplash.ts), never by hand:
//   node scripts/make-startup-images.mjs        (after changing the logo, the tokens or the device list)
// Every iPhone portrait, every iPad portrait and landscape, light and dark, at the device's pixels.
//
// The image is ONLY the start screen's background in its first frame: the base colour, no logo (the
// mesh fades in right after, inline CSS). The one logo is the page's own element, which comes in from
// the first paint: iOS cross-fades its start image into the page, a logo in the image would show twice.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const boot = await vite.ssrLoadModule('/src/lib/bootSplash.ts');
await vite.close();

const tokens = readFileSync(`${root}src/styles/tokens.css`, 'utf8');
// the start screen alone: no scripts, no app stylesheet (exactly the first paint)
const html = boot
  .renderBootHtml(readFileSync(`${root}index.html`, 'utf8'), tokens)
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link rel="(?:manifest|icon|apple-touch-icon|apple-touch-startup-image)"[^>]*>/g, '');

const out = `${root}public/startup`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// a local Chromium outside Playwright's cache: CHROMIUM_PATH=/path/to/chrome
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let bytes = 0;
const images = boot.startupImages();
for (const img of images) {
  const page = await browser.newPage({
    viewport: { width: img.width, height: img.height },
    deviceScaleFactor: img.device.dpr,
    colorScheme: img.scheme,
    reducedMotion: 'reduce',
  });
  await page.setContent(html);
  // first frame: the mesh not yet faded in, no logo
  await page.addStyleTag({ content: `.splash-mesh{opacity:0!important;animation:none!important}.splash-mark{display:none!important}` });
  const path = `${out}/${img.href.split('/').pop()}`;
  const png = await page.screenshot({ path, type: 'png' });
  bytes += png.length;
  await page.close();
}
await browser.close();
console.log(`${images.length} Startbilder in public/startup/ (${Math.round(bytes / 1024)} KiB)`);
