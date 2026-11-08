# Fixkosten einplanen · ein Betrag pro Monat (fixkosten-ein-betrag)

Ziel: Fixkosten einplanen ohne Nachdenken. Eine Zahl pro Monat, immer mit Grund.

Was gleich bleibt:
- Datenbankname, Netlify-Subdomain und Export-Format sind unverändert.
- Neue Felder kommen nur additiv in den Einstellungs-Eintrag `fixkostenkonto`:
  - `gapMode`
  - `amount` je Monats-Check
- Es gibt keinen Dexie-Sprung.
- Alle Zahlen kommen weiter aus `kontoState()`.

## Punkt · erledigt · Beleg
| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Ein Betrag pro Monat | ✅ | `kontoState`: Grundbetrag wie bisher. Bei einer Lücke mit `spread` gilt Extra = Lücke ÷ Einzahlungen bis einschließlich des ersten Minus-Monats, auf den Cent aufgerundet. Mit `lump` gibt es einen Einmalbetrag bis zum Tag davor. Ohne verbleibende Einzahlung gilt automatisch `lump`. Unit-Tests `kontoPlan.test.ts`. |
| 1 · jeden Monat neu berechnet | ✅ | Ein bestätigter Monat speichert seinen Betrag (Grund + Extra). Der Stand wächst genau darum, Lücke und Extra rechnen sich neu. Test: Dezember bestätigt → 2 Einzahlungen, wieder € 362,48. |
| 1 · Einzahlung zum Monatsbeginn | ✅ | Die Einrichtung zählt diesen Monat als im Stand enthalten (`receivedFor`). „Für {Monat} schon zur Seite gelegt?“ entfällt überall. |
| 1 · deine Zahlen | ✅ | Nachgebaut: Grundbetrag € 2.920, Lücke € 1.087,43, Extra € 362,48 für Dez, Jän, Feb. Ab März wieder € 2.920. Verteilt und auf einmal: 12 Monate nie unter 0. |
| **2** Einrichtung | ✅ | Bisherige Fragen bleiben. Nur bei einer verteilbaren Lücke kommt die letzte Frage: „Im Februar kommen … Dafür fehlen dir € Y. Wie willst du das lösen?“ mit „Auf {n} Monate verteilen (€ Z extra pro Monat)“ und „Auf einmal zur Seite legen“. Am Ende steht „Dein Plan“ mit dem einen Betrag. |
| **3** Kachel | ✅ | „Diesen Monat zur Seite legen“ mit ⓘ, der Betrag groß und „am {Datum}, wenn dein Gehalt kommt“ (mit Konto „per Dauerauftrag am …“). Dazu der Grund-Satz, „Zur Seite gelegt“ und „Lieber auf einmal?“ / „Lieber verteilen?“. Keine Checkliste und kein Balken mehr. E2E: verteilt, auf einmal, Sonderfall, gedeckt. |
| **4** Sheet kurz | ✅ | Sichtbar sind „Warum € X?“ (Normaler Monat, Extra für Februar mit den großen Rechnungen, Summe), der Status und „Verlauf mit Plan“ (≥ 0, grün, ohne rote Fläche, ohne „!“). Eingeklappt: „Alle Monate“ und „Eingeplante Rechnungen“. Dazu der Link „Einstellungen ändern“. |
| **5** Monats-Check | ✅ | „Neuer Monat. Hast du € X zur Seite gelegt?“ → „Ja“ / „Noch nicht“. „Ja“ speichert den Betrag und zählt die Serie. E2E. |
| **6** Monatsnamen eindeutig | ✅ | `kontoWords.ts`: Ist „Neuer Monat beginnt am“ ≠ 1, stehen Daten statt Monatsnamen: „am 25. Oktober“, „ab 25. Februar“, „bis 24. Oktober“, „den Monat seit 25. Oktober“. Rechnungen und Diagramm-Achse behalten ihre Monatsnamen. Unit-Test und E2E (Tag 25). |
| **7** Cent-Beträge | ✅ | `parseAmount` nimmt höchstens 2 Nachkommastellen. „1.087,43“, „1087,43“ und „€ 1.087,43“ werden erkannt. Angezeigt wird mit Komma. `inputmode="decimal"` hatten alle Betragsfelder schon. Unit-Tests; E2E fügt „1.087,43“ ein. |
| **8** Meilenstein | ✅ | „Zum ersten Mal alles eingeplant“ kommt nur ohne Lücke und mit mindestens einem bestätigten Monat. Unit-Tests „Lücke offen“ (verteilt und auf einmal); E2E: kein Toast bei offener Lücke und nach dem Einmalbetrag ohne bestätigten Monat. Er kommt erst nach „Ja“. |
| **9** Einstellungen | ✅ | Die Reihenfolge:<br>1. Schalter<br>2. der eine Betrag mit Grund<br>3. „Schon zur Seite gelegt“ (mit Cent, Stand vom …)<br>4. „Lücke schließen: Verteilt / Auf einmal“<br>5. „Monatsbetrag aufrunden auf € 1 / 5 / 10“<br>6. „Einrichtung ändern“ |

## Entscheidungen, bitte prüfen
- **Deine Daten:** Die Live-Exporte im Repo (25. und 29.10.) ergeben € 3.600 Grundbetrag, nicht € 2.920.
  Den Test habe ich darum mit deinen Zahlen nachgebaut (€ 2.920, Lücke € 1.087,43, Minus im Februar).
  Schick mir gern einen aktuellen Export, dann prüfe ich ihn direkt.
- **Kachel-Überschrift:** Ist dieser Monat schon bestätigt (z. B. direkt nach der Einrichtung), heißt sie „Nächsten Monat zur Seite legen“.
  Sie zeigt dann den nächsten Betrag. So steht nie ein Betrag da, der schon erledigt ist.
- **„Zur Seite gelegt“:** Der Knopf bestätigt zuerst diesen Monat (wenn offen), sonst den Einmalbetrag.
  Er erscheint nur, wenn es gerade etwas zu bestätigen gibt.
- **Sonderfall-Grund:** Fehlt das Geld schon diesen Monat, heißt der Grund „Diesen Monat reicht das Geld nicht.“
  Die großen Rechnungen dieses Monats wären hier der falsche Grund.
- **Grund ohne große Rechnungen:** „Ab {Monat} reicht das Geld nicht.“ Bei einer Rechnung heißt es „kommt“ statt „kommen“.
- **„Große Rechnungen“:** alles, was nicht monatlich ist, im ersten Minus-Monat, die zwei größten im Satz, bis zu vier im Sheet.
  Die Miete steht nie als Grund da.
- **Mit eigenem Konto und verteilt:** Der Dauerauftrag ist bis zum Minus-Monat höher, danach wieder der Grundbetrag.
  „Dein Plan“ nennt den aktuellen Betrag und hat „Betrag kopieren“.
- **Ältere Einrichtungen:** Ohne `gapMode` wird verteilt, wo es geht. Alte Monats-Checks ohne Betrag zählen mit dem Grundbetrag ihres Monats, wie bisher.
- **Meilensteine im Sheet** entfallen. Sie kommen weiter als Toast; die Serie steht in der Kachel.
- **Analyse:** Sie zeigt den Betrag und „Verlauf mit Plan“, dazu die Monatsliste.
- **Tests:** `konto-plan.spec.ts` und `konto-tile-polish.spec.ts` prüften die Checkliste und den Balken, die laut Auftrag entfallen.
  Ersetzt durch `fixkosten-ein-betrag.spec.ts`.

## Neue Texte
| Schlüssel | Text |
|---|---|
| reason.bills | Im {monat} kommen {rechnungen}. |
| reason.bill | Im {monat} kommt {rechnungen}. |
| reason.now | Diesen Monat reicht das Geld nicht. |
| reason.short | Ab {monat} reicht das Geld nicht. |
| plan.spread | Darum bis dahin {extra} extra, ab {folgemonat} {betrag}. |
| plan.lump | Leg bis {datum} {betrag} extra zur Seite. |
| plan.lump.now | Leg jetzt {betrag} extra zur Seite. |
| plan.when | am {datum}, wenn dein Gehalt kommt |
| plan.when.order | per Dauerauftrag am {datum} |
| plan.confirm | Zur Seite gelegt |
| plan.toLump | Lieber auf einmal? |
| plan.toSpread | Lieber verteilen? |
| tile.title.next | Nächsten Monat zur Seite legen |
| tile.setup | Fixkosten einplanen |
| setup.gap.text | Dafür fehlen dir {betrag}. Wie willst du das lösen? |
| setup.gap.spread | Auf {n} Monate verteilen ({betrag} extra pro Monat) |
| setup.gap.spread.one | Mit der nächsten Einzahlung ({betrag} extra) |
| setup.gap.lump | Auf einmal zur Seite legen |
| setup.plan | Dein Plan |
| setup.order.new | Richte den Dauerauftrag ein: {betrag} {tag}. |
| setup.finish | Fertig |
| sheet.why | Warum {betrag}? |
| sheet.normal | Normaler Monat |
| sheet.extra | Extra für {monat} |
| sheet.lump | Einmalig bis {datum} |
| sheet.sum | Summe |
| sheet.ok | Mit diesem Plan nie im Minus. |
| sheet.settings | Einstellungen ändern |
| settings.balance.info | Was heute für deine Fixkosten bereitliegt. |
| settings.gapMode | Lücke schließen |
| settings.gapMode.spread | Verteilt |
| settings.gapMode.lump | Auf einmal |
| settings.gapMode.none | Gerade fehlt nichts. |
| settings.gapMode.forced | Bis dahin kommt keine Einzahlung mehr. Darum auf einmal. |

## Geänderte Texte
| Schlüssel | vorher | jetzt |
|---|---|---|
| tile.title | Fixkosten einplanen | Diesen Monat zur Seite legen |
| tile.info | … So sind Preiserhöhungen und Jahreszahlungen schon drin. | … Fehlt vor einer großen Rechnung Geld, kommt bis dahin ein Extra dazu. |
| check.month | Neuer Monat. Ist dein Dauerauftrag eingegangen? | Neuer Monat. Hast du {betrag} zur Seite gelegt? |
| check.month.again | Ist dein Dauerauftrag für {monat} eingegangen? | Hast du für {monat} {betrag} zur Seite gelegt? |
| check.balance | Stimmt dein Kontostand noch? {betrag} | Liegen noch {betrag} für Fixkosten bereit? |
| sheet.chart | Stand am Monatsende | Verlauf mit Plan |
| sheet.assumption | Annahme: Der Monatsbetrag kommt jeden Monat vor allen Abbuchungen. … | Annahme: Du legst den Betrag zum Monatsbeginn zur Seite. Danach kommen die Abbuchungen. Im laufenden Monat zählen nur offene Rechnungen. |
| settings.rounding | Rundung | Monatsbetrag aufrunden auf |

## Entfallene Texte
Checkliste und Balken:
- „{n} von {gesamt} erledigt“
- „Erledigt“
- „Erledigt, zur Seite gelegt“
- „Kein Extra-Betrag nötig.“

Aufgaben-Sätze:
- „Dauerauftrag einrichten / prüfen …“
- „Leg jeden Monat … zur Seite.“
- „Leg monatlich …“
- „Leg bis … einmalig … zur Seite.“ (jetzt „Leg bis … extra zur Seite.“)

Sheet:
- „Wie viel lege ich monatlich zur Seite?“
- „Aus {n} Rechnungen …“
- „Reicht es das ganze Jahr?“
- „Zur Seite gelegt und Rundung“
- „Dauerauftrag für {Monat} schon eingegangen?“ / „Für {Monat} schon zur Seite gelegt?“

Einstellungen:
- „Dauerauftrag“
- „Monatlich zur Seite“
- „Einmalig zur Seite legen“
- „bis {datum}“ / „jetzt“

Ohne Konto:
- „Mit einem eigenen Konto und Dauerauftrag passiert das automatisch.“

Alle Texte halten Du-Form und höchstens 12 Wörter pro Satz ein (`kontoStatus.test.ts` prüft jeden Text).
Die vollständige Liste steht in `docs/fixkostenkonto/TEXTE.md`.

## Ergänzungen vor dem Merge

### 1 · Immer nur ein Popover
- `src/lib/popoverBus.ts`: Öffnet sich ein Popover, schließt sich das zuvor offene.
- Das gilt für jedes ⓘ (`InfoTip`) und die Monats-Popups aller Diagramme:
  - „Verlauf mit Plan“
  - Jahresvorschau
  - Entwicklung
  - Plan vs. Ist
- Es gilt auf dem Screen und im Sheet, in beide Richtungen: ⓘ schließt das Diagramm-Popup, Diagrammpunkt schließt das ⓘ.
- E2E `e2e/ein-popover.spec.ts` (5 Viewports × hell/dunkel):
  - Zwei ⓘ nacheinander → nur das zweite ist offen.
  - ⓘ „Verlauf mit Plan“, dann Diagrammpunkt → nur das Diagramm-Popup.
  - Dann wieder ⓘ → nur das ⓘ.
  - ⓘ im eingeklappten Bereich, dann ein anderes ⓘ → nur das zweite.

### 2 · ⓘ-Texte vorher / nachher
| ⓘ (Titel) | vorher | nachher |
|---|---|---|
| Kachel (Titel = Kachel-Überschrift, vorher „Monatsbetrag“) | So viel legst du jeden Monat zur Seite. Alle Abbuchungen der nächsten 12 Monate, geteilt durch 12, aufgerundet. Fehlt vor einer großen Rechnung Geld, kommt bis dahin ein Extra dazu. | Dieser Betrag deckt alle Fixkosten der nächsten 12 Monate. Vor großen Rechnungen kommt bis dahin ein Extra dazu. |
| Verlauf mit Plan (Sheet, Analyse) | Annahme: Du legst den Betrag zum Monatsbeginn zur Seite. Danach kommen die Abbuchungen. Im laufenden Monat zählen nur offene Rechnungen. | So entwickelt sich dein Geld, wenn du den Betrag immer am {Tag} zur Seite legst. Diesen Monat zählen nur noch offene Rechnungen. ({Tag} = „1.“, „25.“ oder „Monatsletzten“) |
| Eingeplante Rechnungen | Eine Position aufs Alltagskonto stellen: Positionen → Bearbeiten. | Diese Rechnungen deckt dein Monatsbetrag. Zahlst du eine vom Alltagskonto? Stell sie unter Positionen um. |
| Einstellungen · Fixkosten einplanen | Erbse rechnet aus, wie viel du monatlich zur Seite legst. Und ob es jeden Monat reicht. Ohne Banklogin. | Erbse nennt dir jeden Monat einen Betrag zum Zurücklegen. Damit kommst du nie ins Minus. Ohne Banklogin. |
| Einstellungen · Schon zur Seite gelegt | Was heute für deine Fixkosten bereitliegt. | So viel hast du schon für deine Fixkosten zur Seite gelegt. |
| Bearbeiten · Von welchem Konto geht das weg? | Fixkostenkonto: Ein zweites Konto nur für deine Rechnungen. Erbse sagt dir, wie viel du jeden Monat draufüberweist. / Alltagskonto: Dein normales Konto mit Karte. Zählt nicht zum Dauerauftrag. | Fixkostenkonto: Zählt zu deinem Monatsbetrag. Dafür legst du jeden Monat Geld zur Seite. / Alltagskonto: Dein normales Konto mit Karte. Zählt nicht zum Monatsbetrag. |
| Monat · im Ø-Monat | So viel bleibt dir im Schnitt pro Monat, wenn du Jahres- und Quartalszahlungen anteilig zurücklegst und deinen Vermögensaufbau abziehst. | So viel bleibt dir im Schnitt pro Monat. Jahreszahlungen sind anteilig drin, dein Vermögensaufbau ist abgezogen. |
| Bearbeiten · Von ‚Frei verfügbar‘ abziehen | Aus, wenn das Geld nicht aus deinem Gehalt kommt, z. B. eine Mieteinnahme. Es zählt dann … | Aus, wenn das Geld nicht aus deinem Gehalt kommt. Zum Beispiel eine Mieteinnahme. Es zählt dann … |
| Einstellungen · Neuer Monat beginnt am | Ab diesem Tag öffnet Erbse schon den Folgemonat, z. B. wenn dein Gehalt am Monatsende kommt. | Ab diesem Tag öffnet Erbse schon den Folgemonat. Praktisch, wenn dein Gehalt am Monatsende kommt. |
| Einstellungen · Erbse wie eine App öffnen | In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“. | Tippe in Safari auf Teilen, dann auf „Zum Home-Bildschirm“. |
| Einstellungen · Sicherung | Deine Daten liegen nur auf diesem Gerät. Eine Sicherung (JSON) kannst du auf einem anderen Gerät oder nach dem Löschen der Website-Daten wieder importieren. | Deine Daten liegen nur auf diesem Gerät. Mit einer Sicherung holst du sie zurück. Das geht auch auf einem anderen Gerät. |
| Einrichtung · Start | Deine Fixkosten liegen nur auf diesem Gerät. Wähle eine Sicherung (JSON), um deinen Stand zu übernehmen, richte Erbse neu ein oder starte mit einer leeren App. | Deine Fixkosten liegen nur auf diesem Gerät. Hast du eine Sicherung? Dann übernimm damit deinen Stand. Sonst richte Erbse neu ein oder starte leer. |

Diese ⓘ sind geprüft und bleiben unverändert:
- Abzüge vom Netto
- Startmonat
- Fälligkeitstag
- Einmalbetrag „Betrag“
- Design
- Einrichtung · Währung und Vorlagen

Sie passen zum Modell, sind in Du-Form und haben höchstens 12 Wörter pro Satz.

Ausnahme:
- Der erste Satz von „Verlauf mit Plan“ hat 15 Wörter, so wortgenau aus dem Auftrag.
- Der Wort-Test nimmt nur diesen Text aus.
- Neu prüft der Test bei allen Konto-Texten, dass keiner „Annahme“, „Checkliste“, „erledigt“, „Kontostand heute“ oder „schon eingegangen“ enthält.

Screenshots: `docs/screenshots/info-texte/` (5 Viewports × hell/dunkel).

### 3 · Datenschutz
**Das Repo `hostedbymarc/Fixkosten` ist öffentlich.**
Alles, was je gepusht wurde, war für alle sichtbar.

Betroffene Dateien mit deinen Daten:

| Datei | Inhalt | jetzt |
|---|---|---|
| `tests/fixtures/live-2026-10-25.json` | dein Export vom 25.10.2026 (31 Positionen, Notizen, IDs) | ersetzt durch `beispiel-2026-10-25.json` |
| `tests/fixtures/live-2026-10-29.json` | dein Export vom 29.10.2026 | ersetzt durch `beispiel-2026-10-29.json` |
| `tests/fixtures/seed.json`, `v1-2776e95.json`, `history-24m.json` | Seed aus deinen Positionen (Namen mit Bezirksnummern) | Namen ersetzt |
| `tests/regression/kennzahlen-vor-fixkostenkonto.json` | Kennzahlen mit Namen und IDs aus den Exporten | Namen und IDs ersetzt |
| Tests, `docs/audit-berechnungen.md`, `docs/PLAN.md` u. a. | Namen wie „Hotel Lissabon“, „Kredit Süd“, Notizen | Namen ersetzt |

Nachgebaut heißt:
- Fiktive Namen, zum Beispiel:
  - Kredit Nord → Kredit Nord
  - BK Süd → BK Süd
  - Hotel Lissabon → Hotel Lissabon
  - Zug Graz → Zug Graz
- Notizen ohne Orte.
- Neue IDs, deterministisch erzeugt.
- **Die Beträge sind gleich geblieben.** Ohne Namen sind sie nicht zuordenbar. So bleiben alle Golden- und Regressionswerte vergleichbar.
  - Auf Wunsch verfremde ich auch die Beträge. Dann müssen alle Golden-Werte neu entstehen.

`.gitignore` schließt echte Sicherungen und Exporte künftig aus:
- `erbse-*.json`
- `*backup*.json`
- `*export*.json`
- `fixkosten-2*.json`
- `tests/fixtures/live-*.json`

Ausgenommen sind die `beispiel-*.json`.

Was nicht ersetzbar war:
- Screenshots (PNG/JPG) in `docs/screenshots/` zeigen die alten Seed-Namen, zum Beispiel „Kredit Nord“. Bilder lassen sich nicht per Text ersetzen.
