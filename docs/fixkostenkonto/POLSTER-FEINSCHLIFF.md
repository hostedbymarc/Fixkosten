# Polster-Feinschliff

Branch `polster-feinschliff` gegen `main`.

Rahmen:
- Datenbankname, Subdomain und Export-Format bleiben gleich.
- Neue Felder sind additiv: `cushionMoves`, `cushionSurplus`, `spielgeldOverrides`. Es gibt keinen Dexie-Sprung.
- Alle Zahlen kommen aus `monthCard()` / `monthPlan()` (Polster: `src/lib/polster.ts`, Cent).
- Keine neuen Hex-Werte, Du-Form, höchstens 12 Wörter je Satz, nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 „Anders aufteilen“: Text-Button „Abbrechen“ unter dem Feld schließt es ohne zu speichern | ✓ | `CushionSplit` (`cushion-split-cancel`); E2E öffnen → Abbrechen → Stand unverändert |
| 1 nach „Polster aufgefüllt“ mit eigenem Betrag schließt das Feld | ✓ | E2E: € 1.000 eigener Betrag → bestätigt, Feld weg |
| 1 erneutes Tippen auf „Anders aufteilen“ schließt | ✓ | `aria-expanded`; E2E |
| 2 Konfetti liegt UNTER dem Text, in einer eigenen Zeile am unteren Rand | ✓ | `.hero-confetti` ist nur noch der Streifen (40 px) am unteren Rand. Block und Karte halten ihn frei (`.confetti-host[data-confetti]`, `.hero[data-done]`) |
| 2 „Rückgängig“ ein echter Button ≥ 44 px, nicht verdeckt | ✓ | E2E: Höhe ≥ 44, `elementFromPoint` in der Mitte trifft den Button |
| 2 alle Stellen mit liegendem Konfetti (Monat erledigt, Polster); Bounding-Boxen überschneiden sich nicht, alle Viewports | ✓ | E2E `confettiClear`: Verteilen-Block, „Dein Polster“, Hero „{Monat} erledigt“. Jeder Text und Button liegt außerhalb des Streifens, jede Erbse darin. 6 Viewports × hell/dunkel |
| 3 „+ Einzahlen“ / „− Entnehmen“ auf Polster-Karte und -Screen; Betrag (Cent), Notiz ≤ 40 Zeichen, Datum heute | ✓ | `MoveForm`, `addCushionMove`; Unit + E2E |
| 3 beliebig oft, Stand sofort, Rückgängig wie bisher | ✓ | Hinweis 5 s mit Rückgängig (`removeCushionMove`); Unit |
| 3 additiv `cushionMoves`; Stand = Summe; Startwert aus vorhandenem Stand; Export enthält sie, Import ohne geht | ✓ | `parseCushion` in `settings.ts`; Unit „Startwert“, „Export und Import“ |
| 3 „Verlauf“: letzte 5 (Datum · Notiz/Quelle · ±Betrag), „Alle anzeigen ›“ | ✓ | `History`; E2E Reihenfolge und Beträge |
| 3 Verteilen/Lücke je Monat einmal; manuelle Bewegungen unabhängig; Etappen-Feier für alle Bewegungen | ✓ | Unit „unabhängig vom Monat“, Etappe 75 % durch Einzahlen; E2E Feier bei 50 % durch Einzahlen |
| 4 Antippen einer Zeile (①–④, Kategorien) → „Betrag für {Monat}“ mit „Nur {Monat}“ / „Ab {Monat}“; Einmalzahlung: Betrag und Datum | ✓ | `MonthAmountSheet`, `setMonthAmount`; E2E: Xmas nur Dezember |
| 4 ④ „Spielgeld für {Monat}“ nur / ab; `spielgeldOverrides` | ✓ | `setSpielgeldFor`, `monthPlan.spielgeldFor`; Unit + E2E: Dezember € 500, Jänner bleibt € 300 |
| 4 alle Zahlen (Karte, Polster-Vorschau, Dein Plan) sofort | ✓ | E2E: Überschuss und Vorschau des Dezembers sofort; Unit `planRows` |
| 4 Polster bestätigt, Überschuss ändert sich: Hinweis mit „Differenz in den Polster“ / „Differenz entnehmen“ / „Passt so“ | ✓ | `SurplusDiff`, `settleCushionDiff`; Unit + E2E „€ 50 höher“ |
| 5 „Nächster großer Monat“: gedeckt → nur grün „Polster deckt es · € X aus dem Polster“, keine rote Zeile | ✓ | `bigMonthCushion`; Unit |
| 5 „Dein Plan“: Polster ≥ 0 in allen 12 Monaten → grün „Dein Polster deckt alle Lücken.“ plus Polster-Zeilen; rot nur, wenn er unter 0 fiele | ✓ | `cushionLevel`; Unit (covered / short / keine Lücke) |
| 5 Tabellenwerte unverändert | ✓ | Unit: Projektion nie unter 0, wie bisher |

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `big.cushion` | Polster deckt es · {betrag} aus dem Polster | 7 |
| `cushion.split.cancel` | Abbrechen | 1 |
| `cushion.move.in` | + Einzahlen | 1 |
| `cushion.move.out` | − Entnehmen | 1 |
| `cushion.move.amount` | Betrag | 1 |
| `cushion.move.note` | Notiz (optional) | 2 |
| `cushion.move.in.save` | Einzahlen | 1 |
| `cushion.move.out.save` | Entnehmen | 1 |
| `cushion.move.cancel` | Abbrechen | 1 |
| `cushion.toast.moveIn` | Eingezahlt: {betrag} | 2 |
| `cushion.toast.moveOut` | Entnommen: {betrag} | 2 |
| `cushion.history` | Verlauf | 1 |
| `cushion.history.all` | Alle anzeigen › | 2 |
| `cushion.history.less` | Weniger anzeigen | 2 |
| `cushion.history.empty` | Noch keine Bewegungen. | 3 |
| `cushion.src.split` | Polster aufgefüllt | 2 |
| `cushion.src.gap` | Aus Polster genommen | 3 |
| `cushion.src.in` | Eingezahlt | 1 |
| `cushion.src.out` | Entnommen | 1 |
| `cushion.src.start` | Stand eingetragen | 2 |
| `cushion.src.diff` | Differenz | 1 |
| `cushion.diff.higher` | Dein Überschuss ist {betrag} höher. | 5 |
| `cushion.diff.lower` | Dein Überschuss ist {betrag} niedriger. | 5 |
| `cushion.diff.in` | Differenz in den Polster | 4 |
| `cushion.diff.out` | Differenz entnehmen | 2 |
| `cushion.diff.ok` | Passt so | 2 |
| `amount.title` | Betrag für {monat} | 3 |
| `amount.only` | Nur {monat} | 2 |
| `amount.from` | Ab {monat} | 2 |
| `amount.date` | Datum | 1 |
| `amount.save` | Speichern | 1 |
| `amount.cancel` | Abbrechen | 1 |
| `amount.edit` | {monat} ändern | 2 |
| `spielgeld.title` | Spielgeld für {monat} | 3 |
| `month.list.spielgeld` | Spielgeld für {monat} | 3 |
| `plan2.cushion.covered` | Dein Polster deckt alle Lücken. | 5 |
| `plan2.cushion.short` | {monat}: Dein Polster reicht nicht. Dir fehlen {betrag}. | 5 · 3 |

Geändert ist `big.cushion`: vorher „Polster deckt es“, jetzt „Polster deckt es · {betrag} aus dem Polster“.

„+ Einzahlen“, „Einzahlen“, „Eingezahlt“ und „Eingezahlt: {betrag}“ sind im Auftrag wörtlich vorgegeben. Für den Polster gibt es deshalb eine benannte Ausnahme in `kontoStatus.test.ts`. Das Fixkostenkonto bleibt bei „zur Seite legen“.

## Entscheidungen

- **Startwert:** Ein Polster aus polster-ziel ohne Bewegungen bekommt beim Lesen eine Bewegung „Stand eingetragen“ in Höhe des Stands. Das Datum ist der Tag des Stands. Gespeichert wird sie beim nächsten Schreiben. Es geht nichts verloren.
- **Quelle „start“:** Zu `split`, `gap` und `manual` kommt die Quelle `start` dazu, ebenfalls additiv. Sie steht für „Stand eingetragen“ und für eine spätere Änderung von „Schon geschafft“ (die Differenz). So bleibt der Stand immer die Summe der Bewegungen.
- **Ids:** Monatsbestätigung `m-YYYY-MM`, Differenzen `m-YYYY-MM-diff…`. Das Rückgängig des Monats nimmt seine Differenzen mit.
- **Differenz:** Sie misst sich am Überschuss beim Bestätigen (`cushionSurplus`). „Differenz in den Polster“ bucht die ganze Differenz, ohne Regel und ohne Deckel. Danach gilt der neue Überschuss als bestätigt. Das Gleiche gilt für „Passt so“.
- **Kategorien:** Ein Tipp auf den Betrag einer Zeile öffnet „Betrag für {Monat}“. Ein Tipp auf den Namen öffnet weiter „Tatsächlich abgebucht“ (Abhaken mit Betrag und Notiz). Beide Wege bleiben so getrennt.
- **„Nur {Monat}“ bei einer Position:** Ab dem Monat gilt der neue Betrag, ab dem Folgemonat wieder der alte, als zwei Einträge der Planhistorie. Ist der Monat schon abgehakt, übernimmt der Haken den neuen Betrag. Andere Monate behalten ihren Haken.
- **„Ab {Monat}“ beim Spielgeld:** Das Limit in den Einstellungen ändert sich. Monate vom aktiven bis davor behalten ihr Spielgeld, als eigener Wert.
- **Konfetti:** Die Erbsen fallen jetzt nur noch im Streifen, nicht mehr von oben über die Karte. So liegt nie etwas über Text oder Button.

## Testergebnisse

- **Unit-Tests:** 1596 grün in 63 Dateien. Neu sind 17 in `src/db/polster-feinschliff.test.ts` und die Textprüfung der neuen Texte.
- **Build:** `pnpm build` (tsc, check-colors, check-bundle) ist sauber.
- **Neue E2E:** `e2e/polster-feinschliff.spec.ts` mit 2 Tests je Viewport. Viewports sind iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch/quer und Desktop 1440, je hell und dunkel: 24 von 24 grün. `e2e/polster-ziel.spec.ts` ist angepasst (die Karte hat jetzt einen eigenen Öffnen-Button) und ebenfalls grün.
- **Volle Suite ohne Retries** (Lauf 2, nach der letzten Code-Änderung): 19 von 19 Projekten grün.

| Projekt | bestanden | übersprungen | fehlgeschlagen |
|---|---|---|---|
| desktop 1–5/5 | 634 | 40 | 0 |
| iphone-15 | 269 | 405 | 0 |
| iphone-pro-max | 241 | 433 | 0 |
| ipad-portrait | 257 | 417 | 0 |
| ipad-landscape | 245 | 429 | 0 |
| perf (Grenzen aus #59) | 3 | 0 | 0 |
| perf-feier (iPhone 15 und SE, 4× CPU-Drosselung) | 2 | 0 | 0 |
| WebKit iPhone SE hell/dunkel | 212 | 54 | 0 |
| WebKit iPhone 15 hell/dunkel | 230 | 36 | 0 |
| WebKit iPad hoch hell/dunkel | 228 | 38 | 0 |
| WebKit iPad quer hell/dunkel | 216 | 50 | 0 |
| **Summe** | **2537** | | **0** |

- **Gefunden und behoben auf dem Weg, offen berichtet:**
  - **Fehler im eigenen Code:** Unter Last ging bisweilen ein eingetragener Polster verloren. Behoben auf zwei Wegen:
    - Das Betragsfeld liest beim Übernehmen den aktuellen Feldinhalt und übernimmt nur Änderungen.
    - Jede Polster-Aktion liest und schreibt in einer Transaktion.

    Die E2E meldet bei einem Fehlschlag jetzt den gespeicherten Polster mit.
  - **Barrierefreiheit:** Die Namen der Betrag-Buttons enthielten „Betrag“. Das kollidierte mit dem Feld „Betrag“ der Formulare, für Screenreader und in `layout-phase2.spec`. Sie heißen jetzt „{Name}: {Monat} ändern“.
  - **Konfetti-Streifen:** 44 → 40 px, weil die große Zahl des Desktop-Heros an den Streifen stieß.
  - **Wackler `liquid-glass.spec` (WebKit):** Die Einstiegsanimation dauert insgesamt 0,46 s und war beim Abfragen schon vorbei. Der Test zählt die Animationen jetzt beim Start.
  - Die beiden letzten Punkte hat Lauf 1 ans Licht gebracht. Danach lief Lauf 2 vollständig und grün.

## Screenshots

`docs/screenshots/polster-feinschliff/` für 6 Viewports × hell/dunkel:
- Anders aufteilen
- Rückgängig mit Konfetti-Streifen
- Einzahlen mit Feier
- Verlauf
- Betrag für Dezember
- Differenz

## Merge

Squash-Merge nach `main` nach dem grünen Lauf 2. Die Merge-SHA steht im Abschlussprotokoll.

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Es gibt keinen Dexie-Sprung und keine Schreibaktion beim Start.

Polster und Spielgeld:
- Ein vorhandener Polster zeigt im Verlauf die Zeile „Stand eingetragen“ mit seinem Stand.
- Die Bewegungen werden beim ersten Ändern gespeichert.
- Neue Felder im Export: `cushionMoves`, `cushionSurplus`, `spielgeldOverrides`. Ältere Sicherungen bleiben importierbar.

Nach dem Deploy zu prüfen:
- Die Polster-Karte trägt „+ Einzahlen“ und „− Entnehmen“.
- Die Zeilen von ①–④ und die Beträge der Kategorien sind antippbar.
- Das Konfetti liegt in einem eigenen Streifen unter dem Text.
