// „Dein Monat“ (monat-verdichtet) on the dark green hero surface: text ≥ 4.5:1, the big numbers ≥ 3:1 against both
// ends of the gradient; the pill (light glass over the gradient) and the button (brand-100 / brand-700) ≥ 4.5:1;
// the marks of „Dein Plan“ (frei unter dem Spielgeld, Passt) ≥ 4.5:1 on the sheet – light and dark, from tokens.css.
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


const over = (fg: RGB, a: number, under: RGB): RGB => fg.map((c, i) => c * a + under[i]! * (1 - a)) as RGB;

for (const [mode, vars] of [
  ['hell', light],
  ['dunkel (System)', darkMedia],
  ['dunkel (Einstellung)', darkAttr],
] as const) {
  describe(`Dein Monat · ${mode}`, () => {
    const grounds: [string, RGB][] = [
      ['hero-from', rgb(vars, '--hero-from')],
      ['hero-to', rgb(vars, '--hero-to')],
    ];
    for (const [name, ground] of grounds) {
      it(`Text (hero-ink, hero-ink-soft) gegen ${name} ≥ 4,5:1`, () => {
        expect(contrast(rgb(vars, '--hero-ink'), ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb(vars, '--hero-ink-soft'), ground)).toBeGreaterThanOrEqual(4.5);
      });
      it(`„Frei für dich“ (große Zahl) gegen ${name} ≥ 3:1`, () => expect(contrast(rgb(vars, '--hero-ink'), ground)).toBeGreaterThanOrEqual(3));
      it(`Pille: hero-chip-ink auf hellem Glas über ${name} ≥ 4,5:1`, () => {
        const bg = rgb(vars, '--hero-chip-bg', ground);
        expect(contrast(rgb(vars, '--hero-chip-ink'), bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it('Spielgeld-Pille „drüber“ (monat-ist-monat): warn auf warn-soft ≥ 4,5:1', () => expect(contrast(rgb(vars, '--c-warn'), rgb(vars, '--c-warn-soft'))).toBeGreaterThanOrEqual(4.5));
    it('Knopf „… überwiesen“: brand-700 auf brand-100 ≥ 4,5:1', () => expect(contrast(rgb(vars, '--brand-700'), rgb(vars, '--brand-100'))).toBeGreaterThanOrEqual(4.5));
    it('Nummern ①②③: hero-chip-ink auf dem Glas ≥ 4,5:1', () => {
      for (const [, ground] of grounds) expect(contrast(rgb(vars, '--hero-chip-ink'), over(rgb(vars, '--hero-chip-ink'), 0, rgb(vars, '--hero-chip-bg', ground)))).toBeGreaterThanOrEqual(4.5);
    });
  });
}
