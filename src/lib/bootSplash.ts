// The static start screen (index.html), filled in at build time from src/styles/tokens.css: the
// first paint shows the base colour, the Aurora-Mesh of the Monat screen and the flat logo before any
// script or stylesheet has loaded – never a white screen, also not in dark mode.
//
// Used by vite.config.ts (transformIndexHtml) and scripts/make-startup-images.mjs. Pure: no DOM.
// The colours are the token values; nothing here holds a colour of its own.
import { COMPOSITIONS, FADE, TOP_FADE, type Hue } from './meshCompositions';

type Vars = Record<string, string>;

/** The custom properties of one block of tokens.css (light `:root`, dark `:root[data-theme='dark']`). */
function block(css: string, selector: RegExp): Vars {
  const m = selector.exec(css);
  if (!m) throw new Error(`tokens.css: block ${selector} missing`);
  const start = css.indexOf('{', m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    i++;
  }
  const out: Vars = {};
  for (const [, name, value] of css.slice(start, i - 1).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[name!] = value!.trim();
  return out;
}

export interface BootTheme {
  /** --nebel-base: html, body, theme-color, the mesh's base */
  base: string;
  /** --c-mark: the logo (brand; a lighter brand tone in dark mode) */
  mark: [number, number, number];
  /** --mesh-* colours and --mesh-alpha */
  mesh: Record<Hue, [number, number, number]>;
  meshAlpha: number;
}

function resolve(vars: Vars, name: string): string {
  let v = vars[name];
  if (v === undefined) throw new Error(`tokens.css: ${name} missing`);
  for (let n = 0; n < 5 && v.includes('var('); n++) v = v.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => vars[ref] ?? '');
  return v;
}

function channels(value: string): [number, number, number] {
  let m = /^#([0-9a-f]{6})$/i.exec(value);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)) as [number, number, number];
  m = /^(\d+) (\d+) (\d+)$/.exec(value);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  throw new Error(`tokens.css: cannot read colour ${value}`);
}

const HUES: Hue[] = ['brand', 'butter', 'peach', 'sky', 'lilac'];

/** Light and dark values of the start screen, read from tokens.css. */
export function bootThemes(tokensCss: string): { light: BootTheme; dark: BootTheme } {
  const light = block(tokensCss, /^:root \{/m);
  const dark = { ...light, ...block(tokensCss, /^:root\[data-theme='dark'\] \{/m) };
  const theme = (v: Vars): BootTheme => ({
    base: resolve(v, '--nebel-base').toLowerCase(),
    mark: channels(resolve(v, '--c-mark')),
    mesh: Object.fromEntries(HUES.map((h) => [h, channels(resolve(v, `--mesh-${h}`))])) as Record<Hue, [number, number, number]>,
    meshAlpha: Number(resolve(v, '--mesh-alpha')),
  });
  return { light: theme(light), dark: theme(dark) };
}

const num = (x: number) => String(Math.round(x * 1000) / 1000);
const rgb = ([r, g, b]: [number, number, number], a?: number) => (a === undefined ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${num(a)})`);

/**
 * The Monat composition as CSS: one radial gradient per field with the bell falloff of the painted
 * mesh (src/lib/aurora.ts), the top field first (CSS paints the first layer on top), and the fade to
 * the base colour under the status bar. The same fields and positions as the bitmap that replaces it.
 */
export function meshLayers(t: BootTheme): string {
  const fields = COMPOSITIONS.monat.fields.map((f) => {
    const a = Math.min(1, f.a * t.meshAlpha);
    const stops = FADE.map(([at, share]) => `${rgb(t.mesh[f.hue], a * share)} ${num(at * 100)}%`).join(', ');
    return `radial-gradient(circle ${f.r}vmax at ${num(f.x * 100)}% ${num(f.y * 100)}%, ${stops})`;
  });
  const base = channels(t.base);
  // aurora.ts: the mesh is (1 − u)² towards the base colour from the safe area down TOP_FADE px
  const top = [0, 0.25, 0.5, 0.75, 1]
    .map((u) => `${rgb(base, (1 - u) ** 2)} calc(var(--boot-safe-top) + ${num(u * TOP_FADE)}px)`)
    .join(', ');
  return [`linear-gradient(to bottom, ${rgb(base)} 0, ${top})`, ...fields.reverse()].join(', ');
}

function themeVars(t: BootTheme): string {
  return `--boot-base:${t.base};--boot-mark:${rgb(t.mark)};--boot-mesh:${meshLayers(t)};`;
}

/**
 * Logo of the start screen: the app icon's three overlapping peas (r 3.4 at cx 9 / 14 / 19 on the
 * 28 grid: 16.8 × 6.8 units), flat, opacity 100 / 85 / 70 %. 48 px wide on phones, 56 px from 768 px
 * (iPad, desktop), centred.
 */
export const BOOT_MARK_WIDTH = { phone: 48, wide: 56 } as const;
const WIDE_FROM = 768;
/** The three peas: left edge and opacity, as a share of the logo's width (the icon's grid). */
export const BOOT_PEAS = [
  { left: 0, opacity: 1 },
  { left: 5 / 16.8, opacity: 0.85 },
  { left: 10 / 16.8, opacity: 0.7 },
] as const;
/** Diameter of a pea as a share of the logo's width. */
export const BOOT_PEA_SIZE = 6.8 / 16.8;

/**
 * Motion of the start screen, in this stylesheet only (CSS, no script): it runs from the first paint
 * of a cold start and the app never restarts it – it takes over the same element.
 * - in: one pea after the other, left to right: 0 → its opacity, sliding 4 px in from the left
 *   (240 ms each, 120 ms apart, soft curve)
 * - while still loading: a calm wave of opacity, left to right (between its opacity and 40 % of it,
 *   1.4 s per cycle, 150 ms apart)
 * - out (src/lib/entrance.ts: .splash-out): logo and background fade in 200 ms
 * „Bewegung reduzieren“: the peas stand at once, no sliding and no pulse, only the fade out.
 */
export const BOOT_MOTION = { inMs: 240, inStagger: 120, slidePx: 4, pulseMs: 1400, pulseStagger: 150, pulseLow: 0.4, outMs: 200 } as const;
/** The wave starts once the last pea is in. */
export const BOOT_PULSE_START = BOOT_MOTION.inStagger * 2 + BOOT_MOTION.inMs;

/**
 * The inline stylesheet of the start screen: layout, colours and motion of #splash live only here,
 * so the first paint (before any script or other stylesheet) is the start screen as it stays.
 */
export function bootCss(tokensCss: string): string {
  const { light, dark } = bootThemes(tokensCss);
  const m = BOOT_MOTION;
  const pea = (i: number) => {
    const p = BOOT_PEAS[i]!;
    return [
      `.splash-pea:nth-child(${i + 1}){left:${num(p.left * 100)}%;--o:${p.opacity};`,
      `animation:splash-in ${m.inMs}ms cubic-bezier(0.22,1,0.36,1) ${i * m.inStagger}ms both,`,
      `splash-pulse ${m.pulseMs}ms ease-in-out ${BOOT_PULSE_START + i * m.pulseStagger}ms infinite}`,
    ].join('');
  };
  return [
    `:root{--boot-safe-top:env(safe-area-inset-top,0px);${themeVars(light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${themeVars(dark)}}}`,
    `:root[data-theme='dark']{${themeVars(dark)}}`,
    // never white: the page has its base colour before anything else is there
    `html,body{margin:0;background-color:var(--boot-base)}`,
    `#splash{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;pointer-events:none}`,
    `#splash.splash-out{opacity:0;transition:opacity ${m.outMs}ms ease-out}`,
    `.splash-bg{position:absolute;inset:0;background-color:var(--boot-base)}`,
    // the mesh fades in over the plain base colour: the iOS start image (only the base colour) turns into it softly
    `.splash-mesh{position:absolute;inset:0;background-image:var(--boot-mesh);animation:boot-mesh 600ms ease-out 80ms both}`,
    `@keyframes boot-mesh{from{opacity:0}to{opacity:1}}`,
    `.splash-mark{position:relative;display:block;width:${BOOT_MARK_WIDTH.phone}px;height:${num(BOOT_MARK_WIDTH.phone * BOOT_PEA_SIZE)}px;color:var(--boot-mark)}`,
    `@media (min-width: ${WIDE_FROM}px){.splash-mark{width:${BOOT_MARK_WIDTH.wide}px;height:${num(BOOT_MARK_WIDTH.wide * BOOT_PEA_SIZE)}px}}`,
    `.splash-pea{position:absolute;top:0;width:${num(BOOT_PEA_SIZE * 100)}%;height:100%;border-radius:50%;background-color:currentColor;opacity:var(--o)}`,
    pea(0),
    pea(1),
    pea(2),
    `@keyframes splash-in{from{opacity:0;transform:translateX(-${m.slidePx}px)}to{opacity:var(--o);transform:translateX(0)}}`,
    `@keyframes splash-pulse{0%,100%{opacity:var(--o)}50%{opacity:calc(var(--o) * ${m.pulseLow})}}`,
    `@media (prefers-reduced-motion: reduce){.splash-mesh,.splash-pea{animation:none!important}#splash.splash-out{transition-duration:${m.outMs}ms!important}}`,
  ].join('\n');
}

/** iPhone and iPad screens for apple-touch-startup-image (CSS px and pixel ratio). The images show only the background. */
export interface StartupDevice {
  name: string;
  width: number;
  height: number;
  dpr: number;
  ipad: boolean;
}

export const STARTUP_DEVICES: StartupDevice[] = [
  // iPhone
  { name: 'iphone-se', width: 375, height: 667, dpr: 2, ipad: false }, // SE 2/3, 6–8
  { name: 'iphone-8-plus', width: 414, height: 736, dpr: 3, ipad: false },
  { name: 'iphone-x', width: 375, height: 812, dpr: 3, ipad: false }, // X, XS, 11 Pro, 12/13 mini
  { name: 'iphone-xr', width: 414, height: 896, dpr: 2, ipad: false }, // XR, 11
  { name: 'iphone-xs-max', width: 414, height: 896, dpr: 3, ipad: false }, // XS Max, 11 Pro Max
  { name: 'iphone-12', width: 390, height: 844, dpr: 3, ipad: false }, // 12, 13, 14, 16e
  { name: 'iphone-12-pro-max', width: 428, height: 926, dpr: 3, ipad: false }, // 12/13 Pro Max, 14 Plus
  { name: 'iphone-15', width: 393, height: 852, dpr: 3, ipad: false }, // 14 Pro, 15, 15 Pro, 16
  { name: 'iphone-15-pro-max', width: 430, height: 932, dpr: 3, ipad: false }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { name: 'iphone-air', width: 420, height: 912, dpr: 3, ipad: false },
  { name: 'iphone-16-pro', width: 402, height: 874, dpr: 3, ipad: false }, // 16 Pro, 17, 17 Pro
  { name: 'iphone-16-pro-max', width: 440, height: 956, dpr: 3, ipad: false }, // 16/17 Pro Max
  // iPad (portrait and landscape)
  { name: 'ipad-9-7', width: 768, height: 1024, dpr: 2, ipad: true }, // iPad 9.7", mini 5
  { name: 'ipad-mini', width: 744, height: 1133, dpr: 2, ipad: true }, // mini 6/7
  { name: 'ipad-10-2', width: 810, height: 1080, dpr: 2, ipad: true },
  { name: 'ipad-10-5', width: 834, height: 1112, dpr: 2, ipad: true },
  { name: 'ipad-air', width: 820, height: 1180, dpr: 2, ipad: true }, // Air 4/5, iPad 10/11
  { name: 'ipad-pro-11', width: 834, height: 1194, dpr: 2, ipad: true }, // Pro 11 (1–4), Air 11
  { name: 'ipad-pro-11-m4', width: 834, height: 1210, dpr: 2, ipad: true },
  { name: 'ipad-pro-12-9', width: 1024, height: 1366, dpr: 2, ipad: true }, // Pro 12.9, Air 13
  { name: 'ipad-pro-13-m4', width: 1032, height: 1376, dpr: 2, ipad: true },
];

export type Scheme = 'light' | 'dark';
export interface StartupImage {
  device: StartupDevice;
  orientation: 'portrait' | 'landscape';
  scheme: Scheme;
  /** public path, e.g. /startup/iphone-15-portrait-light.png */
  href: string;
  /** CSS px of the screen in this orientation */
  width: number;
  height: number;
  media: string;
}

/** Every start image: iPhones portrait, iPads portrait and landscape, light and dark. */
export function startupImages(): StartupImage[] {
  return (['dark', 'light'] as const).flatMap((scheme) =>
    STARTUP_DEVICES.flatMap((device) =>
      (device.ipad ? (['portrait', 'landscape'] as const) : (['portrait'] as const)).map((orientation) => {
        const [width, height] = orientation === 'portrait' ? [device.width, device.height] : [device.height, device.width];
        const media =
          `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.dpr})` +
          ` and (orientation: ${orientation})` +
          (scheme === 'dark' ? ' and (prefers-color-scheme: dark)' : '');
        return { device, orientation, scheme, href: `/startup/${device.name}-${orientation}-${scheme}.png`, width, height, media };
      }),
    ),
  );
}

/**
 * The <link rel="apple-touch-startup-image"> tags. Dark first, with (prefers-color-scheme: dark);
 * light after it without a colour-scheme condition: should iOS not understand the dark condition
 * (or pick the last match), the light image is used – never no image at all.
 */
export function startupLinks(): string {
  return startupImages()
    .map((i) => `<link rel="apple-touch-startup-image" media="${i.media}" href="${i.href}" />`)
    .join('\n    ');
}

/** index.html with the start screen filled in: the inline stylesheet, theme-color per theme, the start images. */
export function renderBootHtml(html: string, tokensCss: string): string {
  const { light, dark } = bootThemes(tokensCss);
  return html
    .replace('<!-- boot:css -->', `<style id="boot-css">\n${bootCss(tokensCss)}\n    </style>`)
    .replace('<!-- boot:startup-images -->', startupLinks())
    .replace('%BOOT_THEME_LIGHT%', light.base)
    .replace('%BOOT_THEME_DARK%', dark.base);
}
