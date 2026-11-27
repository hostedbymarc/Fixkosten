# Polster-Stand-Feld

Branch `polster-stand-feld` gegen `main`.

Rahmen:
- Datenbankname, Subdomain und Export-Format bleiben gleich.
- Neu ist nur der additive Wert `'fix'` für `cushionMoves[].source`. Es gibt keinen Dexie-Sprung.
- Keine neuen Hex-Werte, Du-Form, höchstens 12 Wörter je Satz, nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Feld „Schon geschafft“ heißt „Aktueller Stand“ und zeigt immer `cushionBalance`, die Summe der Bewegungen | ✓ | `cushion.balanceField`. E2E: nach dem Bestätigen zeigt das Feld Start plus Monat, nicht den Startwert |
| 1 Änderung + Speichern erzeugt eine Bewegung „Korrektur“ über die Differenz (`source: 'fix'`); der Verlauf wird nie überschrieben | ✓ | `setCushionBalance`. Unit: Korrektur −1.200 / +1.000, frühere Bewegungen unverändert. E2E: „Korrektur −€ 500“, darunter die alten Zeilen |
| 2 „Aktueller Stand“ und „Polster-Ziel“ schreiben nur bei Speichern/Enter und nur bei echter Änderung; nie bei Mount, Blur, Unmount, Re-Render oder Schließen | ✓ | `CentsField` ohne `onBlur`, „Speichern“ nur bei Abweichung. `fieldWrite`, Aktionen vergleichen mit dem Gespeicherten. Unit: gleicher Wert schreibt nichts (Rohdaten byte-gleich). E2E: tippen, wegtippen, schließen, neu laden → gespeicherte Polster-Felder byte-gleich |
| 2 Ziel nur durch ausdrückliches Leeren + Speichern entfernbar | ✓ | `fieldWrite('', Ziel)` → entfernen. Leeren ohne Speichern schreibt nichts. Unit |
| 2 Invariante nach jedem Schreiben: Stand = Summe `cushionMoves`; jeder bestätigte Monat genau eine passende Bewegung. Verletzt → nicht schreiben, Hinweis | ✓ | `cushionBroken` (settings.ts), `writeCushion` vor jedem Polster-Schreiben. `CushionWriteError` → Hinweis „Speichern fehlgeschlagen. Bitte erneut.“. Unit: erfüllt nach jeder Aktion, Verletzungen erkannt, verletzter Stand → nichts geschrieben |

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `cushion.balanceField` | Aktueller Stand | 2 (vorher „Schon geschafft“) |
| `cushion.src.fix` | Korrektur | 1 |
| `cushion.field.save` | Speichern | 1 |
| `cushion.saveFailed` | Speichern fehlgeschlagen. Bitte erneut. | 2 · 2 |

## Entscheidungen

- **„Speichern“:** Der Button erscheint unter einem Feld, sobald es vom gespeicherten Wert abweicht. Enter speichert ebenso. Wegtippen lässt die Eingabe stehen und schreibt nichts. Beim Schließen des Sheets ist sie verworfen.
- **Gelesen wird der Feldinhalt selbst:** Er wird beim Speichern gelesen, nicht der Text des letzten Renders. Unter Last kommt Enter manchmal vor diesem Render.
- **Erster Stand:** Hat der Polster noch keinen Stand, ist die erste Eingabe der Startwert („Stand eingetragen“). Jede weitere ist eine „Korrektur“.
- **Leerer „Aktueller Stand“ + Speichern** entfernt den Polster samt Bewegungen, wie bisher.
- **Ältere Daten:** Ein Monat bestätigt, aber ohne eigene Bewegung (Daten aus polster-ziel, über polster-feinschliff gelesen), bekommt beim Lesen seine Bewegung `m-YYYY-MM`. Ihr Betrag wird vom Startwert abgezogen. Die Summe bleibt der Stand, die Invariante gilt.
- **Invariante „passende Bewegung“:** Genau eine Bewegung `m-YYYY-MM` je bestätigtem Monat. Mit ihren Differenzen (`m-YYYY-MM-diff…`) ergibt sie den bestätigten Betrag.
- **Polster-Aktionen:** Alle laufen in einer Transaktion und schreiben über `writeCushion`. Bestätigen, Rückgängig, Einzahlen/Entnehmen, Differenz, Stand und Ziel prüfen die Invariante vor dem Schreiben.

## Testergebnisse

- **Unit-Tests:** 1608 grün in 64 Dateien. Neu sind 10 in `src/db/polster-stand-feld.test.ts`:
  - Korrektur-Bewegung
  - gleicher Wert schreibt nichts
  - `fieldWrite`
  - Invariante erfüllt / erkannt / Schreiben verweigert
  - Reparatur älterer Daten

  `polster-feinschliff.test.ts` ist angepasst (Korrektur statt zweitem Startwert, bestätigter Monat mit eigener Bewegung).
- **Build:** `pnpm build` (tsc, check-colors, check-bundle) ist sauber.
- **Neue E2E:** `e2e/polster-stand-feld.spec.ts` deckt iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch/quer und Desktop 1440 ab, je hell und dunkel: 12 von 12 grün. Die Polster-Specs davor (polster-ziel, polster-feinschliff) sind ebenfalls grün.
- **Volle Suite ohne Retries** (nach der letzten Änderung): 19 von 19 Projekten grün.

| Projekt | bestanden | übersprungen | fehlgeschlagen |
|---|---|---|---|
| desktop 1–5/5 | 646 | 40 | 0 |
| iphone-15 | 269 | 417 | 0 |
| iphone-pro-max | 241 | 445 | 0 |
| ipad-portrait | 257 | 429 | 0 |
| ipad-landscape | 245 | 441 | 0 |
| perf (Grenzen aus #59) | 3 | 0 | 0 |
| perf-feier (iPhone 15 und SE, 4× CPU-Drosselung) | 2 | 0 | 0 |
| WebKit iPhone SE hell/dunkel | 212 | 54 | 0 |
| WebKit iPhone 15 hell/dunkel | 230 | 36 | 0 |
| WebKit iPad hoch hell/dunkel | 228 | 38 | 0 |
| WebKit iPad quer hell/dunkel | 216 | 50 | 0 |
| **Summe** | **2549** | | **0** |

- **Nebenbei:** Nach dem Neuladen mit Fixkostenkonto warten `polster-stand-feld.spec` und `spielgeld-zuordnung.spec` auf „Dein Monat“ statt auf `hero`. Das war die Ursache des Wacklers aus dem polster-feinschliff-Lauf 3.

## Screenshots

`docs/screenshots/polster-stand-feld/`: „Dein Polster“ mit „Korrektur −€ 500“ im Verlauf, 6 Viewports × hell/dunkel.

## Merge

Squash-Merge nach `main` nach dem grünen Lauf. Die Merge-SHA steht im Abschlussprotokoll.

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Es gibt keinen Dexie-Sprung und keine Schreibaktion beim Start.

Polster-Daten:
- Ein bestätigter Monat ohne eigene Bewegung wird beim Lesen ergänzt. Gespeichert wird beim nächsten Ändern, die Summe bleibt gleich.
- Ältere Sicherungen bleiben importierbar.

Nach dem Deploy zu prüfen:
- „Dein Polster“ zeigt „Aktueller Stand“.
- Ein Feld schreibt erst mit „Speichern“ oder Enter.
- Eine Änderung des Stands steht als „Korrektur“ im Verlauf.
