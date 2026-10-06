// Turns a readable bookmarklet source into a one-line javascript: URL.
// Drops comment lines and indentation; statements must end with ; or braces.
import { readFileSync, writeFileSync } from 'node:fs';

const [src = 'scripts/export-preview3-bookmarklet.js', out = 'docs/export-preview3-bookmarklet.txt'] = process.argv.slice(2);
const code = readFileSync(src, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//'))
  .join('');
new Function(code); // syntax check
writeFileSync(out, `javascript:${code}\n`);
console.log(`${out}: ${code.length + 11} Zeichen`);
