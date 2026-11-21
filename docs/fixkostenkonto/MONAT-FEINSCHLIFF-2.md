# Monat-Feinschliff 2

Rahmen eingehalten: Datenbankname, Subdomain und Export-Format bleiben gleich. Es gibt kein neues Feld und keinen Dexie-Sprung. Alle Zahlen kommen aus `monthPlan()` / `netSalaryForPeriod()` / `lastSalary()`. Es gibt keine neuen Hex-Werte.

## Übersicht

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Karte: „November-Gehalt“, darunter gedämpft „kommt am 25. November“ / „ausgezahlt am …“, Betrag antippbar | ✓ | `DeinMonatCard.tsx` (`dein-monat-salary-title`, `-when`), E2E `monat-feinschliff` |
| 1 Kachel-Titel „{Auszahlungsmonat}-Gehalt“ (Start 25: Oktober → „September-Gehalt“, Dezember → „November-Gehalt“) | ✓ | `salaryView()` in `salaryMonth.ts`, Unit `salaryMonth.test.ts` (Start 1, 25, Jahreswechsel), E2E |
| 1 Kachel-Unterzeile nur das Datum, gedämpft; „Nicht markiert“, „Überwiesen ✓“, „Zur Seite gelegt ✓“ entfernt | ✓ | Texte gelöscht, E2E prüft vier Routen auf `Nicht markiert\|Netto-Gehalt` |
| 1 Antippen öffnet den Monatsabschluss | ✓ | E2E: Kachel → `close-salary` |
| 2 Karte (November) und Dezember-Kachel = ein Eintrag | ✓ | Unit `src/db/one-salary.test.ts` (4 Tests), E2E in beide Richtungen |
| 2 Fallback in beiden, Kachel gedämpft statt „–“ | ✓ | `salaryView().fallback`, `data-salary="fallback"`, Unit-Test |
| 2 Schreib-Zeitraum der Karte aus #51 geprüft | ✓ korrekt | siehe unten |
| 3 Weiße Karte „{Monat} erledigt“ entfernt | ✓ | `BillsRow` gelöscht, E2E `bills-row` count 0 |
| 3 Grüne Karte unten: offen „{x} von {n} Rechnungen bezahlt“ (scrollt zu Kategorien), erledigt ✓ + Titel + Unterzeile + Konfetti | ✓ | `BillsLine` in `DeinMonatCard.tsx`, `useCelebration`, E2E `monat-verdichtet` / `monat-feinschliff` |
| 3 Verhalten unverändert (einmal live, danach statisch; `celebratedMonths`) | ✓ | derselbe Hook wie das Oktober-Hero, E2E `feier` |
| 3 Vorher/Nachher November neben Oktober | ✓ | `docs/screenshots/monat-feinschliff-2/` |

## Schreib-Zeitraum der Karte (#51)

Die Karte schreibt in `monthPlan().first.period`. Bei Monatsbeginn 25 und eingegangener November-Überweisung ist das `2026-12`. Das ist derselbe Monatsabschluss, den die Dezember-Kachel liest und schreibt. Der Code aus #51 war also richtig. Der neue Unit-Test belegt das: ein Schreibvorgang über die Karte, dann einer über die Kachel. Danach gibt es genau einen Eintrag, und beide Stellen zeigen ihn.

## Kleinigkeiten

- Die Kachel zeigt das Datum kurz („kommt am 25.11.“). So bleibt die Zeile auch auf dem iPhone SE einzeilig und die Kachelreihe gleich hoch. Die Karte zeigt es lang („kommt am 25. November“).
- Die freie Kachel sagt jetzt „rechnet mit dem Gehalt“, in einer Zeile.
- Der Regressionstest „Monat ohne Fixkosten einplanen“ vergleicht jetzt Hero und Kategorien pixelgenau mit main (Basisbilder neu aus 4149d85). Die Kacheln haben sich absichtlich geändert.
- `upgrade-v4` startet mit der alten App-Version, deshalb sucht er dort weiter das Feld „Netto-Gehalt“.

## Geänderte Texte

| Schlüssel | vorher | nachher | Wörter |
|---|---|---|---|
| `month.salary` | Dein Gehalt am {datum} | entfernt | – |
| `month.noSalary` | Trag dein Netto-Gehalt ein. Dann rechnet Erbse deinen Monat. | Trag dein Gehalt ein. Dann rechnet Erbse deinen Monat. | 4 + 5 |
| `plan2.noSalary` | Trag dein Netto-Gehalt ein. Dann rechnet Erbse deinen Plan. | Trag dein Gehalt ein. Dann rechnet Erbse deinen Plan. | 4 + 5 |
| `salary.marked` / `.marked.aside` / `.unmarked` | Überwiesen ✓ / Zur Seite gelegt ✓ / Nicht markiert | entfernt | – |
| `salary.comes` | Kommt am {datum} | kommt am {datum} | 3 |
| `salary.paid` | – | ausgezahlt am {datum} | 3 |
| `salary.subtitle` | {gehalt}, ausgezahlt am {datum} | {gehalt}, {wann} | 4 |
| `bills.count.card` | – | {x} von {n} Rechnungen bezahlt | 5 |
| `bills.done.sub` | – | Alle {n} Rechnungen bezahlt | 4 |
| `bills.done.sub.one` | – | Die Rechnung ist bezahlt | 4 |
| Kachel-Titel | Netto-Gehalt | {Monat}-Gehalt (`salary.name`) | 1 |
| freie Kachel | (zweizeilig) | rechnet mit dem Gehalt | 4 |
| Analyse, Sparquote | Trag dein Netto-Gehalt im Monat ein, dann siehst du hier deine Sparquote. | Trag dein Gehalt im Monat ein, dann siehst du hier deine Sparquote. | 12 |

Alle Sätze haben höchstens 12 Wörter. Der Test in `kontoStatus` prüft das.

## Screenshots

Vorher (main 4149d85) und nachher, iPhone 15, hell und dunkel, in `docs/screenshots/monat-feinschliff-2/`:
`oktober`, `november-zu`, `november-auf`, `november-erledigt` (vorher: weiße Zusatzkarte), `dezember`.
Alle Viewports (iPhone SE, 15, Pro Max, iPad hoch/quer, Desktop 1440, hell/dunkel) liegen in `docs/screenshots/monat-feinschliff/`.

## Tests

| Lauf | Ergebnis |
|---|---|
| Unit (vitest) | 1291 grün, 53 Dateien |
| E2E desktop | 519 grün, 40 übersprungen |
| E2E iphone-15 | 266 grün |
| E2E iphone-pro-max | 238 grün |
| E2E ipad-portrait | 254 grün |
| E2E ipad-landscape | 242 grün |
| Perf (Scrollen, Tabwechsel) | 3 grün |
| Perf Feier (iPhone 15 / SE, 4× CPU) | 2 grün |
| WebKit, geänderte Specs + feier | 157 grün, 21 übersprungen |

Im ersten vollen Lauf war `dom-figures` in allen Projekten rot. Der Test prüft jede Zahl auf dem Schirm. Das neue Datum in der Kachel war noch nicht geprüft. Die Prüfung ist ergänzt, danach grün (desktop + iPhone 15). `start-screen` offline war einmal rot und danach grün (wackelig, unverändert).

## Merge

Per Squash nach main, SHA steht im PR.
