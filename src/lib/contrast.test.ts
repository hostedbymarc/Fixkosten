// Contrast of every text/background pair in src/styles/tokens.css, light and dark.
// Backgrounds are checked at their darkest and lightest point: the Nebel blob centre
// (incl. 3 % grain) and the plain base, each with the glass layers on top.
// CONTRAST_REPORT=<file> writes the measured table as Markdown (used for the PR).
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
const darkMedia = block(/:root:not\(\[data-theme='light'\]\) \{/);
const darkAttr = block(/^:root\[data-theme='dark'\] \{/m);
const dark = { ...light, ...darkAttr };

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
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

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
export function deltaE(c1: RGB, c2: RGB): number {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const h = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const h1 = h(a1p, b1);
  const h2 = h(a2p, b2);
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

const GRAIN: RGBA = [0, 0, 0, 0.5 * 0.06]; // noise alpha .5 × layer opacity .06

/** The places a token can sit on, at their darkest and lightest point. */
function surfaces(v: Record<string, string>) {
  const base = color(v, '--nebel-base').slice(0, 3) as RGB;
  const blob = over(color(v, '--nebel-1'), base);
  const points: [RGB, RGB] = [over(GRAIN, blob), base]; // darkest (green centre + grain), lightest
  const on = (layer: string) => points.map((p) => over(color(v, layer), p)) as [RGB, RGB];
  const solid = (name: string) => {
    const c = color(v, name).slice(0, 3) as RGB;
    return [c, c] as [RGB, RGB];
  };
  return {
    Nebel: points,
    Glas: on('--glass-bg'),
    'Glas strong': on('--glass-strong-bg'),
    Eingabefeld: on('--field'),
    Tooltip: solid('--c-surface'),
    'brand-100 (Chip)': solid('--c-accent-soft'),
    'paid-soft': solid('--c-paid-soft'),
    'warn-soft': solid('--c-warn-soft'),
    'over-soft': solid('--c-over-soft'),
    'zinc-100 (Badge)': solid('--c-zinc-100'),
    'Brand-Fläche': solid('--c-accent'),
    'Danger-Fläche': solid('--c-danger'),
  };
}

type Surface = keyof ReturnType<typeof surfaces>;
interface Pair {
  fg: string;
  on: Surface[];
  min: number;
}

const GLASSY: Surface[] = ['Glas', 'Glas strong'];
const PAIRS: Pair[] = [
  // text ≥ 4.5
  { fg: '--c-ink', on: ['Nebel', ...GLASSY, 'Eingabefeld', 'Tooltip'], min: 4.5 },
  { fg: '--c-ink-soft', on: ['Nebel', ...GLASSY, 'zinc-100 (Badge)'], min: 4.5 },
  { fg: '--c-ink-mute', on: ['Nebel', ...GLASSY, 'Eingabefeld', 'Tooltip'], min: 4.5 },
  { fg: '--c-ink-faint', on: [...GLASSY, 'Eingabefeld'], min: 4.5 },
  { fg: '--c-accent-ink', on: [...GLASSY, 'Tooltip'], min: 4.5 },
  { fg: '--c-accent-strong', on: ['brand-100 (Chip)'], min: 4.5 },
  { fg: '--c-paid-ink', on: [...GLASSY, 'paid-soft'], min: 4.5 },
  { fg: '--c-over', on: [...GLASSY, 'over-soft', 'Tooltip'], min: 4.5 },
  { fg: '--c-warn', on: ['warn-soft'], min: 4.5 },
  { fg: '--chart-axis', on: GLASSY, min: 4.5 },
  { fg: '--chart-ink-soft', on: GLASSY, min: 4.5 },
  { fg: '--chart-paid-text', on: GLASSY, min: 4.5 },
  { fg: '--chart-over', on: GLASSY, min: 4.5 },
  { fg: '--c-on-paid', on: ['Brand-Fläche'], min: 4.5 }, // white button text = same pair
  { fg: '--c-on-paid', on: ['Danger-Fläche'], min: 4.5 },
  // large figures, icons, rings, focus ≥ 3
  { fg: '--c-accent', on: GLASSY, min: 3 },
  { fg: '--c-focus', on: ['Nebel', ...GLASSY], min: 3 },
  { fg: '--c-check-open', on: GLASSY, min: 3 },
  { fg: '--c-warn-icon', on: [...GLASSY, 'warn-soft'], min: 3 },
  { fg: '--chart-accent', on: GLASSY, min: 3 },
];

function measure(name: 'Hell' | 'Dunkel', v: Record<string, string>) {
  const s = surfaces(v);
  return PAIRS.flatMap((p) =>
    p.on.map((surface) => {
      const fg = color(v, p.fg).slice(0, 3) as RGB;
      const [darkest, lightest] = s[surface];
      const values = [contrast(fg, darkest), contrast(fg, lightest)];
      return { theme: name, fg: p.fg, surface, min: p.min, worst: Math.min(...values), values };
    }),
  );
}

const rows = [...measure('Hell', light), ...measure('Dunkel', dark)];
const rgb = (v: Record<string, string>, n: string) => color(v, n).slice(0, 3) as RGB;
const CATS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];

describe('Kontrast der Tokens (WCAG)', () => {
  it.each(rows.map((r) => [`${r.theme}: ${r.fg} auf ${r.surface}`, r] as const))('%s', (_, r) => {
    expect(r.worst, `${r.values.map((x) => x.toFixed(2)).join(' / ')}`).toBeGreaterThanOrEqual(r.min);
  });

  it('both dark blocks are identical', () => {
    expect(darkMedia).toEqual(darkAttr);
  });
});

describe('Delta-Chip (Ist − Plan): Text ≥ 4,5:1 auf der Chip-Fläche', () => {
  it.each([
    ['Hell', 'weniger (grün)', light, '--c-paid-ink', '--c-paid-soft'],
    ['Hell', 'mehr (rot)', light, '--c-over', '--c-over-soft'],
    ['Dunkel', 'weniger (grün)', dark, '--c-paid-ink', '--c-paid-soft'],
    ['Dunkel', 'mehr (rot)', dark, '--c-over', '--c-over-soft'],
  ] as const)('%s, %s', (_, __, v, fg, bg) => {
    expect(contrast(rgb(v, fg), rgb(v, bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Kategorie-Farben: 8 Slots, 8 verschiedene Tokens', () => {
  it('jeder Slot zeigt auf ein eigenes Token; keine zwei Tokens mit gleichem Wert (Hell und Dunkel)', async () => {
    const { CATEGORY_SLOTS } = await import('./categoryColors');
    const tokens = CATEGORY_SLOTS.map((s) => s.color);
    expect(new Set(tokens).size).toBe(8);
    for (const v of [light, dark]) expect(new Set(CATS.map((c) => resolve(v, c).toLowerCase())).size).toBe(8);
  });

  it.each([
    ['Hell', light],
    ['Dunkel', dark],
  ] as const)('%s: paarweise ΔE ≥ 15 (Anforderung), tatsächlich ≥ 20', (_, v) => {
    for (let i = 0; i < CATS.length; i++)
      for (let j = i + 1; j < CATS.length; j++) expect(deltaE(rgb(v, CATS[i]!), rgb(v, CATS[j]!))).toBeGreaterThanOrEqual(15);
  });
});

describe('Farbabstände (CIEDE2000)', () => {
  it('Brand vs. Amber ≥ 25', () => {
    expect(deltaE(rgb(light, '--brand-500'), rgb(light, '--c-warn-icon'))).toBeGreaterThanOrEqual(25);
    expect(deltaE(rgb(light, '--brand-500'), rgb(light, '--c-warn'))).toBeGreaterThanOrEqual(25);
  });

  it.each([
    ['Hell', light],
    ['Dunkel', dark],
  ] as const)('Kategorien %s: untereinander ≥ 20, zu Brand/Amber ≥ 25, zu Rot ≥ 20', (_, v) => {
    const cats = CATS.map((c) => rgb(v, c));
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) expect(deltaE(cats[i]!, cats[j]!), `${CATS[i]} / ${CATS[j]}`).toBeGreaterThanOrEqual(20);
      for (const ref of ['--brand-500', '--chart-accent', '--c-warn-icon', '--c-warn']) {
        expect(deltaE(cats[i]!, rgb(v, ref)), `${CATS[i]} / ${ref}`).toBeGreaterThanOrEqual(25);
      }
      expect(deltaE(cats[i]!, rgb(v, '--c-over')), `${CATS[i]} / --c-over`).toBeGreaterThanOrEqual(20);
    }
  });
});

// New and changed text/surface pairs of the sprint „korrekt-ruhig“, light and dark: text ≥ 4.5,
// the switch (non-text, WCAG 1.4.11) ≥ 3 for its track against the sheet and the knob against the track.
const SPRINT_PAIRS: { what: string; fg: string; on: Surface; min: number }[] = [
  { what: 'Schalter-Label', fg: '--c-ink', on: 'Glas strong', min: 4.5 },
  { what: 'Schalter-Hilfetext', fg: '--c-ink-mute', on: 'Glas strong', min: 4.5 },
  { what: 'Chip „nicht vom Netto“', fg: '--c-ink-soft', on: 'zinc-100 (Badge)', min: 4.5 },
  { what: 'Chip Planänderung „ab … · €“', fg: '--c-ink-soft', on: 'zinc-100 (Badge)', min: 4.5 },
  { what: 'Label „KATEGORIEN“', fg: '--c-ink-soft', on: 'Nebel', min: 4.5 },
  { what: 'Kategorie-Name / Summe', fg: '--c-ink', on: 'Glas', min: 4.5 },
  { what: 'Kategorie-Status „1/6 bezahlt“, „Ø € …“', fg: '--c-ink-mute', on: 'Glas', min: 4.5 },
  { what: 'Kategorie-Status „✓ bezahlt“', fg: '--c-paid-ink', on: 'Glas', min: 4.5 },
  { what: 'Kachel Vermögensaufbau: Wert', fg: '--c-ink', on: 'Glas', min: 4.5 },
  { what: 'Kachel Vermögensaufbau: Label, Unterzeile', fg: '--c-ink-mute', on: 'Glas', min: 4.5 },
  { what: 'Sparquote „+ € … aus anderen Quellen“', fg: '--c-ink-mute', on: 'Glas', min: 4.5 },
  { what: 'Leerzustand (gestrichelt, auf dem Hintergrund)', fg: '--c-ink-mute', on: 'Nebel', min: 4.5 },
  { what: 'Zeitraum unter „Jahresvorschau“', fg: '--c-ink-mute', on: 'Nebel', min: 4.5 },
  { what: 'Schalter an: Spur gegen das Sheet', fg: '--c-accent', on: 'Glas strong', min: 3 },
  { what: 'Schalter aus: Spur gegen das Sheet', fg: '--c-check-open', on: 'Glas strong', min: 3 },
];

describe('Neue und geänderte Paare (korrekt-ruhig)', () => {
  const cases = (['Hell', 'Dunkel'] as const).flatMap((theme) =>
    SPRINT_PAIRS.map((p) => [`${theme}: ${p.what} (${p.fg} auf ${p.on}) ≥ ${p.min}`, theme, p] as const),
  );
  it.each(cases)('%s', (_, theme, p) => {
    const v = theme === 'Hell' ? light : dark;
    const [darkest, lightest] = surfaces(v)[p.on];
    const fg = rgb(v, p.fg);
    expect(Math.min(contrast(fg, darkest), contrast(fg, lightest))).toBeGreaterThanOrEqual(p.min);
  });

  it.each([
    ['Hell', light],
    ['Dunkel', dark],
  ] as const)('%s: Schalter-Knopf gegen die Spur an und aus ≥ 3', (_, v) => {
    expect(contrast(rgb(v, '--c-surface'), rgb(v, '--c-accent'))).toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(v, '--c-surface'), rgb(v, '--c-check-open'))).toBeGreaterThanOrEqual(3);
  });
});

// Oberer Rand (top-fade): iOS paints the status bar itself (status-bar-style „default“): dark glyphs
// on a light bar, light glyphs on a dark bar; the bar is --nebel-base. Where Safari lets the page show
// under the bar, the glyphs sit on the scrim (--nebel-base, 0.6 at the top) over whatever scrolls there.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const GLYPH = { Hell: [0, 0, 0] as RGB, Dunkel: [255, 255, 255] as RGB };
const UNDER_BAR = ['--nebel-base', '--glass-opaque', '--c-accent', '--c-surface'];
export function statusBarRows() {
  return (['Hell', 'Dunkel'] as const).flatMap((theme) => {
    const v = theme === 'Hell' ? light : dark;
    const base = rgb(v, '--nebel-base');
    const scrim: RGBA = [...base, 0.6];
    return [
      { theme, what: 'Statusleiste (iOS, deckend) = Basisfarbe', value: contrast(GLYPH[theme], base) },
      ...UNDER_BAR.map((t) => ({ theme, what: `Safari unter der Leiste: Scrim 0,6 über \`${t}\``, value: contrast(GLYPH[theme], over(scrim, rgb(v, t))) })),
      { theme, what: `Scrim 0,6 über der Nebel-Mitte`, value: contrast(GLYPH[theme], over(scrim, over(color(v, '--nebel-1'), base))) },
    ];
  });
}

describe('Oberer Rand: Statusleiste lesbar (top-fade)', () => {
  it('status-bar-style bleibt „default“ (nicht black-translucent)', () => {
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="default"/);
  });
  it('black-translucent wäre im hellen Theme unlesbar: weiße Schrift auf der Basisfarbe < 4,5', () => {
    expect(contrast([255, 255, 255], rgb(light, '--nebel-base'))).toBeLessThan(4.5);
  });
  it.each(statusBarRows().map((r) => [`${r.theme}: ${r.what}`, r.value] as const))('%s ≥ 4,5', (_, value) => {
    expect(value).toBeGreaterThanOrEqual(4.5);
  });
  it('theme-color je Theme = Basisfarbe (Hell und Dunkel)', () => {
    expect(html).toContain(`content="${resolve(light, '--nebel-base')}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${resolve(dark, '--nebel-base')}" media="(prefers-color-scheme: dark)"`);
    // the channel token used by the scrim is the same colour
    for (const v of [light, dark]) expect(resolve(v, '--nebel-base-rgb').split(' ').map(Number)).toEqual(rgb(v, '--nebel-base'));
  });
});

if (process.env.CONTRAST_REPORT) {
  const lines = [
    '| Thema | Vordergrund | Hintergrund | dunkelster Punkt | hellster Punkt | Ziel | |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.theme} | \`${r.fg}\` | ${r.surface} | ${r.values[0]!.toFixed(2)} | ${r.values[1]!.toFixed(2)} | ≥ ${r.min} | ${r.worst >= r.min ? '✅' : '❌'} |`,
    ),
    '',
    `ΔE2000 Brand #5A7A2E ↔ Amber-Icon: **${deltaE(rgb(light, '--brand-500'), rgb(light, '--c-warn-icon')).toFixed(1)}**, ↔ Amber-Text: **${deltaE(rgb(light, '--brand-500'), rgb(light, '--c-warn')).toFixed(1)}**, ↔ Rot: ${deltaE(rgb(light, '--brand-500'), rgb(light, '--c-over')).toFixed(1)}`,
  ];
  lines.push('', '**Neue und geänderte Paare (korrekt-ruhig)**', '', '| Thema | Element | Vordergrund | Hintergrund | dunkelster / hellster Punkt | Ziel |', '|---|---|---|---|---|---|');
  for (const [theme, v] of [['Hell', light], ['Dunkel', dark]] as const) {
    for (const p of SPRINT_PAIRS) {
      const [d, l] = surfaces(v)[p.on];
      const fg = rgb(v, p.fg);
      lines.push(`| ${theme} | ${p.what} | \`${p.fg}\` | ${p.on} | ${contrast(fg, d).toFixed(2)} / ${contrast(fg, l).toFixed(2)} | ≥ ${p.min} |`);
    }
    lines.push(`| ${theme} | Schalter-Knopf auf Spur an / aus | \`--c-surface\` | \`--c-accent\` / \`--c-check-open\` | ${contrast(rgb(v, '--c-surface'), rgb(v, '--c-accent')).toFixed(2)} / ${contrast(rgb(v, '--c-surface'), rgb(v, '--c-check-open')).toFixed(2)} | ≥ 3 |`);
  }
  lines.push('', '**Delta-Chip** (Text auf Chip-Fläche, Ziel ≥ 4,5)', '', '| Thema | Variante | Text | Fläche | Kontrast |', '|---|---|---|---|---|');
  for (const [theme, v] of [['Hell', light], ['Dunkel', dark]] as const) {
    for (const [name, fg, bg] of [['weniger (grün)', '--c-paid-ink', '--c-paid-soft'], ['mehr (rot)', '--c-over', '--c-over-soft']] as const) {
      lines.push(`| ${theme} | ${name} | \`${fg}\` | \`${bg}\` | ${contrast(rgb(v, fg), rgb(v, bg)).toFixed(2)} |`);
    }
  }
  for (const [theme, v] of [['Hell', light], ['Dunkel', dark]] as const) {
    const refs = ['--brand-500', '--chart-accent', '--c-warn-icon', '--c-warn', '--c-over'];
    lines.push('', `**Kategorien ${theme}** (ΔE2000; Ziel untereinander ≥ 20, zu Brand/Amber ≥ 25, zu Rot ≥ 20)`, '');
    lines.push(`| | ${CATS.map((c) => `\`${c}\``).join(' | ')} | ${refs.map((r) => `\`${r}\``).join(' | ')} |`);
    lines.push(`|---|${CATS.map(() => '---').join('|')}|${refs.map(() => '---').join('|')}|`);
    for (const a of CATS) {
      const cells = CATS.map((b) => (a === b ? '–' : deltaE(rgb(v, a), rgb(v, b)).toFixed(1)));
      const toRefs = refs.map((r) => deltaE(rgb(v, a), rgb(v, r)).toFixed(1));
      lines.push(`| \`${a}\` ${resolve(v, a)} | ${cells.join(' | ')} | ${toRefs.join(' | ')} |`);
    }
  }
  lines.push('', '**Oberer Rand: Statusleisten-Schrift** (Ziel ≥ 4,5)', '', '| Thema | Hintergrund hinter Uhrzeit/Akku | Kontrast |', '|---|---|---|');
  for (const r of statusBarRows()) lines.push(`| ${r.theme} | ${r.what} | ${r.value.toFixed(2)} |`);
  writeFileSync(process.env.CONTRAST_REPORT, lines.join('\n') + '\n');
}
