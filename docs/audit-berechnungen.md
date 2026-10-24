# Audit: Berechnungen in Erbse

Stand: main `d84694a` (vor dem Fix); Abschnitt 4 beschreibt den Stand nach dem Fix. Reproduziert mit deinen Daten (`seed.local.json`, Stand 05.10.2026) plus November 2026:
Netto 7.819, Hotel Copenhagen 504 und iPhones + Zubehör 2.511 (einmalig 3.11.), Lebensmittel & Co abgehakt mit 450 und Notiz, Cash abgehakt.

## 1. Wie das „Notiz“-Feld modelliert ist

Es gibt **kein eigenes Notiz-Betragsfeld**. Ein Haken ist ein Datensatz `Payment` (Tabelle `payments`, Schema v4, unverändert):

| Feld | Typ | Bedeutung | im Fall Lebensmittel, Nov 2026 |
|---|---|---|---|
| `plannedAmount` | number (€, 2 Nachkommastellen) | Plan beim Abhaken (Snapshot) | **480** |
| `actualAmount` | number | „Tatsächlich abgebucht“ im Zahlungs-Sheet | **450** |
| `note` | string, optional | freier Text | „€30 vom Vormonat abgehoben“ |
| `status` | 'paid' \| 'skipped' | | paid |

- Der Plan von „Lebensmittel & Co“ ist laut deinen Daten **€ 480** und nicht € 450. Die „weitere Position“ ist Strom € 64: 1.008 + 64 + 17 + 23 + 10 + 480 = 1.602.
- Der Chip „−€ 30“ ist `DeltaChip` = `actualAmount − plannedAmount` (`calc.dueItems → delta`, Anzeige `PositionRow`, grün bei weniger, rot bei mehr).
- Der Notiztext selbst fließt nirgends ein. Die 30 € entstehen, weil Plan (480) und Ist (450) an verschiedenen Stellen verschieden verwendet werden:

| Stelle | Funktion | nimmt für den abgehakten Posten |
|---|---|---|
| Hero „von € X“ (Gesamt) | `periodProgress.planned` | Plan 480 |
| Hero „€ X abgebucht“ | `periodProgress.paidActual` | Ist 450 |
| Hero „14 offen · € X“ | `periodProgress.openPlanned` (nur offene Posten) | – |
| Ring % | `periodProgress.ratio` = paidPlanned / planned | Plan 480 |
| Frei verfügbar | `freeAfterFixed` = Netto − `fixedCosts` (`expectedSpend`) | Ist 450 |
| Vermögensaufbau, Sparquote | `wealthBuilding` (`expectedSpend`) | Ist |
| Kategorie-Summe | `groupByCategory.planned` | Plan 480 |
| Jahresvorschau-Balken | `fixedCosts` | Ist 450 |
| Plan vs. Ist (Analyse) | `plannedForPeriod` / `actualForPeriod` | beides, gewollt |

Ergebnis mit dem heutigen Code, auf den Cent wie bei dir: Gesamt 5.679 (Plan), Abgebucht 450 (Ist), Offen 5.199 (5.679 − **480**), Frei 7.819 − 5.649 = **2.170** (Ist).
Dadurch gilt **Abgebucht + Offen ≠ Gesamt** (450 + 5.199 = 5.649).

Weitere Stellen, an denen eingegebene Korrektur-Werte in Rechnungen landen:
- **Einmalausgaben** (`oneOffs`: Nachzahlung/Gutschrift an einer Position, Tabelle `oneOffs`): zählen in Frei verfügbar, Vermögensaufbau, Sparquote, Jahresvorschau und Plan-vs-Ist-Ist, **nicht** in Hero-Gesamt/Offen und nicht in der Kategorie-Summe.
- **Zahlungs-Snapshot** (`plannedAmount`): Hat sich der Plan nach dem Haken mit einer datierten Änderung geändert, gilt der neue Plan (`plannedAmount()` in calc.ts).
- Notiz-Texte (`payment.note`, `monthClose.note`) und das alte Feld `monthClose.freeActual` fließen nirgends ein.

## 2. Kennzahlen aller Screens

Ist = heutiger Code. Soll = deine Definitionen. „offen“ = Definition noch zu klären (siehe Abschnitt 4).

| Kennzahl | Screen | Datei / Funktion | Ist-Formel | Soll-Formel | Abweichung |
|---|---|---|---|---|---|
| Gesamt „von € X abgebucht“ | Monat (Hero) | calc `periodProgress.planned` | Σ Plan der fälligen, nicht übersprungenen Posten ohne VA, inkl. Einmalige; ohne Einmalausgaben | alle fälligen Posten ohne VA inkl. Einmalige | nein (Einmalausgaben: offen) |
| Abgebucht | Monat (Hero) | `periodProgress.paidActual` | Σ Ist der abgehakten | davon bezahlt | nein |
| Offen „n offen · € X“ | Monat (Hero) | `periodProgress.openPlanned` | Σ Plan der offenen Posten | Gesamt − Abgebucht | **ja** (−30) |
| Anzahl offen | Monat (Hero) | `periodProgress.openCount` | offene Posten ohne VA | unbezahlte Posten | nein |
| Fortschritt % | Monat (Ring) | `periodProgress.ratio`, Anzeige `Math.floor` | Σ Plan abgehakt / Gesamt | Abgebucht / Gesamt | **ja** (480 statt 450 im Zähler; Nov: 8,45 % vs 7,92 %, beide „8 %“) |
| Netto-Gehalt | Monat (Kachel) | `netSalaryForPeriod` | MonthClose.netSalary des Monats | – | nein |
| Ø pro Monat | Monat, Positionen | `fixedCostsAvg` | siehe 3 | nur dokumentieren | – |
| davon nicht monatlich | Monat | `reserveNeeded` | siehe 3 | nur dokumentieren | – |
| Frei verfügbar | Monat (Kachel), Monatsabschluss | `freeAfterFixed` / `freeAfterFixedWith` | Netto − (Σ Ist abgehakt + Σ Plan offen + Einmalausgaben) | Netto − Gesamt | **ja** (2.170 statt 2.140) |
| im Ø-Monat | Monat (Kachel), Monatsabschluss, ⓘ | `freeAfterFixedAvg`, `explain.averageMonthExplanation` | siehe 3 | nur dokumentieren | – |
| Vermögensaufbau | Monat (Kachel), Analyse Sparquote | `wealthBuilding` | Σ Ist abgehakt + Σ Plan offen + Einmalausgaben, Kategorien mit VA | alle fälligen VA-Posten (bezahlt + offen) | nein bei Ist = Plan; Basis bei Abweichung: offen |
| Sparquote | Monat (Kachel), Analyse | `savingsRate` | Vermögensaufbau / Netto | Vermögensaufbau / Netto | nein |
| Kategorie-Summe | Monat (Header) | `groupByCategory.planned` | Σ Plan der fälligen, nicht übersprungenen | wie Gesamt je Kategorie | nein |
| Kategorie „x/y bezahlt“ | Monat (Header) | **in der Komponente** `MonthScreen.GroupCard` | gezählt in der Komponente | wie Anzahl je Kategorie | Ort: ja (gehört ins Rechenmodul) |
| Kategorie-Ø | Monat (Header), Positionen | `sumMonthlyEquivalent({categoryId})` | siehe 3 | nur dokumentieren | – |
| Positionsbetrag | Monat (Zeile) | `PositionRow` | Ist wenn abgehakt, sonst Plan | – | nein |
| Chip „−€ 30“ | Monat (Zeile) | `DeltaChip`, `dueItem.delta` | Ist − Plan, grün/rot | neutral grau | **ja** (Farbe) |
| Offen aus Vormonaten | Monat (Banner) | `openFromPrevious`, `sumOpen` | Σ Plan offener Posten früherer Monate seit dem ersten Haken | – | nein; zählt nicht in den Monat |
| Kommt bald | Monat | `upcomingDue(period, 2)` | siehe 3 | nur dokumentieren | – |
| Jahresvorschau Balken | Analyse | `yearForecast` → `fixedCosts` | wie Frei verfügbar: Ist abgehakt + Plan offen + Einmalausgaben | = Monat-Gesamt | **ja** (Nov 5.649 statt 5.679) |
| Jahresvorschau Ø-Linie | Analyse | `fixedCostsAvg(today)` | = Ø pro Monat | – | nein |
| Verteilung | Analyse | `categoryDistribution` | umgelegte Monatsbeträge je Kategorie, Summe = Ø pro Monat | – | nein |
| Sparquote-Karte | Analyse | `savingsCard`, `savingsHistory` | `wealthBuilding`, `savingsRate` je Monat | = Monat | nein |
| Entwicklung | Analyse | `burdenTrend` | Ø pro Monat je Monat | – | nein |
| Plan vs. Ist | Analyse | `planVsActual` | `plannedForPeriod` vs `actualForPeriod` (Σ Ist + bezahlte Einmalausgaben) | – | nein (zeigt Abweichungen bewusst) |
| Optimierungen | Analyse | `planChanges` | Jahresdifferenz datierter Planänderungen | – | nein |
| Ø je Position | Positionen, Detail-Sheet | `monthlyEquivalentOfPlan` | Betrag × Fälligkeiten/Jahr ÷ 12 | – | nein |

## 3. Ist-Formeln der „nur dokumentieren“-Kennzahlen

- **Ø pro Monat (€ 2.952,17)**: Σ über aktive Ausgaben-Positionen des Monats: Plan-Betrag × Anzahl Fälligkeitsmonate pro Jahr ÷ 12.
  - Monatlich zählt ×12/12, quartalsweise ×4/12, halbjährlich (Jun/Dez) ×2/12, jährlich ×1/12.
  - Gerechnet in Cent × Monate, erst am Ende ÷ 1200; die Anzeige rundet kaufmännisch.
  - **Einmalige zählen nicht** (0), **Vermögensaufbau zählt nicht**, Einmalausgaben zählen nicht. Basis ist immer der Plan, nie der Ist-Betrag.
  - Positionen, die erst später beginnen, archiviert oder pausiert sind, zählen nicht.
- **davon nicht monatlich (€ 288,17)**: dieselbe Formel, nur Positionen mit nicht-monatlichem Rhythmus.
  - Seed: Baurechtszins 262,02×2/12 = 43,67 · Parqet 87/12 = 7,25 · Depotentgelt 35×4/12 = 11,67 · Kontoführung 14×4/12 = 4,67 · Amex Gebühr 57,50 · Amex Turbo 1,25 · Steuerberater 105 · Offi 57,17.
  - Exakt (524,04 + 87 + 140 + 56 + 690 + 15 + 1.260 + 686) ÷ 12 = 3.458,04 ÷ 12 = 288,17.
  - Die einzeln gerundeten Zeilen ergäben 288,18, ein Beispiel für die ±1-Cent-Abweichung aus Abschnitt 5.
- **im Ø-Monat (vor dem Fix € 4.866,83)**: Netto **des angezeigten Monats** (`MonthClose.netSalary` genau dieses Monats, kein Rückgriff auf Vormonate) − Ø pro Monat des angezeigten Monats. 7.819 − 2.952,17 = 4.866,83. Ohne Netto im Monat wird nichts angezeigt.
  - Seit dem Nachtrag in Abschnitt 4 wird zusätzlich der umgelegte Vermögensaufbau abgezogen: 7.819 − 2.952,17 − 800,00 = 4.066,83.
- **Kategorie-Ø** (z. B. Wohnen & Leben): dieselbe Formel wie Ø pro Monat, nur die Positionen der Kategorie.
  - Wird im Header nur angezeigt, wenn er von der Monatssumme abweicht.
  - Der Kategorie-Ø enthält die nicht-monatlichen Positionen der Kategorie, die im angezeigten Monat nicht fällig sind.
  - Es fehlen **keine** Positionen im Export vom 05.10. Dort liegen diese Positionen nur noch in den alten Kategorien „Banking & Finanzen“ und „Mobilität“; in deinen aktuellen Daten sind sie in Wohnen & Leben, Abos und Sonstiges.
  - Mit den Seed-Beträgen nachgerechnet und bestätigt (November 2026):

| Kategorie | Monatssumme | nicht-monatliche Anteile | Kategorie-Ø |
|---|---|---|---|
| Wohnen & Leben | 1.602 (Plan) | Offi 686 + Depotentgelt 35 × 4 = 140 + Kontoführung 14 × 4 = 56 → 882 €/Jahr ÷ 12 = **73,50** | **1.675,50** |
| Abos | 71 | Parqet 87 ÷ 12 = 7,25 + Amex Gebühr 690 ÷ 12 = 57,50 + Amex Turbo 15 ÷ 12 = 1,25 → **66,00** | **137,00** |
| Sonstiges | 0 (nur Einmalige, zählen im Ø nicht) | Steuerberater 1.260 ÷ 12 = **105,00** | **105,00** |
| Immo | 991 | Baurechtszins 262,02 × 2 ÷ 12 = **43,67** | **1.034,67** |
| **Summe nicht-monatlich** | | 73,50 + 66,00 + 105,00 + 43,67 = **288,17** | = „davon € 288,17 nicht monatlich“ |

- **Kommt bald**: nicht-monatliche Posten (Rhythmus ≠ monatlich, inkl. Einmalige), die in den **2 Monaten nach dem angezeigten Monat** fällig sind.
  - Es zählt nur `period+1` und `period+2`, nie der angezeigte Monat selbst. Die Liste geht in keine Summe ein.
  - Bezugspunkt ist der angezeigte Monat, nicht „heute“.

## 4. Entscheidungen (von dir, 24.10.2026) und Umsetzung

- **C: Überall der Ist-Betrag.** Ein abgehakter Posten zählt mit dem, was tatsächlich abgebucht wurde. Ein offener zählt mit dem Plan, ein entfallener gar nicht.
- **Einmalausgaben zählen wie Posten**: in Gesamt, Abgebucht (wenn abgehakt), Offen, Anzahl, Kategorie-Summe und damit Frei verfügbar. Gutschriften zählen negativ.

Damit gilt in `calc.monthFigures` (eine Quelle für Hero, Kacheln, Kategorie-Header; Analyse nutzt dieselben Einträge):

| Kennzahl | Formel |
|---|---|
| Gesamt | Σ aller fälligen Einträge ohne Vermögensaufbau: abgehakt = Ist, offen = Plan, + Einmalausgaben |
| Abgebucht | abgehakter Teil davon |
| Offen | Gesamt − Abgebucht |
| Anzahl offen | nicht abgehakte Einträge (Posten + Einmalausgaben) |
| Fortschritt % | Abgebucht ÷ Gesamt, kaufmännisch gerundet, 100 % nur wenn alles abgehakt |
| Vermögensaufbau | dieselbe Regel für Kategorien mit Vermögensaufbau |
| Frei verfügbar | Netto − Gesamt − Vermögensaufbau (seit 24.10.2026, vorher Netto − Gesamt) |
| Sparquote | Vermögensaufbau ÷ Netto |
| Kategorie „x/y bezahlt · Summe“ | dieselbe Regel je Kategorie |

**November 2026 mit deinen Daten:** Gesamt 5.649 · Abgebucht 450 · Offen 5.199 · 14 offen · 8 % · Vermögensaufbau 800 · Sparquote 10,2 % · Frei verfügbar **1.370** (7.819 − 5.649 − 800) · im Ø-Monat **4.066,83** (7.819 − 2.952,17 − 800,00) · Wohnen & Leben 1/6 bezahlt · € 1.572.

**Nachtrag 24.10.2026:** Frei verfügbar zieht auch den Vermögensaufbau ab, „im Ø-Monat“ entsprechend den umgelegten Vermögensaufbau (`wealthBuildingAvg`). Die Sparquote bleibt Vermögensaufbau ÷ Netto.

Abweichend von deiner ursprünglichen Soll-Tabelle sind Gesamt 5.649 (statt 5.679), Offen 5.199 (statt 5.229) und Frei 2.170 (statt 2.140), als Folge von C.
Der Plan (480) bleibt gespeichert und erscheint weiter in „Plan vs. Ist“ und im Zahlungs-Sheet.

## 5. Weitere Prüfpunkte (Stand nach dem Fix)

- **Rundung**
  - Beträge werden als Euro mit 2 Nachkommastellen gespeichert. Gerechnet wird in `calc.ts` in Integer-Cent (`monthFigures`, `sumMoney`, umgelegte Werte als Cent × Monate ÷ 1200), also exakt, nie abgeschnitten. Die Zeilen einer Kategorie ergeben exakt die Kategorie-Summe.
  - Umgelegte Werte (÷12) werden erst bei der Anzeige kaufmännisch auf Cent gerundet. Die Summe der angezeigten Verteilungs-Zeilen kann deshalb um ±1 Cent von „Ø pro Monat“ abweichen (Beispiel „nicht monatlich“: einzeln 288,18, exakt 288,17).
  - **Regel (übernommen):** Umgelegte Ø-Beträge immer mit 2 Nachkommastellen (`formatAvg`: € 1.602,00, € 2.952,17), Monatsbeträge ohne „,00“ (`formatEUR`: € 991).
  - Ø-Beträge sind: Ø pro Monat, „davon nicht monatlich“, Kategorie-Ø, Ø je Position, im Ø-Monat, Verteilung, Entwicklung, ⓘ-Erklärung, Monatsabschluss.
  - Bewusst gerundet bleiben das Ø-Label an der Linie der Jahresvorschau („Ø 2.952“, Platz) sowie „€ 3.158 über Ø“ und „rund € …“.
- **Gutschriften (negative Einmalausgaben)**
  - Eine offene Gutschrift kann das exakte Offen (Gesamt − Abgebucht) unter 0 drücken, und Abgebucht kann größer als Gesamt werden.
  - Angezeigt wird Offen nie unter € 0 (`shownOpen`). Der Ring bleibt bei 0–100 % und zeigt 100 % nur, wenn nichts mehr offen ist; solange etwas offen ist, höchstens 99 %.
  - Eine Kategorie-Summe darf negativ sein (echte Gutschrift).
  - Getestet mit festen Fällen und 300 Zufallsdatensätzen mit großen Gutschriften.
- **Datum/Zeitzone**
  - Fälligkeitsdaten sind Text `YYYY-MM-DD`, der Monat wird per `slice(0, 7)` gebildet, ohne `Date`-Umrechnung. Hotel MUC 1.12. landet immer im Dezember, unabhängig von Zeitzone und Sommer-/Winterzeit.
  - „Heute“ kommt aus der lokalen Zeit, in Wien am 1. um 00:30 also bereits der neue Monat.
  - Getestet mit TZ Europe/Vienna, Monatserster/-letzter und den Tagen der Zeitumstellung.
- **Rhythmen**: Fälligkeit über `dueMonths` (monatlich = alle 12, quartalsweise z. B. 1/4/7/10, halbjährlich 6/12, jährlich 1 Monat) bzw. das Datum (einmalig). Vor- und Folgemonate getestet.
- **Bezahlt-Status**: je `positionId + period` gespeichert. Ein Monatswechsel liest nur, schreibt nichts (Unit- und E2E-Test Oktober/November/Dezember).
- **Vermögensaufbau-Flag**: Jede Kennzahl liest die Kategorie-Art bei jeder Berechnung neu. Umschalten rechnet sofort neu (Test).
- **Analyse = Monat**: Die Jahresvorschau-Balken nutzen dieselben Einträge wie der Monat. Property-Test: Balken = Gesamt für jeden Monat. Sparquote-Karte = Monat.
- **Berechnung außerhalb des Rechenmoduls**: „x/y bezahlt“ (`monthFigures.categories`), das Zählen im Vormonats-Banner (`countOpen`) und der helle Jahresvorschau-Balkenteil (`ForecastMonth.extra`) sind ins Modul verschoben.
  - grep: außerhalb von `src/lib/{calc,analytics,explain}.ts` gibt es kein Betrags-`reduce` und keine Betragssumme.
- **Minuszeichen**: eine Konstante `MINUS` (U+2212) in `format.ts` für Beträge, Differenzen, Achsen und Prozent. `formatPercent` ersetzt das Bindestrich-Minus von Intl.
  - grep/Test: kein anderes Minus vor „€“ im Code und auf dem Monat-Screen.
  - Negative Beträge bei Frei verfügbar, im Ø-Monat und Rechnerisch frei erscheinen in Rot (`text-over`, kontrastgeprüft) und immer mit Minus, nie nur farbig.
- **Bewusst nicht umgesetzt** (optional): ein Hinweis im Zahlungs-Sheet wie „Gesamt −30 €“, wenn das Ist vom Plan abweicht. Unter C ändert sich „von € X“ beim Abhaken mit abweichendem Betrag; das ist korrekt.

## 6. Verifikation

Stand des letzten kompletten Laufs auf diesem Branch (24.10.2026):

| Punkt | Ergebnis |
|---|---|
| Alle bisherigen Tests inkl. Migrationstests | ✅ Unit **305/305** (20 Dateien). Kontrollwerte der Migrationstests prüfen den unveränderten Plan 3.403 über `plannedForPeriod` und zusätzlich das neue Gesamt |
| Golden Fixture November 2026 | ✅ `tests/fixtures/november.ts` mit deinen echten Daten: Lebensmittel Plan 480 / Ist 450 mit Notiz, Strom 64, Hotel Copenhagen 504 und iPhones 2.511 einmalig am 3.11., Netto 7.819, Cash abgehakt. Erwartet und grün: Gesamt **5.649** · Abgebucht **450** · Offen **5.199** · **14 offen** · **8 %** · Vermögensaufbau **800** · Sparquote **10,2 %** · Frei **2.170** · Wohnen & Leben **1/6 · 1.572** |
| Property-Tests | ✅ 300 Zufallsdatensätze × 24 Monate: Abgebucht + Offen = Gesamt, Σ Kategorien = Gesamt, bezahlt + offen = fällig, Frei = Netto − Gesamt, Vermögensaufbau/Sparquote, alte API = neue Zahlen. Dazu: Notizen/Altfelder ändern nichts (100 Datensätze), Jahresvorschau = Monat (60), Export → Import identisch (12), Gutschriften: angezeigtes Offen ≥ 0, Ring 0–100 % (300 mit großen Gutschriften) |
| grep: keine Betragssummen außerhalb des Rechenmoduls | ✅ einzige `reduce` außerhalb von `src/lib/{calc,analytics,explain}.ts`: `src/db/migrations.ts:64` und `src/db/db.ts:118`, beide suchen den ältesten/neuesten Eintrag und summieren nichts |
| Audit-Tabelle, Ist-Formeln „nur dokumentieren“ | ✅ Abschnitte 2 und 3 |
| `pnpm build` | ✅ TypeScript ohne Fehler, Farb-/Namens-Check, „check-bundle: 35 private terms, none found in dist/“ |
| Playwright iPhone 15, iPhone Pro Max, iPad hoch, iPad quer, Desktop 1440 | ✅ komplette Suite **660 passed, 0 failed** (55 skipped = gerätespezifische Tests). `e2e/audit.spec.ts`: dieselben Kennzahlen auf allen 5 Viewports, neutraler Chip, Rundungsregel, Monatswechsel |
| Screenshots Monat November 2026 vorher/nachher | ✅ `docs/screenshots/audit/<viewport>-november-vorher.png` (main `d84694a`) und `-nachher.png` (dieser Branch), alle 5 Viewports |
| Netlify Deploy Preview | im PR (Status am letzten Commit) |
