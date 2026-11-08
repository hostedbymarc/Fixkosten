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
