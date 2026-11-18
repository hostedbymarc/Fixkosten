// „Woraus du bezahlst“ on the hero (ruecklage-spielgeld): the colours of bar and dots ≥ 3:1 against both
// ends of the hero gradient, the text on the hero ≥ 4.5:1 – light and dark, from src/styles/tokens.css.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type RGB = [number, number, number];
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
const darkMedia = { ...light, ...block(/:root:not\(\[data-theme='light'\]\) \{/) };
const darkAttr = { ...light, ...block(/^:root\[data-theme='dark'\] \{/m) };

function rgb(vars: Record<string, string>, name: string, under: RGB = [255, 255, 255]): RGB {
  let v = vars[name];
  if (v === undefined) throw new Error(`token ${name} missing`);
  for (let n = 0; n < 5; n++) v = v.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => vars[ref]!);
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)) as RGB;
  m = /^(\d+) (\d+) (\d+)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (m) {
    const a = Number(m[4]);
    return [1, 2, 3].map((i, k) => Number(m![i]) * a + under[k]! * (1 - a)) as RGB;
  }
  throw new Error(`cannot read ${name}: ${v}`);
}
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};


for (const [mode, vars] of [
  ['hell', light],
  ['dunkel (System)', darkMedia],
  ['dunkel (Einstellung)', darkAttr],
] as const) {
  describe(`Hero-Quellen · ${mode}`, () => {
    const grounds: [string, RGB][] = [
      ['hero-from', rgb(vars, '--hero-from')],
      ['hero-to', rgb(vars, '--hero-to')],
    ];
    for (const token of ['--hero-src-reserve', '--hero-src-salary', '--hero-src-spielgeld']) {
      for (const [name, ground] of grounds) {
        it(`${token} gegen ${name} ≥ 3:1`, () => expect(contrast(rgb(vars, token), ground)).toBeGreaterThanOrEqual(3));
      }
    }
    for (const token of ['--hero-ink', '--hero-ink-soft']) {
      for (const [name, ground] of grounds) {
        it(`Text ${token} gegen ${name} ≥ 4,5:1`, () => expect(contrast(rgb(vars, token), ground)).toBeGreaterThanOrEqual(4.5));
      }
    }
    it('die drei Farben sind verschieden', () => {
      const all = ['--hero-src-reserve', '--hero-src-salary', '--hero-src-spielgeld'].map((t) => rgb(vars, t).join(','));
      expect(new Set(all).size).toBe(3);
    });
  });
}
