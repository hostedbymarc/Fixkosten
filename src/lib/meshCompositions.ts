// The Aurora-Mesh compositions and their falloff, without anything of the browser or React: used by
// src/lib/aurora.ts (the painted layers) and by the build (src/lib/bootSplash.ts: the static start
// screen in index.html draws the same fields as CSS before any script runs).
import type { Route } from './routes';

export type Hue = 'brand' | 'butter' | 'peach' | 'sky' | 'lilac';
/** One colour field: centre (share of the viewport), radius in vmax, alpha (light theme). */
export interface Field {
  hue: Hue;
  x: number;
  y: number;
  r: number;
  a: number;
}
export interface Composition {
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

/** Bell-shaped falloff, the same curve as the Nebel: share of the alpha at distance t (1 = rim). */
export const FADE: [number, number][] = [
  [0, 1],
  [0.15, 0.9],
  [0.3, 0.66],
  [0.45, 0.39],
  [0.6, 0.19],
  [0.75, 0.075],
  [0.9, 0.024],
  [1, 0],
];
export function bell(t: number): number {
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

/** Under the status bar the mesh fades to the base colour (iOS samples the body colour for the bar). */
export const TOP_FADE = 220;
