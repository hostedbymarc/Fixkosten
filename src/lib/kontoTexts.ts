// Every text of the Fixkostenkonto in one place: Du-Form, at most 12 words per sentence, no
// jargon. {platzhalter} are filled in by t(); an amount counts as one word. src/lib/kontoStatus.test.ts
// checks the word limit, scripts/konto-texts.mjs prints the list for the PR.

export const KONTO_TEXTS = {
  // · Status (Kachel, Sheet, Dein Plan, Einstellungen): nur in Worten, 3 Zustände
  'status.setup': 'Fixkostenkonto einrichten',
  'status.progress': '{n} von {gesamt} erledigt',
  'status.gap': 'Im {monat} fehlen {betrag}.',
  'status.gap.action': 'Zahl einmalig {betrag} ein, dann passt alles.',
  'status.gap.done': 'Erledigt, eingezahlt',
  'status.covered': 'Alles gedeckt bis {monat}.',

  // · Kachel auf dem Monats-Screen
  'tile.title': 'Fixkostenkonto',
  'tile.order': 'Dauerauftrag {betrag} {tag}',
  'tile.streak': '{n} Monate in Folge',
  'tile.streak.new': 'Neue Serie startet.',

  // · Einrichtung: zwei Fragen
  'setup.title': 'Fixkostenkonto einrichten',
  'setup.progress': 'Frage {n} von 2',
  'setup.next': 'Weiter',
  'setup.back': 'Zurück',
  'setup.q1': 'Wie viel liegt heute auf deinem Fixkostenkonto?',
  'setup.q1.label': 'Kontostand heute',
  'setup.q1.none': 'Ich habe noch keins',
  'setup.q2': 'Läuft dein Dauerauftrag schon?',
  'setup.q2.yes': 'Ja',
  'setup.q2.no': 'Nein',

  // · Dein Plan: Checkliste, immer 3 Punkte
  'plan.title': 'Dein Plan',
  'plan.account': 'Fixkostenkonto eröffnen',
  'plan.account.hint': 'Ein zweites Konto, nur für deine Rechnungen.',
  'plan.account.ok': 'Fixkostenkonto ist da',
  'plan.order.new': 'Dauerauftrag einrichten: {betrag} monatlich {tag}',
  'plan.order.check': 'Dauerauftrag prüfen: {betrag} monatlich {tag}',
  'plan.gap': 'Einmalig {betrag} einzahlen',
  'plan.gap.none': 'Keine Einzahlung nötig',
  'plan.copy': 'Betrag kopieren',
  'plan.copied': 'Kopiert',
  'plan.done': 'Erledigt',
  'plan.finish': 'Fertig',

  // · monatlicher Check
  'check.month': 'Neuer Monat. Ist dein Dauerauftrag eingegangen?',
  'check.month.again': 'Ist dein Dauerauftrag für {monat} eingegangen?',
  'check.month.yes': 'Ja',
  'check.month.no': 'Noch nicht',
  'check.balance': 'Stimmt dein Kontostand noch? {betrag}',
  'check.balance.ok': 'Stimmt',
  'check.balance.other': 'Anderer Betrag',
  'check.balance.remind': 'Trag deinen Kontostand ein. Dann rechnet Erbse genauer.',
  'check.balance.save': 'Speichern',
  'check.later': 'Später',

  // · Meilensteine
  'milestone.firstPod': 'Zum ersten Mal alles gedeckt',
  'milestone.streak3': '3 Monate in Folge',
  'milestone.streak6': '6 Monate in Folge',
  'milestone.year': 'Ein Jahr gedeckt',
  'milestone.toast': 'Geschafft: {meilenstein}',

  // · Sheet „Fixkostenkonto“
  'sheet.q1': 'Wie viel überweise ich monatlich?',
  'sheet.q1.cause': 'Aus {n} Rechnungen der nächsten 12 Monate, aufgerundet.',
  'sheet.q3': 'Reicht es das ganze Jahr?',
  'sheet.allMonths': 'Alle Monate',
  'sheet.inputs': 'Kontostand und Rundung',
  'sheet.col.deposit': 'Einzahlung',
  'sheet.col.debits': 'Abbuchungen',
  'sheet.col.end': 'Stand',

  // · Einstellungen
  'settings.off': 'Erbse zeigt nur deine Fixkosten.',
  'settings.on': 'Erbse rechnet deinen Dauerauftrag aus und warnt, bevor das Konto knapp wird.',
  'settings.balance': 'Kontostand',
  'settings.asOf': 'Stand vom {datum}',
  'settings.order': 'Dauerauftrag',
  'settings.gap': 'Einmalig einzahlen',
  'settings.rounding': 'Rundung',
  'settings.edit': 'Einrichtung ändern',
} as const;

export type KontoTextId = keyof typeof KONTO_TEXTS;

/** Milestone (src/db/settings.ts) → its text. */
export const MILESTONE_TEXT = {
  firstPod: 'milestone.firstPod',
  streak3: 'milestone.streak3',
  streak6: 'milestone.streak6',
  year: 'milestone.year',
} as const satisfies Record<string, KontoTextId>;

/** Text with its {platzhalter} filled in. */
export function t(id: KontoTextId, vars: Record<string, string | number> = {}): string {
  return KONTO_TEXTS[id].replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
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
