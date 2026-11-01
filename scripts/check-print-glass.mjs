// Fails when a Liquid-Glass material class of src/index.css is missing from the print block:
// in print every material is opaque and its effect layers (::before / ::after) are gone, so a new
// variant must be listed there too (iOS paints unmasked effect layers dark).
//   node scripts/check-print-glass.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const start = css.indexOf('@media print {');
if (start < 0) {
  console.error('check-print-glass: no @media print block in src/index.css');
  process.exit(1);
}
// the block ends at the brace that closes it
let depth = 0;
let end = start;
for (let i = css.indexOf('{', start); i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}' && --depth === 0) {
    end = i;
    break;
  }
}
const print = css.slice(start, end);
const rest = css.slice(0, start) + css.slice(end);
const classes = [...new Set(rest.match(/\.glass(?:-[a-z]+)*(?![\w-])/g) ?? [])].sort();
const missing = [];
for (const c of classes) {
  const base = new RegExp(`\\${c}(?![\\w-])\\s*[,{]`);
  if (!base.test(print)) missing.push(`${c} (surface)`);
  for (const pseudo of ['::before', '::after']) if (!print.includes(`${c}${pseudo}`)) missing.push(`${c}${pseudo}`);
}
// .glass-group-blur is switched off as a whole: its surface rule is the display: none list
if (missing.length) {
  console.error(`check-print-glass: material classes not covered by @media print in src/index.css:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-print-glass: ${classes.length} material classes (${classes.join(', ')}) covered in print`);
