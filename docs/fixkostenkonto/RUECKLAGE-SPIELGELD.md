# Rücklage und Spielgeld (ruecklage-spielgeld)

**Anlass:** „Aus dem Topf“ war unklar. Die Hero-Kachel behauptete, alle Fixkosten kämen aus dem Topf. Jetzt zeigt Erbse, wie sich das Gehalt aufteilt.

**Basis:** Der Branch baut auf `walkthrough` (#47) auf, weil der Walkthrough und „Topf“ dort entstanden. Der PR geht gegen main und enthält #47 mit. Wird #47 zuerst gemergt, bleibt hier nur dieser Sprint im Diff.

**Rahmen:**
- Datenbankname, Netlify-Subdomain und Export-Format sind unverändert. Es gibt keinen Dexie-Sprung.
- `Position.account` bekommt den zusätzlichen Wert `spielgeld`. Bestehende Werte bleiben, wie sie gespeichert sind. Die v5-Hochstufung und der Import alter Exporte lassen `spielgeld` stehen.
- Neu im Einstellungs-Eintrag `fixkostenkonto` (additiv, nur gespeichert, wenn gesetzt):
  - `spielgeld` (Betrag oder leer)
  - `spielgeldOverflow` (je Monat `surplus` | `other`)
- Die Rücklage-Rechnung zählt weiter nur `fixkostenkonto`: Monatsbetrag, Lücke, Simulation.
- Alle Zahlen von „Fixkosten einplanen“ kommen aus `kontoState()`. Die Aufteilung (`salarySplit.ts`) liest nur:
  - `kontoState`
  - `monthItems`, das sind dieselben Einträge wie `monthFigures`
  - das Netto-Gehalt
- Keine neuen Hex-Werte. Alle neuen Beträge zeigen Cent.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** „Rücklage“ statt „Topf“ | ✅ | Walkthrough, Kachel-ⓘ und Sheet-ⓘ sagen jetzt „Rücklage“. Kein „Topf“ mehr in `src/`. Liste unten. |
| **2** Woraus wird bezahlt? | ✅ | Bearbeiten-Dialog (wiederkehrend und einmalig) mit Frage „Woraus zahlst du das?“, Segment Rücklage, Gehalt, Spielgeld und ⓘ mit dem Text aus dem Auftrag. |
| 2 · Liste | ✅ | Chip „Gehalt“ bzw. „Spielgeld“, kein Chip bei Rücklage. |
| 2 · Rechnung | ✅ | Unit-Test: Positionen auf Gehalt oder Spielgeld ändern den Monatsbetrag nicht. |
| **3** Spielgeld | ✅ | Einstellungen: „Spielgeld pro Monat“, optional, Cent erlaubt, ⓘ „So viel willst du jeden Monat frei ausgeben.“ |
| 3 · Karte | ✅ | „Spielgeld {Monat}“ mit Ausgegeben, Limit, Balken und Liste. Sie erscheint nur, wenn ein Spielgeld gesetzt ist. |
| 3 · Überzug | ✅ | Text „€ X über dem Spielgeld“ und Frage „Woher kommt der Rest?“ mit „Aus dem Überschuss“ (Standard) oder „Andere Quelle (z. B. Mieteinnahmen)“. Die Antwort gilt je Monat und ist jederzeit änderbar. |
| 3 · „nicht vom Netto“ | ✅ | Siehe Abschnitt unten. |
| **4** Gehalts-Aufteilung | ✅ | Breite Karte „So teilt sich dein Gehalt“. Ohne Gehalt bietet sie „Gehalt eintragen“ an. Ohne „Fixkosten einplanen“ bleiben „Frei verfügbar“ und „Ø pro Monat“ unverändert (Unit- und E2E-Test). Die Zeilen:<br>• Gehalt am {Tag}<br>• − Zur Seite legen<br>• − Direkt vom Gehalt (Namen bei ≤ 2)<br>• − Vermögensaufbau<br>• − Spielgeld<br>• − Spielgeld-Überzug (nur „aus dem Überschuss“)<br>• = Überschuss bzw. „Bleibt dir“ |
| **5** Hero ehrlich | ✅ | Unter „Abzüge vom Netto“ stehen die Zeilen „aus deiner Rücklage“, „direkt vom Gehalt“ und „aus Spielgeld“, nur die mit Betrag > 0. Unit-Test: A + B + C = Fixkosten, auch mit Einmalbetrag ohne Position. |
| **6** Zur-Seite-Kachel | ✅ | Bei „auf einmal“ mit offenem Einmalbetrag:<br>• zwei gleich große Felder „jeden Monat am 1.“ und „einmalig bis {Datum}“<br>• darunter der Grund-Satz<br>• Button „Einmalbetrag zur Seite gelegt“<br>Die Empfehlung erscheint nur mit Spielgeld und nur als Hinweis. |
| **7** Walkthrough | ✅ | Karte 1: Untertitel „Nur Rechnungen aus deiner Rücklage“, dazu „{n} Posten zahlst du direkt.“. Betragslabel am Rand werden am Rand verankert, nichts wird abgeschnitten. Karte 3: neue Grafik Gehalt → Rücklage / Gehalt direkt / Spielgeld / Vermögensaufbau. |
| Unit-Tests | ✅ | `salarySplit.test.ts` (16) mit Daten wie deinen, Details unten. |
| E2E | ✅ | `ruecklage-spielgeld.spec.ts`:<br>• Geräte: iPhone SE, iPhone 15, iPad hoch und quer, Desktop 1440, jeweils hell und dunkel.<br>• Ablauf: Position auf Spielgeld, Spielgeld setzen, Überzug beantworten.<br>• Karte, Hero und Empfehlung aktualisieren sich sofort. |

### Daten wie deine (Unit-Test, nachgebaut)

- Eingaben:
  - Gehalt € 8.302
  - Rücklage-Monatsbetrag € 2.909
  - Lebensmittel € 450 auf Gehalt
  - Vermögensaufbau € 1.283
  - Spielgeld € 1.209
  - zwei Einmalzahlungen von zusammen € 3.028,45 auf Spielgeld
- Mit Überzug „andere Quelle“ beträgt der Überschuss **€ 2.451**. Die Empfehlung lautet **„auf einmal“ für € 990,43**.
- Mit „aus dem Überschuss“ (Standard) sinkt der Überschuss um € 1.819,45 auf € 631,55.

### „Andere Quelle“: so ist es gelöst

Es gab schon ein Konzept „nicht vom Netto“: `fromNet: false` für einmalige Vermögensaufbau-Zahlungen, etwa eine Mieteinnahme. Solche Beträge zählen nicht gegen das Netto-Gehalt.

„Andere Quelle“ nutzt genau diese Bedeutung, aber je Monat für den Teil über dem Spielgeld:
- **„Andere Quelle“:** Der Überzug wird nicht vom Gehalt abgezogen, wie bei `fromNet: false`.
- **„Aus dem Überschuss“:** Er steht als eigene Zeile in der Aufteilung.

`fromNet` hängt an einer Position, die Antwort aber am Monat. Darum liegt sie in `spielgeldOverflow[Monat]` statt in einem zweiten Positionsfeld. „Frei verfügbar“ ohne „Fixkosten einplanen“ ändert sich dadurch nicht.

## Geänderte und neue Texte

| Wo | vorher | jetzt |
|---|---|---|
| Hero | „Bezahlt aus deinem Topf“ + ⓘ | „aus deiner Rücklage € A“ · „direkt vom Gehalt € B“ · „aus Spielgeld € C“ |
| Kachel, ⓘ | „Dieser Betrag deckt alle Fixkosten der nächsten 12 Monate. …“ | „Dieser Betrag füllt deine Rücklage für die Rechnungen der nächsten 12 Monate. …“ |
| Sheet, ⓘ „Eingeplante Rechnungen“ | „Diese Rechnungen deckt dein Monatsbetrag. Zahlst du eine vom Alltagskonto? …“ | „Diese Rechnungen zahlst du aus deiner Rücklage. Zahlst du eine direkt vom Gehalt? …“ |
| Bearbeiten-Dialog | „Von welchem Konto geht das weg?“ Fixkostenkonto / Alltagskonto | „Woraus zahlst du das?“ Rücklage / Gehalt / Spielgeld |
| Bearbeiten-Dialog, ⓘ | zwei Sätze zu Fixkosten- und Alltagskonto | „Rücklage: Geld, das du jeden Monat zur Seite legst. Gehalt: zahlst du direkt. Spielgeld: aus deinem Spielgeld.“ |
| Liste, Chip | „Alltagskonto“ | „Gehalt“ / „Spielgeld“ |
| Walkthrough 1 | – | „Nur Rechnungen aus deiner Rücklage“ · „{n} Posten zahlst du direkt.“ |
| Walkthrough 2 | „… gleicht dein Topf aus.“ | „… gleicht deine Rücklage aus.“ |
| Walkthrough 3 | „Aus diesem Topf zahlst du alle Rechnungen.“ · „Das ist kein Extra-Geld. …“ · „Oben in der App …“ | „Aus deiner Rücklage zahlst du die Rechnungen.“ · „Die Rücklage ist kein Extra-Geld. Es ist dasselbe Geld, nur gleichmäßig verteilt.“ · „Manches zahlst du direkt vom Gehalt oder aus deinem Spielgeld.“ · Grafik „Rücklage“, „Gehalt direkt“, „Spielgeld“, „Vermögensaufbau“ |
| Walkthrough 4 | „Dein Topf ist bis dahin noch nicht voll.“ | „Deine Rücklage ist bis dahin noch nicht voll.“ |
| Einstellungen | – | „Spielgeld pro Monat“ · ⓘ „So viel willst du jeden Monat frei ausgeben.“ · „Leer lassen, wenn du kein Spielgeld planst.“ |
| Spielgeld-Karte | – | „Spielgeld {Monat}“ · „Ausgegeben“ · „Limit“ · „Noch € X übrig.“ · „€ X über dem Spielgeld“ · „Woher kommt der Rest?“ · „Aus dem Überschuss“ · „Andere Quelle (z. B. Mieteinnahmen)“ · „Diesen Monat noch nichts aus dem Spielgeld.“ |
| Gehalts-Karte | „Frei verfügbar“ (mit Fixkosten einplanen) | „So teilt sich dein Gehalt“ · „Gehalt am {Datum}“ · „Zur Seite legen“ · „Direkt vom Gehalt“ · „Vermögensaufbau“ · „Spielgeld“ · „Spielgeld-Überzug“ · „Überschuss“ / „Bleibt dir“ · „Trag dein Netto-Gehalt ein, dann siehst du die Aufteilung.“ · „Gehalt eintragen“ |
| Zur-Seite-Kachel | Betrag + „Leg bis … extra zur Seite.“ + „Zur Seite gelegt“ (bei „auf einmal“) | „jeden Monat am {Tag}“ € X · „einmalig bis {Datum}“ € Y · Grund · „Einmalbetrag zur Seite gelegt“ |
| Empfehlung | – | „Nach deinem Spielgeld bleiben € Ü.“ + „Du kannst die € Y auf einmal zur Seite legen.“ / „Leg die € Y lieber verteilt zur Seite.“ |

Die vollständige Liste mit Wortzahl je Satz steht in `TEXTE.md`.

## Entscheidungen, bitte prüfen

- **Ohne Spielgeld, aber Positionen auf Spielgeld:** Deren Summe steht als Zeile „Spielgeld“ in der Aufteilung, ohne Überzug. Darunter heißt es „Bleibt dir“.
- **Vermögensaufbau in der Aufteilung:** Nur vom Netto und nur, was nicht über Rücklage oder Spielgeld läuft. Sonst würde er doppelt zählen.
- **„Zur Seite legen“:** Gemeint ist der Betrag des gezeigten Monats aus `kontoState`. Ist der laufende Monat schon zur Seite gelegt, hat er kein Extra mehr.
- **Empfehlung bei „verteilt“:** Sie vergleicht mit der Lücke, bei „auf einmal“ mit dem Einmalbetrag. Sie steht in beiden Fällen.
- **Feste Cent-Anzeige:** Nur in den neuen Karten, den Hero-Zeilen, der Empfehlung und den Kachel-Feldern. Alte Kacheln bleiben, wie sie waren.
- **Prüfskripte:**
  - Der Bundle-Prüfer erlaubt jetzt das Wort „mieteinnahmen“. Es steht in deinem Text, enthält aber „Miete“ aus den Testdaten.
  - Die Hero-Funktion heißt `costSources`, weil der Namensprüfer „Fixkosten“ in Bezeichnern ablehnt.
