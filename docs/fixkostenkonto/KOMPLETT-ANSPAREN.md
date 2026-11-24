# Komplett ansparen

Branch `komplett-ansparen` gegen `main`. Rahmen: Datenbankname, Subdomain und Export-Format bleiben unverändert. Das neue Feld ist additiv in `saving` und hat keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()`. Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 „ändern“: „Komplett vom {Monat}-Gehalt“ (Gehälter vom nächsten bis zum Fälligkeitsmonat) | ✓ | `DeinPlanSheet.tsx` → `PaymentEditor`. E2E: Option wählen → Dezember-① und Februar-① sofort |
| 1 „Teilbetrag vom {Monat}-Gehalt: € …“, Rest folgt der Plan-Art | ✓ | Rest bei Fälligkeit („Eigener Plan“ zahlt alles andere bei Fälligkeit). Unit und E2E |
| 1 Additiv in `saving`: `mode 'once'`, `salaryMonth`, optional `amount` (Cent) | ✓ | `types.ts` `SavingSetting`. Bestehende Modi unverändert. Unit: Export/Import mit und ohne Feld |
| 1 `monthPlan()`: Betrag in ① des gewählten Gehalts; Fälligkeitsmonat „aus Rücklage“, vom Gehalt nur der Rest | ✓ | `core()`: `fromSalary`, `atDue`. Golden Test |
| 2 ① aufgeklappt: „{Name} · fällig {Monat}“ / „{Name} · für {Monat}“, „(€ X schon angespart)“, Summe = ① | ✓ | `PlanMonth.lines` → `monthCard` → `ItemLine`. Unit: Summe = Liste in allen Monaten, mit und ohne Rundung |
| 2 Fälligkeitsmonat: unter ① gedämpft „€ X aus Rücklage“ | ✓ | `PlanMonth.fromReserve`, `dein-monat-transfer-note`. E2E |
| 2 Untertitel „komplett vom {Monat}-Gehalt“ / „€ X vom {Monat}-Gehalt, Rest bei Fälligkeit“ | ✓ | `stateText()`. E2E |
| 2 „Nächster großer Monat“: voll angespart → „✓ Schon angespart“ | ✓ | `BigMonth.saved`. Unit und E2E |
| 3 „Nächster großer Monat“ im aktiven und in künftigen Monaten, ab dem angezeigten Monat; nicht in vergangenen | ✓ | `bigMonthFrom()`, `MonthScreen` → `BigMonthSlot`. Unit und E2E (Oktober nein, Dezember → Februar) |
| 4 ④ ohne Unterzeile in allen Monaten; Liste bleibt; Warnzeile bleibt | ✓ | `DeinMonatCard.tsx`. Texte `month.spielgeld.*` gelöscht. E2E in drei Monaten; bestehende E2E angepasst |

## Regeln im Detail

- **Welches Vorkommen:** `once` gilt für die erste Fälligkeit ab dem gewählten Gehalt. Spätere Fälligkeiten derselben Position zahlst du bei Fälligkeit.
- **Gehalt vor dem Plan:** zählt im ersten Gehalt des Plans. Ein Teilbetrag über der Zahlung zählt höchstens mit ihrem Betrag.
- **Schon Angespartes** (Kontostand) geht wie bisher zuerst an die nächsten großen Zahlungen. „Komplett“ nimmt vom Gehalt nur, was dann noch fehlt.
- **Plan-Art:** Die Auswahl macht den Plan zu „Eigener Plan“, wie „Ansparen ab“. Mit „Bei Fälligkeit“ oder „Gleichmäßig“ oben im Schalter gilt wieder die ganze Plan-Art.
- **① bei „Gleichmäßig“:** bleibt wie bisher (Rechnungen plus „Für später zur Seite“ / „Aus dem Angesparten“). Der Dauerauftrag besteht nicht aus einzelnen Posten.
- **Rundung:** Rundet „Fixkosten einplanen“ auf, bringt „Für später zur Seite“ die Liste auf ①.
- **„Schon angespart“ und Fehlbetrag:** Fehlt im Plan Geld, steht wie bisher „Geht sich nicht aus. Dir fehlen € X.“. „✓ Schon angespart“ nur, wenn nichts fehlt.

## Golden Test (neu)

Testdaten: `tests/fixtures/golden-month.ts` plus eine erfundene jährliche Zahlung „Kfz-Steuer“ € 240 im März (aktiv + 3). Monatsbeginn 25, heute 10. Dezember 2026. Komplett vom aktiven Gehalt (November-Gehalt, Zeitraum Dezember).

| | Dezember (aktiv) | März |
|---|---|---|
| ① vorher | 360 | 240 |
| ① nachher | 360 + 240 = **600** | **0** („fällig März € 0,00 (€ 240,00 schon angespart)“) |
| aus Rücklage | – | **€ 240** |
| Vor Spielgeld frei | 957 → 717 | 1.062 → 1.302 |
| Überschuss | 427 → **187** | 762 → **1.002** |

Jänner und Februar bleiben unverändert. „Dein Plan“ zeigt dieselben Beträge.

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `plan2.pay.onceAll` + Auswahl | Komplett vom {Monat}-Gehalt | 3 |
| `plan2.pay.oncePartLabel` + Auswahl + Betrag | Teilbetrag vom {Monat}-Gehalt: € … | 4 |
| `plan2.pay.once` | komplett vom {Monat}-Gehalt | 3 |
| `plan2.pay.oncePart` | € {X} vom {Monat}-Gehalt, Rest bei Fälligkeit | 6 |
| `plan2.pay.salary` (Bedienhilfe) | Von welchem Gehalt? | 3 |
| `plan2.pay.partAmount` (Bedienhilfe) | Teilbetrag | 1 |
| `month.list.due` | {Name} · fällig {Monat} | 3 |
| `month.list.for` | {Name} · für {Monat} | 3 |
| `month.list.saved` | (€ {X} schon angespart) | 3 |
| `month.fromReserve` | € {X} aus Rücklage | 3 |
| `big.saved` | ✓ Schon angespart | 2 |

Gelöscht: `month.spielgeld.spent` („€ X von € L ausgegeben“), `month.spielgeld.over` („€ X ausgegeben · € Y drüber“), `month.spielgeld.none` („Kein Spielgeld festgelegt“). `docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Testergebnisse

Alles nach der letzten Code-Änderung (ae6a024):

| Lauf | Ergebnis |
|---|---|
| Unit (vitest) | 1423 bestanden, davon neu `komplett-ansparen.test.ts` plus ein neuer Golden-Fall |
| `tsc -b` | sauber |
| E2E desktop (5 Teile) | 585 bestanden |
| E2E iphone-15 | 269 bestanden |
| E2E iphone-pro-max | 241 bestanden |
| E2E ipad-portrait | 257 bestanden |
| E2E ipad-landscape | 245 bestanden |
| perf | 3 bestanden |
| perf-feier | 2 bestanden |
| WebKit (komplett-ansparen, alle-monate-gleich, monat-verdichtet, monat-ist-monat, spielgeld-pille-rechenfehler, gehalt-zum-planen, monat-feinschliff) | 108 bestanden |

Es gab keine Fehler und keine Wiederholungen.

## Screenshots

`docs/screenshots/komplett-ansparen/`: „Dein Plan“ mit der Auswahl, Dezember mit „Steuerberater · für Februar“, Februar mit „aus Rücklage“, „Nächster großer Monat“ mit „Schon angespart“. Sechs Viewports in hell und dunkel.

## Merge

Per Squash nach `main`, sobald alles grün ist. Den SHA meldet der Abschlussbericht.

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Es gibt keine Datenänderung beim Start und keinen Dexie-Sprung. Neu ist nur ein weiterer Wert in `saving` der Positionen. Er wird nur gespeichert, wenn du ihn wählst. Ältere Sicherungen bleiben importierbar.

Nach dem Deploy:
- ① zeigt aufgeklappt in „Bei Fälligkeit“ und „Eigener Plan“ die neuen Zeilen.
- ④ hat keine Unterzeile mehr.
- „Nächster großer Monat“ erscheint auch in künftigen Monaten.
