// Checks manifest + icons: valid JSON, required fields, every icon present in its declared size,
// apple-touch-icon opaque without own rounding, maskable full bleed with the peas inside the
// 80 % safe zone, "any" icons rounded.   node scripts/check-icons.mjs [dir]   (default: public)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const dir = process.argv[2] ?? 'public';
const BRAND = [90, 122, 46];
const errors = [];
const fail = (msg) => errors.push(msg);

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
for (const key of ['name', 'short_name', 'start_url', 'display', 'theme_color', 'background_color', 'icons']) {
  if (!manifest[key]) fail(`manifest: ${key} fehlt`);
}
if (manifest.name !== 'Erbse' || manifest.short_name !== 'Erbse') fail('manifest: name/short_name ist nicht "Erbse"');
if (manifest.start_url !== '/') fail('manifest: start_url muss "/" bleiben');
if (manifest.theme_color.toUpperCase() !== '#5A7A2E') fail('manifest: theme_color ist nicht Brand');
if (manifest.background_color.toUpperCase() !== '#F4F5F1') fail('manifest: background_color ist nicht #F4F5F1');
const html = readFileSync(existsSync(join(dir, 'index.html')) ? join(dir, 'index.html') : 'index.html', 'utf8');
if (!html.includes('content="Erbse"')) fail('index.html: apple-mobile-web-app-title ist nicht "Erbse"');

const icons = [
  ...manifest.icons.map((i) => ({ file: i.src.replace(/^\//, ''), size: Number(i.sizes.split('x')[0]), purpose: i.purpose ?? 'any' })),
  { file: 'apple-touch-icon.png', size: 180, purpose: 'apple' },
];
if (!manifest.icons.some((i) => i.purpose === 'maskable')) fail('manifest: kein maskable-Icon');

const browser = await chromium.launch();
const page = await browser.newPage();
const same = (p, rgb, tol = 3) => p[3] === 255 && rgb.every((v, i) => Math.abs(p[i] - v) <= tol);
for (const icon of icons) {
  const path = join(dir, icon.file);
  if (!existsSync(path)) {
    fail(`${icon.file}: fehlt`);
    continue;
  }
  const data = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  const res = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: Array.from(ctx.getImageData(0, 0, img.width, img.height).data) };
  }, data);
  const at = (x, y) => res.px.slice((y * res.w + x) * 4, (y * res.w + x) * 4 + 4);
  if (res.w !== icon.size || res.h !== icon.size) fail(`${icon.file}: ${res.w}×${res.h} statt ${icon.size}×${icon.size}`);
  const corner = at(0, 0);
  if (icon.purpose === 'apple' || icon.purpose === 'maskable') {
    if (!same(corner, BRAND)) fail(`${icon.file}: Ecke nicht deckend Brand (rgba ${corner}) – eigene Rundung?`);
    // everything outside the 80 % safe-zone circle must be plain brand
    const r = res.w * 0.4;
    for (let y = 0; y < res.h; y += 2) {
      for (let x = 0; x < res.w; x += 2) {
        if (Math.hypot(x - res.w / 2, y - res.h / 2) > r && !same(at(x, y), BRAND)) {
          fail(`${icon.file}: Inhalt außerhalb der Safe Zone bei ${x},${y}`);
          y = res.h;
          break;
        }
      }
    }
  } else if (corner[3] !== 0) {
    fail(`${icon.file}: "any"-Icon ohne Rundung (Ecke deckend)`);
  }
}
await browser.close();

if (errors.length) {
  console.error(`check-icons: ${errors.length} Fehler\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`check-icons: Manifest valide, ${icons.length} Icons ok (apple-touch-icon ohne Rundung, maskable mit Safe Zone)`);
