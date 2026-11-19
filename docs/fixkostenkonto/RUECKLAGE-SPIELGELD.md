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

### Testergebnisse

- **Unit-Tests:** 1.107 grün, davon 16 in `salarySplit.test.ts`.
- **Volle E2E-Suite (Chromium):** alle Projekte gelaufen.
  - 25 Tests waren zuerst rot, alle mit alten Erwartungen:
    - Die Kachel „auf einmal“ hatte einen neuen Knopf. Jetzt ist es wieder der gewohnte Bestätigen-Knopf, nur mit dem neuen Text.
    - Der Tooltip-Test suchte „Frei verfügbar“ bei aktivem Modus. Er prüft es jetzt vorher.
  - Gefixt und neu gelaufen: alle grün.
- **Gefundener Fehler im InfoTip:**
  - Auf dem iPad mit Maus konnte ein Tipp direkt nach einem Hover das Popover nicht offen halten.
  - Der Schließ-Timer lief weiter. Jetzt stoppt ein Tipp ihn.
- **WebKit:** `ruecklage-spielgeld`, `walkthrough`, `ein-popover`, `fixkostenkonto`, alle grün.
  - Ein Test drückte Esc, während das Sheet noch glitt. Er wartet jetzt.
- **Screenshots:** aus Chromium, in `docs/screenshots/ruecklage-spielgeld/`. Es gibt 7 je Gerät und Modus, 70 insgesamt.

**Preview:** https://deploy-preview-48--fixkosten.netlify.app

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

# Ergänzung (im selben PR)

**Reihenfolge nach Freigabe:** zuerst #47 mergen, dann #48. Rahmen wie oben. Alle Zahlen kommen aus `kontoState()`, `costSources`, `monthItems` und `monthFigures`.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Hero auf iPad und Desktop | ✅ | Ursache siehe unten. Bis 1279 px liegt alles untereinander wie auf dem iPhone. Ab 1280 px hat die rechte Spalte feste 340 px. Pillen brechen nicht mehr um. E2E `feier.spec.ts`: Betrag ≥ 2 × „Abzüge vom Netto“, ab iPad ≥ 56 px, Pille ≤ 33 px hoch, auf allen 5 Geräten hell und dunkel. |
| **2** Woraus du bezahlst | ✅ | Überschrift „Woraus du bezahlst“ bzw. „… bezahlt hast“. Darunter ein Balken (10 px, 2 px Abstand) und die Zeilen untereinander: Punkt, Name, Betrag mit Cent. Nur Quellen > 0, bei einer Quelle kein Balken. Neue Tokens `--hero-src-*` verweisen auf bestehende Tokens, es gibt keine neuen Hex-Werte. Kontrast-Test: Farben ≥ 3:1, Text ≥ 4,5:1 gegen beide Enden des Hero-Verlaufs, hell und dunkel (33 Tests). E2E: Summe der Zeilen = Fixkosten, Balkenhöhe 10 px. |
| **3** „{Monat} erledigt“ | ✅ | Haken im hellen Brand-Kreis, „Oktober erledigt“, „Alle 16 Rechnungen bezahlt“, Betrag groß. Ab 2 Monaten kommt „{n} Monate in Folge“ dazu, aus der bestehenden Serie, nur bei aktivem „Fixkosten einplanen“. „Alles abgebucht“ entfällt. Das Konfetti läuft live beim letzten Haken und einmal beim ersten Öffnen eines kompletten Monats (`celebratedMonths`). Ein Tipp auf den Haken spielt die Feier erneut ab. Bei reduced motion gibt es weder Konfetti noch Pop. |
| **4** Nächstes Gehalt | ✅ | Umschalter „Nächstes Gehalt \| Aktuelles Gehalt“, Standard ist „Nächstes“. Fehlt das Netto des Folgemonats, gilt das zuletzt eingetragene mit „(wie im {Monat})“. „Zur Seite legen“ ist genau der Kachel-Betrag (Unit- und E2E-Test). Die Empfehlung der Kachel rechnet immer mit dem nächsten Gehalt und dem Grundbetrag. |
| **5** Rundung | ✅ | Die Überschrift „Monatsbetrag aufrunden auf“ ist nur noch für Screenreader da. € 1 / € 5 / € 10 stehen direkt unter dem Schalter. |

## Ursache des Desktop-Fehlers

- Ab 768 px war der Hero zweispaltig. Links standen Ring und Betrag, rechts „Abzüge vom Netto“ mit `shrink-0`.
- Die rechte Spalte nahm ihre ganze Inhaltsbreite. Die Quellen standen nebeneinander und durften nicht umbrechen.
- Der große Betrag passt seine Schrift an die Restbreite an (`.fit`: Container-Breite ÷ Zeichenbreite).
- Je breiter die rechte Spalte, desto kleiner der Betrag. Mit Cent („€ 5.670,48“) wurde er noch kleiner.
- Die Pille „Alles abgebucht“ hatte kein `whitespace-nowrap`. In der schmalen Spalte brach sie um.
- **Lösung:** Bis 1279 px untereinander, ab 1280 px rechte Spalte mit festen 340 px. Pillen mit `whitespace-nowrap`, Quellen untereinander.

## Konfetti: Technik und Leistung

- **Technik:** eine DOM-Ebene mit Kreisen, CSS-Keyframes nur auf `transform` und `opacity`. Der Compositor übernimmt die Animation, der Haupt-Thread rechnet nichts pro Frame.
  - Canvas hätte jeden Frame im Haupt-Thread neu gezeichnet. Das ist unter 4× Drosselung teurer.
- **Ebene:** hinter dem Hero-Inhalt, die Zahlen bleiben lesbar. Am Ende bleiben die Erbsen mit 70 % Deckkraft liegen.
- **Erbsen:** 5–16 px, Dauer 1,6–3,2 s, Verzögerung 0–0,9 s, leichtes seitliches Schwingen.
  - Farben aus `brand-100/200/300`, `cat-3`, `cat-6`, `pea-logo` und den Quellen-Tokens.
  - Gleicher Monat ergibt das gleiche Bild (fester Startwert).
- **Kein Ton.** Beim Verlassen des Screens verschwindet die Ebene.
- **Messung** (`perf.spec.ts`, iPhone-Profil, 4× CPU-Drosselung, Tipp auf den Haken, 4,3 s Chrome-Trace):

| Gerät | Erbsen | Ø Frame-Zeit | längster Frame |
|---|---|---|---|
| iPhone 15 | 90 | 15,5 ms | 75,8 ms |
| iPhone SE | 90 | 15,8 ms | 105,2 ms |
| iPhone SE | **60** (gewählt) | 15,4 ms | 58,6 ms |

- Zusätzlich lief die Messung in der vollen Suite, also auf einer stärker ausgelasteten Maschine. Die Kalibrierung lag dort bei 39 ms statt 27 ms.
  - iPhone 15: 16,4 ms roh, auf die Maschine normiert 12,6 ms; längster Frame 74,6 ms.
  - iPhone SE: 15,5 ms roh, normiert 12,2 ms; längster Frame 58 ms.
  - Der Test prüft den normierten Wert. Roh lag das iPhone 15 dort knapp über 16 ms.
- Einzeln gemessen liegen alle Werte unter 16 ms. Das iPhone SE bekommt trotzdem 60 Erbsen, weil sich der längste Frame damit fast halbiert. Die Werte stehen in `docs/perf/liquid-glass.json`.

## Entscheidungen, bitte prüfen

- **`celebratedMonths` im Einstellungs-Eintrag:** Der Eintrag wird damit auch ohne „Fixkosten einplanen“ angelegt. Damit die Einladung trotzdem erscheint, gilt ein Eintrag mit nur gefeierten Monaten als „unberührt“ (Unit-Test). Gespeichert werden höchstens die letzten 36 Monate.
- **Bestehende Daten:** Alte, komplett bezahlte Monate feiern beim ersten Öffnen einmal, wie im Auftrag beschrieben.
- **Serie:** „{n} Monate in Folge“ zählt die bestätigten Monate von „Fixkosten einplanen“. Das Abzeichen erscheint nur im aktiven Monat.
- **Einzahl:** Bei nur einer Rechnung steht „Deine Rechnung ist bezahlt“ statt „Alle 1 Rechnungen bezahlt“.
- **Umschalter:** Die Stellung bleibt, solange der Monats-Screen offen ist. Beim nächsten Start steht er wieder auf „Nächstes Gehalt“.
- **Wortregel:** Der Text-Test verbot „erledigt“, noch aus einem älteren Sprint. Für `hero.done.title` gilt jetzt eine Ausnahme, weil du den Titel vorgegeben hast.

## Neue Texte

| Wo | Text |
|---|---|
| Hero, Feier | „{Monat} erledigt“ · „Alle {n} Rechnungen bezahlt“ · „Deine Rechnung ist bezahlt“ · „{n} Monate in Folge“ · Haken: „Feier noch einmal abspielen“ |
| Hero, Quellen | „Woraus du bezahlst“ / „Woraus du bezahlt hast“ · „Rücklage“ · „Gehalt“ · „Spielgeld“ (vorher „aus deiner Rücklage“, „direkt vom Gehalt“, „aus Spielgeld“) |
| Gehalts-Aufteilung | „Nächstes Gehalt“ · „Aktuelles Gehalt“ · „(wie im {Monat})“ · nur für Screenreader: „Welches Gehalt?“ |
| Hero | entfällt: „Alles abgebucht“ |

## Screenshots der Ergänzung

- `docs/screenshots/feier/`: `01-hero-normal`, `02-hero-erledigt` (Konfetti im Endzustand), `03-hero-erledigt-ruhig`, je Gerät hell und dunkel
- `docs/screenshots/ruecklage-spielgeld/`: `07-hero-quellen` (Balken und zwei Zeilen), `08-aufteilung-naechstes-gehalt`, `09-aufteilung-aktuelles-gehalt`

## Testergebnisse der Ergänzung

- **Unit-Tests:** 1173 grün.
- **Volle E2E-Suite, einmal komplett** (Chromium, alle 5 Projekte plus perf):
  - Erster Lauf: 54 rot, alle wegen alter Erwartungen.
    - „Alles abgebucht“ und `hero-planned` im bezahlten Monat.
    - Alter Quellen-Text, alte Layout-Regel „ab iPad rechts“.
    - Ein zu schmales ⓘ (39 px) neben „Abzüge vom Netto“ auf Desktop.
  - Korrektur: Spalte 340 px, ⓘ schrumpft nicht mehr; Tests auf den Feier-Zustand umgestellt.
  - Nachlauf der 9 betroffenen Specs auf allen 5 Projekten: 317 grün, 15 rot.
  - Die 15 roten lagen in `dom-figures` und `once-sheet`: Untertitel ungeprüft, noch ein `hero-planned`.
  - Danach beide Specs auf allen 5 Projekten: 45 grün, 0 rot.
  - perf: 5 grün.
- **WebKit** (feier, ruecklage-spielgeld, walkthrough, ein-popover, fixkostenkonto, hero-abzuege): 120 grün.
- **Screenshots** stammen aus Chromium; die WebKit-Bilder wurden verworfen.

# Ergänzung 2 (im selben PR)

**Reihenfolge nach Freigabe:** zuerst #47 mergen, dann #48. Rahmen wie oben: Datenbankname, Subdomain und Export-Format sind unverändert. Neue Felder sind nur additiv. Alle Zahlen kommen aus `kontoState()` und den bestehenden Rechenfunktionen. Es gibt keine neuen Hex-Werte.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Desktop Dezember überdeckt | ✅ | Ursache unten. `monatswechsel.spec.ts`: Desktop 1440, iPad hoch und quer, hell und dunkel. Mehrfach vor und zurück bis Dezember, schnell und langsam. Dann Pixel-Check: Hero-Betrag, „Abzüge vom Netto“ und Kachel-Betrag haben sichtbare Pixel. Über der Mitte des Betrags liegt nichts. Die Zier-Ebenen bleiben in der Kachel. Der Schimmer ist nach seinem Lauf weg. |
| **2** Feier nur im aktiven Monat | ✅ | `celebrateOnOpen` und `celebrateLive` prüfen den aktiven Monat (Unit-Test). E2E `feier.spec.ts`: Heute ist der 5. November. Oktober wird über „Offen aus Oktober“ fertig, ohne Konfetti. Auch beim ersten Öffnen des Oktobers und nach dem Neuladen gibt es keins. |
| **3** Erbsen im Streifen unten | ✅ | Im Feier-Zustand hat der Hero unten 52 px Padding. Die Erbsen landen in einem 28 px hohen Streifen, 10 px über dem Rand (Unit-Test). E2E auf allen 5 Geräten: Keine ruhende Erbse überschneidet eine Textbox des Hero. Gemessen wird mit den Rechtecken jedes Textknotens. |
| **4** Kachel, Empfehlung, Umschalter nur im aktiven Monat | ✅ | Andere Monate zeigen keine Zur-Seite-Kachel und keinen Umschalter. Die Aufteilung zeigt dort nur die Ist-Werte des Monats mit dessen eigenem Netto. E2E: Heute ist der 5. November. Im Oktober steht „Gehalt am 1. Oktober“ mit € 4.788,00, ohne Einmalzahlungen aus dem November. Rest = Netto minus die eigenen Zeilen. |
| **5** „(geschätzt wie zuletzt)“ | ✅ | Text ersetzt, E2E prüft „Gehalt am 1. November (geschätzt wie zuletzt)“. |
| **6** Empfehlung wie die Aufteilung | ✅ | Reicht es: „Leg die € Y auf einmal zur Seite. Danach bleiben dir € R.“ Reicht es nicht: „Auf einmal würden dir € X fehlen. Leg es lieber verteilt zur Seite.“ (X = Y − Überschuss, positiv) R = Überschuss mit Grundbetrag − Y. Unit-Test: R = `nextSalarySplit(…, order).rest` − Y. E2E: R = angezeigter Überschuss bei „Nächstes Gehalt“ − Y. Beide Fälle haben einen Screenshot. |
| **7** Analyse „bis …, danach …“ | ✅ | „€ 3.239,15 bis Februar, danach € 2.909“, solange ein Extra läuft. Der Monat ist der letzte mit Extra aus `kontoState().months`. Ohne Extra bleibt „€ X / Monat“. E2E prüft die Form. |
| **8** Betrag doppelt nach der Feier | ✅ | Ursache unten. Zu jedem Zeitpunkt gibt es genau einen Textknoten. E2E: Während der Feier ist zu drei Zeitpunkten genau ein Betrags-Element im Hero. Am Betrag und seinen Eltern gibt es kein `transform`, `filter` oder `will-change`. Der Betrag nach der Feier ist pixelgleich mit dem Ruhezustand nach dem Neuladen (Toleranz 8 von 255 für das Dithering des Lichts). Läuft auch in WebKit. |
| **9** Spielgeld-Zuordnung | ✅ | Ergebnis unten. Unit: `spielgeld-zuordnung.test.ts` (5 Tests). E2E: `spielgeld-zuordnung.spec.ts` auf Desktop und iPhone 15. |
| **10** Namen als zweite Zeile | ✅ | Die Namen stehen ohne Klammern auf einer eigenen Zeile unter dem Label, in gedämpfter Schrift. E2E: die Zeile liegt unter dem Label und bricht nicht um. |
| **11** Überzug teilweise aus anderer Quelle | ✅ | Dritte Wahl „Teilweise“ mit „Davon aus anderer Quelle: € …“. Cent sind erlaubt, höchstens der Überzug („Höchstens € X.“). Gespeichert als `{ mode: 'part', otherAmount }`. Alte Werte „surplus“ und „other“ werden weiter gelesen und unverändert gespeichert. Unit: Überzug € 1.828,45, andere Quelle € 800, aus dem Überschuss € 1.028,45. E2E: € 508 Überzug, € 200 andere Quelle, € 308 aus dem Überschuss, auch nach dem Neuladen. |

## Ursache zu 1 (Dezember überdeckt)

- **Nachgestellt:** Mit nachgebauten Daten sah ich die Fläche nicht 1:1, weder in Chromium noch in WebKit. Dabei waren Desktop 1280 und 1440, iPad, schnelle Wechsel und das Monatsraster.
- **Zwei Mechanismen passen genau zu deinem Bild. Beide sind belegt und behoben:**
  - **Hochzählen mit zwei Ebenen:**
    - Beim Monatswechsel wurde die echte Zahl durchsichtig geschaltet. Eine Kopie darüber zeigte die Zwischenwerte, Frame für Frame.
    - Stockt dieser Frame-Takt, bleibt die echte Zahl unsichtbar. Safari drosselt ihn, etwa bei Last.
    - Im WebKit-Lauf hing ein Wechsel nachweislich: Nach 30 s stand die Kopie noch auf „€ 1.365“, die echte Zahl war durchsichtig.
    - „0%“ und die Labels zählen nicht hoch und bleiben sichtbar. Genau so sah dein Hero aus.
  - **Zier-Ebenen außerhalb der Kachel:**
    - Der Hero hat zwei grüne Lichtfelder (110–120 px weicher Schein) und einen diagonalen Schimmer (22°).
    - Sie laufen auf eigenen Compositing-Ebenen. WebKit beschneidet solche Ebenen mit `overflow` und `border-radius` allein nicht zuverlässig.
    - Dann liegt ein grüner, diagonal auslaufender Schein über dem Inhalt.
    - Das Schimmer-Element blieb außerdem nach seinem Lauf im DOM stehen.
- **Behoben:**
  - Die Zahl ist ein einziger Textknoten. Das Hochzählen schreibt in denselben Knoten. Ein Timer setzt den Endwert, falls kein Frame kommt.
  - Lichtfelder und Konfetti werden zusätzlich mit `clip-path` und `contain: paint` beschnitten.
  - Der Schimmer wird nach seinem Lauf entfernt. Beim Monatswechsel startet keine alte Konfetti-Ebene mit.

## Ursache zu 8 (Betrag doppelt und unscharf)

- `CountUp` hatte zwei Ebenen: die echte Zahl und eine Kopie darüber, nur für die Zwischenwerte.
- Die Kopie hatte eine eigene Schriftgröße, passend für den breiteren der beiden Werte. Deshalb lag sie leicht versetzt.
- Beim Öffnen eines Monats mit Feier fallen Hochzählen und Feier zusammen. In Safari waren dann beide Ebenen kurz gleichzeitig sichtbar: zwei versetzte Kopien.
- Dazu lagen die Ebenen der 90 Erbsen ohne Begrenzung über dem Text. Safari rasterte den Text dann neu. Das machte ihn während der Feier weich.
- **Behoben:** genau ein Textknoten. Die Erbsen-Ebene ist jetzt mit `contain: paint` und `clip-path` abgeschlossen. Der Pop betrifft nur den Haken-Kreis. Am Text gibt es kein `transform`, `filter` oder `will-change`.
- Die Erbsen selbst behalten `will-change`. Ohne lag die Feier bei 4× Drosselung knapp über 16 ms.

## Ergebnis zu 9 (Spielgeld-Zuordnung)

- **Kein Fehler gefunden.** `account: spielgeld` bleibt in allen geprüften Fällen erhalten:
  - beim Speichern im Bearbeiten-Dialog, wiederkehrend (Miete) und einmalig (Konzert), auch wenn nur Name oder Notiz geändert werden
  - bei Betragsänderungen ab einem Monat und bei Korrekturen
  - beim Monatswechsel vor und zurück
  - beim Neuladen
  - im Abgleich Position ↔ Monats-Instanz: Chip in Positionen, Dialog, Hero-Zeile „Spielgeld“, Spielgeld-Karte, bezahlte Instanz, Einmalbetrag zur Position
  - bei Export → Import in eine leere App, beim Zusammenführen und beim Ersetzen
  - bei der v5-Hochstufung
- Dein Fund auf dem iPhone passt zum getrennten Speicher eines privaten Tabs. Dort fehlt einfach die Zuordnung aus dem normalen Tab.

## Entscheidungen, bitte prüfen

- **Negativer Rest:** Freigegeben mit neuem Text: „Auf einmal würden dir € 3.084,30 fehlen.“ Der Betrag steht positiv.
- **Vergangene Monate, „Zur Seite legen“:** Es gilt der Betrag des Monats aus `kontoState`. Liegt der Monat vor der Simulation, gilt der Grundbetrag.
- **„Teilweise“ ohne Betrag:** Er zählt als € 0 aus anderer Quelle. Dann kommt der ganze Überzug aus dem Überschuss.
- **Feier-Padding:** Nur im Zustand „{Monat} erledigt“ ist der Hero unten 52 px statt 24–32 px hoch.

## Neue und geänderte Texte

| Wo | vorher | jetzt |
|---|---|---|
| Gehalts-Aufteilung | „(wie im {Monat})“ | „(geschätzt wie zuletzt)“ |
| Empfehlung, reicht | „Nach deinem Spielgeld bleiben € Ü. Du kannst die € Y auf einmal zur Seite legen.“ | „Leg die € Y auf einmal zur Seite. Danach bleiben dir € R.“ |
| Empfehlung, reicht nicht | „Nach deinem Spielgeld bleiben € Ü. Leg die € Y lieber verteilt zur Seite.“ | „Auf einmal würden dir € X fehlen. Leg es lieber verteilt zur Seite.“ |
| Analyse | „€ X / Monat“ | „€ X bis {Monat}, danach € Y“ (solange ein Extra läuft) |
| Spielgeld-Karte | – | „Teilweise“ · „Davon aus anderer Quelle“ · „Aus dem Überschuss: € X.“ · „Höchstens € X.“ |

## Screenshots der Ergänzung 2 (Chromium)

- `docs/screenshots/feier/*-02-hero-erledigt`: Endzustand, Erbsen im Streifen unten
- `docs/screenshots/monatswechsel/*-dezember-nach-monatswechsel`: Desktop 1440 und iPad, hell und dunkel
- `docs/screenshots/ruecklage-spielgeld/*-12-oktober-aufteilung`: Oktober, nicht aktiv, eigenes Netto, Name als zweite Zeile
- `docs/screenshots/ruecklage-spielgeld/*-06-kachel-auf-einmal` und `*-11-empfehlung-verteilt`: Empfehlung, beide Fälle
- `docs/screenshots/ruecklage-spielgeld/*-10-spielgeld-teilbetrag`: Spielgeld-Karte mit Teilbetrag

## Testergebnisse der Ergänzung 2

- **Unit-Tests:** 1.189 grün. Neu: `spielgeld-zuordnung.test.ts` mit 5 Tests, dazu neue Fälle in `salarySplit.test.ts` und `celebration.test.ts`.
- **Volle E2E-Suite (Chromium):** alle sechs Projekte gelaufen. Desktop 511, iPhone 15 268, iPhone Pro Max 240, iPad hoch 256, iPad quer 244, Perf 3 grün.
- **Zwei Tests waren rot:**
  - `luxe2`, Hochzählen beim Monatswechsel, in allen fünf Geräte-Projekten. Der Test suchte die alte Kopie über der Zahl. Er prüft jetzt den einen Textknoten: Während des Zählens weicht der Text vom Endwert ab.
  - Perf, Feier auf dem iPhone 15: 16,7 ms statt unter 16 ms. Ursache: Ich hatte `will-change` auch von den Erbsen genommen. Die Erbsen haben es wieder, der Text nicht. Danach dreimal grün, zuletzt 11,5 ms normiert.
  - Beide gefixt und neu gelaufen: `luxe2`, `feier`, `monatswechsel` auf Desktop, iPhone 15 und iPad, 25 grün.
- **Neue Specs:** `monatswechsel` 6 grün, `spielgeld-zuordnung` 2 grün, `feier` 15 grün, `ruecklage-spielgeld` 20 grün.
- **WebKit:** `feier`, `hero-abzuege`, `ruecklage-spielgeld`, `monatswechsel`, 50 grün.
- **Build-Prüfungen:** Farben nur in `tokens.css`, keine Verläufe ins Transparente, Bundle-Größe: alle grün.
- Die Screenshots stammen aus Chromium. Die WebKit-Bilder habe ich verworfen.
