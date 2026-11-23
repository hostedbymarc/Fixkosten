# Spielgeld-Pille und Rechenfehler

Branch `spielgeld-pille-rechenfehler` gegen `main`. Rahmen: Datenbankname, Subdomain und Export-Format bleiben unverändert. Es gibt kein neues Datenbankfeld und keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()`. Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Pille „Spielgeld: … übrig / drüber“ weg, in allen Monaten; Texte und Komponente gelöscht | ✓ | `DeinMonatCard.tsx` ohne Pille; `month.pill.*` gelöscht. E2E: `dein-monat-pill` gibt es in Oktober, November und Dezember nicht, in sechs Viewports hell und dunkel |
| 1 Nur über dem Limit: gedämpfte Zeile „Spielgeld € X drüber“ unter „Vor Spielgeld frei“ im Warn-Token | ✓ | `dein-monat-over` mit `.hero-warn`. E2E: nur im Dezember (€ 150 von € 100), unterhalb von „Vor Spielgeld frei“; in Oktober und November keine Zeile |
| 1 ④ mit Unterzeile und Liste unverändert | ✓ | E2E: „€ 150,00 ausgegeben · € 50,00 drüber“ im Warn-Chip wie bisher |
| 2 Abhaken ändert ①–④, „Vor Spielgeld frei“ und Überschuss nicht | ✓ | `kontoBalance.planBalance`, `monthPlan`. Nachgestellt auf `main` und behoben (siehe unten). Golden-Test, Property-Test, E2E |
| 3 Cent gehen verloren | ✓ (kein Rechenfehler) | Ursache: der Betrag von Netlify wurde im Positionen-Tab auf € 8 geändert (siehe unten). Alle Rechnungen laufen schon in ganzzahligen Cent, jetzt per Test belegt |
| 4 Golden-Test mit Cent, drei Abhak-Zustände je Monat | ✓ | `spielgeld-pille-rechenfehler.test.ts`: 9 Fälle (3 Monate × nichts / teilweise / alles) |
| 4 Property-Test: 200 zufällige Abhak-Zustände pro Monat | ✓ | 200 je Monat bei „Bei Fälligkeit“ (mit und ohne Überweisung des Monats); zusätzlich je 60 bei „Gleichmäßig“, „Eigener Plan“ und mit Rundung |
| 4 Jede aufgeklappte Liste = Zeilenbetrag auf den Cent | ✓ | In allen drei Monaten, in jedem Zustand des Property-Tests |

## Ursache Bug 2: Abhaken änderte ①

Der Kontostand und der Plan zählten eine abgehakte Rechnung doppelt.

- Der erwartete Kontostand zieht jede Rechnung ab, sobald sie abgehakt ist („Kontostand plus seither bezahlte Rechnungen“, aus #53).
- Der Plan zählte dieselbe Rechnung in ihrem Monat trotzdem weiter. Nur im aktiven Monat zählten bloß die offenen.
- Ein Haken im künftigen Monat nahm also Geld vom Angesparten weg. Die Rechnung blieb aber im Plan. Das Angesparte reichte für weniger, ① stieg um den angesparten Betrag.

Nachgestellt auf `main` mit dem Golden-Datensatz (€ 500 angespart, Dezember aktiv):

| | ① Dezember | ① Jänner | Überschuss Jänner |
|---|---|---|---|
| nichts abgehakt | 18,36 | 601,81 | 422,16 |
| Steuerberater und Kammerbeitrag im Jänner abgehakt | **378,36** | **741,81** | **282,16** |

**Fix:** Der Plan hängt nicht mehr am Bezahlt-Status.
- `monthPlan` zählt jede Rechnung des Kontos in ihrem Monat, abgehakt oder nicht.
- Er startet von `planBalance`: Stichtag-Betrag plus bestätigte Überweisungen, minus jede Rechnung des Kontos, die nach dem Stichtag in einem früheren Monat fällig war, abgehakt oder nicht.
- Damit ändert auch ein Haken im vergangenen Monat nichts mehr. Eine offene Rechnung aus dem Vormonat zählt jetzt wie eine bezahlte.
- Der angezeigte Kontostand („Schon zur Seite gelegt“, Monats-Check) bleibt der echte. Er rechnet weiter mit den Haken.
- Gilt für alle drei Planarten: „Bei Fälligkeit“, „Gleichmäßig“ und „Eigener Plan“.

## Ursache Bug 3: Cent

Kein Rechenfehler. Netlify wurde im Positionen-Tab von € 8,03 auf € 8 geändert. Eine Betragsänderung gilt ab dem gewählten Monat. Frühere Monate behalten den alten Betrag. Deshalb zeigten künftige Monate ② ohne Cent, die frühere Hero-Ansicht des aktiven Monats noch mit Cent.

Geprüft und per Test belegt:
- Alle Summen der Karte laufen in ganzzahligen Cent: `monthCard`, `monthPlan`, `calc.monthItems`, `salaryParts`. Gerundet wird nur bei der Anzeige.
- Ein Posten mit Cent (€ 8,03) steht in jedem Monat mit Cent in ②: Unit, E2E und Pixel-Messung auf dem iPhone SE, kein Abschneiden.
- Einzige gewollte Rundung: ① bei „Monatsbetrag runden“. Die Differenz steht dann als „Für später zur Seite“ in der Liste.

## Rechenweg der neuen Golden-Test-Fälle

Testdaten: `goldenCentDataset()` in `tests/fixtures/golden-month.ts`, alles erfunden. Wie der bisherige Golden-Datensatz, dazu:
- Parkplatz € 8,03 monatlich, direkt (②);
- Rundfunk € 18,36 monatlich, Rücklage (①);
- Kammerbeitrag € 123,45 jährlich im Jänner, Rücklage (①);
- Einmalzahlungen „nicht eingeplant“: Kino € 12,49 (November), Kaffee € 4,51 (Dezember), Buch € 23,99 (Jänner).

Monatsbeginn 25, heute 10. Dezember 2026, Netto € 4.000, Spielgeld € 300, Stichtag 20. Oktober mit € 500.

**Angespart für den Plan:** 500 − Rundfunk November 18,36 = 481,64. Verteilt nach Datum, bei gleichem Tag der größere Betrag zuerst: Kfz-Versicherung (Dezember) 360, Steuerberater 121,64, Kammerbeitrag 0.

| | November (vergangen) | Dezember (aktiv) | Jänner (künftig) |
|---|---|---|---|
| ① | 18,36 (Rundfunk) | 18,36 + 360 − 360 = **18,36** | 18,36 + 600 − 121,64 + 123,45 = **620,17** |
| ② | 2.318 + 8,03 = **2.326,03** | 2.333 + 8,03 = **2.341,03** | 2.318 + 8,03 = **2.326,03** |
| ③ | 350 | 350 | 350 |
| Vor Spielgeld frei | 4.000 − 18,36 − 2.326,03 − 350 = **1.305,61** | 4.000 − 18,36 − 2.341,03 − 350 = **1.290,61** | 4.000 − 620,17 − 2.326,03 − 350 = **703,80** |
| ausgegeben | 120 + 12,49 = 132,49 | 450 + 80 + 4,51 = 534,51 | 23,99 |
| ④ = max(300, ausgegeben) | 300 | 534,51 | 300 |
| **Überschuss** | **1.005,61** | **756,10** | **403,80** |

Diese Zahlen gelten in jedem Abhak-Zustand: nichts, teilweise (jeder zweite Posten), alles, und in 200 zufälligen Zuständen je Monat. Auch Haken in den anderen beiden Monaten ändern nichts.

## Gelöschte Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `month.pill.rest` | Spielgeld: {betrag} von {limit} · {rest} übrig | 6 |
| `month.pill.over` | Spielgeld: {betrag} von {limit} · {over} drüber | 6 |
| `month.pill.none` | Spielgeld festlegen | 2 |

Gelöscht ist auch die Pille selbst (Button `dein-monat-pill` in `DeinMonatCard.tsx`). Das Spielgeld setzt du jetzt in „Dein Plan“ (über „Plan ansehen“).

## Neuer Text

| Schlüssel | Text | Wörter |
|---|---|---|
| `month.over` | Spielgeld {betrag} drüber | 3 |

`docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Testergebnisse

TESTERGEBNISSE

## Screenshots

`docs/screenshots/spielgeld-pille-rechenfehler/`: Dezember mit der Zeile „drüber“. Sechs Viewports (iPhone SE, 15, Pro Max, iPad hoch/quer, Desktop 1440) in hell und dunkel.

## Merge

MERGE

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Es gibt keine Datenänderung, kein neues Feld und keinen Dexie-Sprung.

Nach dem Deploy kann ① in künftigen Monaten anders aussehen als vorher, in zwei Fällen:
- Es waren schon Rechnungen künftiger Monate abgehakt. Dann sinkt ① auf den richtigen Wert.
- Eine Rechnung aus einem früheren Monat nach dem Stichtag war noch offen. Dann steigt ① um diesen Betrag.

Der angezeigte Kontostand bleibt gleich.
