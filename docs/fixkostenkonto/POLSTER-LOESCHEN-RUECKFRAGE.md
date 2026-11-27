# Polster löschen: Rückfrage (Nachtrag zu #62)

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Leeres „Aktueller Stand“ + Speichern/Enter → Rückfrage „Polster und Verlauf löschen?“ mit „Löschen“ / „Abbrechen“ | ja | `ClearConfirm` in `src/components/konto/Polster.tsx`; `CentsField` ruft bei leerem Feld `onClear` statt zu schreiben; E2E `e2e/polster-loeschen-rueckfrage.spec.ts` (12 Fälle) |
| 1 „Abbrechen“ stellt den gespeicherten Wert wieder ins Feld, nichts wird geschrieben | ja | Feld wird neu aufgebaut (`key`), E2E prüft Feldwert und unveränderte IndexedDB |
| 1 Gilt auch für leeres „Polster-Ziel“ | ja | eigene Überschrift „Polster-Ziel löschen?“ (Ziel löschen entfernt Stand und Verlauf nicht); E2E: Abbrechen + Löschen |
| 1 Folgefehler: nach „Löschen“ blieben bestätigte Monate stehen, ein neuer Stand scheiterte an der Invariante | behoben | `setCushionBalance(null)` leert auch `cushionConfirmed` und `cushionSurplus`; Unit + E2E „neuer Stand speichert wieder“ |
| 2 Import einer Sicherung von vor #61 (Polster mit bestätigtem Monat, ohne `cushionMoves`) | ja | `src/db/polster-loeschen-rueckfrage.test.ts`: Stand gleich, Verlauf = „Stand eingetragen“ + Monat, `cushionBroken` = null, nächste Bewegung bleibt konsistent |

Die Rückfrage sitzt im Polster-Sheet selbst (`role="alertdialog"`), nicht als zweites Sheet darüber: zwei
gestapelte Sheets würden beide auf Escape reagieren.

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `cushion.clear.balance` | Polster und Verlauf löschen? | 4 |
| `cushion.clear.balance.text` | Stand, Verlauf und bestätigte Monate sind dann weg. | 8 |
| `cushion.clear.goal` | Polster-Ziel löschen? | 2 |
| `cushion.clear.goal.text` | Stand und Verlauf bleiben. | 4 |
| `cushion.clear.confirm` | Löschen | 1 |
| `cushion.clear.cancel` | Abbrechen | 1 |

Keine neuen Felder, kein Dexie-Sprung, keine neuen Hex-Werte, Datenbankname und Exportformat unverändert.

## Testergebnisse

- Unit (vitest): 65 Dateien, 1617 Tests grün, davon 3 neu in `polster-loeschen-rueckfrage.test.ts`.
- Typecheck grün, Texte-Test grün (≤ 12 Wörter), `TEXTE.md` neu erzeugt.
- Neue E2E `polster-loeschen-rueckfrage.spec.ts`: 12 von 12 grün (6 Viewports × hell/dunkel).
- Volle Suite ohne Retries, drei Läufe, keiner komplett grün:

| Lauf | Teile fertig | grün | Fehler |
|---|---|---|---|
| 1 | 16 von 19 (2-h-Grenze) | 15 | WebKit iPhone 15 dunkel, `setup.spec`: `page.reload` → „WebKit encountered an internal error“ (Engine-Absturz, schon in #60 gesehen) |
| 2 | 5 von 19, abgebrochen | 4 | Desktop, `start-screen.spec` erster Paint iPad quer hell: 1,9 % Weiß statt < 0,1 % |
| 3 | 3 von 19, abgebrochen | 2 | Desktop, `liquid-glass.spec:645`: Balken starten 1 ms zu früh (7281,7 statt ≥ 7282,7) |

Alle drei Fehler liegen in Dateien, die dieser Nachtrag nicht ändert. Gegenprobe zu Lauf 2: den Test
`start-screen.spec:181` je 5× pro Viewport (50 Läufe) wiederholt. Dieser Branch: 9 von 50 rot. `main`
(130bd43): 7 von 50 rot. Der Wackler besteht also schon auf `main`.

## Merge

Nicht gemergt. Die Merge-Regel verlangt eine komplett grüne Suite. PR #63 bleibt offen.

Vorschlag: eigener Stabilisierungs-Sprint für `start-screen.spec` (erster Paint unter CPU 6×) und
`liquid-glass.spec:645` (1 ms Toleranz), danach Nachweis und Merge.

## Hinweis Production-Deploy

Erst nach dem Merge. Kein Dexie-Sprung, keine Datenänderung beim Start, Exportformat gleich.
Nach dem Deploy: leeres Feld + Speichern im Polster-Sheet zeigt die Rückfrage.

## Screenshots

`docs/screenshots/polster-loeschen-rueckfrage/` – je Viewport (iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch/quer,
Desktop 1440) hell und dunkel: `*-frage-stand.jpg`, `*-frage-ziel.jpg`.
