// Fails when the Liquid-Glass material gets effect layers again: iOS Safari „Ganze Seite“ captured
// the transparent parts of ::before/::after layers (specular fading to alpha 0, rim ring cut out with
// mask-composite) as black. The material paints everything on the surface itself (src/index.css).
//   node scripts/check-glass-layers.mjs
// Checked in every CSS file under src/ and every class string in src/**/*.tsx:
//   - a ::before/::after of a material class (.glass, .glass-*) only ever switches itself off
//     (content: none / display: none): no gradient, no image, no mask
//   - no mask-composite and no mix-blend-mode on a material class
//   - no Tailwind before:/after: variant next to a material class
// Gradients (iOS „Ganze Seite“ captures a gradient into transparency as black, PR #36):
//   - no gradient at all in a rule of a material class
//   - no gradient into transparency in any other CSS rule either, except the page background
//     (Nebel, grain and the scrim at the top: body::before, body::after, #root::before; clean in the
//     captures). Allowed: a gradient whose colour stops are all the same (a flat colour: press
//     feedback) and, since the Luxe redesign, a gradient whose stops are ALL opaque tokens (hero,
//     Soft-3D-Erbse): opaque to opaque never reaches alpha 0, so there is nothing to capture as black
//   - no gradient in components (src/**/*.tsx, *.ts): class strings, inline styles; SVG gradients
//     only in SVG_GRADIENT_FILES, and only with opaque token stops (style={{ stopColor: 'var(--…)' }})
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const MATERIAL = /\.glass(?:-[a-z]+)*(?![\w-])/;
// token values of every theme: a stop is opaque only if the token is opaque in all of them
const tokenCss = readFileSync('src/styles/tokens.css', 'utf8');
const tokenValues = new Map();
for (const [, name, value] of tokenCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  if (!tokenValues.has(name)) tokenValues.set(name, []);
  tokenValues.get(name).push(value.trim());
}
function opaqueValue(v, depth = 0) {
  if (depth > 6) return false;
  v = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return true;
  if (/^\d+ \d+ \d+$/.test(v)) return true;
  let m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) return (tokenValues.get(m[1]) ?? ['transparent']).every((t) => opaqueValue(t, depth + 1));
  m = /^rgb\(var\((--[\w-]+)\)\)$/.exec(v);
  if (m) return (tokenValues.get(m[1]) ?? ['transparent']).every((t) => /^\d+ \d+ \d+$/.test(t.trim()) || opaqueValue(t, depth + 1));
  m = /^color-mix\(in srgb,\s*(.+)\)$/.exec(v);
  if (m) {
    // split the two colours at the top-level comma, drop a trailing percentage
    let d = 0;
    let cut = -1;
    for (let i = 0; i < m[1].length; i++) {
      if (m[1][i] === '(') d++;
      else if (m[1][i] === ')') d--;
      else if (m[1][i] === ',' && d === 0) cut = i;
    }
    if (cut < 0) return false;
    return [m[1].slice(0, cut), m[1].slice(cut + 1)].every((c) => opaqueValue(c.replace(/\s+\d+(?:\.\d+)?%\s*$/, ''), depth + 1));
  }
  return false;
}
// SVG gradients with opaque token stops: the logo only
const SVG_GRADIENT_FILES = new Set(['src/components/Logo.tsx']);
const PSEUDO = /::?(?:before|after)\b/;
const problems = [];
const classes = new Set();
// the page background: Nebel + grain (body::before/::after) and the scrim at the top (#root::before)
const PAGE_BACKGROUND = new Set(['body::before', 'body::after', '#root::before']);
let gradientRules = 0;
/** The colour stops of every gradient in a declaration block (arguments without positions/directions). */
function gradients(body) {
  const out = [];
  for (const m of body.matchAll(/gradient\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < body.length && depth) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') depth--;
      i++;
    }
    const args = [];
    let d = 0;
    let cur = '';
    for (const ch of body.slice(start, i - 1)) {
      if (ch === '(') d++;
      if (ch === ')') d--;
      if (ch === ',' && d === 0) {
        args.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    args.push(cur.trim());
    out.push(args.filter((a) => !/^(?:to |at |\d|circle|ellipse|from )/.test(a)).map((a) => a.replace(/\s+[\d.]+(?:%|px)?$/, '')));
  }
  return out;
}

for (const file of files('src').filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  // innermost rules: a selector and a body without braces (nested @media/@layer bodies are walked too)
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].slice(m[1].lastIndexOf(';') + 1).trim();
    if (selector.startsWith('@')) continue;
    const body = m[2];
    const line = css.slice(0, m.index + m[1].length - m[1].trimStart().length).split('\n').length;
    for (const part of selector.split(',').map((s) => s.trim())) {
      if (!MATERIAL.test(part)) continue;
      for (const c of part.match(new RegExp(MATERIAL, 'g'))) classes.add(c);
      if (PSEUDO.test(part)) {
        const decls = body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean);
        for (const d of decls) {
          const [prop, ...v] = d.split(':');
          const value = v.join(':').replace(/!important/, '').trim();
          const ok = (prop.trim() === 'content' && value === 'none') || (prop.trim() === 'display' && value === 'none');
          if (!ok) problems.push(`${file}:${line}: ${part} → „${d}“ (Effektebene am Material)`);
        }
      }
      if (/mask-composite|mix-blend-mode/.test(body)) problems.push(`${file}:${line}: ${part} → mask-composite/mix-blend-mode am Material`);
      if (/gradient\(/.test(body)) problems.push(`${file}:${line}: ${part} → Verlauf am Material`);
    }
    if (/gradient\(/.test(body) && !selector.split(',').every((p) => MATERIAL.test(p) === false && PAGE_BACKGROUND.has(p.trim()))) {
      const flat = gradients(body).every((g) => new Set(g).size === 1 || g.every((stop) => opaqueValue(stop)));
      if (!flat && !selector.split(',').some((p) => MATERIAL.test(p))) problems.push(`${file}:${line}: ${selector.replace(/\s+/g, ' ')} → Verlauf mit Transparenz`);
      gradientRules++;
    }
  }
}

// components: no gradient in class strings, inline styles or SVG (logo: opaque token stops only)
for (const file of files('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f))) {
  if (SVG_GRADIENT_FILES.has(file)) {
    const text = readFileSync(file, 'utf8');
    if (/gradient\(|bg-gradient-|gradient-to-|stopOpacity|stop-opacity/.test(text)) problems.push(`${file}: CSS-Verlauf oder Stop-Deckkraft im Logo`);
    for (const [, v] of text.matchAll(/stopColor:\s*'([^']+)'/g)) if (!opaqueValue(v)) problems.push(`${file}: Verlaufsstopp ${v} nicht deckend`);
    if (/<stop\b(?![^>]*stopColor)/.test(text)) problems.push(`${file}: <stop> ohne Token-Farbe`);
    continue;
  }
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/gradient\(|Gradient\(|<(?:linear|radial)Gradient|bg-gradient-|gradient-to-/.test(code)) problems.push(`${file}:${i + 1}: Verlauf in einer Komponente → ${code.trim().slice(0, 120)}`);
    });
}

// Tailwind variants on elements that carry a material class
for (const file of files('src').filter((f) => f.endsWith('.tsx'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = (m[1] ?? m[2]).split(/\s+/);
        if (cls.some((c) => /^glass(?:-[a-z]+)*$/.test(c) && c !== 'glass-group') && cls.some((c) => /(?:^|:)(?:before|after):/.test(c))) {
          problems.push(`${file}:${i + 1}: before:/after: an einer Material-Fläche → ${m[0]}`);
        }
      }
    });
}

if (problems.length) {
  console.error(`check-glass-layers: ${problems.length} Fund(e)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-glass-layers: ${classes.size} material classes (${[...classes].sort().join(', ')}) without effect layers or gradients; ${gradientRules} gradient rule(s) outside the page background, all flat or opaque`,
);
