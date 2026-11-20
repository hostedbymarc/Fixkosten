# Monat verdichtet

Sprint `monat-verdichtet`. Der Monats-Screen beantwortet in fünf Sekunden: Wie viel ist frei, und passt mein Spielgeld? Eine Karte „Dein Monat“ statt Hero, Zur-Seite-Kachel, Gehalts-Aufteilung und Spielgeld-Karte. Alle Zahlen kommen aus einer zentralen Rechnung `monthPlan()`.

**Rahmen:**
- Datenbankname, Subdomain und Export-Format sind unverändert. Es gibt keinen Dexie-Sprung.
- Neue Felder nur additiv:
  - `Position.saving` (`{ mode: 'due' | 'spread', startMonth? }`): ohne Index, wird mit der Position gespeichert und exportiert.
  - `planMode` (`'due' | 'even' | 'custom'`) im Einstellungs-Eintrag `fixkostenkonto`.
  - Alte Felder (`gapMode`, `spielgeldOverflow` …) bleiben gespeichert und unangetastet.
- Migration ohne Schreiben: Ein fehlender `planMode` wird aus `gapMode` abgeleitet. „auf einmal“ wird `due`, „verteilt“ oder nie gefragt wird `even`. Alte Einträge bleiben Byte für Byte gleich.
- Alle Zahlen: `monthPlan()` (neu, `src/lib/monthPlan.ts`). Sie liest `kontoState()` und die bestehenden Rechenfunktionen (`dueItems`, Gehalts-Teile).
- Keine neuen Hex-Werte. Die Karte nutzt den bestehenden Hero-Stil (`hero`, `hero-chip`, Brand-Tokens).

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Karte „Dein Monat“ | ✅ | Nur im aktiven Monat, nur mit „Fixkosten einplanen“. Für das nächste Gehalt: „Dein Gehalt am {Tag}. {Monat}“ mit Netto (fehlt es: zuletzt eingetragenes mit „geschätzt“; ganz ohne: Hinweis und „Gehalt eintragen“, keine weiteren Zeilen). ① „Aufs Fixkostenkonto“ / „Zur Seite legen“ mit „inkl. € A für {Zahlung} im {Monat}“, ② „Direkt bezahlt“ mit bis zu 2 Namen oder „{n} Posten“, ③ „Vermögensaufbau“. Trennlinie, „Frei für dich“ als größte Zahl. Pille: „Dein Spielgeld € S passt“ (Haken) / „Dir fehlen € X für dein Spielgeld“ (Warnsymbol) / „Spielgeld festlegen“. Knopf „€ T aufs Fixkostenkonto überwiesen“ ersetzt den Monats-Check, danach „Überwiesen. Erledigt am {Datum}.“. ① und die Pille öffnen „Dein Plan“, die Pille mit dem Spielgeld direkt editierbar. E2E: `monat-verdichtet.spec.ts`. |
| **2** Rechnungen als schmale Zeile | ✅ | „Rechnungen {Monat}“ · „x von n bezahlt“ · dünner Balken (`progressbar`), darunter die Kategorien. Bei 100 %: „{Monat} erledigt“ mit Haken. Konfetti einmal live beim letzten Haken (bestehende Logik als `useCelebration`), danach liegen die Erbsen ruhig unten in der Zeile. Die Zeile ist nur dann höher. Nicht aktive Monate: Hero wie bisher. E2E: `monat-verdichtet.spec.ts`. |
| **3** „Nächster großer Monat“ | ✅ | Nur wenn ein Monat der nächsten 12 mindestens 25 % über dem Durchschnitt liegt. Monat · Summe, die 2 größten nicht monatlichen Zahlungen, Status „Mit deinem Plan bist du vorbereitet.“ oder „Plane vor: …“ mit dem Vorschlag aus Punkt 4. Antippen öffnet „Dein Plan“. Unit: `monthPlan.test.ts`. |
| **4** Sheet „Dein Plan“ | ✅ | Antwort in einem Satz, eine von drei: „Passt so. …“ / „Passt, wenn du ansparst.“ mit „Spar ab {Monat} € X im Monat für {Zahlung} an.“ und „Übernehmen“ / „Geht nicht ganz. Höchstens € M Spielgeld sind möglich.“ mit „Spielgeld auf € M setzen“. Umschalter „Bei Fälligkeit \| Gleichmäßig“ mit „Empfohlen“, bei einzeln geänderten Zahlungen „Eigener Plan“. Tabelle der nächsten 4 Gehälter (auf 12 ausklappbar), Monate unter dem Spielgeld mit Symbol und Farbe. Liste „Große Zahlungen“ nach Datum mit Zustand und „ändern“ (im Monat zahlen oder vorher ansparen ab wählbarem Monat), „€ Y schon angespart · {Monat} noch € Z“. Felder `saving` und `planMode`. Unit und E2E. |
| **5** Einrichtung und Standard-Zuordnung | ✅ | Frage 1 bleibt. Ja: Positionen ohne gespeicherte Zuordnung → „Rücklage“. Nein: monatliche → „Direkt“, alle anderen → „Rücklage“, Texte „Zur Seite legen“ / „zur Seite gelegt“. Gespeicherte Zuordnungen bleiben (`assignAccounts`, `setupAccount`). Bestehende Installationen: unverändert; „eingerichtet“ und eigenes Konto wie bisher aus dem gespeicherten Stand. Fragen zur Lücke entfallen; danach öffnet „Dein Plan“ und übernimmt die Empfehlung. Unit und E2E. |
| **6** Aufräumen | ✅ | Entfernt (Liste unten). Einstellungen, Abschnitt Fixkosten einplanen: Schalter, Eigenes Konto ja/nein, Stand der Rücklage, Spielgeld, Sicherheitspuffer, Runden, „Dein Plan öffnen“, „So funktioniert Erbse“; „Lücke schließen“ entfällt. Analyse: „Ø pro Monat (aktiver Monat)“ → „Ø pro Monat“; die Karte „Fixkosten einplanen“ zeigt den Verlauf nach dem gewählten Plan. Walkthrough Karten 2–5 neu (Texte unten). |
| **7** Design | ✅ | Dunkelgrüner Hero-Stil, Zahlen rechtsbündig mit `tabular-nums`, „Frei für dich“ als größte Zahl (`num-display`, passt sich der Breite an). ①②③ als kleine helle Kreise. iPhone (auch SE): Karte und Rechnungen-Zeile ohne Scrollen sichtbar (E2E-Messung). iPad und Desktop: Karte links oben, rechts „Nächster großer Monat“ und „Kommt bald“, Kategorien darunter in der Spalte der Karte; Lesebreite begrenzt. Kontrast: Unit `contrast-dein-monat.test.ts` (Text ≥ 4,5:1, große Zahl ≥ 3:1, Pille, Knopf; hell und dunkel). |

## Rechnung `monthPlan()`

Für jedes der 12 Gehälter ab dem nächsten (`kontoState().next`):

- **T_m** (aufs Konto):
  - Bei Fälligkeit (`due`): alle monatlichen Rechnungen des Kontos im Monat m + fällige große Zahlungen abzüglich dem, was schon für sie angespart ist.
  - Gleichmäßig (`even`): der Betrag von `kontoState` (12-Monats-Anteil, Extra, Sicherheitspuffer); bisherige Logik unverändert.
  - Eigener Plan (`custom`): wie Bei Fälligkeit, aber eine Zahlung mit `saving.mode = 'spread'` wird in gleichen Raten (auf den Cent aufgerundet) vom Startmonat bis zum Fälligkeitsmonat angespart.
- **F_m** = Netto_m − T_m − Direkt_m − Vermögensaufbau_m (geplant, nur vom Netto). Fehlt das Netto, gilt das zuletzt eingetragene.
- **Schon angespart:** Der erwartete Stand der Rücklage wird in Datumsreihenfolge auf die nächsten großen Zahlungen verteilt. Ist das Geld dieses Monats schon überwiesen, zahlt der Stand zuerst die offenen Rechnungen dieses Monats.
- **Antwort:** Hält der gewählte Plan das Spielgeld in allen 12 Monaten → 1. Sonst Vorschläge: die großen Zahlungen der knappen Monate ab dem ersten Gehalt ansparen (größte zuerst), bis jeder Monat passt → 2. Passt das nicht, aber „Gleichmäßig“ → 2 mit „Spar alle großen Zahlungen gleichmäßig an.“. Sonst → 3 mit dem höchsten erreichbaren Spielgeld, auf € 50 abgerundet, und dem Plan, der es erreicht.
- **Empfohlen:** Bei Fälligkeit, wenn es das Spielgeld in allen 12 Monaten hält; sonst Gleichmäßig; sonst keins.

**Deine Zahlen (Unit-Test, nachgebaut):**
- Netto € 8.302, Lebensmittel € 480 direkt, Vermögensaufbau € 800, Spielgeld € 1.200, Rücklage € 142.
- Konto-Rechnungen Dezember € 2.541,03 (mit Baurechtszins € 262), Februar € 4.602,70 (Steuerberater € 1.260, Öffis € 686).
- Bei Fälligkeit: Februar aufs Konto € 4.602,70, **frei € 2.419,30**. Antwort **„Passt so“**, empfohlen „Bei Fälligkeit“.
- Baurechtszins: **„€ 142 schon angespart · Dezember noch € 120“**, Dezember aufs Konto € 2.399,03.
- Spielgeld € 3.000: Antwort 2, **„Spar ab Dezember € 420 im Monat für Steuerberater an.“**; übernommen passt der Eigene Plan (Februar frei € 3.259,30).
- Spielgeld € 4.500: Antwort 3 mit dem Maximum (auf € 50 abgerundet); mit diesem Spielgeld passt der zugehörige Plan.

## Entfernte Komponenten

| entfernt | Datei | ersetzt durch |
|---|---|---|
| Zur-Seite-Kachel (mit Empfehlung „auf einmal / verteilt“) | `KontoTileView.tsx`, `KontoTile` in `KontoTile.tsx` | Zeile ① und Knopf „… überwiesen“ in „Dein Monat“ |
| Sheet „Fixkosten einplanen“ (Warum € X?, Status, Wechsel) | `KontoSheet` in `KontoSheet.tsx`, `KontoStatusView.tsx` | „Dein Plan“ (`DeinPlanSheet.tsx`); der Verlauf bleibt in der Analyse |
| Gehalts-Aufteilung mit „Nächstes \| Aktuelles Gehalt“ | `SalarySplitCard.tsx` | „Dein Monat“ |
| Karte „Dein Spielgeld“ | `SpielgeldPlanCard.tsx`, `spielgeldPlan.ts` | Pille und „Dein Plan“ |
| Empfehlung „auf einmal / verteilt“ | `lumpAdvice`, `tileAdvice` in `salarySplit.ts` | Antwort und „Empfohlen“ in „Dein Plan“ |
| Lücken-Frage der Einrichtung, Schritt „Dein Plan“ der Einrichtung | `KontoSetupSheet.tsx` | „Dein Plan“ nach der Einrichtung |
| Monats-Check „Hast du € X zur Seite gelegt?“ | Karte `month` in `KontoCheckCard.tsx` | Knopf in „Dein Monat“ („Stimmt dein Kontostand noch?“ bleibt) |
| „Lücke schließen“ und Plan-Betrag in den Einstellungen | `SettingsScreen.tsx` | „Dein Plan öffnen“ |
| Texte dieser Komponenten (80 Schlüssel) | `kontoTexts.ts` | neue Texte unten |

## Entscheidungen, bitte prüfen

- **Nächstes Gehalt:** Die Karte zeigt den nächsten Überweisungsmonat aus `kontoState` (`next`). Nach der Einrichtung gilt dieser Monat als schon überwiesen, die Karte zeigt dann das Gehalt des Folgemonats ohne Knopf. Der Knopf erscheint, sobald der Monat beginnt.
- **Bei Fälligkeit ohne Sicherheitspuffer:** Das Geld wird genau dann gebraucht, wenn es fällig ist. So stimmt „€ 142 schon angespart“ aus deinem Beispiel. Der Puffer gilt weiter für „Gleichmäßig“.
- **Runden** gilt auch für Bei Fälligkeit und Eigener Plan: T wird auf den gewählten Schritt aufgerundet.
- **Antwort prüft deinen Plan:** „Passt so“ heißt, dein gewählter Plan hält das Spielgeld. „Empfohlen“ folgt deiner Regel (zuerst Bei Fälligkeit, dann Gleichmäßig) und kann daneben auf den anderen Modus zeigen.
- **Eigener Plan aus „Gleichmäßig“:** Ändert man eine Zahlung, während „Gleichmäßig“ gewählt ist, werden alle anderen großen Zahlungen ab dem nächsten Gehalt angespart. So springt nichts.
- **Walkthrough:** Er öffnet nach der Einrichtung nicht mehr von selbst, weil jetzt „Dein Plan“ öffnet. Er bleibt in den Einstellungen.
- **Kein Spielgeld gesetzt:** Die Pille sagt „Spielgeld festlegen“, „Dein Plan“ zeigt „Leg dein Spielgeld fest. …“; „Empfohlen“ prüft dann nur, dass nichts unter 0 geht.
- **Nach der Einrichtung ohne Netto** übernimmt „Dein Plan“ „Gleichmäßig“ (keine Empfehlung ohne Netto möglich).

## Neue Texte

Wörter je Satz in Klammern; die vollständige Liste steht in `TEXTE.md`.

| Wo | Text |
|---|---|
| Dein Monat | „Dein Gehalt am {datum}“ (4) · „geschätzt“ (1) · „Trag dein Netto-Gehalt ein. Dann rechnet Erbse deinen Monat.“ (4 · 5) · „Gehalt eintragen“ (2) |
| Dein Monat | „Aufs Fixkostenkonto“ (2) · „Zur Seite legen“ (3) · „inkl. {betrag} für {zahlung} im {monat}“ (6) · „inkl. {betrag} für {n} Zahlungen im {monat}“ (7) |
| Dein Monat | „Direkt bezahlt“ (2) · „{n} Posten“ (2) · „Vermögensaufbau“ (1) · „Frei für dich“ (3) |
| Pille | „Dein Spielgeld {betrag} passt“ (4) · „Dir fehlen {betrag} für dein Spielgeld“ (6) · „Spielgeld festlegen“ (2) |
| Knopf | „{betrag} aufs Fixkostenkonto überwiesen“ (4) · „{betrag} zur Seite gelegt“ (5) · „Überwiesen. Erledigt am {datum}.“ (1 · 3) · „Zur Seite gelegt. Erledigt am {datum}.“ (3 · 3) |
| Einrichten | „Richte „Fixkosten einplanen“ ein. Dann siehst du, was frei ist.“ (4 · 6) · „Einrichten“ (1) · „Dein Plan öffnen“ (3) |
| Rechnungen-Zeile | „Rechnungen {monat}“ (2) · „{x} von {n} bezahlt“ (4) · „{monat} erledigt“ (2) · „Nichts fällig“ (2) |
| Großer Monat | „Nächster großer Monat“ (3) · „Mit deinem Plan bist du vorbereitet.“ (6) · „Plane vor: {vorschlag}“ (3) |
| Dein Plan | „Passt so. Dein Spielgeld bleibt jeden Monat übrig.“ (2 · 6) · „Passt, wenn du ansparst.“ (4) · „Spar ab {monat} {betrag} im Monat für {zahlung} an.“ (9) · „Spar alle großen Zahlungen gleichmäßig an.“ (6) · „Übernehmen“ (1) |
| Dein Plan | „Geht nicht ganz. Höchstens {betrag} Spielgeld sind möglich.“ (3 · 5) · „Spielgeld auf {betrag} setzen“ (4) · „Leg dein Spielgeld fest. Dann prüft Erbse deinen Plan.“ (4 · 5) · „Trag dein Netto-Gehalt ein. Dann rechnet Erbse deinen Plan.“ (4 · 5) |
| Dein Plan | „Dein Spielgeld“ (2) · „Große Zahlungen“ (2) · „Bei Fälligkeit“ (2) · „Gleichmäßig“ (1) · „Eigener Plan“ (2) · „Empfohlen“ (1) |
| Dein Plan | „Jede große Zahlung überweist du im Monat, in dem sie fällig ist.“ (12) · „Du sparst alle großen Zahlungen vorher in gleichen Raten an.“ (10) · „Du hast Zahlungen einzeln geändert.“ (5) |
| Dein Plan | „Deine nächsten Gehälter“ (3) · „Monat“ · „aufs Konto“ · „zur Seite“ · „frei für dich“ · „Alle 12 Monate“ (3) · „Nur 4 Monate“ (3) |
| Dein Plan | „In den nächsten 12 Monaten kommt keine große Zahlung.“ (9) · „im {monat} zahlen“ (3) · „vorher ansparen: {n} × {betrag} ab {monat}“ (7) · „gleichmäßig angespart“ (2) · „{betrag} schon angespart · {monat} noch {rest}“ (7) · „ändern“ (1) · „Ansparen ab“ (2) · „Fertig“ (1) |
| Einstellungen | „Eigenes Konto für Fixkosten“ (4) · „Ja“ · „Nein“ |

**Walkthrough, Karten 2–5:**

| Karte | Titel | Text |
|---|---|---|
| 2 | „Bei Fälligkeit oder gleichmäßig.“ (4) | „Gleichmäßig sind das {betrag} pro Monat. Bei Fälligkeit zahlst du, wenn es kommt.“ (6 · 7) |
| 3 | „Vom Gehalt geht zuerst dein Plan weg.“ (7) | „Aufs Fixkostenkonto, direkt bezahlt, Vermögensaufbau. Der Rest ist frei für dich.“ (5 · 7) · „Spielgeld planst du nur ein. Erbse prüft, ob es passt.“ (5 · 5) · Grafik: Gehalt → Fixkostenkonto / Direkt bezahlt / Frei für dich / Vermögensaufbau |
| 4 | „Erbse empfiehlt den einfacheren Weg.“ (5) | „Zuerst bei Fälligkeit. Reicht das nicht jeden Monat, dann gleichmäßig.“ (3 · 8) · „Für dich passt: Bei Fälligkeit.“ / „Für dich passt: Gleichmäßig.“ (5 / 4) · „Fehlt etwas, zeigt dir „Dein Plan“ einen Vorschlag.“ (8) |
| 5 | „Dein Spielgeld ist die Prüfgröße.“ (5) | „Am {tag} kommt dein Gehalt. Erbse zeigt dir, was frei bleibt.“ (5 · 6) |

## Screenshots (Chromium)

`docs/screenshots/monat-verdichtet/`, je iPhone SE, iPhone 15, iPad hoch und quer, Desktop 1440, hell und dunkel:
- `*-01-monat-ohne-netto`, `*-02-monat-passt`, `*-03-monat-fehlt`, `*-04-monat-erledigt`: Monat oben
- `*-11-plan-passt`, `*-12-plan-ansparen`, `*-13-plan-geht-nicht`: Sheet „Dein Plan“ in allen drei Antworten
- `*-05-layout`: Layout (iPad und Desktop: Karte links, großer Monat rechts)

## Testergebnisse

**Unit und Build:**
- Unit (vitest): 51 Dateien, 1260 Tests grün. Darin `monthPlan.test.ts` (29: Bei Fälligkeit, Gleichmäßig, Eigener Plan, Ersparnis in Datumsreihenfolge, drei Antworten mit Vorschlag und Maximum, fehlendes Netto, eigenes Konto ja/nein, Migration `gapMode` → `planMode`) und `contrast-dein-monat.test.ts` (24).
- `tsc -b` ohne Fehler, `pnpm build` grün (check-colors, check-glass-layers, check-bundle).

**Regressionstest ohne „Fixkosten einplanen“:** `monat-ohne-einplanen.spec.ts` vergleicht den Monats-Screen (Oktober und November, iPhone 15 und Desktop, hell und dunkel) Pixel für Pixel mit Referenzbildern aus main vor dem Sprint (e112e57). 4 grün, 0 Pixel Unterschied.

**Volle E2E-Suite (Chromium), einmal komplett:**

| Projekt | Ergebnis |
|---|---|
| desktop | 490 grün |
| iphone-15 | 269 grün |
| iphone-pro-max | 241 grün |
| ipad-portrait | 257 grün |
| ipad-landscape | 245 grün |
| perf | 3 grün: Scrollen Monat Ø 12,1 ms, Scrollen Analyse 15,0 ms, Tabwechsel 13,7 ms (normalisiert, Grenze 16) |
| perf-feier (isoliert) | 2 grün: iPhone 15 Ø 18,1 ms (Grenze 22), iPhone SE 13,0 ms (Grenze 16); Grenzen unverändert |

Vorher, beim Umstellen der Specs (nicht im Endlauf): 13 rot im ersten Lauf der angepassten Specs, alles Test-Erwartungen (ⓘ auf verborgenem Tab, Label „Ø pro Monat“, Import zeigt „Dein Monat“); angepasst und grün.

**WebKit** (`monat-verdichtet`, `feier`, `fixkostenkonto`, `feinschliff-puffer`, `walkthrough`, `ein-popover`, `monatswechsel`, `hero-abzuege`):
- Erster Lauf: 73 rot. Ursache war ein echter Fehler: Nach der Einrichtung wechselte „Dein Monat“ zur Karte und baute das Einrichtungs-Sheet ab, bevor es „Dein Plan“ öffnen konnte. Behoben (Sheet außerhalb des Wechsels).
- Zweiter Lauf: 155 grün, 12 absichtlich übersprungen, 1 rot (Esc im Test-Helfer ging verloren). Helfer wiederholt Esc jetzt; `ein-popover` danach 3 × wiederholt: 59 von 60 und 60 von 60 grün.
- Ein Ausreißer: „Einstellungen: geänderte ⓘ-Texte“ (iPhone SE dunkel, unveränderter Test) einmal rot in 124 Läufen, einzeln 4 × grün, nicht reproduzierbar.
- WebKit-Screenshots sind verworfen; die Specs liefen danach in Chromium neu.

**Viewports:** iPhone SE, iPhone 15, iPad hoch und quer, Desktop 1440, je hell und dunkel, in `monat-verdichtet`, `feier`, `fixkostenkonto`, `feinschliff-puffer`, `walkthrough`, `ein-popover`.
