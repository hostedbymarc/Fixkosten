// Luxe 2: every text on glass, measured against the lightest and the darkest point of the
// Aurora-Mesh behind it – per screen composition (src/lib/aurora.ts), light and dark, iPhone and
// desktop viewport. The glass fill is composited over the mesh point after the backdrop's
// brightness(1.05) (the blur only averages, so a single point is the worst case). Text ≥ 4.5.
// CONTRAST_REPORT_LUXE2=<file> writes the table as Markdown (for the PR).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPOSITIONS, meshColour } from './aurora';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css)!;
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

function resolve(v: Record<string, string>, name: string): string {
  let s = v[name];
  if (s === undefined) throw new Error(`token ${name} missing`);
  for (let n = 0; n < 5; n++) s = s.replace(/var\((--[\w-]+)\)/g, (_, r: string) => v[r]!);
  return s;
}
function colour(v: Record<string, string>, name: string): RGBA {
  const s = resolve(v, name);
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
  m = /^(\d+) (\d+) (\d+)$/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), 1];
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  throw new Error(`cannot read ${name}: ${s}`);
}
const rgb = (v: Record<string, string>, n: string) => colour(v, n).slice(0, 3) as RGB;
const over = (top: RGBA, bottom: RGB): RGB => [0, 1, 2].map((i) => top[i]! * top[3] + bottom[i]! * (1 - top[3])) as RGB;
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const brighter = (c: RGB): RGB => c.map((x) => Math.min(255, x * 1.05)) as RGB;

const VIEWPORTS = [
  { name: 'iPhone', width: 393, height: 852, safeTop: 0 },
  { name: 'Desktop', width: 1440, height: 900, safeTop: 0 },
];

/** Lightest and darkest mesh colour of a composition (a 24 × 24 grid over the viewport). */
function extremes(v: Record<string, string>, route: keyof typeof COMPOSITIONS): [RGB, RGB] {
  const cols = {
    base: rgb(v, '--mesh-base'),
    brand: rgb(v, '--mesh-brand'),
    butter: rgb(v, '--mesh-butter'),
    peach: rgb(v, '--mesh-peach'),
    sky: rgb(v, '--mesh-sky'),
    lilac: rgb(v, '--mesh-lilac'),
  };
  const scale = Number(resolve(v, '--mesh-alpha'));
  let lo: RGB = [255, 255, 255];
  let hi: RGB = [0, 0, 0];
  for (const vp of VIEWPORTS)
    for (let i = 0; i <= 24; i++)
      for (let j = 0; j <= 24; j++) {
        const c = meshColour(COMPOSITIONS[route], { x: (i / 24) * vp.width, y: (j / 24) * vp.height }, vp, cols, scale);
        if (lum(c) < lum(lo)) lo = c;
        if (lum(c) > lum(hi)) hi = c;
      }
  return [lo, hi];
}

interface Row {
  theme: string;
  screen: string;
  what: string;
  fg: string;
  ratio: number;
}
const TONES = ['butter', 'peach', 'sky', 'lilac', 'pea'] as const;
const GLASS_TEXT = ['--c-ink', '--c-ink-soft', '--c-ink-mute', '--c-ink-faint', '--c-accent-ink', '--c-paid-ink', '--c-over', '--c-warn'];
const MESH_TEXT = ['--c-ink', '--c-ink-soft', '--c-accent-ink'];

function measure(theme: string, v: Record<string, string>): Row[] {
  const rows: Row[] = [];
  for (const screen of Object.keys(COMPOSITIONS) as (keyof typeof COMPOSITIONS)[]) {
    const points = extremes(v, screen).map(brighter);
    const glass = points.map((p) => over(colour(v, '--glass-bg'), p));
    for (const fg of GLASS_TEXT) {
      // the amber chip text sits on its own chip, measured below
      if (fg === '--c-warn') continue;
      rows.push({ theme, screen, what: 'Text auf Glas', fg, ratio: Math.min(...glass.map((g) => contrast(rgb(v, fg), g))) });
    }
    // amber chip (warn-soft) on glass
    rows.push({ theme, screen, what: 'Amber-Chip „Kommt bald“', fg: '--c-warn', ratio: contrast(rgb(v, '--c-warn'), rgb(v, '--c-warn-soft')) });
    for (const fg of MESH_TEXT) {
      rows.push({ theme, screen, what: 'Text direkt auf dem Mesh', fg, ratio: Math.min(...points.map((p) => contrast(rgb(v, fg), p))) });
    }
    const alpha = Number(resolve(v, '--glass2-tile-alpha'));
    for (const t of TONES) {
      const tone = rgb(v, `--${t}`);
      const deep = rgb(v, `--${t}-deep`);
      // the tile over the mesh, and its corner where the second tone glows in (inset, .9)
      const surfaces = points.flatMap((p) => {
        const tile = over([...tone, alpha] as RGBA, p);
        return [tile, over([...deep, 0.9] as RGBA, tile)];
      });
      for (const [fg, what] of [
        [`--${t}-ink`, 'Kachel-Zahl, Label'],
        [`--${t}-ink-soft`, 'Unterzeile'],
        ['--c-over', 'negativer Betrag'],
      ] as const) {
        rows.push({ theme, screen, what: `getöntes Glas ${t}: ${what}`, fg, ratio: Math.min(...surfaces.map((s) => contrast(rgb(v, fg), s))) });
      }
    }
  }
  return rows;
}

const ALL = [...measure('Hell', light), ...measure('Dunkel', dark)];

describe('Luxe 2: Text auf Glas gegen die hellste und dunkelste Mesh-Stelle', () => {
  for (const r of ALL) {
    it(`${r.theme} · ${r.screen} · ${r.what} (${r.fg}) ≥ 4.5`, () => {
      expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

if (process.env.CONTRAST_REPORT_LUXE2) {
  const lines = ['| Screen | Paar | Token | Hell | Dunkel |', '|---|---|---|---|---|'];
  for (const r of ALL.filter((x) => x.theme === 'Hell')) {
    const d = ALL.find((x) => x.theme === 'Dunkel' && x.screen === r.screen && x.what === r.what && x.fg === r.fg)!;
    const cell = (x: number) => `${x.toFixed(2)} ${x >= 4.5 ? '✓' : '✗'}`;
    lines.push(`| ${r.screen} | ${r.what} | \`${r.fg}\` | ${cell(r.ratio)} | ${cell(d.ratio)} |`);
  }
  writeFileSync(process.env.CONTRAST_REPORT_LUXE2, lines.join('\n') + '\n');
}
