// Every text of „Fixkosten einplanen“ (internally: the Fixkostenkonto) in one place: Du-Form, at most 12 words per sentence, no
// jargon. {platzhalter} are filled in by t(); an amount counts as one word. src/lib/kontoStatus.test.ts
// checks the word limit, scripts/konto-texts.mjs prints the list for the PR.

export const KONTO_TEXTS = {
  // · ein Betrag pro Monat, mit Grund (Kachel, Sheet, Einrichtung, Einstellungen)
  'status.setup': 'Fixkosten einplanen',
  'status.covered': 'Alles eingeplant bis {monat}.',
  'reason.bills': 'Im {monat} kommen {rechnungen}.',
  'reason.bill': 'Im {monat} kommt {rechnungen}.',
  'reason.now': 'Diesen Monat reicht das Geld nicht.',
  'reason.short': 'Ab {monat} reicht das Geld nicht.',
  'plan.spread': 'Darum bis dahin {extra} extra, ab {folgemonat} {betrag}.',
  'plan.lump': 'Leg bis {datum} {betrag} extra zur Seite.',
  'plan.lump.now': 'Leg jetzt {betrag} extra zur Seite.',
  'plan.when': 'am {datum}, wenn dein Gehalt kommt',
  'plan.when.order': 'per Dauerauftrag am {datum}',
  'plan.confirm': 'Zur Seite gelegt',
  'plan.toLump': 'Lieber auf einmal?',
  'plan.toSpread': 'Lieber verteilen?',
  'plan.copy': 'Betrag kopieren',
  'plan.copied': 'Kopiert',

  // · Kachel auf dem Monats-Screen
  'tile.title': 'Diesen Monat zur Seite legen',
  'tile.title.next': 'Nächsten Monat zur Seite legen',
  'tile.setup': 'Fixkosten einplanen',
  'tile.info.title': 'Monatsbetrag',
  'tile.info': 'Dieser Betrag deckt alle Fixkosten der nächsten 12 Monate. Vor großen Rechnungen kommt bis dahin ein Extra dazu.',
  'tile.start': 'Jetzt starten',
  'tile.streak': '{n} Monate in Folge',
  'tile.streak.new': 'Neue Serie startet.',
  'invite.title': 'Neu: Fixkosten einplanen.',
  'invite.text': 'Erbse sagt dir, wie viel du monatlich zur Seite legst.',

  // · Einrichtung: ein Schritt pro Screen
  'setup.title': 'Fixkosten einplanen',
  'setup.progress': 'Frage {n} von {gesamt}',
  'setup.next': 'Weiter',
  'setup.back': 'Zurück',
  'setup.account': 'Hast du ein eigenes Konto für Fixkosten?',
  'setup.account.yes': 'Ja',
  'setup.account.no': 'Nein, ich plane nur',
  'setup.balance': 'Wie viel hast du heute schon für Fixkosten zur Seite gelegt?',
  'setup.balance.label': 'Schon zur Seite gelegt',
  'setup.balance.none': 'Noch nichts',
  'setup.order': 'Läuft dein Dauerauftrag schon?',
  'setup.order.yes': 'Ja',
  'setup.order.no': 'Nein',
  'setup.gap.text': 'Dafür fehlen dir {betrag}. Wie willst du das lösen?',
  'setup.gap.spread': 'Auf {n} Monate verteilen ({betrag} extra pro Monat)',
  'setup.gap.spread.one': 'Mit der nächsten Einzahlung ({betrag} extra)',
  'setup.gap.lump': 'Auf einmal zur Seite legen',
  'setup.plan': 'Dein Plan',
  'setup.order.new': 'Richte den Dauerauftrag ein: {betrag} {tag}.',
  'setup.finish': 'Fertig',

  // · monatlicher Check: die einzige wiederkehrende Aktion
  'check.month': 'Neuer Monat. Hast du {betrag} zur Seite gelegt?',
  'check.month.again': 'Hast du für {monat} {betrag} zur Seite gelegt?',
  'check.month.yes': 'Ja',
  'check.month.no': 'Noch nicht',
  'check.balance': 'Liegen noch {betrag} für Fixkosten bereit?',
  'check.balance.ok': 'Stimmt',
  'check.balance.other': 'Anderer Betrag',
  'check.balance.remind': 'Trag ein, was du schon zur Seite gelegt hast. Dann rechnet Erbse genauer.',
  'check.balance.save': 'Speichern',
  'check.later': 'Später',

  // · Meilensteine
  'milestone.firstPod': 'Zum ersten Mal alles eingeplant',
  'milestone.streak3': '3 Monate in Folge',
  'milestone.streak6': '6 Monate in Folge',
  'milestone.year': 'Ein Jahr eingeplant',
  'milestone.toast': 'Geschafft: {meilenstein}',

  // · Sheet „Fixkosten einplanen“
  'sheet.title': 'Fixkosten einplanen',
  'sheet.why': 'Warum {betrag}?',
  'sheet.normal': 'Normaler Monat',
  'sheet.extra': 'Extra für {monat}',
  'sheet.lump': 'Einmalig bis {datum}',
  'sheet.sum': 'Summe',
  'sheet.ok': 'Mit diesem Plan nie im Minus.',
  'sheet.ok.buffer': 'Mit diesem Plan nie unter {betrag}.',
  'sheet.buffer': 'Puffer {betrag}',
  'sheet.month.lowest': 'Gezeigt: {monat}, der Monat mit dem tiefsten Stand. Tipp auf einen Punkt für einen anderen Monat.',
  'sheet.month.picked': 'Gezeigt: {monat}.',
  'sheet.chart': 'Verlauf mit Plan',
  'sheet.chart.info': 'So entwickelt sich dein Geld, wenn du den Betrag immer am {tag} zur Seite legst. Diesen Monat zählen nur noch offene Rechnungen.',
  'sheet.positions.info': 'Diese Rechnungen deckt dein Monatsbetrag. Zahlst du eine vom Alltagskonto? Stell sie unter Positionen um.',
  'sheet.allMonths': 'Alle Monate',
  'sheet.positions': 'Eingeplante Rechnungen ({n})',
  'sheet.col.deposit': 'Einzahlung',
  'sheet.col.debits': 'Abbuchungen',
  'sheet.col.end': 'Stand',
  'sheet.settings': 'Einstellungen ändern',
  'sheet.rising': 'Dein Stand steigt in 12 Monaten um {betrag}. Der Monatsbetrag ist höher als nötig, z. B. durch die Rundung.',

  // · Einstellungen
  'settings.title': 'Fixkosten einplanen',
  'settings.switch': 'Fixkosten einplanen',
  'settings.off': 'Erbse zeigt nur deine Fixkosten.',
  'settings.on': 'Erbse sagt dir, wie viel du monatlich zur Seite legst. Und warnt, bevor es knapp wird.',
  'settings.info': 'Erbse nennt dir jeden Monat einen Betrag zum Zurücklegen. Damit kommst du nie ins Minus. Ohne Banklogin.',
  'settings.balance': 'Schon zur Seite gelegt',
  'settings.balance.info': 'So viel hast du schon für deine Fixkosten zur Seite gelegt.',
  'settings.asOf': 'Stand vom {datum}',
  'settings.gapMode': 'Lücke schließen',
  'settings.gapMode.spread': 'Verteilt',
  'settings.gapMode.lump': 'Auf einmal',
  'settings.gapMode.none': 'Gerade fehlt nichts.',
  'settings.gapMode.forced': 'Bis dahin kommt keine Einzahlung mehr. Darum auf einmal.',
  'settings.roundingOn': 'Monatsbetrag runden',
  'settings.rounding': 'Monatsbetrag aufrunden auf',
  'settings.buffer': 'Sicherheitspuffer',
  'settings.buffer.off': 'Aus',
  'settings.buffer.info': 'Ein kleines Polster, falls eine Rechnung teurer wird.',
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
