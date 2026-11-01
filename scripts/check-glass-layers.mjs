// Fails when the Liquid-Glass material gets effect layers again: iOS Safari „Ganze Seite“ captured
// the transparent parts of ::before/::after layers (specular fading to alpha 0, rim ring cut out with
// mask-composite) as black. The material paints everything on the surface itself (src/index.css).
//   node scripts/check-glass-layers.mjs
// Checked in every CSS file under src/ and every class string in src/**/*.tsx:
//   - a ::before/::after of a material class (.glass, .glass-*) only ever switches itself off
//     (content: none / display: none): no gradient, no image, no mask
//   - no mask-composite and no mix-blend-mode on a material class
//   - no Tailwind before:/after: variant next to a material class
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const MATERIAL = /\.glass(?:-[a-z]+)*(?![\w-])/;
const PSEUDO = /::?(?:before|after)\b/;
const problems = [];
const classes = new Set();

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
    }
  }
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
console.log(`check-glass-layers: ${classes.size} material classes (${[...classes].sort().join(', ')}) without effect layers`);
