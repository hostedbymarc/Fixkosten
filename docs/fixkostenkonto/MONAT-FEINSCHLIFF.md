# Monat-Feinschliff

Sprint `monat-feinschliff`. Das Gehalt heißt nach dem Monat, in dem es kommt. Der aktive Monat zeigt die Aufteilung nur auf Wunsch. Oktober und Dezember behalten ihr Layout. Das Konfetti verhält sich in jedem Monat gleich.

**Rahmen:**
- Datenbankname, Subdomain und Export-Format sind unverändert. Es gibt keinen Dexie-Sprung.
- Neu und nur additiv: der Meta-Eintrag `monthSplitOpen` (aufgeklappt ja/nein, je Gerät, kein Teil der Sicherung). `celebratedMonths` gab es schon, es wird jetzt geschrieben.
- Alle Zahlen kommen aus `monthPlan()` und `kontoState()`. Die Zeile „inkl. …“ liest `inclLine()` (neu in `monthPlan.ts`).
- Keine neuen Hex-Werte. Die Klapp-Animation nutzt CSS (`.fold`), ohne Farben.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Gehalt nach Auszahlungsmonat | ✅ | `src/lib/salaryMonth.ts`: Auszahlungstag = erster Tag des Zeitraums; Monat = Kalendermonat dieses Tages; „{Monat}-Gehalt“. Monatsbeginn 1: unverändert. „geschätzt“ entfällt überall (fehlt das Netto, gilt das zuletzt eingetragene, ohne Hinweis). Gehalt in „Dein Monat“ antippbar: Zahlentastatur, Cent, Enter oder außerhalb speichert, alle Zahlen folgen sofort. Gespeicherte Daten unverändert. Stellen unten. Unit: `salaryMonth.test.ts` (1, 15, 25, Monatsletzter, Jahreswechsel). E2E: `monat-feinschliff.spec.ts`. |
| **2** Layouts | ✅ | Aktiver Monat: unter der Gehaltszeile „So teilt sich dein Gehalt“ mit Pfeil, eingeklappt. Eingeklappt: Gehalt, „Frei für dich“, Pille, „Überwiesen“-Knopf. Aufgeklappt zusätzlich ① ② ③ mit „inkl. …“ und den Namen. Zustand je Gerät (Meta-Eintrag), sanfte Höhenanimation, mit reduzierter Bewegung ohne. Oktober und Dezember: Layout unverändert (`monat-layout.spec.ts` vergleicht Lage und Größe von Hero, Netto-, Vermögensaufbau-Kachel, Notiz, Kategorien mit der Referenz aus main: 12 von 12 gleich). Neutraler Status in der Netto-Kachel (siehe unten). |
| **3** Konfetti überall wie im Oktober | ✅ | Eine Komponente (`Confetti`) in jedem Monat, am Boden der Karte: im aktiven Monat die Rechnungen-Zeile, in anderen Monaten der Hero (deren Layout bleibt). Erledigt: liegt dauerhaft. Live einmal je Monat beim letzten Haken, in jedem Monat; gemerkt in `celebratedMonths`. Öffnen eines erledigten Monats: nur liegend. Wieder offen: weg; erneut erledigt: liegend, keine zweite Feier. Nie über Text; reduzierte Bewegung: nur liegend. Unit: `celebration.test.ts`. E2E: `monat-feinschliff.spec.ts`, `feier.spec.ts`. |
| **4** „inkl. … für …“ | ✅ | Gleichmäßig: das Extra für den tiefsten Monat und seine großen Zahlungen („inkl. € X für Februar · Steuerberater, Öffis, …“), nicht die nächste fällige Zahlung. Bei Fälligkeit: nur wenn diesen Monat eine große Zahlung fällig ist („inkl. € 120,00 Baurechtszins“, der Rest nach dem Angesparten). Eigener Plan: die Raten dieses Monats für den Monat der angesparten Zahlung. Unit: `monthPlan.test.ts` (beide Modi und Eigener Plan). |
| **5** „Dein Plan“ | ✅ | Über dem Umschalter „Wie zahlst du große Zahlungen?“; die Liste heißt weiter „Große Zahlungen“, nur einmal. Tabellenkopf „aufs Konto“ / „zur Seite“ nach der Konto-Einstellung. E2E. |
| **6** Nur nicht eingeplante Posten | ✅ | Statt „0/0 bezahlt“ und „€ 0“: „nicht eingeplant“ ohne Betrag, Name gedämpft; Ø bleibt sichtbar (wenn vorhanden). E2E. |

## Stellen aus Punkt 1 (Gehalt benannt oder eingetragen)

| Stelle | vorher | jetzt (Monatsbeginn 25, November-Screen) |
|---|---|---|
| Karte „Dein Monat“ | „Dein Gehalt am 25. November“ + Chip „geschätzt“ | „Dein Gehalt am 25. November“, kein Chip; Betrag antippbar |
| Netto-Kachel (andere Monate, ohne „Fixkosten einplanen“) | Zeitraum „November 2026“ | Auszahlungsmonat „Oktober 2026“ (bei Monatsbeginn 1 gleich) |
| Netto-Kachel (andere Monate, mit „Fixkosten einplanen“) | „November 2026“ / „Gehalt eintragen“ | neutraler Status, siehe unten |
| Eingabe: Monatsabschluss, Untertitel | „Netto-Gehalt des Monats“ | „Oktober-Gehalt, ausgezahlt am 25. Oktober“ (bei 1 unverändert) |
| Analyse, Sparquote | „Netto € …“ | „Oktober-Gehalt € …“ (bei 1 unverändert) |
| Einstellungen, ⓘ „Neuer Monat beginnt am“ | … „Praktisch, wenn dein Gehalt am Monatsende kommt.“ | dazu „Dein Gehalt heißt nach dem Monat, in dem es kommt.“ |
| Walkthrough, Karte 5 | „Am {tag} kommt dein Gehalt. …“ | unverändert (nennt schon den Auszahlungstag) |
| Hero-Kachel | nennt kein Gehalt („Abzüge vom Netto“) | unverändert |

## „nicht ausbezahlt“: ersetzte Stellen

- Den Text „nicht ausbezahlt“ gibt es weder im Code noch in `TEXTE.md` noch in der Git-Historie. Ich habe ihn dort nicht gefunden.
- In Oktober und Dezember steht an der gemeinten Stelle – der Zeile unter dem Betrag der Netto-Kachel – bisher der Zeitraum („Oktober 2026“) bzw. „Gehalt eintragen“. Diese Zeile ist jetzt der neutrale Status (mit „Fixkosten einplanen“), gleiche Stelle, gleiche Höhe:
  - vergangene Monate: „Überwiesen ✓“ (ohne eigenes Konto „Zur Seite gelegt ✓“), falls markiert; sonst „Nicht markiert“, gedämpft
  - künftige Monate: „Kommt am {Auszahlungstag}“, gedämpft (Dezember: „Kommt am 25. November“)
- Code: `SalaryTile` in `src/screens/MonthScreen.tsx` (`salary-sub`), Texte `salary.marked`, `salary.marked.aside`, `salary.unmarked`, `salary.comes` in `kontoTexts.ts` / `TEXTE.md`, Logik `salaryStatus()` in `salaryMonth.ts`.

## Konfetti: Unterschiede vorher und Lösung

| vorher | Lösung |
|---|---|
| Live-Feier nur im aktiven Monat; vergangene und künftige Monate fielen nie, auch nicht beim letzten Haken. | Live in jedem Monat beim letzten Haken. |
| `celebratedMonths` wurde nie geschrieben (`markCelebrated` war ungenutzt): wieder offen und erneut erledigt fiel das Konfetti jedes Mal neu. | Die Feier wird gemerkt; danach nur liegend, auch nach Neuladen. |
| Aktiver Monat: Rechnungen-Zeile; andere Monate: Hero. Beide nutzen dieselbe Komponente am Boden der Karte. | Bleibt so (die Layouts der anderen Monate bleiben unverändert); Verhalten jetzt gleich. |
| Reduzierte Bewegung: nur liegend. | Unverändert. |

## Entscheidungen, bitte prüfen

- **Status statt Monatsname:** Mit „Fixkosten einplanen“ zeigt die Netto-Kachel anderer Monate den Status statt des Monatsnamens; ohne den Modus den Auszahlungsmonat. Der aktive Monat hat den Knopf in der Karte.
- **Vergangener Monat ohne Gehalt:** zeigt mit dem Modus ebenfalls den Status („Nicht markiert“); Antippen öffnet weiter den Monatsabschluss.
- **Gehalt in der Karte ändern** schreibt das Netto des Zeitraums der Karte (beim nächsten Gehalt dessen Zeitraum), auch wenn es vorher nur übernommen war.
- **Konfetti in künftigen Monaten:** erlaubt, wenn du dort alles abhakst (gleiches Verhalten in jedem Monat).

## Neue und geänderte Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `salary.name` | „{monat}-Gehalt“ | 1 |
| `salary.subtitle` | „{gehalt}, ausgezahlt am {datum}“ | 4 |
| `salary.marked` | „Überwiesen ✓“ | 1 |
| `salary.marked.aside` | „Zur Seite gelegt ✓“ | 3 |
| `salary.unmarked` | „Nicht markiert“ | 2 |
| `salary.comes` | „Kommt am {datum}“ | 3 |
| `salary.rule` | „Dein Gehalt heißt nach dem Monat, in dem es kommt.“ | 10 |
| `month.split` | „So teilt sich dein Gehalt“ | 5 |
| `month.salary.edit` | „Gehalt ändern“ (Vorlesetext) | 2 |
| `month.incl.save` | „inkl. {betrag} für {monat} · {zahlungen}“ | 5 |
| `month.incl.due` | „inkl. {betrag} {zahlungen}“ | 3 |
| `plan2.mode` | „Wie zahlst du große Zahlungen?“ (vorher „Große Zahlungen“) | 5 |
| `unplanned.chip` (neu auch im Kategorie-Kopf) | „nicht eingeplant“ | 2 |
| entfällt | `month.estimated` „geschätzt“, `month.incl`, `month.incl.more` | – |

## Screenshots

`docs/screenshots/monat-feinschliff/`, je iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch und quer, Desktop 1440, hell und dunkel:
- `*-oktober-vorher` / `*-oktober-nachher`, `*-dezember-vorher` / `*-dezember-nachher`: Layout-Vergleich (vorher aus main)
- `*-oktober`, `*-november-zu`, `*-november-auf`, `*-dezember`, `*-dein-plan`

## Testergebnisse

**Unit und Build:**
- Unit (vitest): 52 Dateien, 1285 Tests grün. Neu: `salaryMonth.test.ts` (Monatsbeginn 1, 15, 25, Monatsletzter, Jahreswechsel Dezember-Gehalt → Jänner-Screen; Status je Monatsart; kein „geschätzt“ / „ausbezahlt“ in den Texten), `monthPlan.test.ts` (inkl.-Zeile Gleichmäßig, Bei Fälligkeit, Eigener Plan; Fallback-Netto ohne Hinweis), `celebration.test.ts` (einmal je Monat, in jedem Monat).
- `tsc -b` ohne Fehler, `pnpm build` grün (check-colors, check-glass-layers, check-bundle).

**Layout Oktober und Dezember:** `monat-layout.spec.ts` gegen die Referenz aus main (vor dem Sprint): 12 von 12 gleich (6 Viewports × hell/dunkel; Hero, Netto- und Vermögensaufbau-Kachel, Notiz, Kategorien – Lage und Größe auf den Pixel). Vorher/Nachher-Screenshots in `docs/screenshots/monat-feinschliff/`.

**Volle E2E-Suite (Chromium), einmal komplett:**

| Projekt | Ergebnis |
|---|---|
| desktop | 522 grün, 40 übersprungen, 1 rot: Esc im Test-Helfer ging beim Öffnen des Sheets verloren. Helfer wiederholt Esc jetzt (`closePlan`); 3 × wiederholt grün. |
| iphone-15 | 269 grün |
| iphone-pro-max | 241 grün |
| ipad-portrait | 257 grün |
| ipad-landscape | 245 grün |
| perf | 3 grün: Scrollen Monat 15,5 ms, Analyse 13,8 ms, Tabwechsel 13,1 ms (normalisiert, Grenze 16) |
| perf-feier (isoliert) | 2 grün: iPhone 15 16,1 ms (Grenze 22), iPhone SE 15,7 ms (Grenze 16) |

**WebKit** (`monat-feinschliff`, `feier`, `monat-verdichtet`, `fixkostenkonto`, `feinschliff-puffer`): 121 grün, 16 absichtlich übersprungen, 1 rot (dieselbe Esc-Ursache im Test). Mit `closePlan` neu: `feinschliff-puffer` und `walkthrough` 30 grün. Der Layout-Vergleich läuft nur in Chromium (die Referenz ist in Chromium gemessen; WebKit setzt Schrift anders). WebKit-Screenshots verworfen.

**Nach den letzten Test-Änderungen (Chromium):** `monat-feinschliff`, `monat-verdichtet`, `walkthrough`, `feinschliff-puffer`: 76 grün, 11 übersprungen.

**Viewports:** iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch und quer, Desktop 1440, je hell und dunkel (`monat-feinschliff`, `monat-layout`).
