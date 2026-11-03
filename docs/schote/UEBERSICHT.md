# Schote · Übersicht (Phase A, zur Freigabe)

Basis: Stand von PR #39 (noch nicht gemergt). Nach dem Merge wird dieser Branch auf `main` umgesetzt.

## 1. Neue Datenfelder (Phase B, rein additiv und optional)

Alles liegt im bestehenden `meta`-Eintrag `fixkostenkonto` (Schlüssel–Wert-Tabelle, gibt es seit PR #39).
Jedes Feld ist optional. Fehlt es, gilt der Standardwert; alte Dateien importieren also unverändert.

| Feld | Typ | Wofür |
|---|---|---|
| `anchor` | `{ amount, date }` | Kontostand-Anker (Betrag, Tag). „Anderer Betrag“ setzt einen neuen. Ersetzt fachlich `balance`; `balance` bleibt zum Lesen alter Daten. |
| `hasAccount` | `boolean` | Antwort auf Frage 1 („Noch nicht“ → Kontostand 0) |
| `setupSteps` | `0–3` | Fortschritt der Einrichtung („0 von 3 Schritten“) |
| `setupDone` | `boolean` | Einrichtung abgeschlossen → Kachel zeigt Zustand 2–4 |
| `balanceUnknown` | `boolean` | „Weiß ich gerade nicht“ → Erinnerung beim nächsten Öffnen |
| `checks` | `{ period, deposited, answeredOn }[]` | Monats-Checks („Ist dein Dauerauftrag eingegangen?“) |
| `snoozedOn` | Datum | „Noch nicht“ → frühestens am nächsten Tag wieder fragen |
| `balanceCheckedOn` | Datum | letzte Antwort auf „Stimmt dein Kontostand noch?“ (alle 3 Monate) |
| `plan` | `{ orderDone, gapDone }` | Erledigt-Status der Plan-Checkliste |
| `milestonesShown` | `string[]` | welche Meilenstein-Toasts schon kamen (Toast nur einmal) |

**Abgeleitet, nicht gespeichert:**
- erwarteter Kontostand = Anker + bestätigte Einzahlungen seit dem Anker − abgehakte Fixkostenkonto-Positionen seit dem Anker
- Serie, Abzeichen und erreichte Meilensteine
- Schote, Lücke, Polster

Unbestätigte Monate zählen ohne Einzahlung.

**Migration:** Ein vorhandener `balance` aus PR #39 wird beim Lesen zum Anker mit dem Tag des Updates. Unit-Tests decken das ab.

> **Zur Freigabe – Dexie-Versionssprung:** Der Auftrag verlangt neue Daten „mit Dexie-Versionssprung und Migration“. Die Felder brauchen aber keine neue Tabelle und keinen Index. Sie liegen in `meta`, dessen Schema gleich bleibt.
> Ein Sprung auf v6 würde wieder Versionszahlen in 11 bestehenden Tests ändern. Damit wäre „alle bestehenden Tests unverändert grün“ und also das Selbst-Mergen ausgeschlossen.
> **Vorschlag:** kein Sprung, Migration beim Lesen. Wenn du den Sprung trotzdem willst, baue ich ihn und lasse den PR offen.

## 2. Komponenten

**Neu (Phase A, in diesem PR):**
- `src/components/konto/PeaPod.tsx`: die Schote.
  - Größen groß (Sheet, Einrichtung, mit Monatskürzeln) und kompakt (Kachel).
  - Die Erbsen rasten Erbse für Erbse mit dem bestehenden `check-pop` ein; ohne Animation bei „Bewegung reduzieren“.
  - Die Breite folgt dem Container (`cqi`), max. 460 px; die Schote wird nie gestreckt.
- `src/components/konto/KontoTileView.tsx`: die Kachel mit genau 4 Zuständen, plus Serien-Abzeichen.
- `src/components/konto/KontoSetupSheet.tsx`: die Einrichtung (3 Fragen) und „Dein Plan“.
- `src/lib/schote.ts`: Schote aus den Monatsend-Ständen, Polster, Kachel-Zustand.
- `src/lib/schoteTexts.ts`: alle neuen Texte an einer Stelle; ein Test prüft, dass kein Satz über 12 Wörter hat.
- `dev/schote/` + `src/dev/schote.tsx`: Dev-Seite. Sie wird nur für `vite dev`, Netlify-Deploy-Previews und den E2E-Build gebaut, nie für Produktion. Sie enthält nur Beispielzahlen.

**Neu (Phase B):**
- `src/lib/kontoBalance.ts`: erwarteter Stand, Anker, Serie, Meilensteine.
- `KontoCheckCard`: Monats-Check und Kontostand-Check.
- Meilenstein-Reihe im Sheet.

**Geändert (Phase B):**
- `KontoTile`: nutzt `KontoTileView` und sitzt direkt unter der Hero-Kachel.
- `KontoSheet`: drei Fragen als Abschnitte.
- `KontoChart`: deutliche Nulllinie, rot getönter Bereich unter 0.
- `SettingsScreen`: Satz je Zustand, Zusammenfassung, „Einrichtung ändern“.
- `settings.ts` und `backup.ts`: neue Felder.
- `MonthScreen`: Check-Karte oben.

Phase A ändert nichts an der laufenden App. Die neuen Komponenten hängen nur an der Dev-Seite.

## 3. Texte

Alle neuen Texte mit Wortzahl je Satz stehen in [`TEXTE.md`](TEXTE.md), generiert aus `src/lib/schoteTexts.ts`.

## 4. Entscheidungen zur Freigabe

1. **Vorzeichen:** Jede Einzahlung aufs Fixkostenkonto bekommt `+`, auch der Dauerauftrag („Dauerauftrag +€ 2.955 am 1.“, „Noch +€ 580 einzahlen“). Abbuchungen bekommen `−`. Soll der Dauerauftrag ohne Vorzeichen stehen, ist das eine Zeile.
2. **„am 1.“** ist fest; ein Ausführungstag wird nicht gespeichert.
3. **„Noch nicht“ bei Frage 1** überspringt Frage 2 und 3, denn ohne Konto gibt es weder Kontostand noch Dauerauftrag. Es geht direkt zu „Dein Plan“. Der Fortschritt zählt trotzdem als 3 von 3.
4. **Antwort bei Frage 3:**
   - „Ja“ / „Nein“ → im Plan steht „Dauerauftrag **prüfen**: +€ X monatlich am 1.“, denn es gibt schon einen, der Betrag kann aber abweichen.
   - „Ich habe noch keinen“ → „Dauerauftrag **einrichten**: …“. Die Novemberrate kommt dann nicht mehr und steckt in der Lücke (Beispiel: € 580 → € 3.535).
5. **„Dein Plan“:** Die Schote bleibt leer, bis alle Punkte erledigt sind, dann füllt sie sich von November bis Oktober. So gibt es den Moment immer, auch ohne Lücke.
6. **Polster:** Liegt der tiefste Monatsend-Stand über einem Dauerauftrag, gilt Polster = tiefster Stand ÷ Dauerauftrag, abgerundet auf eine Stelle (Beispiel: € 4.220 ÷ € 2.955 = +1,4 Monate).
7. **„Gedeckt bis …“** erscheint nur, wenn alle 12 Monate gedeckt sind, sonst „n von 12 Monaten gedeckt“. Auch ein späterer ungedeckter Monat zählt.
8. **Bestehende Installationen mit Modus an** (PR #39) und eingetragenem Kontostand gelten als eingerichtet, sehen also keinen Zustand 1. Ohne Kontostand sehen sie „Fixkostenkonto einrichten“.
9. **Serie:** Ein Monat zählt, wenn der Monats-Check „Ja“ ist. Ein Monat ohne „Ja“ beendet die Serie, beim nächsten Monat steht „Neue Serie startet.“.
