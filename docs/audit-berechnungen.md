# Audit: Berechnungen in Erbse

Stand: main `d84694a` (vor dem Fix). Reproduziert mit deinen Daten (`seed.local.json`, Stand 05.10.2026) plus November 2026:
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
- **im Ø-Monat (€ 4.866,83)**: Netto **des angezeigten Monats** (`MonthClose.netSalary` genau dieses Monats, kein Rückgriff auf Vormonate) − Ø pro Monat des angezeigten Monats. 7.819 − 2.952,17 = 4.866,83. Ohne Netto im Monat wird nichts angezeigt.
- **Kategorie-Ø** (z. B. Wohnen & Leben): dieselbe Formel wie Ø pro Monat, nur die Positionen der Kategorie.
  - Wird im Header nur angezeigt, wenn er von der Monatssumme abweicht.
  - Mit dem Stand 05.10. ist Wohnen & Leben 1.602 = 1.602. Deine € 1.675,50 enthalten also eine nicht-monatliche Wohnen-Position, die später angelegt wurde: +€ 73,50/Monat = € 882/Jahr.
- **Kommt bald**: nicht-monatliche Posten (Rhythmus ≠ monatlich, inkl. Einmalige), die in den **2 Monaten nach dem angezeigten Monat** fällig sind.
  - Es zählt nur `period+1` und `period+2`, nie der angezeigte Monat selbst. Die Liste geht in keine Summe ein.
  - Bezugspunkt ist der angezeigte Monat, nicht „heute“.

## 4. Was noch geklärt werden muss

- **Basis bei abweichendem Ist** (Lebensmittel: Plan 480, abgebucht 450). Deine Soll-Tabelle verlangt Gesamt 5.679 (Plan), Abgebucht 450 (Ist), Offen 5.229, Frei 2.140 (Plan).
  - Das ist rechnerisch konsistent, heißt aber: Die 30 € Differenz stehen als „offen“, obwohl der Posten abgehakt ist.
  - Wer den Ist-Betrag ändert, ändert Abgebucht und Offen. Die Invariante „Korrektur-Werte ändern keine Kennzahl“ gilt dann nur für Notiztexte.
- **Einmalausgaben** (Nachzahlung/Gutschrift): Die Soll-Definitionen erwähnen sie nicht. Heute zählen sie in Frei verfügbar und Vermögensaufbau, aber nicht in Hero und Kategorie-Summe.
- **Golden Fixture**: Mit deinen echten Daten ist Lebensmittel Plan 480 / Ist 450 und die weitere Position Strom 64 (nicht 450 / 94). Die Summe 1.602 bleibt gleich.

## 5. Weitere Prüfpunkte

- **Rundung**
  - Beträge werden als Euro mit 2 Nachkommastellen gespeichert und über `sumMoney` in Cent summiert, also exakt, nie abgeschnitten. Die Zeilen einer Kategorie ergeben exakt die Kategorie-Summe.
  - Umgelegte Werte (÷12) werden erst bei der Anzeige kaufmännisch auf Cent gerundet.
  - Die Summe der angezeigten Verteilungs-Zeilen kann deshalb um ±1 Cent von „Ø pro Monat“ abweichen.
  - Cent erscheinen, weil `formatEUR` „,00“ weglässt: ganze Beträge ohne Cent (€ 991), sonst mit (€ 2.952,17).
  - Vorschlag: Regel beibehalten, aber umgelegte Beträge (Ø) immer mit 2 Stellen zeigen; Monatsbeträge ohne „,00“.
- **Datum/Zeitzone**
  - Fälligkeitsdaten sind Text `YYYY-MM-DD`, der Monat wird per `slice(0, 7)` gebildet, ohne `Date`-Umrechnung. Hotel MUC 1.12. landet immer im Dezember, unabhängig von Zeitzone und Sommer-/Winterzeit.
  - „Heute“ kommt aus der lokalen Zeit (`format(new Date(), 'yyyy-MM')`), in Wien am 1. um 00:30 also bereits der neue Monat.
  - Tests dazu kommen hinzu.
- **Rhythmen**: Fälligkeit über `dueMonths` (monatlich = alle 12, quartalsweise z. B. 1/4/7/10, halbjährlich 6/12, jährlich 1 Monat) bzw. das Datum (einmalig). Vor- und Folgemonate sind korrekt (Tests kommen hinzu).
- **Bezahlt-Status**: je `positionId + period` gespeichert. Ein Monatswechsel liest nur, schreibt nichts.
- **Vermögensaufbau-Flag**: Jede Kennzahl liest die Kategorie-Art bei jeder Berechnung neu (Live-Query). Umschalten rechnet sofort neu.
- **Analyse = Monat**: Jahresvorschau-Balken weichen bei abgehakten Abweichungen ab (siehe Tabelle). Sparquote-Karte = Monat.
- **Berechnung außerhalb des Rechenmoduls**
  - `MonthScreen.GroupCard` zählt „x/y bezahlt“ selbst.
  - `Forecast.tsx` rechnet `due − regular` für den hellen Balkenteil.
  - `MonthScreen` zählt die Posten im Vormonats-Banner.
  - Das sind keine Betragssummen bis auf `due − regular`; alles wird ins Modul verschoben.
