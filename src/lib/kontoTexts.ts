// Every text of „Fixkosten einplanen“ (internally: the Fixkostenkonto) in one place: Du-Form, at most 12 words per sentence, no
// jargon. {platzhalter} are filled in by t(); an amount counts as one word. src/lib/kontoStatus.test.ts
// checks the word limit, scripts/konto-texts.mjs prints the list for the PR.

export const KONTO_TEXTS = {
  // · Status (Kachel, Sheet, Dein Plan, Einstellungen): nur in Worten, 3 Zustände
  'status.setup': 'Fixkosten einplanen',
  'status.progress': '{n} von {gesamt} erledigt',
  'status.gap': 'Ab {monat} reicht das Geld nicht.',
  'status.gap.action': 'Leg bis {datum} einmalig {betrag} zur Seite.',
  'status.gap.actionNow': 'Leg jetzt einmalig {betrag} zur Seite.',
  'status.gap.done': 'Erledigt, zur Seite gelegt',
  'status.covered': 'Alles eingeplant bis {monat}.',

  // · Kachel auf dem Monats-Screen
  'tile.title': 'Fixkosten einplanen',
  'tile.order': 'Dauerauftrag {betrag} {tag}',
  'tile.monthly': 'Monatlich {betrag} {tag}',
  'tile.info.title': 'Monatsbetrag',
  'tile.info':
    'So viel legst du jeden Monat zur Seite. Alle Abbuchungen der nächsten 12 Monate, geteilt durch 12, aufgerundet. So sind Preiserhöhungen und Jahreszahlungen schon drin.',
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

  // · Dein Plan: Checkliste mit zwei Punkten
  'plan.title': 'Dein Plan',
  'plan.order.new': 'Dauerauftrag einrichten: {betrag} monatlich {tag} auf dein Fixkostenkonto',
  'plan.order.check': 'Dauerauftrag prüfen: {betrag} monatlich {tag} auf dein Fixkostenkonto',
  'plan.monthly': 'Leg jeden Monat {betrag} für Fixkosten zur Seite.',
  'plan.monthly.info': 'Mit einem eigenen Konto und Dauerauftrag passiert das automatisch.',
  'plan.gap': 'Leg bis {datum} einmalig {betrag} zur Seite.',
  'plan.gap.now': 'Leg jetzt einmalig {betrag} zur Seite.',
  'plan.gap.none': 'Kein Extra-Betrag nötig.',
  'plan.copy': 'Betrag kopieren',
  'plan.copied': 'Kopiert',
  'plan.done': 'Erledigt',
  'plan.finish': 'Fertig',

  // · monatlicher Check
  'check.month': 'Neuer Monat. Ist dein Dauerauftrag eingegangen?',
  'check.month.again': 'Ist dein Dauerauftrag für {monat} eingegangen?',
  'check.month.plan': 'Neuer Monat. Hast du {betrag} zur Seite gelegt?',
  'check.month.plan.again': 'Hast du für {monat} {betrag} zur Seite gelegt?',
  'check.month.yes': 'Ja',
  'check.month.no': 'Noch nicht',
  'check.balance': 'Stimmt dein Kontostand noch? {betrag}',
  'check.balance.plan': 'Liegen noch {betrag} für Fixkosten bereit?',
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
  'sheet.q1': 'Wie viel lege ich monatlich zur Seite?',
  'sheet.q1.cause': 'Aus {n} Rechnungen der nächsten 12 Monate, aufgerundet.',
  'sheet.q3': 'Reicht es das ganze Jahr?',
  'sheet.chart': 'Stand am Monatsende',
  'sheet.assumption': 'Annahme: Der Monatsbetrag kommt jeden Monat vor allen Abbuchungen. Im aktiven Monat zählen nur noch offene Positionen.',
  'sheet.allMonths': 'Alle Monate',
  'sheet.positions': 'Eingeplante Rechnungen ({n})',
  'sheet.inputs': 'Zur Seite gelegt und Rundung',
  'sheet.col.deposit': 'Einzahlung',
  'sheet.col.debits': 'Abbuchungen',
  'sheet.col.end': 'Stand',
  'sheet.balance.info': 'Was heute für deine Fixkosten bereitliegt.',
  'sheet.received': 'Dauerauftrag für {monat} schon eingegangen?',
  'sheet.received.plan': 'Für {monat} schon zur Seite gelegt?',
  'sheet.rounding': 'Monatsbetrag aufrunden auf',
  'sheet.rising': 'Dein Stand steigt in 12 Monaten um {betrag}. Der Monatsbetrag ist höher als nötig, z. B. durch die Rundung.',

  // · Einstellungen
  'settings.title': 'Fixkosten einplanen',
  'settings.switch': 'Fixkosten einplanen',
  'settings.off': 'Erbse zeigt nur deine Fixkosten.',
  'settings.on': 'Erbse sagt dir, wie viel du monatlich zur Seite legst. Und warnt, bevor es knapp wird.',
  'settings.info': 'Erbse rechnet aus, wie viel du monatlich zur Seite legst. Und ob es jeden Monat reicht. Ohne Banklogin.',
  'settings.balance': 'Schon zur Seite gelegt',
  'settings.asOf': 'Stand vom {datum}',
  'settings.order': 'Dauerauftrag',
  'settings.monthly': 'Monatlich zur Seite',
  'settings.gap': 'Einmalig zur Seite legen',
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
