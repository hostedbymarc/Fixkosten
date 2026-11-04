// Prints the Bestandsaufnahme „Tooltips statt Erklärtexte“ (e2e/help-texts.ts) as a Markdown table.
// node --experimental-strip-types scripts/help-texts-table.mjs > docs/fixkostenkonto/TOOLTIPS.md
const { HELP_TEXTS } = await import('../e2e/help-texts.ts');
const label = { tooltip: 'wird Tooltip', sichtbar: 'bleibt sichtbar', 'entfällt': 'entfällt' };
const order = { tooltip: 0, 'entfällt': 1, sichtbar: 2 };
const esc = (s) => s.replace(/\|/g, '\\|');
const rows = [...HELP_TEXTS].sort((a, b) => order[a.placement] - order[b.placement]);
console.log('| Text | Screen | Kategorie |');
console.log('|---|---|---|');
for (const r of rows) {
  const cat = `${label[r.placement]}${r.kind ? ` (${r.kind})` : ''}${r.note ? ` – ${r.note}` : ''}`;
  console.log(`| ${esc(r.texts.map((t) => `„${t}“`).join(' / '))} | ${esc(r.screen)} | ${esc(cat)} |`);
}
