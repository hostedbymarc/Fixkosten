// Every new text of the „Schote“ sprint in one place: Du-Form, at most 12 words per sentence, no
// jargon. {platzhalter} are filled in by t(); an amount counts as one word. src/lib/schote.test.ts
// checks the word limit, scripts/schote-texts.mjs prints the list for the PR.

export const SCHOTE_TEXTS = {
  // · Schote
  'pod.until': 'Gedeckt bis {monat}',
  'pod.count': '{n} von {gesamt} Monaten gedeckt',

  // · Kachel auf dem Monats-Screen
  'tile.title': 'Fixkostenkonto',
  'tile.setup.title': 'Fixkostenkonto einrichten',
  'tile.setup.progress': '{n} von 3 Schritten',
  'tile.gap.text': 'Noch {betrag} einzahlen, dann ist alles gedeckt',
  'tile.gap.action': 'Erledigt, eingezahlt',
  'tile.order': 'Dauerauftrag {betrag} am 1.',
  'tile.cushion': 'Polster: {monate} Monate',
  'tile.streak': '{n} Monate in Folge',
  'tile.streak.new': 'Neue Serie startet.',
  'tile.details': 'Details',

  // · Einrichtung
  'setup.title': 'Fixkostenkonto einrichten',
  'setup.progress': 'Schritt {n} von 3',
  'setup.next': 'Weiter',
  'setup.back': 'Zurück',
  'setup.q1': 'Hast du ein eigenes Konto nur für Rechnungen?',
  'setup.q1.yes': 'Ja, hab ich',
  'setup.q1.no': 'Noch nicht',
  'setup.q1.noText': 'Kein Problem. Erbse rechnet trotzdem aus, wie viel du brauchst.',
  'setup.q2': 'Wie viel Geld liegt heute drauf?',
  'setup.q2.label': 'Kontostand heute',
  'setup.q2.hint': 'Nur einmal eintragen. Danach rechnet Erbse selbst weiter.',
  'setup.q2.unknown': 'Weiß ich gerade nicht',
  'setup.q3': 'Ist der Dauerauftrag für {monat} schon eingegangen?',
  'setup.q3.yes': 'Ja',
  'setup.q3.no': 'Nein',
  'setup.q3.none': 'Ich habe noch keinen',

  // · Ergebnis „Dein Plan“
  'plan.title': 'Dein Plan',
  'plan.order.new': 'Dauerauftrag einrichten: {betrag} monatlich am 1.',
  'plan.order.check': 'Dauerauftrag prüfen: {betrag} monatlich am 1.',
  'plan.copy': 'Betrag kopieren',
  'plan.copied': 'Kopiert',
  'plan.done': 'Erledigt',
  'plan.gap': 'Einmalig {betrag} überweisen',
  'plan.pending': 'Erledige die Punkte, dann füllt sich die Schote.',
  'plan.full': 'Alles gedeckt bis {monat}',
  'plan.finish': 'Fertig',

  // · Phase B: monatlicher Erbsen-Check
  'check.month': 'Neuer Monat. Ist dein Dauerauftrag eingegangen?',
  'check.month.yes': 'Ja',
  'check.month.no': 'Noch nicht',
  'check.balance': 'Stimmt dein Kontostand noch? {betrag}',
  'check.balance.ok': 'Stimmt',
  'check.balance.other': 'Anderer Betrag',
  'check.balance.remind': 'Trag deinen Kontostand ein. Dann rechnet Erbse genauer.',

  // · Phase B: Meilensteine
  'milestone.firstPod': 'Erste Schote voll',
  'milestone.streak3': '3 Monate in Folge',
  'milestone.streak6': '6 Monate in Folge',
  'milestone.year': 'Ein Jahr gedeckt',
  'milestone.toast': 'Geschafft: {meilenstein}',

  // · Phase B: Sheet „Fixkostenkonto“
  'sheet.q1': 'Wie viel überweise ich monatlich?',
  'sheet.q1.cause': 'Aus {n} Rechnungen im Monatsschnitt, aufgerundet.',
  'sheet.q2': 'Muss ich jetzt etwas tun?',
  'sheet.q2.none': 'Nein, alles gedeckt.',
  'sheet.q2.gap': 'Ja. Zahl einmalig {betrag} ein.',
  'sheet.q2.order': 'Ja. Stell den Dauerauftrag auf {betrag}.',
  'sheet.q3': 'Reicht es das ganze Jahr?',
  'sheet.allMonths': 'Alle Monate',
  'sheet.settings': 'Einstellungen zum Konto',

  // · Phase B: Einstellungen
  'settings.off': 'Erbse zeigt nur deine Fixkosten.',
  'settings.on': 'Erbse rechnet deinen Dauerauftrag aus und warnt, bevor das Konto knapp wird.',
  'settings.balance': 'Kontostand',
  'settings.asOf': 'Stand vom {datum}',
  'settings.order': 'Dauerauftrag',
  'settings.rounding': 'Rundung',
  'settings.edit': 'Einrichtung ändern',
} as const;

export type SchoteTextId = keyof typeof SCHOTE_TEXTS;

/** Text with its {platzhalter} filled in. */
export function t(id: SchoteTextId, vars: Record<string, string | number> = {}): string {
  return SCHOTE_TEXTS[id].replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Sentences of a text (a placeholder counts as one word). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}{]/u.test(w)).length;
}
