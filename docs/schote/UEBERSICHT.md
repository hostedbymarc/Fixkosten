# Schote · Übersicht

Basis: `main` nach dem Merge von PR #39. Die Schote rechnet mit dem neuen Dauerauftrag (alle Abbuchungen der 12 Monate ab dem Folgemonat ÷ 12).

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

## 4. Entscheidungen (freigegeben)

1. **Kein Dexie-Versionssprung.** Die Felder liegen in `meta`. Bedingung erfüllt:
   - Test „alter Eintrag ohne die neuen Felder wird korrekt gelesen“ (`src/lib/kontoBalance.test.ts`).
   - Export → Import identisch (`toKontoSettings` idempotent; `v5.test.ts` unverändert grün).
   - Gespeichert und exportiert werden nur Felder, die vom Standard abweichen. Ein alter Eintrag bleibt damit bitgleich.
2. **Vorzeichen:** Der Dauerauftrag steht ohne Vorzeichen („Dauerauftrag € 2.955“), ebenso Lücke und Plan. Vorzeichen nur in Listen und Monatsdetails (Einzahlung +, Abbuchungen −).
3. **Tag** = „Neuer Monat beginnt am“ (`orderDay`): „am 1.“, „am 25.“, „am Monatsletzten“. Er passt damit zur Simulation, in der die Einzahlung zu Beginn des aktiven Monats kommt.
4. **„Noch nicht“ bei Frage 1** geht direkt zu „Dein Plan“. Der Plan startet mit „Fixkostenkonto eröffnen“.
5. **„prüfen“ / „einrichten“**, Novemberrate in der Lücke: wie vorgeschlagen.
6. **Belohnung pro Schritt:** Nach jedem erledigten Punkt rasten sofort die Erbsen ein, die dadurch gedeckt sind.
   - Vor dem ersten Punkt rechnet die Schote ohne Dauerauftrag, nur mit dem Kontostand.
   - „Dauerauftrag erledigt“ schaltet die Einzahlungen ein.
   - „Einmalig überweisen erledigt“ legt die Lücke auf den Kontostand.
   - „Fixkostenkonto eröffnen“ allein deckt noch nichts; dort ploppt nur die Erbse am Punkt selbst.
7. **Polster:** wie vorgeschlagen.
8. **Installationen aus #39 mit Kontostand** gelten als eingerichtet. Beim ersten Start wird ihr Kontostand zum Anker.
9. **Monatskürzel** sind Knöpfe. Antippen zeigt den vollen Monatsnamen mit „gedeckt“ / „nicht gedeckt“ unter der Schote, in der Zeile statt darüber, sodass nichts überdeckt wird. Jedes Kürzel ist so breit wie seine Erbse. Der Test prüft, dass sie sich nicht überlappen, auch auf dem iPhone SE.

## 4b. Änderungen nach deinem STOPP (zur Freigabe)

1. **Akku-Logik:** Die Erbsen füllen sich von links bis vor den ersten Monat, dessen Stand am Monatsende unter 0 ist. Ab diesem Monat bleibt alles leer, auch wenn spätere Monate wieder im Plus wären (`podFromMonths`, Test „Minus im Februar, Plus ab Mai → nur November bis Jänner gefüllt“).
2. **Antwort zuerst** (`PodAnswer`), in Kachel, Sheet und „Dein Plan“:
   - Gedeckt: „Alles gedeckt bis Oktober 2027.“
   - Lücke: „Ab Februar 2027 fehlt Geld.“, darunter „Zahl einmalig € Y ein, dann passt alles.“ und „Erledigt, eingezahlt“.
   - „n von 12 Monaten gedeckt“ gibt es nicht mehr.
   - Im Sheet steht der Knopf bei „Muss ich jetzt etwas tun?“ direkt darüber. Unter „Reicht es das ganze Jahr?“ stehen nur die zwei Sätze, damit es keinen zweiten Knopf gibt.
   - In „Dein Plan“ sind die Plan-Punkte die Handlung. Wenn nur noch die einmalige Überweisung offen ist, rückt sie direkt unter den Satz.
3. **Leere Plätze:** heller, ruhiger Platzhalter in Erbsenform ohne Minus. Nur der erste leere Platz hat einen dezenten roten Ring mit „!“-Icon.
4. **Legende:** „1 Erbse = 1 Monat mit genug Geld“ steht unter der großen Schote. In der Kachel ist es ein ⓘ neben der Schote.
5. **Monatskürzel:** Jedes Kürzel zeigt beim Antippen den vollen Monat, auch J/J, M/M und A/A. Der Monat, ab dem Geld fehlt, steht ausgeschrieben unter seiner Erbse.
6. **Dev-Seite:** Zuerst kommen die vier Kachel-Zustände wie in der App, mit Beispielzahlen und je einer Überschrift. Danach folgen Einrichtung und „Dein Plan“. Der Katalog „groß und kompakt“ steht am Ende.

## 5. Kontostand-Modell (Phase B)

- **Erwarteter Stand** = Anker + bestätigte Einzahlungen seit dem Anker − abgehakte Fixkostenkonto-Positionen und Einmalbeträge seit dem Anker.
  - „Seit“ ist ein Zeitpunkt (ISO-Zeitstempel), kein Monat. Ein neuer Anker mitten im Monat und ein Monatsbeginn ≠ 1 brauchen deshalb keinen Sonderfall.
  - Die Einzahlung eines Monats zählt mit dem Dauerauftrag dieses Monats.
- **„Ja“ bei der Einrichtung** = Check zum selben Zeitpunkt wie der Anker. Er zählt nicht doppelt, weil er schon im Kontostand steckt.
- **„Nein“** = Check „noch nicht“; gefragt wird ab dem nächsten Tag.
- **„Ich habe noch keinen“** = diesen Monat keine Einzahlung.
- **Unbestätigte Monate** zählen ohne Einzahlung.
- **Serie:** bestätigte Monate in Folge bis zum aktiven Monat, oder bis zum Vormonat, solange dieser Monat offen ist. Ab 2 als Abzeichen. Nach einem verpassten Monat: „Neue Serie startet.“
- **Meilensteine:**
  - „Erste Schote voll“ (bleibt, wenn einmal erreicht)
  - „3 Monate in Folge“, „6 Monate in Folge“
  - „Ein Jahr gedeckt“ = 12 bestätigte Monate in Folge
  - Toast einmal, danach Abzeichen im Sheet.
- **Karte oben auf dem Monats-Screen** (höchstens eine):
  1. Erinnerung nach „Weiß ich gerade nicht“, beim nächsten Start
  2. Monats-Check
  3. alle 3 Monate „Stimmt dein Kontostand noch?“
