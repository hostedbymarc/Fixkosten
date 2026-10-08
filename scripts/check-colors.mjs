// Fails when a colour value or the old app name shows up outside the allowed places.
//   node scripts/check-colors.mjs
// Colours: only src/styles/tokens.css. Exceptions: icon files (public/, scripts/brand/),
// src/lib/categoryColors.ts (hex strings there are database keys, never painted),
// tests, and the theme-color meta tag in index.html (HTML cannot read CSS variables).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['src/styles/tokens.css', 'src/lib/categoryColors.ts']);
const COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/;
// the app is "Erbse"; "fixkosten" may only remain where renaming would lose data
const OLD_NAME = /fixkosten/i;
const NAME_OK = [
  /FixkostenDB/, // class name
  /name = 'fixkosten'/, // IndexedDB name
  /'fixkosten-backup'/, // backup format
  /'fixkosten-theme'/, // stored appearance
  /\b(der|die|den|deiner|[Dd]eine|keine|zu den)\s+Fixkosten\b/, // the German word as a term
  /Fixkosten oder Sparplan/,
  /Monatliche Fixkosten/,
];

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const problems = [];
for (const file of [...files('src'), 'index.html']) {
  if (!/\.(tsx?|css|html)$/.test(file) || /\.test\.ts$/.test(file)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/rgba?\(var\(--[\w-]+\)[^)]*\)/g, ''); // token references are fine
      if (!ALLOWED.has(file) && COLOR.test(code) && !(file === 'index.html' && line.includes('name="theme-color"'))) {
        problems.push(`${file}:${i + 1}: Farbwert außerhalb von tokens.css → ${line.trim()}`);
      }
      if (OLD_NAME.test(line) && !NAME_OK.some((ok) => ok.test(line)) && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
        problems.push(`${file}:${i + 1}: alter App-Name → ${line.trim()}`);
      }
    });
}

if (problems.length) {
  console.error(`check-colors: ${problems.length} Fund(e)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-colors: keine Farbwerte außerhalb von tokens.css, kein alter App-Name in der UI');
