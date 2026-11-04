# Abgleich Prompt A (PR #39) · Punkt · erledigt · Beleg

Stand: Branch `claude/fixkostenkonto-sprint-kiayqr` (PR #39), nach der Umsetzung von F1 über 12 Monate.

> Branch: Der Auftrag nennt `feature-fixkostenkonto`. Diese Session darf nur auf `claude/fixkostenkonto-sprint-kiayqr` pushen; das ist der Branch von PR #39.

## 0 · Was sich nicht ändern darf

| Punkt | erledigt | Beleg |
|---|---|---|
| Netlify-Subdomain, DB-Name, Service-Worker-Scope, `start_url` | ✅ | `netlify.toml` und `public/manifest.webmanifest` gegenüber `main` unverändert. DB-Name `'fixkosten'` (`src/db/db.ts:183`). Einen Service Worker gibt es nicht. |
| Bestehende Berechnungen exakt gleich, neue Features nutzen sie | ✅ | `src/lib/calc.ts`, `analytics.ts`, `period.ts` gegenüber `main` unverändert. Golden-Datei `tests/regression/kennzahlen-vor-fixkostenkonto.json` aus `main` 9a97477, 4 Datensätze identisch. `standingOrder` nutzt `monthlyEquivalent`, die Simulation nutzt `dueItems`/`planForPeriod`. |
| Schema nur additiv, Versionssprung + Migration | ✅ | Dexie v5 mit optionalem `account` (`db.ts:191`, `migrateToV5`). Test `v5.test.ts` „Migration v4 → v5“, „v1 → v5“. |
| Import alter `fixkosten-*.json` / `erbse-*.json` | ✅ | `v5.test.ts`: „alte fixkosten-*.json (v2 …)“, „erbse-*.json (v4 …)“ |
| Bestehende Installation: gleiche Screens + eine Einladungskarte; leere Installation: Modus sofort an | ✅ | `KontoInvite` (`KontoTile.tsx`). E2E `fixkostenkonto.spec.ts` „bestehende Installation …“; `v5.test.ts` „Leer starten: Modus sofort an“ |
| Design: Token, `.glass`, `<Pea>`, keine Hex-Werte | ✅ | `check-colors` im Build |
| Nicht im Sprint (Paar-Modus, CSV, Bezahlung, Bank) | ✅ | nichts davon gebaut |

## Phase 1 · Bestandsaufnahme

| Punkt | erledigt | Beleg |
|---|---|---|
| Tabelle F1–F5 (Status, Belege, was fehlt, Aufwand, Schema) | ✅ | `docs/fixkostenkonto/BESTANDSAUFNAHME.md`, PR #39 |
| 5 Voraussetzungen mit Beleg | ✅ | dort, Abschnitt „Voraussetzungen“ |
| STOPP-Prüfung | ✅ | kein STOPP-Grund („€“ stand nur in 5 Dateien) |

## Phase 2 · Features

| Punkt | erledigt | Beleg |
|---|---|---|
| **F4** Feld `account` (`fixkostenkonto` / `girokonto`), optional | ✅ | `Position.account` (`types.ts`), `accountOf` |
| F4 Standard: Vermögensaufbau → Girokonto, sonst Fixkostenkonto; „nicht vom Netto“ zählt nicht | ✅ | `defaultAccount`, `onKonto` (`fixkostenkonto.ts`); Tests „Vermögensaufbau (Girokonto) und nicht vom Netto zählen nicht“, „accountOf …“ |
| F4 Segment im Bearbeiten-Dialog, Chip nur bei Girokonto | ✅ | `PositionFormSheet` (`account-field`), `PositionsScreen` (`account-chip`); im UI „Alltagskonto“ (Tooltip-Nachtrag) |
| **F1** D aus den Monatsanteilen (÷1/3/6/12), mit den vorhandenen Funktionen | ✅ | `standingOrder()` summiert über `dueItems`, dieselbe Quelle wie die Simulation. Ohne Änderungen im Zeitraum = Σ `monthlyEquivalent`: Tests „Monatsanteil …“, „ohne Änderungen = Summe der heutigen Monatsanteile“ |
| F1 Aufrunden auf 1 / 5 / 10 €, Standard 5 € | ✅ | `DEFAULT_ROUNDING = 5`; Test „Rundung nach oben auf 1 / 5 / 10 €“ |
| F1 Kachel „Dauerauftrag € X / Monat“, Tippen öffnet Sheet | ✅ | `KontoTile`, `KontoSheet`; E2E |
| **F1 „über die nächsten 12 Monate“** | ✅ | D = Σ aller Fixkostenkonto-Abbuchungen der 12 Monate ab dem Folgemonat ÷ 12, aufgerundet (`standingOrder`, `orderWindow`). Enthalten: startende und endende Positionen, geplante Änderungen, einmalige Zahlungen und Einmalbeträge; übersprungene Monate zählen nicht. Tests: „Zeitraum: die 12 Monate ab dem Folgemonat“, „geplante Preiserhöhung“ (1.000 → 1.100 ab 03/2027: D = € 1.075, keine Lücke), „geplante Senkung“, „startende Position“, „auslaufende Position“, „einmalige Zahlungen im Zeitraum anteilig“, „übersprungener Monat zählt nicht“, Live-Fixture „Abbuchungen Dezember 2026 – November 2027 ÷ 12“ |
| F1 Hinweiszeile zur größten Ursache | ✅ | `order.cause` (Änderung, Start, Ende, einmalig; ab 1 € pro Monat) → Zeile `konto-order-cause` im Sheet, z. B. „Mehr, weil Miete ab März 2027 € 1.100 kostet.“ Tests: „größte Ursache gewinnt …“ und die Fälle oben. E2E prüft die Zeile, ohne Zeile gilt D = Ø pro Monat. |
| **F2** Eingaben „Kontostand heute“ und „schon eingegangen?“ in den Einstellungen | ✅ | `KontoInputs` (Einstellungen und Sheet) |
| F2 Simulation 12 Monate ab dem aktiven Monat; Einzahlung vor Abbuchungen (sichtbar); diesen Monat nur offene | ✅ | `simulateKonto`; `KONTO_ASSUMPTION` im ⓘ „Kontostand am Monatsende“ (Tooltip-Nachtrag); Test „diesen Monat zählen nur offene Positionen“ |
| F2 wiederkehrend + einmalig auf dem Fixkostenkonto, inkl. geplanter Änderungen | ✅ | Tests „einmalige Zahlung … erzeugt eine Startlücke“, „geplante Preiserhöhung im Zeitraum“ |
| F2 Startlücke = max(0, −Minimum), Texte „Damit dein Konto …“ / „Dein Konto ist gedeckt.“ | ✅ | `GapMessage`; Tests „Jahreszahlung diesen Monat offen“ u. a. |
| **F3** Liniendiagramm im Sheet und in der Analyse | ✅ | `KontoChart`, `KontoSection` |
| F3 unter 0 rot mit Vorzeichen und Icon | ✅ | `BalanceDot` („!“), `SignedBalance` (Alert-Icon, −) |
| F3 Tippen zeigt Einzahlung, Abbuchungen, Stand | ✅ | `MonthBreakdown`; E2E „tap on a month“ |
| F3 Hinweis bei starkem Anstieg | ✅ | `RisingHint`; Test „Hinweis steigt stark“ |
| **F5** nur bei leerer DB; Land mit Standard aus `navigator.language` | ✅ | `SetupDialog`, `countryFromLanguage` |
| F5 Vorlagen je Land, Rhythmus/Kategorie vorbelegt, Betrag immer leer | ✅ | `templates.ts`; Test „Vorlagen je Land …, Betrag nie“; E2E prüft leeres Feld und gesperrtes „Fertig“ |
| F5 Land in den Einstellungen änderbar; CH = CHF `de-CH`, AT `de-AT`, DE `de-DE` | ✅ | `CountrySection`, `country.ts`, `format-country.test.ts` |
| F5 danach Monats-Screen mit Kachel | ✅ | E2E „Onboarding AT/DE/CH“ |
| Einladungskarte „Neu: Fixkostenkonto …“, Aktivieren / Später | ✅ | `KontoInvite`; E2E „Später: Karte weg …“ |

## Tests

| Punkt | erledigt | Beleg |
|---|---|---|
| Unit-Tests der Rechnung (alle 11 geforderten Fälle) | ✅ | `src/lib/fixkostenkonto.test.ts`, 30 Tests (davon 6 neu für F1 über 12 Monate) |
| Regressionstest aller Kennzahlen vorher/nachher | ✅ | `tests/regression/`, `src/regression` |
| Migrationstest | ✅ | `v5.test.ts` |
| Import-Tests alt + Export → Import identisch | ✅ | `v5.test.ts` |

## Verifikation

| Punkt | erledigt | Beleg |
|---|---|---|
| Alle bestehenden Tests grün, Änderungen nur wie freigegeben | ✅ | Freigegeben: Versionszahlen 4 → 5 in 11 Tests, `upgrade-v4` ohne `account` im Vergleich, zwei Hinweistexte im ⓘ. Sonst ist kein bestehender Test geändert. Ausnahme `fullpage` „Monat November“: schlägt auf `main` genauso fehl, siehe unten. |
| Neue Unit-/Regressions-/Migrations-/Import-Tests grün | ✅ | 762/762 |
| Bestandsaufnahme im PR, kein offener STOPP | ✅ | PR #39 |
| grep Hex / „€“ | ✅ | `check-colors`; „€“ nur in `format.ts` |
| `pnpm build` | ✅ | |
| Playwright 5 Viewports | ✅ | Gesamtlauf auf `d4d8539` (6 Chromium-Projekte): 1337 ✅, 1 ❌. Rot nur `fullpage` „Monat November“ Pro Max hell, schon auf `main` rot. |
| Screenshots im PR | ✅ | `docs/screenshots/fixkostenkonto/` (140) |
| Netlify Deploy Preview | ✅ | deploy-preview-39 |
| WebKit | – | nicht gefordert; in der Umgebung nicht installiert. Manuell auf dem iPhone (Safari) prüfen. |
| Merge-SHA ausgeben | ✅ | `46433c0a1d20860eca6f45327f258b47886b01c8` (Squash nach `main`, 4. 11. 2026) |

## Bekannt auf `main`: `fullpage` „Monat November“

Dieser Test ist schon auf `main` (`9a97477`) wackelig. Er kommt nicht aus #39 und wurde nicht angefasst.
- Auf `main`: 2 von 8 Läufen rot (iPhone 15 dunkel 0,2356; iPhone Pro Max hell 0,2132).
- Auf #39: dieselben Werte.
