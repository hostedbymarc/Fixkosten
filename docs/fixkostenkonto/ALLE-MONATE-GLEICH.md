# Alle Monate gleich

Branch `alle-monate-gleich` gegen `main`. Rahmen: Datenbankname, Subdomain und Export-Format bleiben unverändert. Es gibt kein neues Datenbankfeld und keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()`. Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

**Entscheidung (Rückfrage):** Die Karte „Dein Monat“ gibt es nur mit „Fixkosten einplanen“.
- Mit „Fixkosten einplanen“ zeigt jeder Monat die Karte; Hero, Netto- und VA-Kachel fallen dort weg. Ist das Einplanen noch nicht eingerichtet, steht die Einrichtungs-Karte da.
- Ohne „Fixkosten einplanen“ bleibt der Monatsbildschirm wie bisher. Hero, Netto- und VA-Kachel bleiben dafür im Code, denn ohne Plan gibt es kein ① und kein Spielgeld-Limit.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Eine Karte für alle Monate (vergangen, aktiv, künftig) | ✓ | `MonthScreen.tsx`: `verdichtet = konto.enabled` zeigt `DeinMonatCard` in jedem Monat. E2E `alle-monate-gleich.spec.ts`: Oktober, November und Dezember haben dieselbe DOM-Struktur, sechs Viewports in hell und dunkel |
| 1 Hero, Netto- und VA-Kachel weg (mit Einplanen) | ✓ | E2E: `hero`, `salary-tile`, `wealth-tile`, `free-tile`, `kpi-value` und `hero-sources` gibt es in keinem Monat. Gelöschte Komponenten siehe unten |
| 1 Kopf „{Monat}-Gehalt“ mit „ausgezahlt am“ / „kommt am“, Betrag antippbar | ✓ | `salaryWhen(period, start)`; Golden-Test „Kopf“ in allen drei Monaten. E2E: Gehalt im Dezember eintragen ändert den Überschuss sofort |
| 1 ①–④ aufklappbar, Rechnungen-Zeile und Konfetti am Kartenende | ✓ | E2E: Listensumme = Zeilenbetrag in jedem Monat; `dein-monat-bills` steht in jedem Monat |
| 1 „Nächstes Gehalt“ und „Nächster großer Monat“ nur im aktiven Monat | ✓ | E2E: `next-salary` und `big-month` gibt es nur bei `data-when="active"` |
| 2 ④ „Spielgeld“ = max(Limit, ausgegeben) mit Unterzeile, „drüber“ im Warn-Ton | ✓ | `monthCard.ts`; Golden-Test P1 (unter dem Limit), P2 (drüber), ohne Limit und „aus anderer Quelle“ |
| 2 „Überschuss in diesem Monat“ = Netto − ① − ② − ③ − ④, negativ mit Minus im Warn-Ton, „Vor Spielgeld frei“ | ✓ | Golden-Test „Überschuss“; E2E prüft die Überschuss-Gleichung im DOM; Kontrast-Test für `--hero-warn` |
| 3 Einmalzahlungen nach „Neuer Monat beginnt am“ | ✓ | `calc.oncePeriod`; Unit-Tests für den 24., 25., 31. und den Jahreswechsel; der Kauf am 27.11. zählt im Dezember (Golden) |
| 4 Künftige Monate: nur liegendes Konfetti, kein Eintrag in `celebratedMonths`; einmalige Bereinigung beim Start | ✓ | `celebrateLive(…, active)`, `cleanCelebrated()` in `App.tsx`. E2E: Abhaken im Dezember gibt 0 Live-Feiern, danach im aktiven November genau 1 |
| 5 Nächstes-Gehalt-Zeile einzeilig (iPhone SE/15) | ✓ | Kurzes Datum „25.11.“, `whitespace-nowrap`. E2E: kein Überlauf in allen Viewports |

## Rechenweg des Golden Tests

Testdaten: `tests/fixtures/golden-month.ts`, alles erfunden. Monatsbeginn 25, heute 10. Dezember 2026. Damit ist der Dezember aktiv (25.11.–24.12.), November vergangen und Januar künftig. Netto € 4.000, Spielgeld-Limit € 300.

| | P1 November (vergangen) | P2 Dezember (aktiv) | P3 Januar (künftig) |
|---|---|---|---|
| Kopf | Oktober-Gehalt, ausgezahlt am 25. Oktober | November-Gehalt, ausgezahlt am 25. November | Dezember-Gehalt, kommt am 25. Dezember (letztes Gehalt als Vorschlag, gedämpft) |
| Netto | 4.000 | 4.000 | 4.000 |
| ① Rücklage | 0 (keine Rechnung des Kontos, keine Überweisung) | 360 (Kfz-Versicherung, Plan) | 600 (Steuerberater, wie in „Dein Plan“) |
| ② Direkt bezahlt | 2.318 (14 Posten) | 2.333 | 2.318 |
| ③ Vermögensaufbau | 350 | 350 | 350 |
| Vor Spielgeld frei | 4.000 − 0 − 2.318 − 350 = **1.332** | 4.000 − 360 − 2.333 − 350 = **957** | 4.000 − 600 − 2.318 − 350 = **732** |
| ausgegeben | Konzert 120 | Fahrrad 450 + Jacke 80 (27.11.) = 530; Geschenk 200 aus anderer Quelle gedämpft | 0 |
| ④ Spielgeld = max(300, ausgegeben) | 300 (180 noch nicht ausgegeben) | 530 (230 drüber) | 300 (300 noch nicht ausgegeben) |
| **Überschuss** | 1.332 − 300 = **1.032** | 957 − 530 = **427** | 732 − 300 = **432** |

Weitere Fälle im Golden Test:
- Ohne Limit ist ④ = ausgegeben. November: 120, Überschuss 1.212, keine Pille.
- Mit Überweisung im vergangenen Monat (€ 50) ist ① = 50, mit der Zeile „Für später zur Seite“.
- Mit Monatsbeginn 1 zählt die Jacke im November: ausgegeben 200, ④ 300.
- „Dein Plan“ zeigt im aktiven und im künftigen Monat dieselben Werte für ①, ② und ③ wie die Karte.
- Positionen-Ø: 2.428 / 2.443.

## Regeln im Detail

- **① je Monat** (`transferOf`):
  - aktiver Monat: der gewählte Plan (`monthPlan.current`);
  - künftiger Monat: der Wert aus „Dein Plan“;
  - vergangener Monat: der überwiesene Betrag aus dem Monats-Check, sonst die Rechnungen des Kontos im Zeitraum.
- **④ Ausgleichszeile:** Unter dem Limit ergänzt „Noch nicht ausgegeben“ die Liste auf das Spielgeld. Diese Zeile zählt nicht als Posten.
- **Einmalzahlungen:** Sie gehören zum Zeitraum ihres Datums (`activeMonth(datum, start)`). Ein Haken, der noch unter dem alten Kalendermonat gespeichert ist, wandert mit in den neuen Zeitraum. Wiederkehrende Kosten behalten ihre Zuordnung.
- **Warn-Ton auf der grünen Karte:** `text-warn` war dort zu schwach. Deshalb gibt es den Token `--hero-warn`:
  - hell: `var(--butter-deep)`, dunkel: `var(--c-warn)`; nur bestehende Farben;
  - Kontrast ≥ 3:1 per Test geprüft;
  - die Unterzeile „… drüber“ ist ein Chip (`hero-chip pill-over`).

## Gelöschte Komponenten

- `HeroSources` („Woraus du bezahlst“) in `MonthScreen.tsx`
- `src/lib/heroSources.ts` und die zugehörigen Tests
- der Serien-Chip im erledigten Hero (`tile.streak`)
- die Texte `hero.src.*` (4 Schlüssel), `tile.streak` und `month.unplanned.other`
- mit Einplanen: Hero, Netto- und VA-Kachel sowie Frei-/KPI-Kachel in jedem Monat (vorher nur im aktiven Monat)

`HeroCard`, `SalaryTile` und `WealthTile` bleiben für den Modus ohne „Fixkosten einplanen“ im Code. So wurde es in der Rückfrage entschieden.

## Neue und geänderte Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `month.free` | Überschuss in diesem Monat | 4 |
| `month.unplanned` | Spielgeld | 1 |
| `month.spielgeld.spent` | € {betrag} von € {limit} ausgegeben | 4 |
| `month.spielgeld.over` | € {betrag} ausgegeben · € {over} drüber | 4 |
| `month.spielgeld.none` | Kein Spielgeld festgelegt | 3 |
| `month.list.rest` | Noch nicht ausgegeben | 3 |
| Nächstes Gehalt (Datum kurz) | November-Gehalt · kommt am 25.11. · Plan ansehen › | 7 |

`docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Testergebnisse

TESTERGEBNISSE

## Screenshots

`docs/screenshots/alle-monate-gleich/`: Oktober, November und Dezember, jeweils „zu“ und „auf“. Sechs Viewports (iPhone SE, 15, Pro Max, iPad hoch/quer, Desktop 1440) in hell und dunkel.

## Merge

MERGE

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Beim ersten Start entfernt die App einmalig die `celebratedMonths`-Einträge nach dem aktiven Monat. Das ist die einzige Datenänderung; es gibt kein neues Feld und keinen Dexie-Sprung. Ein Backup bleibt importierbar.
