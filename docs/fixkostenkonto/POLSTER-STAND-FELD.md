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

TESTERGEBNISSE

## Screenshots

`docs/screenshots/polster-stand-feld/`: „Dein Polster“ mit „Korrektur −€ 500“ im Verlauf, 6 Viewports × hell/dunkel.

## Merge

MERGE

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Es gibt keinen Dexie-Sprung und keine Schreibaktion beim Start.

Polster-Daten:
- Ein bestätigter Monat ohne eigene Bewegung wird beim Lesen ergänzt. Gespeichert wird beim nächsten Ändern, die Summe bleibt gleich.
- Ältere Sicherungen bleiben importierbar.

Nach dem Deploy zu prüfen:
- „Dein Polster“ zeigt „Aktueller Stand“.
- Ein Feld schreibt erst mit „Speichern“ oder Enter.
- Eine Änderung des Stands steht als „Korrektur“ im Verlauf.
