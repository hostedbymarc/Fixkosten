// Hintergrund „Aurora-Mesh“ (Luxe 2): five soft colour fields behind everything, one composition
// per screen, cross-faded on a tab change, drifting gently for 20 s after it and then at rest.
//
// Safe construction: every composition is painted into an OPAQUE bitmap (the fields blended over
// --mesh-base), like the Nebel before it (src/lib/nebel.ts). No CSS gradient into transparency and no
// filter: blur – iOS Safari „Ganze Seite“ stretches fixed layers over the page and captures a
// gradient into transparency as black (PR #36). An opaque image cannot turn black.
//
// Two fixed layers (#aurora > .aurora-layer): the shown one and the next one; a tab change paints the
// next composition (cached per screen, theme and size) into the hidden layer and cross-fades opacity
// (600 ms). Drift = transform of the whole layer (3–6 vmax) over 20 s with ease-out, then it rests;
// paused while the page is hidden, off with „Bewegung reduzieren“ and when DRIFT is false.
// „Transparenz reduzieren“: the fields at --mesh-reduced of their alpha and no grain.
// Presentation only: reads the route from the hash, writes nothing but the layers' style.

import { readRoute, type Route } from './routes';

type Hue = 'brand' | 'butter' | 'peach' | 'sky' | 'lilac';
/** One colour field: centre (share of the viewport), radius in vmax, alpha (light theme). */
interface Field {
  hue: Hue;
  x: number;
  y: number;
  r: number;
  a: number;
}
interface Composition {
  fields: Field[];
  /** drift target in vmax (the layer moves there over 20 s) */
  drift: [number, number];
}

/** The screens' compositions (bottom field first). Dark multiplies alpha by --mesh-alpha (.55 → .20–.30). */
export const COMPOSITIONS: Record<Route, Composition> = {
  // warm: butter and peach on top
  monat: {
    fields: [
      { hue: 'sky', x: 0.1, y: 1.05, r: 62, a: 0.35 },
      { hue: 'lilac', x: 1.0, y: 0.82, r: 62, a: 0.38 },
      { hue: 'brand', x: -0.05, y: 0.55, r: 70, a: 0.36 },
      { hue: 'peach', x: 0.95, y: 0.12, r: 78, a: 0.5 },
      { hue: 'butter', x: 0.15, y: -0.02, r: 85, a: 0.55 },
    ],
    drift: [4, 2.5],
  },
  // balanced
  positionen: {
    fields: [
      { hue: 'lilac', x: 0.55, y: 1.05, r: 80, a: 0.38 },
      { hue: 'peach', x: 0.95, y: 0.7, r: 64, a: 0.4 },
      { hue: 'sky', x: 0.02, y: 0.62, r: 72, a: 0.42 },
      { hue: 'butter', x: 0.92, y: 0.05, r: 68, a: 0.42 },
      { hue: 'brand', x: 0.12, y: 0.0, r: 82, a: 0.45 },
    ],
    drift: [-3.5, 3],
  },
  // cool: sky and lilac
  analyse: {
    fields: [
      { hue: 'butter', x: 0.98, y: 1.0, r: 60, a: 0.35 },
      { hue: 'peach', x: 0.02, y: 0.95, r: 60, a: 0.35 },
      { hue: 'brand', x: 0.6, y: 0.7, r: 80, a: 0.36 },
      { hue: 'lilac', x: 0.92, y: 0.08, r: 76, a: 0.5 },
      { hue: 'sky', x: 0.1, y: 0.0, r: 86, a: 0.55 },
    ],
    drift: [5, -2.5],
  },
  // calm: little colour
  einstellungen: {
    fields: [
      { hue: 'lilac', x: 0.95, y: 0.95, r: 60, a: 0.35 },
      { hue: 'sky', x: 0.02, y: 0.9, r: 60, a: 0.35 },
      { hue: 'peach', x: 0.95, y: 0.1, r: 60, a: 0.35 },
      { hue: 'butter', x: 0.5, y: 0.5, r: 70, a: 0.35 },
      { hue: 'brand', x: 0.1, y: 0.0, r: 70, a: 0.4 },
    ],
    drift: [-3, -2],
  },
};

/** Drift on or off (the frame-time budget decides, see the PR: off when scrolling gets above 16 ms). */
export const DRIFT = true;
export const DRIFT_MS = 20_000;
/** Ambient motion (drift, hero colour fields): this id, this long, then everything rests. */
export const AMBIENT_ID = 'ambient';
export const AMBIENT_MS = DRIFT_MS;
export const FADE_MS = 600;
/** Extra room around the viewport for the drift (vmax), every side. */
const MARGIN_VMAX = 6;
/** The bitmap at a quarter of the CSS px: the fields are smooth, the browser scales it up softly. */
const SCALE = 0.25;
/** Under the status bar the mesh fades to the base colour (iOS samples the body colour for the bar). */
const TOP_FADE = 220;

/** Bell-shaped falloff, the same curve as the Nebel: share of the alpha at distance t (1 = rim). */
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
const LUT_SIZE = 2048;
const BELL_LUT = Float32Array.from({ length: LUT_SIZE + 1 }, (_, i) => bell(Math.sqrt(i / LUT_SIZE)));

function rgb(ctx: CanvasRenderingContext2D, css: string): [number, number, number] {
  ctx.fillStyle = 'black';
  ctx.fillStyle = css.trim() || 'black';
  const v = String(ctx.fillStyle);
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const [r = 0, g = 0, b = 0] = v.replace(/[^\d.,]/g, '').split(',').map(Number);
  return [r, g, b];
}

export interface Viewport {
  width: number;
  height: number;
  safeTop: number;
}

/** The colour of the composition at a viewport point (CSS px): used by the contrast measurement. */
export function meshColour(c: Composition, at: { x: number; y: number }, vp: Viewport, colours: Record<Hue | 'base', [number, number, number]>, alphaScale: number): [number, number, number] {
  const vmax = Math.max(vp.width, vp.height) / 100;
  const out = [...colours.base] as [number, number, number];
  for (const f of c.fields) {
    const d = Math.hypot(at.x - f.x * vp.width, at.y - f.y * vp.height) / (f.r * vmax);
    const a = Math.min(1, f.a * alphaScale) * bell(d);
    const col = colours[f.hue];
    for (let k = 0; k < 3; k++) out[k]! += (col[k]! - out[k]!) * a;
  }
  return out;
}

/** Paints a composition (opaque PNG data URL) for the viewport, margin included. */
export function paintAurora(c: Composition, vp: Viewport, style: CSSStyleDeclaration, reduced: boolean): string | null {
  const canvas = document.createElement('canvas');
  const vmax = Math.max(vp.width, vp.height) / 100;
  const m = MARGIN_VMAX * vmax;
  const W = vp.width + 2 * m;
  const H = vp.height + 2 * m;
  const w = (canvas.width = Math.max(1, Math.round(W * SCALE)));
  const h = (canvas.height = Math.max(1, Math.round(H * SCALE)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = rgb(ctx, style.getPropertyValue('--mesh-base'));
  const scale = (Number(style.getPropertyValue('--mesh-alpha')) || 1) * (reduced ? Number(style.getPropertyValue('--mesh-reduced')) || 0.35 : 1);
  const fields = c.fields.map((f) => ({
    col: rgb(ctx, style.getPropertyValue(`--mesh-${f.hue}`)),
    a: Math.min(1, f.a * scale),
    // in bitmap px
    cx: (m + f.x * vp.width) * SCALE,
    cy: (m + f.y * vp.height) * SCALE,
    r: f.r * vmax * SCALE,
  }));
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const fadeEnd = vp.safeTop + TOP_FADE;
  for (let j = 0; j < h; j++) {
    const y = j + 0.5;
    // viewport y of this row (CSS px): fade to the base colour under the status bar
    const vy = y / SCALE - m;
    const u = Math.min(1, Math.max(0, (vy - vp.safeTop) / (fadeEnd - vp.safeTop)));
    const top = 1 - (1 - u) ** 2;
    for (let i = 0; i < w; i++) {
      const x = i + 0.5;
      let r = base[0];
      let g = base[1];
      let b = base[2];
      for (const f of fields) {
        const dx = (x - f.cx) / f.r;
        const dy = (y - f.cy) / f.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const a = f.a * BELL_LUT[Math.round(d2 * LUT_SIZE)]!;
        r += (f.col[0] - r) * a;
        g += (f.col[1] - g) * a;
        b += (f.col[2] - b) * a;
      }
      const k = (j * w + i) * 4;
      px[k] = Math.round(base[0] + (r - base[0]) * top);
      px[k + 1] = Math.round(base[1] + (g - base[1]) * top);
      px[k + 2] = Math.round(base[2] + (b - base[2]) * top);
      px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const media = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** Builds the two layers and keeps them in step with the route, theme, size and visibility. */
export function initAurora() {
  const root = document.documentElement;
  const host = document.createElement('div');
  host.id = 'aurora';
  host.setAttribute('aria-hidden', 'true');
  const layers = [document.createElement('div'), document.createElement('div')] as const;
  for (const l of layers) {
    l.className = 'aurora-layer';
    host.appendChild(l);
  }
  document.body.prepend(host);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--safe-top);visibility:hidden;pointer-events:none';
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);

  const cache = new Map<string, string>();
  let front = 0;
  let shown: string | null = null;
  let drift: Animation | null = null;

  const viewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight, safeTop: probe.getBoundingClientRect().height });

  function image(route: Route): string | null {
    const style = getComputedStyle(root);
    const vp = viewport();
    const reduced = media('(prefers-reduced-transparency: reduce)');
    // the height in steps of 120 px: the iOS toolbar showing or hiding does not repaint
    const key = [route, vp.width, Math.ceil(vp.height / 120), vp.safeTop, reduced, style.getPropertyValue('--mesh-base'), style.getPropertyValue('--mesh-alpha')].join('|');
    let url = cache.get(key);
    if (!url) {
      url = paintAurora(COMPOSITIONS[route], { ...vp, height: Math.ceil(vp.height / 120) * 120 }, style, reduced) ?? undefined;
      if (url) cache.set(key, url);
    }
    return url ?? null;
  }

  function startDrift(layer: HTMLElement, route: Route) {
    drift?.cancel();
    drift = null;
    if (!DRIFT || media('(prefers-reduced-motion: reduce)') || !layer.animate) return;
    const [dx, dy] = COMPOSITIONS[route].drift;
    drift = layer.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${dx}vmax, ${dy}vmax, 0)` }], {
      duration: DRIFT_MS,
      // comes to rest softly
      easing: 'cubic-bezier(0.3, 0.1, 0.2, 1)',
      fill: 'forwards',
      id: AMBIENT_ID,
    });
    if (document.hidden) drift.pause();
  }

  function show(force = false) {
    const route = readRoute();
    const url = image(route);
    if (!url) return;
    const target = `url("${url}")`;
    if (!force && target === shown) return;
    const first = shown === null;
    shown = target;
    root.dataset.aurora = route;
    const next = (first ? layers[front] : layers[1 - front])!;
    const prev = layers[front]!;
    if (next !== prev) next.getAnimations().forEach((a) => a.cancel());
    next.style.setProperty('--aurora-image', target);
    if (first || force || media('(prefers-reduced-motion: reduce)')) {
      next.style.opacity = '1';
      if (next !== prev) {
        prev.getAnimations().forEach((a) => a.cancel());
        prev.style.opacity = '0';
        front = 1 - front;
      }
    } else {
      // cross-fade: only opacity
      next.style.opacity = '1';
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-in-out' });
      prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in-out', fill: 'forwards' }).finished.then(
        () => {
          if (layers[front] !== prev) prev.style.opacity = '0';
        },
        () => undefined,
      );
      front = 1 - front;
    }
    startDrift(next, route);
  }

  show();
  window.addEventListener('hashchange', () => show());
  document.addEventListener('visibilitychange', () => {
    // every CSS animation pauses with the page (index.css: :root[data-page-hidden])
    if (document.hidden) root.dataset.pageHidden = '';
    else delete root.dataset.pageHidden;
    // and every ambient Web Animation (drift, hero colour fields)
    for (const a of document.getAnimations()) {
      if (a.id !== AMBIENT_ID) continue;
      if (document.hidden && a.playState === 'running') a.pause();
      else if (!document.hidden && a.playState === 'paused') a.play();
    }
  });
  // theme (attribute or system) and size: repaint the shown composition
  let timer = 0;
  let width = window.innerWidth;
  const repaint = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => show(true), 120);
  };
  new MutationObserver(repaint).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', repaint);
  window.matchMedia?.('(prefers-reduced-transparency: reduce)').addEventListener?.('change', repaint);
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return; // a height-only resize (toolbar, full-page capture) keeps the image
    width = window.innerWidth;
    repaint();
  });
}
