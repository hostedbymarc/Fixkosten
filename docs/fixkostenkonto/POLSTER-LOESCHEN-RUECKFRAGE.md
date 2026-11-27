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

## Screenshots

`docs/screenshots/polster-loeschen-rueckfrage/` – je Viewport (iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch/quer,
Desktop 1440) hell und dunkel: `*-frage-stand.jpg`, `*-frage-ziel.jpg`.
