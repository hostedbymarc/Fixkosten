// Pixel measurements of the page background (Nebel), shared by the background specs.
import type { Page } from '@playwright/test';

export interface PixelStats {
  width: number;
  height: number;
  /** max deviation per channel from `base` at or below row `from` (CSS px × scale) */
  maxDevBelow: number;
  /** pixels with every channel ≤ 16 (#101010) */
  nearBlack: number;
  /** pixels not fully opaque */
  transparent: number;
  /** max channel jump between the rows `edge − 1` and `edge` (0 when no edge given) */
  edgeStep: number;
  /** slope jump along rays from the top-left blob (L per 100 px, 16 px block means, 48 px segments) */
  kink: number;
}

/**
 * Measures a PNG (base64) in the page: decoding and sampling run in the browser, no extra
 * dependency. `scale` = device pixels per CSS px; rows/edges are given in CSS px.
 */
export async function pixelStats(
  page: Page,
  png: Buffer,
  opts: { base: [number, number, number]; from: number; edge?: number; scale: number; blob?: { x: number; y: number } },
): Promise<PixelStats> {
  return page.evaluate(
    async ([b64, o]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const at = (x: number, y: number) => (y * img.width + x) * 4;
      let maxDevBelow = 0;
      let nearBlack = 0;
      let transparent = 0;
      const step = Math.max(1, Math.round(o.scale * 2));
      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          const i = at(x, y);
          if (d[i + 3]! < 255) transparent++;
          if (d[i]! <= 16 && d[i + 1]! <= 16 && d[i + 2]! <= 16) nearBlack++;
          if (y >= o.from * o.scale)
            maxDevBelow = Math.max(maxDevBelow, Math.abs(d[i]! - o.base[0]), Math.abs(d[i + 1]! - o.base[1]), Math.abs(d[i + 2]! - o.base[2]));
        }
      }
      let edgeStep = 0;
      if (o.edge) {
        const y = Math.round(o.edge * o.scale);
        for (let x = 0; x < img.width; x++) {
          const a = at(x, y - 1);
          const b = at(x, y);
          edgeStep = Math.max(edgeStep, Math.abs(d[a]! - d[b]!), Math.abs(d[a + 1]! - d[b + 1]!), Math.abs(d[a + 2]! - d[b + 2]!));
        }
      }
      const L = (x: number, y: number) => {
        const i = at(x, y);
        return 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      };
      const mean = (x: number, y: number) => {
        let t = 0;
        let n = 0;
        for (let j = -8; j < 8; j++)
          for (let i = -8; i < 8; i++) {
            const xx = Math.round((x + i) * o.scale);
            const yy = Math.round((y + j) * o.scale);
            if (xx >= 0 && yy >= 0 && xx < img.width && yy < img.height) (t += L(xx, yy)), n++;
          }
        return t / n;
      };
      let kink = 0;
      const cssW = img.width / o.scale;
      const cssH = img.height / o.scale;
      const blob = o.blob ?? { x: cssW * 0.12, y: 40 };
      for (const a of [0, 25, 50, 75, 90]) {
        const v: number[] = [];
        for (let t = 0; ; t += 48) {
          const x = blob.x + t * Math.cos((a * Math.PI) / 180);
          const y = blob.y + t * Math.sin((a * Math.PI) / 180);
          if (x >= cssW || y >= cssH) break;
          v.push(mean(x, y));
        }
        for (let i = 2; i < v.length; i++) kink = Math.max(kink, (Math.abs(v[i]! - 2 * v[i - 1]! + v[i - 2]!) * 100) / 48);
      }
      return { width: img.width, height: img.height, maxDevBelow, nearBlack, transparent, edgeStep, kink };
    },
    [png.toString('base64'), opts] as const,
  );
}

/** Share of pixels that differ by more than `tolerance` levels in any channel (same size images). */
export async function diffShare(page: Page, a: Buffer, b: Buffer, tolerance = 10): Promise<number> {
  return page.evaluate(
    async ([x, y, tol]) => {
      const load = async (b64: string) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      const w = Math.min(p.width, q.width);
      const h = Math.min(p.height, q.height);
      let diff = 0;
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const i = (yy * p.width + xx) * 4;
          const j = (yy * q.width + xx) * 4;
          if (Math.abs(p.data[i]! - q.data[j]!) > tol || Math.abs(p.data[i + 1]! - q.data[j + 1]!) > tol || Math.abs(p.data[i + 2]! - q.data[j + 2]!) > tol) diff++;
        }
      return diff / (w * h);
    },
    [a.toString('base64'), b.toString('base64'), tolerance] as const,
  );
}

/** Hide every piece of content (incl. inline `visibility: visible`): what stays is the page background. */
export const HIDE_CONTENT = '#root, #root *, body > div:not(#root), body > div:not(#root) * { visibility: hidden !important; }';
/** iOS „Ganze Seite“ renders without (backdrop-)filter. */
export const NO_FILTER = '*, *::before, *::after { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
/** iOS keeps fixed layers where they are at scroll 0: only the first screen. */
export const FIXED_FIRST_SCREEN = (vh: number) =>
  `body::before, body::after { position: absolute !important; height: ${vh}px !important; bottom: auto !important; }`;
