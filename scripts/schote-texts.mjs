// Prints the texts of the „Schote“ sprint as a Markdown table (for the PR):
//   node --experimental-strip-types scripts/schote-texts.mjs > docs/schote/TEXTE.md
import { SCHOTE_TEXTS, sentences, wordCount } from '../src/lib/schoteTexts.ts';

const AREA = { pod: 'Schote', tile: 'Kachel', setup: 'Einrichtung', plan: 'Dein Plan', check: 'Erbsen-Check (B)', milestone: 'Meilensteine (B)', sheet: 'Sheet (B)', settings: 'Einstellungen (B)' };
console.log('| Bereich | Schlüssel | Text | Wörter je Satz |');
console.log('|---|---|---|---|');
for (const [id, text] of Object.entries(SCHOTE_TEXTS)) {
  const counts = sentences(text).map(wordCount).join(' · ');
  console.log(`| ${AREA[id.split('.')[0]]} | \`${id}\` | ${text.replace(/\|/g, '\\|')} | ${counts} |`);
}
