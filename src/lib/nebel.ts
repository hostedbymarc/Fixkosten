// Hintergrund „Nebel“ as an opaque bitmap instead of CSS gradients with transparency.
//
// iOS Safari „Ganze Seite“ renders the page with the screen CSS, stretches fixed layers over the
// whole page and paints `transparent` in a gradient as black: a hard green disc on black, grey glass.
// An opaque image plus the flat base colour cannot turn black. The canvas draws the same three
// blobs from the same tokens (--nebel-1/2/3 over --nebel-base); body::before shows it at the top,
// 660 px high, the base colour below (every blob reaches 0 above 660 px).
//
// Oberer Rand: iOS paints the status bar as a flat colour sampled from the page (the body
// background, --nebel-base). The Nebel therefore is exactly that colour under the bar and the scrim
// (safe area + 48 px) and flows in below on an ease-out curve over TOP_FADE px: no step, no band.

/** Height of the Nebel band in CSS px; below it the page is the plain base colour. */
export const NEBEL_HEIGHT = 660;
/** Length of the fade from the bar colour into the Nebel, below the scrim (CSS px). */
export const TOP_FADE = 440;
// Both bitmaps are 1:1 in CSS px: a scaled bitmap in a fixed layer may be drawn without smoothing or
// from a blurred mip level in Chrome; at 1:1 every CSS px row carries its own value.
/** Bell-shaped fade (≈ e^(−4.6 t²)): share of the token alpha at t = 0, 0.15, … 0.9, 1. */
const FADE: [number, number][] = [
  [0, 1],
  [0.15, 0.9],
  [0.3, 0.66],
  [0.45, 0.39],
  [0.6, 0.19],
  [0.75, 0.075],
  [0.9, 0.024],
  [1, 0],
];

interface Blob {
  token: string;
  /** horizontal radius from the viewport width (CSS px) */
  rx: (vw: number) => number;
  ry: number;
  /** centre: share of the width, px from the top */
  x: number;
  y: number;
}

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

// bottom to top (the last one is painted last, like the first CSS background layer)
const BLOBS: Blob[] = [
  { token: '--nebel-3', rx: (vw) => clamp(440, 0.46 * vw, 1000), ry: 440, x: 0.42, y: 220 },
  { token: '--nebel-2', rx: (vw) => clamp(440, 0.44 * vw, 860), ry: 480, x: 0.92, y: 160 },
  { token: '--nebel-1', rx: (vw) => clamp(480, 0.6 * vw, 1100), ry: 620, x: 0.12, y: 30 },
];

/** Normalises any CSS colour through the canvas: [r, g, b, a] with a in 0…1. */
function rgba(ctx: CanvasRenderingContext2D, css: string): [number, number, number, number] {
  ctx.fillStyle = 'black';
  ctx.fillStyle = css.trim() || 'black';
  const v = String(ctx.fillStyle);
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const [r = 0, g = 0, b = 0, a = 1] = v.replace(/[^\d.,]/g, '').split(',').map(Number);
  return [r, g, b, a];
}

/** Share of the token alpha at distance t (1 = rim), linear between the FADE stops like a CSS gradient. */
function bell(t: number): number {
  if (t >= 1) return 0;
  for (let i = 1; i < FADE.length; i++) {
    const [t1, s1] = FADE[i]!;
    if (t <= t1) {
      const [t0, s0] = FADE[i - 1]!;
      return s0 + ((s1 - s0) * (t - t0)) / (t1 - t0);
    }
  }
  return 0;
}

/** bell() over the squared distance, so the pixel loop needs no square root. */
const LUT_SIZE = 4096;
const BELL_LUT = Float32Array.from({ length: LUT_SIZE + 1 }, (_, i) => bell(Math.sqrt(i / LUT_SIZE)));

/**
 * Draws the Nebel for the current width and theme; returns a PNG data URL (opaque).
 * Computed per pixel in floating point and rounded once: a canvas gradient would be dithered
 * (±1–2 levels from row to row), which reads as noise in the top fade.
 */
export function paintNebel(width: number, style: CSSStyleDeclaration, safeTop = 0): string | null {
  const canvas = document.createElement('canvas');
  const w = (canvas.width = Math.max(1, Math.round(width)));
  const h = (canvas.height = NEBEL_HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = rgba(ctx, style.getPropertyValue('--nebel-base'));
  const blobs = BLOBS.map((b) => ({ ...b, cx: b.x * width, rx: b.rx(width), colour: rgba(ctx, style.getPropertyValue(b.token)) }));
  // the bar colour over the safe area and the scrim (only one layer changes per row there), then the
  // Nebel comes in as 1 − (1 − u)² over TOP_FADE px (ease-out, flat join)
  const fadeStart = safeTop + SCRIM_FADE;
  const fadeEnd = fadeStart + TOP_FADE;
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const r = new Float32Array(w);
  const g = new Float32Array(w);
  const b = new Float32Array(w);
  for (let j = 0; j < h; j++) {
    const y = j + 0.5;
    r.fill(base[0]);
    g.fill(base[1]);
    b.fill(base[2]);
    for (const blob of blobs) {
      const dy = (y - blob.y) / blob.ry;
      const dy2 = dy * dy;
      if (dy2 >= 1) continue;
      // only the columns inside the ellipse on this row
      const half = blob.rx * Math.sqrt(1 - dy2);
      const from = Math.max(0, Math.floor(blob.cx - half));
      const to = Math.min(w - 1, Math.ceil(blob.cx + half));
      const [cr, cg, cb, ca] = blob.colour;
      for (let i = from; i <= to; i++) {
        const dx = (i + 0.5 - blob.cx) / blob.rx;
        const d2 = dx * dx + dy2;
        if (d2 >= 1) continue;
        const a = ca * BELL_LUT[Math.round(d2 * LUT_SIZE)]!;
        r[i]! += (cr - r[i]!) * a;
        g[i]! += (cg - g[i]!) * a;
        b[i]! += (cb - b[i]!) * a;
      }
    }
    const u = Math.min(1, Math.max(0, (y - fadeStart) / (fadeEnd - fadeStart)));
    const fade = 1 - (1 - u) ** 2;
    for (let i = 0, k = j * w * 4; i < w; i++, k += 4) {
      px[k] = Math.round(base[0] + (r[i]! - base[0]) * fade);
      px[k + 1] = Math.round(base[1] + (g[i]! - base[1]) * fade);
      px[k + 2] = Math.round(base[2] + (b[i]! - base[2]) * fade);
      px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Height of the scrim below the safe area (CSS px). */
export const SCRIM_FADE = 48;
/** Scrim opacity at the top (Uhrzeit/Akku); never a covering block. */
export const SCRIM_MAX = 0.6;

/**
 * Scrim opacity at depth y (CSS px from the top): ease-out SCRIM_MAX · (1 − t)³ over safe area + 48 px.
 * `solid` (Transparenz reduzieren): fully covering over the safe area, then (1 − t)³ over 48 px.
 */
export function scrimAlpha(y: number, safeTop: number, solid = false): number {
  if (solid) return y <= safeTop ? 1 : (1 - Math.min(1, (y - safeTop) / SCRIM_FADE)) ** 3;
  return SCRIM_MAX * (1 - Math.min(1, y / (safeTop + SCRIM_FADE))) ** 3;
}

/** The scrim as a bitmap (base colour, alpha per row) at 1:1 in CSS px: no gradient dithering, and
 *  never scaled (a strip stretched across the width is drawn from a blurred mip level in Chrome). */
function paintScrim(width: number, style: CSSStyleDeclaration, safeTop: number, solid: boolean): string | null {
  const canvas = document.createElement('canvas');
  const height = safeTop + SCRIM_FADE;
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = rgba(ctx, style.getPropertyValue('--nebel-base'));
  // first row = top, last row = exactly 0: the bitmap ends without a residue at the lower edge
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let j = 0; j < canvas.height; j++) {
    const a = Math.round(255 * scrimAlpha((j / (canvas.height - 1)) * height, safeTop, solid));
    for (let i = 0; i < canvas.width; i++) img.data.set([base[0], base[1], base[2], a], (j * canvas.width + i) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Paints the Nebel now (before the first render) and again on resize and theme changes. */
export function initNebel() {
  const root = document.documentElement;
  // height of the safe area at the top (0 in a home-screen app with an opaque status bar)
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--safe-top);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  let key = '';
  const update = () => {
    const style = getComputedStyle(root);
    const safeTop = probe.getBoundingClientRect().height;
    const nextKey = [window.innerWidth, safeTop, ...['--nebel-base', '--nebel-1', '--nebel-2', '--nebel-3'].map((t) => style.getPropertyValue(t))].join('|');
    if (nextKey === key) return;
    key = nextKey;
    const url = paintNebel(window.innerWidth, style, safeTop);
    if (url) root.style.setProperty('--nebel-image', `url("${url}")`);
    for (const [name, solid] of [['--scrim-image', false], ['--scrim-image-solid', true]] as const) {
      const scrim = paintScrim(window.innerWidth, style, safeTop, solid);
      if (scrim) root.style.setProperty(name, `url("${scrim}")`);
    }
    // browsers that still colour the status bar from theme-color get the same colour as the page top
    const bar = style.getPropertyValue('--nebel-base').trim();
    if (bar) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bar));
  };
  update();
  // while a window is being resized, paint once it has settled
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 150);
  };
  window.addEventListener('resize', schedule);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
