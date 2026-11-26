// Prints the texts of „Fixkosten einplanen“ as a Markdown table (for the PR):
//   node --experimental-strip-types scripts/konto-texts.mjs > docs/fixkostenkonto/TEXTE.md
import { KONTO_TEXTS, sentences, wordCount } from '../src/lib/kontoTexts.ts';

const AREA = { status: 'Status', reason: 'Grund', tile: 'Kachel', invite: 'Einladung', setup: 'Einrichtung', plan: 'Dein Plan', check: 'Monats-Check', milestone: 'Meilensteine', sheet: 'Sheet', settings: 'Einstellungen', hero: 'Monats-Screen', walk: 'Walkthrough', account: 'Bearbeiten-Dialog', spiel: 'Spielgeld-Karte', split: 'Gehalts-Aufteilung', advice: 'Empfehlung', analyse: 'Analyse', month: 'Dein Monat', bills: 'Rechnungen-Zeile', big: 'Nächster großer Monat', plan2: 'Sheet „Dein Plan“', unplanned: 'Bearbeiten-Dialog', salary: 'Gehalt (Auszahlungsmonat)', cushion: 'Polster', amount: 'Betrag für {Monat}', spielgeld: 'Spielgeld für {Monat}' };
console.log('| Bereich | Schlüssel | Text | Wörter je Satz |');
console.log('|---|---|---|---|');
for (const [id, text] of Object.entries(KONTO_TEXTS)) {
  const counts = sentences(text).map(wordCount).join(' · ');
  console.log(`| ${AREA[id.split('.')[0]]} | \`${id}\` | ${text.replace(/\|/g, '\\|')} | ${counts} |`);
}
