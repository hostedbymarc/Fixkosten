// Prints the texts of the Fixkostenkonto as a Markdown table (for the PR):
//   node --experimental-strip-types scripts/konto-texts.mjs > docs/fixkostenkonto/TEXTE.md
import { KONTO_TEXTS, sentences, wordCount } from '../src/lib/kontoTexts.ts';

const AREA = { status: 'Status', tile: 'Kachel', setup: 'Einrichtung', plan: 'Dein Plan', check: 'Monats-Check', milestone: 'Meilensteine', sheet: 'Sheet', settings: 'Einstellungen' };
console.log('| Bereich | Schlüssel | Text | Wörter je Satz |');
console.log('|---|---|---|---|');
for (const [id, text] of Object.entries(KONTO_TEXTS)) {
  const counts = sentences(text).map(wordCount).join(' · ');
  console.log(`| ${AREA[id.split('.')[0]]} | \`${id}\` | ${text.replace(/\|/g, '\\|')} | ${counts} |`);
}
