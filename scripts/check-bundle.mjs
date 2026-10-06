// Fails the build if private seed data (position names, amounts) leaked into dist/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const seed = JSON.parse(readFileSync(new URL('../tests/fixtures/seed.json', import.meta.url), 'utf8'));
const terms = new Set(['Kredit 1220', 'Baurechtszins', '1008', '262.02', '262,02']);
for (const p of seed.data.positions) terms.add(p.name);
for (const r of seed.data.reminders) terms.add(r.text);
// synthetic 24-month history (tests and screenshots only)
const history = JSON.parse(readFileSync(new URL('../tests/fixtures/history-24m.json', import.meta.url), 'utf8'));
for (const p of history.data.positions) terms.add(p.name);
for (const o of history.data.oneOffs) terms.add(o.label);
terms.add('history-24m');

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const leaks = [];
for (const file of files('dist').filter((f) => /\.(js|css|html|json|webmanifest|map)$/.test(f))) {
  const text = readFileSync(file, 'utf8').toLowerCase();
  for (const term of terms) if (text.includes(term.toLowerCase())) leaks.push(`${file}: "${term}"`);
}

if (leaks.length) {
  console.error(`Private data found in bundle:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log(`check-bundle: ${terms.size} private terms, none found in dist/`);
