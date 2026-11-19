import type { Locator, Page } from '@playwright/test';

// Pixel checks on real screenshots (decoded in the page's own canvas, no image library needed).

/** RGBA pixels of a PNG screenshot, decoded in the browser. */
async function decode(page: Page, png: Buffer): Promise<{ width: number; height: number; data: number[] }> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  }, png.toString('base64'));
}

/**
 * Share of the pixels in `target` that stand out from its background (luminance differs from the
 * median by more than 0.3): a visible number gives a clear share, a number covered by a surface or
 * not drawn gives about 0.
 */
export async function inkShare(page: Page, target: Locator): Promise<number> {
  const { data } = await decode(page, await target.screenshot({ animations: 'disabled' }));
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 4) lum.push((0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255);
  const median = [...lum].sort((a, b) => a - b)[Math.floor(lum.length / 2)]!;
  return lum.filter((l) => Math.abs(l - median) > 0.3).length / lum.length;
}

/**
 * Number of pixels that differ by more than `tolerance` (0–255, any channel) between two PNG screenshots of
 * the same size (-1: different size). The default 8 ignores the 1–2 steps of dithering in the hero's soft
 * light behind the text; a second, shifted copy of a number differs by up to 255.
 */
export async function differentPixels(page: Page, a: Buffer, b: Buffer, tolerance = 8): Promise<number> {
  const [x, y] = [await decode(page, a), await decode(page, b)];
  if (x.width !== y.width || x.height !== y.height) return -1;
  let n = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    if (Math.max(Math.abs(x.data[i]! - y.data[i]!), Math.abs(x.data[i + 1]! - y.data[i + 1]!), Math.abs(x.data[i + 2]! - y.data[i + 2]!)) > tolerance) n++;
  }
  return n;
}
