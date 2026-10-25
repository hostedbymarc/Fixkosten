// Hintergrund „Nebel“ as an opaque bitmap instead of CSS gradients with transparency.
//
// iOS Safari „Ganze Seite“ renders the page with the screen CSS, stretches fixed layers over the
// whole page and paints `transparent` in a gradient as black: a hard green disc on black, grey glass.
// An opaque image plus the flat base colour cannot turn black. The canvas draws the same three
// blobs from the same tokens (--nebel-1/2/3 over --nebel-base); body::before shows it at the top,
// 660 px high, the base colour below (every blob reaches 0 above 660 px).

/** Height of the Nebel band in CSS px; below it the page is the plain base colour. */
export const NEBEL_HEIGHT = 660;
/** Canvas pixels per CSS px: the blobs are smooth, half resolution upscales without visible steps. */
const RES = 0.5;
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

/** Draws the Nebel for the current width and theme; returns a PNG data URL (opaque). */
export function paintNebel(width: number, style: CSSStyleDeclaration): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * RES));
  canvas.height = Math.round(NEBEL_HEIGHT * RES);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = rgba(ctx, style.getPropertyValue('--nebel-base'));
  ctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const blob of BLOBS) {
    const [r, g, b, a] = rgba(ctx, style.getPropertyValue(blob.token));
    const rx = blob.rx(width);
    ctx.save();
    ctx.scale(RES, RES);
    ctx.translate(blob.x * width, blob.y);
    ctx.scale(1, blob.ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [t, share] of FADE) grad.addColorStop(t, `rgba(${r}, ${g}, ${b}, ${a * share})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

/** Paints the Nebel now (before the first render) and again on resize and theme changes. */
export function initNebel() {
  const root = document.documentElement;
  let width = -1;
  let key = '';
  const update = () => {
    const style = getComputedStyle(root);
    const nextKey = ['--nebel-base', '--nebel-1', '--nebel-2', '--nebel-3'].map((t) => style.getPropertyValue(t)).join('|');
    if (window.innerWidth === width && nextKey === key) return;
    width = window.innerWidth;
    key = nextKey;
    const url = paintNebel(width, style);
    if (url) root.style.setProperty('--nebel-image', `url("${url}")`);
  };
  update();
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  window.addEventListener('resize', schedule);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
