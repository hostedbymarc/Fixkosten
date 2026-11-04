# Fixkostenkonto – Phase 1: Bestandsaufnahme

Stand: main `9a97477` (Redesign „Luxe 2“), Schema v4, 724 Unit-Tests grün.

## Features

| Feature | Status | Belege | Was fehlt | Aufwand | Schemaänderung? |
|---|---|---|---|---|---|
| **F4** Konto pro Position | fehlt | `Position` in `src/lib/types.ts` hat kein Konto-Feld; einziges verwandtes Kennzeichen ist `fromNet` (nur einmalige VA-Zahlungen, `countsFromNet` in `src/lib/calc.ts`) | optionales Feld `account`, Dexie-Versionssprung v5 mit Vorbelegung, Backup-Migration, Segment-Control im `PositionFormSheet`, Chip in `PositionsScreen` | M | ja, rein additiv (optionales Feld, keine Index-Änderung) |
| **F1** Dauerauftrag-Empfehlung | fehlt | Bausteine vorhanden: `monthlyEquivalent`, `sumMonthlyEquivalent`, `fixedCostsAvg`, `reserveNeeded` (`src/lib/calc.ts`) | Summe der Monatsanteile nur für `account = fixkostenkonto`, Rundung 1/5/10 €, Bento-Kachel + Sheet | S | nein (Einstellungen im `meta`-Key-Value-Store) |
| **F2** Startlücke | fehlt | `dueItems` liefert Status offen/abgehakt/entfallen je Monat; Einstellungs-Muster `readMonthStart`/`writeMonthStart` (`src/db/backup.ts`) | Kontostand heute, „Dauerauftrag schon eingegangen?“, 12-Monats-Simulation, Anzeige | M | nein (`meta`) |
| **F3** Kontostand-Simulation | fehlt | 12-Monats-Vorschau `yearForecast` (`src/lib/analytics.ts`) = nur Fixkosten-Summe je Monat, kein Kontostand; Recharts-Infrastruktur `ChartCard`, `chartTheme.tsx` | Liniendiagramm Kontostand, Minus-Markierung (Vorzeichen + Icon), Monats-Detail, Hinweis „steigt stark“ | M | nein |
| **F5** Onboarding mit Länder-Vorlagen | teilweise | `SetupDialog` (`src/components/SetupDialog.tsx`) bei leerer DB (`needsSetup`): nur „Daten importieren“ / „Leer starten“; Leerzustand `EmptyCard` im Monats-Screen | Land wählen, Vorlagen, Länder-Einstellung, CHF/de-CH, de-DE | M–L | nein (`meta`) |

## Voraussetzungen

| Frage | Ergebnis | Beleg |
|---|---|---|
| Zentrale Funktion für Monatsanteil nicht-monatlicher Positionen? | **ja** | `monthlyEquivalent(position, period)` / `sumMonthlyEquivalent(ds, period, filter)` in `src/lib/calc.ts` (ganzzahlige Cent × Fälligkeitsmonate ÷ 1200); `reserveNeeded` = nur nicht monatliche |
| Zentrale 12-Monats-Vorschau? | **ja** (nur Fixkosten-Summen) | `yearForecast(ds, today, 12)` in `src/lib/analytics.ts`, baut auf `dueItems`/`fixedCosts` auf. Für das Konto wird **nicht** `yearForecast` geändert, sondern direkt `dueItems` je Monat genutzt (Kontofilter, offen/abgehakt) |
| Geplante Änderungen in der Vorschau? | **ja** | `planForPeriod` liest je Monat den gültigen `history`-Eintrag; `dueItems` → `yearForecast`. Test: `src/lib/forecast.test.ts` „a position starting later / a dated change“ |
| Währungsformatierung zentral? | **ja** | `src/lib/format.ts`: `formatEUR`, `formatAvg`, `formatDelta`, `formatEURSet`, `formatCompactEUR` (fest `de-AT`/`EUR`). „€“ als Code-Literal außerhalb: 5 Dateien (`form.tsx`, `MonthCloseSheet.tsx`, `PaymentSheet.tsx` – Präfix im Eingabefeld; `Forecast.tsx` – 2 Regex zum Abschneiden; `fitText.ts` – Glyphenbreite). Rest nur Kommentare. **< 15 Dateien → kein STOPP**, CHF wird in diesem Sprint umgesetzt |
| Leerzustand / Onboarding? | **teilweise** | `needsSetup` + `SetupDialog` (Import oder leer), `EmptyCard` „Für … ist nichts fällig“ |
| Export-Schema mit Version? | **ja** | `BackupFile` in `src/db/backup.ts`: `{ format: 'fixkosten-backup', schemaVersion, exportedAt, data: {categories, positions, payments, oneOffs, monthClose, changeLog, reminders}, settings?: { monthStartDay } }`; `schemaVersion` = `SCHEMA_VERSION` (4), Import akzeptiert 2–4 und migriert über `src/db/migrations.ts` |

## STOPP-Prüfung

- Bestehende Berechnung ändern nötig? **Nein.** Alles Neue liegt in `src/lib/fixkostenkonto.ts` und ruft nur bestehende Funktionen (`monthlyEquivalent`, `dueItems`, `planForPeriod`, `isActiveInPeriod`, `countsFromNet`, `sumMoney`) auf. `calc.ts` und `analytics.ts` bleiben unverändert.
- Schemaänderung nicht additiv? **Nein.** Nur optionales Feld `Position.account`, Dexie v5 ohne Index-Änderung; Einstellungen im bestehenden `meta`-Store; Backup bekommt optionale `settings`-Felder.
- Währung verstreut (> 15 Dateien)? **Nein** (5 Dateien).

→ **Kein offener STOPP-Grund.** Weiter mit Phase 2.
