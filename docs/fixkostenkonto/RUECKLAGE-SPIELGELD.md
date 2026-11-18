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

- Alle Werte liegen unter 16 ms. Das iPhone SE bekommt trotzdem 60 Erbsen, weil sich der längste Frame damit fast halbiert. Die Werte stehen in `docs/perf/liquid-glass.json`.

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

TESTERGEBNISSE
