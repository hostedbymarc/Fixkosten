# Gehalt zum Planen

Branch `gehalt-zum-planen` gegen `main`. Rahmen: Datenbankname, Subdomain und Export-Format bleiben unverändert. Das neue Feld `planSalary` ist additiv und hat keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()`. Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Einstellung „Gehalt zum Planen“ im Bereich Gehalt, mit ⓘ | ✓ | `SettingsScreen.tsx` → `SalarySection`, `PlanSalaryField`. ⓘ: „Dein normales Netto ohne Sonderzahlungen. Lieber vorsichtig.“ |
| 1 Additives Feld, im Export, Import ohne Feld funktioniert | ✓ | `KontoSettings.planSalary`, gespeichert nur wenn gesetzt. Unit: Rundreise und Export/Import mit und ohne Feld. E2E „Sicherung“: Export enthält `planSalary`, Import ohne Feld → nicht gesetzt |
| 1 Fallback: eigener Eintrag > Gehalt zum Planen > zuletzt eingetragen | ✓ | Eine Funktion `plannedSalary()` in `salaryMonth.ts`, genutzt von Karte (`salaryView`) und Plan (`monthPlan`). Unit-Tests zur Reihenfolge |
| 1 Karte: „{Monat}-Gehalt“, Betrag gedämpft, „geplant · kommt am {Datum}“; Antippen öffnet die Eingabe | ✓ | `DeinMonatCard.tsx`. E2E in sechs Viewports hell und dunkel, Unterzeile einzeilig bis zum iPhone SE |
| 1 „Dein Plan“: „Ohne Eintrag geplant mit € X.“ und Zusatz „geplant“ | ✓ | `DeinPlanSheet.tsx`, `PlanMonth.estimated`. E2E: Wert setzen → Notiz und Zeilen sofort neu, ohne Neuladen |
| 1 Einmaliger Hinweis im aktiven Monat, solange nichts gesetzt ist | ✓ | „Leg dein Gehalt zum Planen fest ›“ öffnet die Einstellungen und fokussiert das Feld. Nach dem Antippen kommt er nicht wieder (`planSalaryHintSeen`). Mit gesetztem Wert gibt es ihn nicht |
| 2 Feld leeren und bestätigen löscht den Eintrag; Fallback greift sofort | ✓ | `SalaryEdit`. Unit und E2E |
| 2 Text-Button „Gehalt entfernen“, nur mit Eintrag | ✓ | Auf der Karte und im Monatsabschluss. E2E: ohne Eintrag kein Button; mit Eintrag entfernt er ihn |
| 2 € 0 bleibt ein bewusster Eintrag | ✓ | Unit und E2E: € 0,00 ohne „geplant“ |
| 3 „Dein Plan“ bei Maximum € 0: „{Monat} geht sich nicht aus. Dir fehlen € X.“, kein Button | ✓ | `data-kind="short"`. Ist das Maximum > 0, bleibt der bisherige Text mit Button (bestehende E2E unverändert grün) |
| 3 „Nächster großer Monat“: „Geht sich nicht aus. Dir fehlen € X.“, bei Erfolg wie bisher | ✓ | `BigMonthCard.tsx`. E2E: derselbe Betrag wie in „Dein Plan“ |
| 3 Betrag = größter Fehlbetrag im Plan-Zeitraum, aus `monthPlan()`, Unit-Test | ✓ | `MonthPlan.shortfall` / `shortfallOf()`. Unit-Tests |

## Regeln im Detail

- **Fehlbetrag:** Der Monat, dessen „frei für dich“ am weitesten unter dem Spielgeld liegt. Ohne Spielgeld zählt € 0 als Grenze. Grundlage ist der gewählte Plan, dieselbe Rechnung wie die Markierung in der Tabelle. Ohne Gehalt gibt es keinen Fehlbetrag.
- **Datum in der Unterzeile:** kurz („kommt am 25.11.“), damit die Zeile bis zum iPhone SE einzeilig bleibt. Ein Monat mit Eintrag zeigt wie bisher „kommt am 25. November“.
- **Einladung:** „Gehalt zum Planen“ allein zählt nicht als Einrichtung. Die Einladung zu „Fixkosten einplanen“ bleibt stehen.
- **Nebenbei behoben:** Das Einstellungsfeld folgt jetzt einem Import, auch nachdem du dort getippt hast. Nur solange das Feld den Fokus hat, bleibt dein getippter Text.

## Golden Test (neu)

Testdaten: `tests/fixtures/golden-month.ts`, alles erfunden. Monatsbeginn 25, heute 10. Dezember 2026. Jänner (künftig) hat keinen Eintrag, „Gehalt zum Planen“ ist € 3.500.

| | Jänner |
|---|---|
| Netto (geplant) | 3.500 statt bisher 4.000 (zuletzt eingetragen) |
| ① Rücklage | 600 |
| ② Direkt | 2.318 |
| ③ Vermögensaufbau | 350 |
| Vor Spielgeld frei | 3.500 − 600 − 2.318 − 350 = **232** |
| ④ Spielgeld | 300 |
| Überschuss | 232 − 300 = **−68** |
| „Dein Plan“ | Jänner 3.500 „geplant“, frei 232, unter dem Spielgeld. Fehlbetrag **€ 68** |

Dezember behält seinen Eintrag (€ 4.000) und alle Zahlen. Mit € 2.000 geplant geht sich nicht einmal € 0 Spielgeld aus. Dann gilt: „Jänner geht sich nicht aus. Dir fehlen € 1.568,00.“ (−1.268 frei plus 300 Spielgeld).

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `settings.salary.title` | Gehalt | 1 |
| `settings.planSalary` | Gehalt zum Planen | 3 |
| `settings.planSalary.info` | Dein normales Netto ohne Sonderzahlungen. Lieber vorsichtig. | 5 + 2 |
| `settings.planSalary.hint` | Gilt für Monate ohne eingetragenes Gehalt. | 6 |
| `month.planSalary.hint` | Leg dein Gehalt zum Planen fest › | 6 |
| `month.salary.planned` | geplant · kommt am {Datum} | 4 |
| `month.salary.remove` | Gehalt entfernen | 2 |
| `plan2.table.planned` | geplant | 1 |
| `plan2.planned` | Ohne Eintrag geplant mit € {X}. | 6 |
| `plan2.short` | {Monat} geht sich nicht aus. Dir fehlen € {Betrag}. | 6 + 4 |
| `big.short` | Geht sich nicht aus. Dir fehlen € {Betrag}. | 5 + 4 |

Gelöscht: `big.prepare` („Plane vor: {vorschlag}“) samt Vorschlagslogik in `BigMonthCard.tsx`. `docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Testergebnisse

TESTERGEBNISSE

## Screenshots

`docs/screenshots/gehalt-zum-planen/`: Dezember mit geplantem Gehalt und „Dein Plan“ mit Fehlbetrag. Sechs Viewports (iPhone SE, 15, Pro Max, iPad hoch/quer, Desktop 1440) in hell und dunkel.

## Merge

MERGE

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Es gibt keine Datenänderung beim Start und keinen Dexie-Sprung. Neu sind zwei optionale Einstellungsfelder (`planSalary`, `planSalaryHintSeen`). Sie werden nur gespeichert, wenn gesetzt. Ältere Sicherungen bleiben importierbar.

Nach dem Deploy:
- Ohne gesetztes „Gehalt zum Planen“ rechnet alles wie bisher mit dem zuletzt eingetragenen Gehalt.
- Künftige Monate ohne Eintrag zeigen „geplant · kommt am …“.
- Im aktiven Monat erscheint einmal der Hinweis „Leg dein Gehalt zum Planen fest ›“.
