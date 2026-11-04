// Bestandsaufnahme „Tooltips statt Erklärtexte“: every help or explanatory text of the app, its screen
// and where it lives now. Single source for e2e/tooltips.spec.ts and the table in the PR report
// (scripts/help-texts-table.mjs). Texts are moved, never reworded.

export type Placement = 'sichtbar' | 'tooltip' | 'entfällt';
/** why a visible text stays visible */
export type Kind = 'Wert' | 'Label' | 'Aktion' | 'Status' | 'Warnung' | 'Fehler';

export interface HelpText {
  /** the text (or one of its variants); `…` marks the part that holds a value */
  texts: string[];
  screen: string;
  placement: Placement;
  kind?: Kind;
  note?: string;
}

export const HELP_TEXTS: HelpText[] = [
  // ---- Tooltip: definitions, assumptions, explanations
  { texts: ['Alles, was diesen Monat von deinem Netto abgeht: Fixkosten und Vermögensaufbau. Ring, „abgebucht“ und „offen“ zählen nur die Fixkosten.'], screen: 'Monat · Hero „Abzüge vom Netto“', placement: 'tooltip', note: 'war schon ein Tooltip, jetzt mit Esc/Scroll im Sheet' },
  { texts: ['So viel bleibt dir im Schnitt pro Monat, wenn du Jahres- und Quartalszahlungen anteilig zurücklegst und deinen Vermögensaufbau abziehst.'], screen: 'Monat · Kachel „Frei verfügbar“ (im Ø-Monat)', placement: 'tooltip', note: 'war schon ein Tooltip' },
  { texts: ['So viel überweist du jeden Monat per Dauerauftrag aufs Fixkostenkonto: alle Abbuchungen der nächsten 12 Monate geteilt durch 12, aufgerundet. So sind Preiserhöhungen und Jahreszahlungen schon drin.'], screen: 'Monat · Kachel „Fixkostenkonto“', placement: 'tooltip', note: 'neu (Auftrag: Erklärung des Dauerauftrags)' },
  { texts: ['Annahme: Der Dauerauftrag kommt jeden Monat vor allen Abbuchungen. Im aktiven Monat zählen nur noch offene Positionen.'], screen: 'Fixkostenkonto-Sheet, Analyse · „Kontostand am Monatsende“', placement: 'tooltip' },
  { texts: ['Was heute auf deinem Fixkostenkonto liegt.'], screen: 'Fixkostenkonto-Sheet, Einstellungen · „Kontostand heute“', placement: 'tooltip' },
  { texts: ['Eine Position aufs Alltagskonto stellen: Positionen → Bearbeiten.'], screen: 'Fixkostenkonto-Sheet · „Im Dauerauftrag“', placement: 'tooltip', note: '„Girokonto“ heißt in der Oberfläche jetzt „Alltagskonto“' },
  { texts: ['Fixkostenkonto: Ein zweites Konto nur für deine Rechnungen. Erbse sagt dir, wie viel du jeden Monat draufüberweist.', 'Alltagskonto: Dein normales Konto mit Karte. Zählt nicht zum Dauerauftrag.'], screen: 'Bearbeiten-Dialog · „Von welchem Konto geht das weg?“', placement: 'tooltip', note: 'neu (Text aus dem Auftrag)' },
  { texts: ['Aus, wenn das Geld nicht aus deinem Gehalt kommt, z. B. eine Mieteinnahme. Es zählt dann zum Vermögensaufbau, aber nicht gegen ‚Frei verfügbar‘.'], screen: 'Bearbeiten-Dialog (einmalig, Vermögensaufbau) · „Von ‚Frei verfügbar‘ abziehen“', placement: 'tooltip' },
  { texts: ['Setzt die Fälligkeitsmonate automatisch – darunter einzeln anpassbar.'], screen: 'Bearbeiten-Dialog · „Startmonat“', placement: 'tooltip' },
  { texts: ['31 = letzter Tag des Monats'], screen: 'Bearbeiten-Dialog · „Fälligkeitstag“', placement: 'tooltip' },
  { texts: ['Wird abgezogen.', 'Kommt in diesem Monat dazu.'], screen: 'Einmalbetrag-Sheet · „Betrag“', placement: 'tooltip' },
  { texts: ['Ab diesem Tag öffnet Erbse schon den Folgemonat, z. B. wenn dein Gehalt am Monatsende kommt.'], screen: 'Einstellungen · „Neuer Monat beginnt am“', placement: 'tooltip' },
  { texts: ['Erbse rechnet aus, welchen Dauerauftrag dein Fixkostenkonto braucht und ob es jeden Monat reicht. Ohne Banklogin.'], screen: 'Einstellungen · „Fixkostenkonto verwenden“', placement: 'tooltip' },
  { texts: ['Bestimmt Währung und Zahlenformat. Die Beträge selbst bleiben unverändert.'], screen: 'Einstellungen · „Land und Währung“', placement: 'tooltip' },
  { texts: ['Folgt deinem Gerät: hell oder dunkel, je nach Systemeinstellung.', 'Immer hell, auch wenn dein Gerät dunkel ist.', 'Immer dunkel, angenehm am Abend.'], screen: 'Einstellungen · „Design“', placement: 'tooltip' },
  { texts: ['In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.'], screen: 'Einstellungen · „Erbse wie eine App öffnen“', placement: 'tooltip' },
  { texts: ['Deine Daten liegen nur auf diesem Gerät. Eine Sicherung (JSON) kannst du auf einem anderen Gerät oder nach dem Löschen der Website-Daten wieder importieren.'], screen: 'Einstellungen · „Sicherung“', placement: 'tooltip' },
  { texts: ['Deine Fixkosten liegen nur auf diesem Gerät. Wähle eine Sicherung (JSON), um deinen Stand zu übernehmen, richte Erbse neu ein oder starte mit einer leeren App.'], screen: 'Einrichtung · Start', placement: 'tooltip' },
  { texts: ['Davon hängen Währung und Vorlagen ab. Du kannst das Land später in den Einstellungen ändern.'], screen: 'Einrichtung · Land', placement: 'tooltip' },
  { texts: ['Tippe an, was du zahlst, und trag den Betrag ein. Erbse rechnet daraus deinen Dauerauftrag fürs Fixkostenkonto.'], screen: 'Einrichtung · Vorlagen', placement: 'tooltip' },

  // ---- entfällt: doppelt
  { texts: ['Zählt zum Dauerauftrag aufs Fixkostenkonto.', 'Zählt nicht zum Dauerauftrag.'], screen: 'Bearbeiten-Dialog · unter dem Konto-Umschalter', placement: 'entfällt', note: 'steht jetzt im Tooltip des Umschalters' },
  { texts: ['Dauerauftrag, Startlücke und die nächsten 12 Monate'], screen: 'Fixkostenkonto-Sheet · Untertitel', placement: 'entfällt', note: 'wiederholt die Abschnitte darunter' },

  // ---- sichtbar: warnings and errors (never in a tooltip)
  { texts: ['Damit dein Konto nie ins Minus rutscht, zahl einmalig'], screen: 'Fixkostenkonto-Sheet, Analyse', placement: 'sichtbar', kind: 'Warnung' },
  { texts: ['Tiefster Stand ohne Einzahlung:'], screen: 'Fixkostenkonto-Sheet, Analyse', placement: 'sichtbar', kind: 'Warnung' },
  { texts: ['Dein Kontostand steigt in 12 Monaten um'], screen: 'Fixkostenkonto-Sheet, Analyse', placement: 'sichtbar', kind: 'Warnung', note: 'Dauerauftrag höher als nötig' },
  { texts: ['einzahlen, dann reicht es 12 Monate'], screen: 'Monat · Kachel „Fixkostenkonto“ (Startlücke)', placement: 'sichtbar', kind: 'Warnung' },
  { texts: ['Vor dem Import wird der aktuelle Stand als Sicherheitskopie gemerkt – der Import lässt sich danach rückgängig machen.'], screen: 'Import-Sheet', placement: 'sichtbar', kind: 'Warnung', note: 'Datenverlust' },
  { texts: ['Einträge aus der Datei gewinnen bei Konflikten; alles, was nur auf diesem Gerät ist, bleibt erhalten.', 'Danach sind auf diesem Gerät genau die Daten aus der Datei.'], screen: 'Import-Sheet · Zusammenführen / Ersetzen', placement: 'sichtbar', kind: 'Warnung', note: 'Datenverlust' },
  { texts: ['Sie werden verschoben, danach wird die Kategorie gelöscht.'], screen: 'Kategorie löschen', placement: 'sichtbar', kind: 'Warnung', note: 'Löschen' },
  { texts: ['Mindestens eine Ausgaben-Kategorie muss bleiben.'], screen: 'Kategorien', placement: 'sichtbar', kind: 'Warnung' },
  { texts: ['Keine Optimierung, abgehakte Monate bleiben.'], screen: 'Bearbeiten-Dialog · „Tippfehler korrigieren“', placement: 'sichtbar', kind: 'Warnung', note: 'überschreibt den Plan' },
  { texts: ['Gehört die Zahlung zu einer bestehenden Position (z. B. Strom-Nachzahlung)? Dann dort ‚Einmalbetrag hinzufügen‘.'], screen: 'Neue einmalige Zahlung', placement: 'sichtbar', kind: 'Warnung', note: 'verhindert eine doppelte Position' },
  { texts: ['Deine Daten wurden nicht verändert. Bitte die App neu laden.'], screen: 'Fehlerseite', placement: 'sichtbar', kind: 'Fehler' },
  { texts: ['Bitte einen Betrag eingeben', 'Bitte einen Betrag größer als 0 eingeben.', 'Bitte einen Namen eingeben.', 'Bitte ein Datum wählen.'], screen: 'alle Formulare', placement: 'sichtbar', kind: 'Fehler' },
  { texts: ['Pflichtfeld: Erbse trägt keinen Betrag für dich ein.'], screen: 'Einrichtung · Vorlagen', placement: 'sichtbar', kind: 'Fehler', note: 'Pflichtfeld-Hinweis' },
  { texts: ['Pflichtfeld – die Zahlung erscheint nur im Monat der Fälligkeit', 'erscheint nur in diesem Monat'], screen: 'Bearbeiten-Dialog · „Fällig am“', placement: 'sichtbar', kind: 'Fehler', note: 'Pflichtfeld-Hinweis' },

  // ---- sichtbar: values, labels, actions, status
  { texts: ['Dein Konto ist gedeckt.', 'Gedeckt für die nächsten 12 Monate'], screen: 'Fixkostenkonto-Sheet, Kachel, Analyse', placement: 'sichtbar', kind: 'Status' },
  { texts: ['genau … aus n Positionen, aufgerundet auf …', 'Summe … → aufgerundet …'], screen: 'Fixkostenkonto-Sheet', placement: 'sichtbar', kind: 'Wert' },
  { texts: ['Frühere Monate bleiben unverändert. Zählt als Optimierung bzw. Erhöhung.'], screen: 'Bearbeiten-Dialog · „Ab wann gilt das?“', placement: 'sichtbar', kind: 'Label', note: 'Unterschied der zwei Optionen, die Gegenoption ist eine Warnung' },
  { texts: ['Ø … pro Monat', 'Vormonat: …', 'bisher … / Monat · … / Jahr', 'gilt ab …', 'Gilt seit Beginn (…).'], screen: 'Bearbeiten-Dialog, Monatsabschluss, Betrag ändern', placement: 'sichtbar', kind: 'Wert' },
  { texts: ['Rechnerisch frei diesen Monat … · im Ø-Monat …, jeweils nach den Fixkosten und dem Vermögensaufbau'], screen: 'Monatsabschluss', placement: 'sichtbar', kind: 'Wert' },
  { texts: ['Aktiver Monat: …', 'Letzte Sicherung: …', 'Noch keine Sicherung exportiert.'], screen: 'Einstellungen', placement: 'sichtbar', kind: 'Wert' },
  { texts: ['zählt in diesem Monat, nicht im Ø pro Monat', 'zählt nur in diesem Monat, nicht im Ø'], screen: 'Einmalbetrag-Sheet (Untertitel), Positionsdetail', placement: 'sichtbar', kind: 'Label' },
  { texts: ['Fällige Ausgaben der nächsten 12 Monate', 'Umgelegte Ausgaben pro Monat nach Kategorie', 'Ø pro Monat (aktiver Monat)', 'Sparquote je Monat'], screen: 'Analyse', placement: 'sichtbar', kind: 'Label' },
  { texts: ['Verlauf ab 3 Monaten', 'In den nächsten 2 Monaten keine Sonderzahlungen.', 'Noch nichts abgehakt.'], screen: 'Analyse, Monat, Positionsdetail', placement: 'sichtbar', kind: 'Status' },
  { texts: ['Trag dein Netto-Gehalt im Monat ein, dann siehst du hier deine Sparquote.'], screen: 'Analyse · Sparquote', placement: 'sichtbar', kind: 'Aktion', note: 'Leerzustand mit „Netto eintragen“' },
  { texts: ['Keine archivierten Positionen. Archivieren geht in „Positionen“ per Wischen nach links oder über das ⋯-Menü.'], screen: 'Einstellungen · Archiv', placement: 'sichtbar', kind: 'Status', note: 'Leerzustand' },
  { texts: ['Neu: Fixkostenkonto. Erbse rechnet deinen Dauerauftrag aus.'], screen: 'Monat · Einladungskarte', placement: 'sichtbar', kind: 'Aktion' },
];

/** Warnings and errors: they must never be inside a tooltip. Values in `…` are cut off. */
export const NEVER_IN_TOOLTIP = HELP_TEXTS.filter((t) => t.kind === 'Warnung' || t.kind === 'Fehler').flatMap((t) => t.texts.map((x) => x.split('…')[0]!.trim()).filter((x) => x.length > 0));

/** Tooltip texts: each must be found in a tooltip (any of its variants). */
export const TOOLTIP_TEXTS = HELP_TEXTS.filter((t) => t.placement === 'tooltip');
