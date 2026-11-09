// Contrast of the controls (answer buttons of the setup, segment controls, secondary buttons) in light
// and dark, from src/styles/tokens.css: the edge and the selected segment ≥ 3:1 against every
// background they sit on, every text ≥ 4.5:1 on its fill. CONTROLS_REPORT=<file> writes the table.
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

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

/** where the controls sit: the page, cards, the opaque sheet and the sheet while it moves */
function grounds(vars: Record<string, string>): [string, RGB][] {
  const canvas = rgb(vars, '--c-canvas');
  return [
    ['canvas', canvas],
    ['surface', rgb(vars, '--c-surface')],
    ['glass-opaque (Sheet)', rgb(vars, '--glass-opaque')],
    ['glass-fallback', rgb(vars, '--glass-fallback', canvas)],
  ];
}

const rows: string[] = [];
const themes: [string, Record<string, string>][] = [
  ['hell', light],
  ['dunkel', darkAttr],
];

afterAll(() => {
  if (process.env.CONTROLS_REPORT)
    writeFileSync(process.env.CONTROLS_REPORT, ['| Modus | Paar | Kontrast | Ziel |', '|---|---|---|---|', ...rows].join('\n') + '\n');
});

describe('Bedienelemente: Kontrast hell und dunkel', () => {
  it('beide Dunkel-Blöcke gleich', () => {
    for (const k of ['--c-control', '--c-control-edge', '--c-control-track', '--c-control-on', '--c-on-control']) expect(darkMedia[k]).toBe(darkAttr[k]);
  });
  for (const [theme, vars] of themes) {
    const check = (pair: string, a: RGB, b: RGB, min: number) => {
      const c = contrast(a, b);
      rows.push(`| ${theme} | ${pair} | ${c.toFixed(2)} : 1 | ≥ ${min} |`);
      expect(c, `${theme}: ${pair}`).toBeGreaterThanOrEqual(min);
    };
    it(`${theme}: Rand und gewähltes Segment ≥ 3:1 gegen den Untergrund`, () => {
      for (const [name, ground] of grounds(vars)) {
        check(`Rand (control-edge) / ${name}`, rgb(vars, '--c-control-edge'), ground, 3);
        check(`gewähltes Segment (control-on) / ${name}`, rgb(vars, '--c-control-on'), ground, 3);
      }
      check('gewähltes Segment / Segment-Spur', rgb(vars, '--c-control-on'), rgb(vars, '--c-control-track'), 3);
    });
    it(`${theme}: Text ≥ 4,5:1 auf seiner Fläche`, () => {
      check('Text (ink) / Button-Fläche', rgb(vars, '--c-ink'), rgb(vars, '--c-control'), 4.5);
      check('Text (ink-soft) / Button-Fläche', rgb(vars, '--c-ink-soft'), rgb(vars, '--c-control'), 4.5);
      check('Link-Text (accent-ink) / Button-Fläche', rgb(vars, '--c-accent-ink'), rgb(vars, '--c-control'), 4.5);
      check('Segment-Text (ink-mute) / Segment-Spur', rgb(vars, '--c-ink-mute'), rgb(vars, '--c-control-track'), 4.5);
      check('Segment-Text gewählt (on-control) / control-on', rgb(vars, '--c-on-control'), rgb(vars, '--c-control-on'), 4.5);
      check('Text (ink) / Hover-Fläche (control-track)', rgb(vars, '--c-ink'), rgb(vars, '--c-control-track'), 4.5);
    });
  }
});
