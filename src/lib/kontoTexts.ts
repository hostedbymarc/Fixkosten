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

  // · Kachel auf dem Monats-Screen
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
  'sheet.buffer': 'Puffer {betrag}',
  'sheet.month.lowest': 'Gezeigt: {monat}, der Monat mit dem tiefsten Stand. Tipp auf einen Punkt für einen anderen Monat.',
  'sheet.month.picked': 'Gezeigt: {monat}.',
  'sheet.chart': 'Verlauf mit Plan',
  'sheet.chart.info': 'So entwickelt sich dein Geld, wenn du den Betrag immer am {tag} zur Seite legst. Diesen Monat zählen nur noch offene Rechnungen.',
  'sheet.allMonths': 'Alle Monate',
  'sheet.col.deposit': 'Einzahlung',
  'sheet.col.debits': 'Abbuchungen',
  'sheet.col.end': 'Stand',
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
  'settings.roundingOn': 'Monatsbetrag runden',
  'settings.rounding': 'Monatsbetrag aufrunden auf',
  'settings.buffer': 'Sicherheitspuffer',
  'settings.buffer.off': 'Aus',
  'settings.buffer.info': 'Ein kleines Polster, falls eine Rechnung teurer wird.',
  'settings.edit': 'Einrichtung ändern',
  'settings.walkthrough': 'So funktioniert Erbse',

  // · Monats-Screen, Hero (ohne „Fixkosten einplanen“): Monat erledigt
  'hero.done.title': '{monat} erledigt',
  'hero.done.sub': 'Alle {n} Rechnungen bezahlt',
  'hero.done.sub.one': 'Deine Rechnung ist bezahlt',

  // · Woraus zahlst du das? (Bearbeiten-Dialog, Positionen-Liste)
  'account.question': 'Woraus zahlst du das?',
  'account.reserve': 'Rücklage',
  'account.salary': 'Direkt',
  'account.info': 'Rücklage: Geld, das du jeden Monat zur Seite legst. Direkt: zahlst du sofort vom Gehalt.',
  'unplanned.label': 'Nicht einplanen',
  'unplanned.info': 'Zählt nicht zu Fixkosten, Rücklage und Aufteilung. Zum Beispiel Käufe aus deinem Spielgeld.',
  'unplanned.chip': 'nicht eingeplant',

  // · Spielgeld (Einstellungen, Karte „Dein Spielgeld“): nur ein Planungswert
  'settings.spielgeld': 'Spielgeld pro Monat',
  'settings.spielgeld.info': 'Dein geplantes Spielgeld. Erbse prüft, ob es neben der Rücklage passt.',
  'settings.spielgeld.hint': 'Leer lassen, wenn du kein Spielgeld planst.',

  // · So teilt sich dein Gehalt (statt „Frei verfügbar“, nur mit Fixkosten einplanen)
  'analyse.order.until': '{betrag} bis {monat}, danach {basis}',

  // · Zur-Seite-Kachel: auf einmal mit offenem Einmalbetrag, Empfehlung (nur mit geplantem Spielgeld)

  // · Walkthrough „So funktioniert Erbse“ (5 Karten)
  'walk.title': 'So funktioniert Erbse',
  'walk.example': 'Beispiel',
  'walk.example.note': 'Beispielzahlen. Richte „Fixkosten einplanen“ ein, dann siehst du deine.',
  'walk.progress': 'Karte {n} von {gesamt}',
  'walk.next': 'Weiter',
  'walk.back': 'Zurück',
  'walk.done': 'Fertig',
  'walk.1.title': 'Deine Fixkosten schwanken.',
  'walk.1.sub': 'Nur Rechnungen aus deiner Rücklage',
  'walk.1.direct': '{n} Posten zahlst du direkt.',
  'walk.1.text': 'Im {teuer} zahlst du {max}, im {guenstig} nur {min}.',
  'walk.2.title': 'Bei Fälligkeit oder gleichmäßig.',
  'walk.2.text': 'Gleichmäßig sind das {betrag} pro Monat. Bei Fälligkeit zahlst du, wenn es kommt.',
  'walk.3.title': 'Vom Gehalt geht zuerst dein Plan weg.',
  'walk.3.text': 'Aufs Fixkostenkonto, direkt bezahlt, Vermögensaufbau. Der Rest ist frei für dich.',
  'walk.3.app': 'Spielgeld planst du nur ein. Erbse prüft, ob es passt.',
  'walk.3.salary': 'Gehalt',
  'walk.3.pot': 'Fixkostenkonto',
  'walk.3.direct': 'Direkt bezahlt',
  'walk.3.spielgeld': 'Frei für dich',
  'walk.3.wealth': 'Vermögensaufbau',
  'walk.4.title': 'Erbse empfiehlt den einfacheren Weg.',
  'walk.4.rule': 'Zuerst bei Fälligkeit. Reicht das nicht jeden Monat, dann gleichmäßig.',
  'walk.4.due': 'Für dich passt: Bei Fälligkeit.',
  'walk.4.even': 'Für dich passt: Gleichmäßig.',
  'walk.4.none': 'Fehlt etwas, zeigt dir „Dein Plan“ einen Vorschlag.',
  'walk.5.title': 'Dein Spielgeld ist die Prüfgröße.',
  'walk.5.text': 'Am {tag} kommt dein Gehalt. Erbse zeigt dir, was frei bleibt.',
  // · monat-ist-monat / alle-monate-gleich: Karte „Dein Monat“ für jeden Monat (das Gehalt am Anfang des Zeitraums)
  'month.title': 'Dein Monat',
  'month.noSalary': 'Trag dein Gehalt ein. Dann rechnet Erbse deinen Monat.',
  'month.noSalary.action': 'Gehalt eintragen',
  'month.toAccount': 'Aufs Fixkostenkonto',
  'month.aside': 'Zur Seite legen',
  'month.incl.due': 'inkl. {betrag} {zahlungen}',
  'month.incl.save': 'inkl. {betrag} für {monat} · {zahlungen}',
  'month.split': 'So teilt sich dein Gehalt',
  'month.salary.edit': 'Gehalt ändern',
  'month.direct': 'Direkt bezahlt',
  'month.direct.more': '{n} Posten',
  'month.wealth': 'Vermögensaufbau',
  'month.free': 'Überschuss in diesem Monat',
  'month.before': 'Vor Spielgeld frei: {betrag}',
  'month.unplanned': 'Spielgeld',
  'month.spielgeld.spent': '{betrag} von {limit} ausgegeben',
  'month.spielgeld.over': '{betrag} ausgegeben · {over} drüber',
  'month.spielgeld.none': 'Kein Spielgeld festgelegt',
  'month.pill.rest': 'Spielgeld: {betrag} von {limit} · {rest} übrig',
  'month.pill.over': 'Spielgeld: {betrag} von {limit} · {over} drüber',
  'month.wealth.notFromNet': '{betrag} nicht vom Netto',
  'month.list.save': 'Für später zur Seite',
  'month.list.take': 'Aus dem Angesparten',
  'month.list.rest': 'Noch nicht ausgegeben',
  'month.list.empty': 'Nichts in diesem Monat',
  'month.list.notFromNet': 'nicht vom Netto',
  'month.list.other': 'aus anderer Quelle',
  'month.next': '{gehalt} · {wann}',
  'month.next.plan': 'Plan ansehen',
  'month.deviation': 'in diesem Monat {x} statt {y}',
  'source.label': 'Bezahlt aus',
  'source.salary': 'Gehalt',
  'source.other': 'Andere Quelle',
  'source.info': 'Andere Quelle zählt nicht gegen dein Spielgeld.',
  'month.pill.none': 'Spielgeld festlegen',
  'month.confirm.account': '{betrag} aufs Fixkostenkonto überwiesen',
  'month.confirm.aside': '{betrag} zur Seite gelegt',
  'month.done.account': 'Überwiesen. Erledigt am {datum}.',
  'month.done.aside': 'Zur Seite gelegt. Erledigt am {datum}.',
  'month.setup': 'Richte „Fixkosten einplanen“ ein. Dann siehst du, was frei ist.',
  'month.setup.action': 'Einrichten',
  'month.plan': 'Dein Plan öffnen',

  // · Rechnungen als schmale Zeile
  'bills.title': 'Rechnungen {monat}',
  'bills.count': '{x} von {n} bezahlt',
  'bills.count.card': '{x} von {n} Rechnungen bezahlt',
  'bills.done.sub': 'Alle {n} Rechnungen bezahlt',
  'bills.done.sub.one': 'Die Rechnung ist bezahlt',
  'bills.done': '{monat} erledigt',
  'bills.none': 'Nichts fällig',

  // · Nächster großer Monat
  'big.title': 'Nächster großer Monat',
  'big.ready': 'Mit deinem Plan bist du vorbereitet.',
  'big.prepare': 'Plane vor: {vorschlag}',

  // · Sheet „Dein Plan“
  'plan2.title': 'Dein Plan',
  'plan2.ok': 'Passt so. Dein Spielgeld bleibt jeden Monat übrig.',
  'plan2.save': 'Passt, wenn du ansparst.',
  'plan2.proposal': 'Spar ab {monat} {betrag} im Monat für {zahlung} an.',
  'plan2.proposal.even': 'Spar alle großen Zahlungen gleichmäßig an.',
  'plan2.apply': 'Übernehmen',
  'plan2.max': 'Geht nicht ganz. Höchstens {betrag} Spielgeld sind möglich.',
  'plan2.max.apply': 'Spielgeld auf {betrag} setzen',
  'plan2.none': 'Leg dein Spielgeld fest. Dann prüft Erbse deinen Plan.',
  'plan2.noSalary': 'Trag dein Gehalt ein. Dann rechnet Erbse deinen Plan.',
  'plan2.spielgeld': 'Dein Spielgeld',
  'plan2.spielgeld.edit': 'Spielgeld ändern',
  'plan2.mode': 'Wie zahlst du große Zahlungen?',
  'plan2.mode.due': 'Bei Fälligkeit',
  'plan2.mode.even': 'Gleichmäßig',
  'plan2.mode.due.info': 'Jede große Zahlung überweist du im Monat, in dem sie fällig ist.',
  'plan2.mode.even.info': 'Du sparst alle großen Zahlungen vorher in gleichen Raten an.',
  'plan2.mode.custom.info': 'Du hast Zahlungen einzeln geändert.',
  'plan2.custom': 'Eigener Plan',
  'plan2.recommended': 'Empfohlen',
  'plan2.table': 'Deine nächsten Gehälter',
  'plan2.table.month': 'Monat',
  'plan2.table.transfer': 'aufs Konto',
  'plan2.table.aside': 'zur Seite',
  'plan2.table.free': 'frei für dich',
  'plan2.table.short': 'weniger als dein Spielgeld',
  'plan2.table.more': 'Alle 12 Monate',
  'plan2.table.less': 'Nur 4 Monate',
  'plan2.payments': 'Große Zahlungen',
  'plan2.payments.empty': 'In den nächsten 12 Monaten kommt keine große Zahlung.',
  'plan2.pay.due': 'im {monat} zahlen',
  'plan2.pay.spread': 'vorher ansparen: {n} × {betrag} ab {monat}',
  'plan2.pay.even': 'gleichmäßig angespart',
  'plan2.pay.saved': '{betrag} schon angespart · {monat} noch {rest}',
  'plan2.pay.savedAll': '{betrag} schon angespart',
  'plan2.pay.edit': 'ändern',
  'plan2.pay.when': 'Wie zahlst du {zahlung}?',
  'plan2.pay.from': 'Ansparen ab',
  'plan2.pay.ready': 'Fertig',

  // · monat-feinschliff: das Gehalt heißt nach dem Monat, in dem es kommt
  'salary.name': '{monat}-Gehalt',
  'salary.paid': 'ausgezahlt am {datum}',
  'salary.comes': 'kommt am {datum}',
  'salary.subtitle': '{gehalt}, {wann}',
  'salary.rule': 'Dein Gehalt heißt nach dem Monat, in dem es kommt.',

  // · Einstellungen
  'settings.account': 'Eigenes Konto für Fixkosten',
  'settings.account.yes': 'Ja',
  'settings.account.no': 'Nein',
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
