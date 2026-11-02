// Contrast of the Luxe tokens (src/styles/tokens.css), light and dark: hero gradient, accent tiles,
// cards, check pea, logo. Text ≥ 4.5, large numbers / icons / graphics ≥ 3.
// Translucent surfaces are composited over the darkest and lightest page point (Nebel blob centre
// and plain base). CONTRAST_REPORT_LUXE=<file> writes the measured table as Markdown (for the PR).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`block ${selector} missing`);
  const start = css.indexOf('{', m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    i++;
  }
  const out: Record<string, string> = {};
  for (const [, name, value] of css.slice(start, i - 1).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[name!] = value!.trim();
  return out;
}

const light = block(/^:root \{/m);
const dark = { ...light, ...block(/^:root\[data-theme='dark'\] \{/m) };
const darkMedia = { ...light, ...block(/:root:not\(\[data-theme='light'\]\) \{/) };

function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name];
  if (v === undefined) throw new Error(`token ${name} missing`);
  for (let n = 0; n < 5; n++) v = v.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => vars[ref]!);
  return v;
}
function color(vars: Record<string, string>, name: string): RGBA {
  const v = resolve(vars, name);
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
  m = /^(\d+) (\d+) (\d+)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), 1];
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  throw new Error(`cannot read ${name}: ${v}`);
}
const over = (top: RGBA, bottom: RGB): RGB => [0, 1, 2].map((i) => top[i]! * top[3] + bottom[i]! * (1 - top[3])) as RGB;
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
function lab([r, g, b]: RGB): RGB {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const rad = (d: number) => (d * Math.PI) / 180;
/** CIEDE2000 */
function deltaE(c1: RGB, c2: RGB): number {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const C1 = Math.hypot((1 + G) * a1, b1);
  const C2 = Math.hypot((1 + G) * a2, b2);
  const h = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const h1 = h((1 + G) * a1, b1);
  const h2 = h((1 + G) * a2, b2);
  let dh = h2 - h1;
  if (C1 * C2 === 0) dh = 0;
  else if (Math.abs(dh) > 180) dh -= 360 * Math.sign(dh);
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1 + C2) / 2;
  const hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const dt = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dt)) * Rc;
  return Math.sqrt(((L2 - L1) / Sl) ** 2 + ((C2 - C1) / Sc) ** 2 + (dH / Sh) ** 2 + Rt * ((C2 - C1) / Sc) * (dH / Sh));
}

/** A surface as its darkest and lightest composite colour. */
function surfaces(v: Record<string, string>) {
  const base = color(v, '--nebel-base').slice(0, 3) as RGB;
  const page: RGB[] = [over(color(v, '--nebel-1'), base), base];
  const solid = (n: string) => [color(v, n).slice(0, 3) as RGB];
  const onPage = (n: string) => page.map((p) => over(color(v, n), p));
  const onHero = (n: string) => ['--hero-from', '--hero-to'].map((h) => over(color(v, n), color(v, h).slice(0, 3) as RGB));
  return {
    'Hero (Verlauf)': [...solid('--hero-from'), ...solid('--hero-to')],
    'Hero-Pille': onHero('--hero-chip-bg'),
    'Hero-Pille aktiv': solid('--hero-chip-on-bg'),
    'Hero-Ring-Spur': onHero('--hero-ring-track'),
    butter: solid('--butter'),
    peach: solid('--peach'),
    sky: solid('--sky'),
    lilac: solid('--lilac'),
    pea: solid('--pea'),
    Karte: onPage('--card-bg'),
    'Karte deckend': solid('--card-solid'),
    'Haken-Erbse': [...solid('--check-body'), ...solid('--check-glint')],
    // the peas sit between y 10.4 and 17.6 of 28: the square's gradient there (t .37 … .63)
    'Logo-Quadrat (hinter den Erbsen)': [0.37, 0.63].map((t) => {
      const [a, b] = [color(v, '--logo-top'), color(v, '--logo-bottom')];
      return [0, 1, 2].map((i) => a[i]! * (1 - t) + b[i]! * t) as RGB;
    }),
    'Amber-Chip': solid('--c-warn-soft'),
    Nebel: page,
  };
}
type Surface = keyof ReturnType<typeof surfaces>;
interface Pair {
  what: string;
  fg: string;
  on: Surface;
  min: 4.5 | 3;
}
const TONES = ['butter', 'peach', 'sky', 'lilac', 'pea'] as const;
const PAIRS: Pair[] = [
  { what: 'Riesenzahl / Text auf dem Hero', fg: '--hero-ink', on: 'Hero (Verlauf)', min: 4.5 },
  { what: '„von € …“ auf dem Hero', fg: '--hero-ink-soft', on: 'Hero (Verlauf)', min: 4.5 },
  { what: 'Fortschrittsring', fg: '--hero-ring', on: 'Hero (Verlauf)', min: 3 },
  { what: 'Ring vs. Spur', fg: '--hero-ring', on: 'Hero-Ring-Spur', min: 3 },
  { what: 'Chip „N offen · €“', fg: '--hero-chip-ink', on: 'Hero-Pille', min: 4.5 },
  { what: 'Chip gedrückt', fg: '--hero-chip-on-ink', on: 'Hero-Pille aktiv', min: 4.5 },
  ...TONES.flatMap((t): Pair[] => [
    { what: `${t}: Kachel-Zahl, Label`, fg: `--${t}-ink`, on: t, min: 4.5 },
    { what: `${t}: Unterzeile`, fg: `--${t}-ink-soft`, on: t, min: 4.5 },
    { what: `${t}: negativer Betrag (Rot)`, fg: '--c-over', on: t, min: 4.5 },
  ]),
  { what: 'Karte: Text', fg: '--c-ink', on: 'Karte', min: 4.5 },
  { what: 'Karte: Status, Ø', fg: '--c-ink-mute', on: 'Karte', min: 4.5 },
  { what: 'Karte: „✓ bezahlt“', fg: '--c-paid-ink', on: 'Karte', min: 4.5 },
  { what: 'Karte: Link „Alle anzeigen“', fg: '--c-accent-ink', on: 'Karte', min: 4.5 },
  { what: 'Karte: Rot', fg: '--c-over', on: 'Karte', min: 4.5 },
  { what: 'Karte deckend: Text', fg: '--c-ink-mute', on: 'Karte deckend', min: 4.5 },
  { what: 'Haken-Erbse: Häkchen', fg: '--check-ink', on: 'Haken-Erbse', min: 3 },
  { what: 'Haken-Erbse auf der Karte', fg: '--check-body', on: 'Karte', min: 3 },
  { what: 'offener Ring (gestrichelt)', fg: '--c-check-open', on: 'Karte', min: 3 },
  { what: 'Logo-Erbse auf dem Quadrat', fg: '--pea-body', on: 'Logo-Quadrat (hinter den Erbsen)', min: 3 },
  { what: 'Amber-Chip „Kommt bald“: Text', fg: '--c-warn', on: 'Amber-Chip', min: 4.5 },
  { what: 'Amber-Uhr auf der Karte', fg: '--c-warn-icon', on: 'Karte', min: 3 },
  { what: 'Abschnittstitel', fg: '--c-ink-soft', on: 'Nebel', min: 4.5 },
];

function measure(v: Record<string, string>) {
  const s = surfaces(v);
  return PAIRS.map((p) => {
    const fg = color(v, p.fg);
    const ratios = s[p.on].map((bg) => contrast(over(fg, bg), bg));
    return { ...p, ratio: Math.min(...ratios) };
  });
}

const rows = { Hell: measure(light), Dunkel: measure(dark) };

describe('Luxe: Kontrast der neuen Token-Paare', () => {
  for (const [theme, list] of Object.entries(rows)) {
    for (const r of list) {
      it(`${theme}: ${r.what} (${r.fg} auf ${r.on}) ≥ ${r.min}`, () => {
        expect(r.ratio).toBeGreaterThanOrEqual(r.min);
      });
    }
  }
  it('beide Dunkel-Blöcke sind für die Luxe-Tokens identisch', () => {
    for (const k of Object.keys(light).filter((k) => /^--(hero|butter|peach|sky|lilac|pea|card|shadow-card|shadow-tile|check|logo|fab)/.test(k))) {
      expect(darkMedia[k], k).toBe(dark[k]);
    }
  });
});

const rgb = (v: Record<string, string>, n: string) => color(v, n).slice(0, 3) as RGB;
const DELTAS = [
  { what: 'Amber (Signal) vs. butter', a: '--c-warn-icon', b: '--butter' },
  { what: 'Amber (Text) vs. butter', a: '--c-warn', b: '--butter' },
];
describe('Luxe: Farbabstand Amber vs. butter (CIEDE2000)', () => {
  for (const [theme, v] of [['Hell', light], ['Dunkel', dark]] as const) {
    for (const d of DELTAS) {
      it(`${theme}: ${d.what} ≥ 20`, () => {
        expect(deltaE(rgb(v, d.a), rgb(v, d.b))).toBeGreaterThanOrEqual(20);
      });
    }
  }
});

if (process.env.CONTRAST_REPORT_LUXE) {
  const lines = ['| Paar | Token | Fläche | Min | Hell | Dunkel |', '|---|---|---|---|---|---|'];
  rows.Hell.forEach((r, i) => {
    const d = rows.Dunkel[i]!;
    const cell = (x: number) => `${x.toFixed(2)} ${x >= r.min ? '✓' : '✗'}`;
    lines.push(`| ${r.what} | \`${r.fg}\` | ${r.on} | ${r.min} | ${cell(r.ratio)} | ${cell(d.ratio)} |`);
  });
  lines.push('', '| ΔE2000 | Hell | Dunkel |', '|---|---|---|');
  for (const d of [...DELTAS, { what: 'Amber-Chip-Fläche vs. butter (nur Info)', a: '--c-warn-soft', b: '--butter' }]) {
    lines.push(`| ${d.what} | ${deltaE(rgb(light, d.a), rgb(light, d.b)).toFixed(1)} | ${deltaE(rgb(dark, d.a), rgb(dark, d.b)).toFixed(1)} |`);
  }
  writeFileSync(process.env.CONTRAST_REPORT_LUXE, lines.join('\n') + '\n');
}
