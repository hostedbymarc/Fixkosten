# Plan-Optionen

Branch `plan-optionen` gegen `main`. Rahmen: Datenbankname, Subdomain und Export-Format bleiben unverändert. Die neuen Felder sind additiv (`saving` und eine Einstellung) und haben keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()`. Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 „ändern“: „Aufteilen: vom {Monat}- bis {Monat}-Gehalt“, gleiche Raten, Cent-Rest auf die erste Rate, nur Gehälter bis zum Fälligkeitsmonat | ✓ | `DeinPlanSheet.tsx` → `PaymentEditor`. `monthPlan.ts` → `core()`, Modus `range`. Unit: 2 × € 120; € 100 auf 3 = 33,34 + 33,33 + 33,33; Grenzen |
| 1 Additiv in `saving`: `mode 'range'`, `fromSalaryMonth`, `toSalaryMonth`; bestehende Modi unverändert | ✓ | `types.ts` `SavingSetting`. Unit: Wechsel range → once → spread → due mit gleicher Plansumme. Export/Import mit und ohne Feld |
| 1 Untertitel „aufgeteilt vom {Monat}- bis {Monat}-Gehalt“ | ✓ | `stateText()`. E2E |
| 2 Vorschau im Editor, live je Option: betroffene Monate „Überschuss vorher → nachher“, höchstens 4 Zeilen, gedämpft, Verschlechterung im Warn-Token | ✓ | `plan-preview`. Rechnet `monthPlan()` mit der Auswahl als „Eigener Plan“ und liest die Monatskarten. E2E: Werte und Farbe |
| 2 Erst „Übernehmen“ speichert | ✓ | `plan-payment-apply`. E2E: vor „Übernehmen“ unverändert. Unit: Vorschau = Werte nach dem Speichern (5 Optionen) |
| 3 „Deine nächsten Gehälter“: Monat (+ „geplant“) · zur Seite · Überschuss; Überschuss = großer Betrag der Monatskarte | ✓ | `planRows()` in `monthCard.ts` liest je Zeile `monthCard()`. Unit: Tabelle = Karte für 12 Monate in drei Plänen |
| 3 Zeile antippen → springt zu diesem Monat | ✓ | `PlanHost` → `onJump`. E2E: „Jän 27“ antippen → Jänner, Überschuss der Karte = Zeile |
| 3 Monate außerhalb des aktuellen Jahres mit Jahreszahl („Okt 27“) | ✓ | `rowMonth()`. E2E |
| 4 Rot nur bei „Vor Spielgeld“ < 0: „{Monat Jahr} geht sich nicht aus. Dir fehlen € X.“, erster solcher Monat | ✓ | `planStatus()`. Unit. E2E „Gehalt zum Planen“ |
| 4 Nur Spielgeld nicht gedeckt: gedämpft im Warn-Token „Ab {Monat} reicht dein Gehalt zum Planen nicht fürs volle Spielgeld.“ | ✓ | `planStatus()` `spielgeld`. Unit und E2E |
| 4 Sonst grün wie bisher | ✓ | `plan2.ok`. E2E unverändert grün |
| 4 „Nächster großer Monat“ mit derselben Logik für seinen Monat | ✓ | `monthLevel()` in `BigMonthCard.tsx`. Unit. E2E: Stufe = Stufe seiner Zeile in „Dein Plan“ |
| 5 Schalter „Überschuss als Polster mitnehmen“ mit ⓘ „Nur einschalten, wenn du Überschüsse liegen lässt.“, Standard aus | ✓ | `SwitchField` in „Dein Plan“. `KontoSettings.cushion`, nur gespeichert, wenn an |
| 5 An: Spalte „Polster“ = laufende Summe; Meldung „Dein Polster reicht bis {Monat Jahr}.“ bzw. „Reicht für alle 12 Monate.“ | ✓ | `PlanRow.cushion`, `planStatus(rows, true)`. Unit. E2E: Summe je Zeile |
| 5 Aus: alles wie in Punkt 3–4; Einstellung additiv, im Export | ✓ | E2E an/aus. Unit und E2E: Export/Import mit und ohne Feld |

## Regeln im Detail

- **Aufteilen, welches Vorkommen:** Wie „Komplett“ gilt `range` für die erste Fälligkeit ab dem Von-Gehalt. Spätere zahlst du bei Fälligkeit. Ein Von-Gehalt vor dem Plan zählt ab dem ersten Gehalt. Ein Bis-Gehalt nach der Fälligkeit endet im Fälligkeitsmonat.
- **Bis zum Fälligkeitsmonat:** Endet die Aufteilung im Fälligkeitsmonat, zahlt dieser seine Rate. Der Rest kommt „aus Rücklage“.
- **Von = Bis:** Der Untertitel lautet dann „komplett vom {Monat}-Gehalt“.
- **Plan-Art:** Wie bei „Komplett“ wird der Plan zu „Eigener Plan“. Die Vorschau rechnet genau so.
- **Vorschau:** Sie zeigt die gewählte Option, live bei jeder Änderung. Sie listet Monate, deren Überschuss sich ändert, höchstens vier.
- **Spaltenkopf:** „zur Seite“ ohne eigenes Konto, „aufs Konto“ mit eigenem Konto, wie bisher. Der Wert ist ① der Monatskarte.
- **Monatsnamen:** Im Jahr des aktiven Monats kurz („Dez“), sonst mit Jahr („Jän 27“).
- **Polster:** Er summiert ab der ersten Zeile der Tabelle, also ab dem nächsten Gehalt. Das ist der aktive Monat, solange seine Einzahlung offen ist. „Reicht bis“ nennt den Monat vor dem ersten negativen Polster. Rot ist es, wenn der Polster dort auch ohne das Spielgeld des Monats nicht reicht. Ist schon der erste Monat negativ, gelten die zwei Stufen wie ohne Polster.
- **Polster ohne Spielgeld:** Die Meldung zeigt den Polster statt „Leg dein Spielgeld fest“.
- **Vorschläge bleiben:** „Spar ab …“ mit „Übernehmen“ und „Spielgeld auf € X setzen“ stehen weiter unter der Meldung.
- **„Nächster großer Monat“:** Er rechnet ohne Polster, nur mit seinem Monat. Ohne Gehalt gilt er als vorbereitet.

## Golden Test (neu)

Testdaten: `tests/fixtures/golden-month.ts` plus eine erfundene jährliche Zahlung „Kfz-Steuer“ € 240 im März (aktiv + 3). Monatsbeginn 25, heute 10. Dezember 2026. Aufgeteilt vom November- bis Dezember-Gehalt (Zeiträume Dezember und Jänner, Gehalt 0 und +1).

| | Dezember (aktiv) | Jänner | Februar | März |
|---|---|---|---|---|
| ① vorher | 360 | 600 | 0 | 240 |
| ① nachher | 360 + 120 = **480** | 600 + 120 = **720** | 0 | **0** („€ 240,00 aus Rücklage“) |
| Vor Spielgeld frei | 957 → 837 | 732 → 612 | 1.302 | 1.062 → 1.302 |
| Überschuss | 427 → **307** | 432 → **312** | 1.002 | 762 → **1.002** |

„Deine nächsten Gehälter“ zeigt dieselben Zahlen.

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `plan2.pay.rangeLabel` + Auswahl + `plan2.pay.rangeTo` + Auswahl | Aufteilen: vom {Monat}-Gehalt bis {Monat}-Gehalt | 5 |
| `plan2.pay.range` | aufgeteilt vom {Monat}- bis {Monat}-Gehalt | 5 |
| `plan2.pay.rangeFrom` (Bedienhilfe) | Erstes Gehalt | 2 |
| `plan2.pay.rangeLast` (Bedienhilfe) | Letztes Gehalt | 2 |
| `plan2.preview` | Überschuss vorher → nachher | 3 |
| `plan2.preview.none` | Kein Monat ändert sich. | 4 |
| `plan2.table.left` | Überschuss | 1 |
| `plan2.table.cushion` | Polster | 1 |
| `plan2.table.miss` (Bedienhilfe) | Geht sich nicht aus | 4 |
| `plan2.table.jump` (Bedienhilfe) | Zu {Monat Jahr} springen | 4 |
| `plan2.short` (jetzt mit Jahr) | {Monat Jahr} geht sich nicht aus. Dir fehlen € {X}. | 6 + 4 |
| `plan2.spielgeldShort` | Ab {Monat} reicht dein Gehalt zum Planen nicht fürs volle Spielgeld. | 11 |
| `plan2.cushion` | Überschuss als Polster mitnehmen | 4 |
| `plan2.cushion.info` | Nur einschalten, wenn du Überschüsse liegen lässt. | 7 |
| `plan2.cushion.until` | Dein Polster reicht bis {Monat Jahr}. | 6 |
| `plan2.cushion.all` | Reicht für alle 12 Monate. | 5 |
| `big.spielgeld` | Dein Gehalt zum Planen reicht nicht fürs volle Spielgeld. | 9 |

„Übernehmen“ (`plan2.apply`) gab es schon. Gelöscht: `plan2.table.free` („frei für dich“) und `plan2.pay.ready` („Fertig“). `docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Testergebnisse

Alle Läufe nach dem letzten Code- und Testcommit (9877a7e):

| Lauf | Ergebnis |
|---|---|
| Unit (vitest) | 60 Dateien, 1466 bestanden |
| TypeScript, Build (inkl. Farb- und Namensprüfung) | sauber |
| E2E desktop (5 Teile) | 598 bestanden, 40 übersprungen |
| E2E iphone-15 | 269 bestanden, 369 übersprungen |
| E2E iphone-pro-max | 241 bestanden, 397 übersprungen |
| E2E ipad-portrait | 257 bestanden, 381 übersprungen |
| E2E ipad-landscape | 244 bestanden, 1 rot, 393 übersprungen. Rot: `month.spec.ts` „bottom sheet: pay open position…“ (älterer Test, nicht berührt). Isoliert 3 × wiederholt: 36/36 grün. In Lauf 1 grün |
| Perf | 3 bestanden |
| Perf-Feier | 2 bestanden. In Lauf 1 einmal 16,2 ms bei Grenze 16 ms (iPhone SE, unter Last); isoliert 2 × grün |
| WebKit | plan-optionen 13, komplett-ansparen 12, monat-verdichtet 25, gehalt-zum-planen 13, alle-monate-gleich 13, monat-ist-monat 12, spielgeld-pille-rechenfehler 12, monat-feinschliff 21 bestanden |

WebKit-Befund: Der Sicherungs-Test lud die Seite neu, während der zweite Import noch schrieb. Chromium war schneller, WebKit verlor den Import. Der Test wartet jetzt auf „Sicherung importiert“, das erst nach dem Commit erscheint. Danach 3 × grün. Die App war nicht betroffen.

iPhone SE ist ein Viewport im Projekt `desktop` (plan-optionen, Screenshots).

## Screenshots

`docs/screenshots/plan-optionen/`: Editor mit Vorschau, Tabelle nach „Übernehmen“, „Dein Plan“ mit Polster. Sechs Viewports in hell und dunkel.

## Merge

Per Squash nach `main`, sobald alles grün ist. Den SHA meldet der Abschlussbericht.

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Es gibt keine Datenänderung beim Start und keinen Dexie-Sprung. Neu sind ein weiterer Wert in `saving` der Positionen und die Einstellung `cushion`. Beide werden nur gespeichert, wenn du sie wählst. Ältere Sicherungen bleiben importierbar.

Nach dem Deploy:
- Änderungen an großen Zahlungen speichert erst „Übernehmen“.
- Die Tabelle zeigt den Überschuss nach Spielgeld statt „frei für dich“.
- Rot erscheint nur noch, wenn Fixkosten oder Vermögensaufbau nicht gedeckt sind.
