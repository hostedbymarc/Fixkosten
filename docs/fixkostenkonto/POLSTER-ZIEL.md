# Polster-Ziel

Branch `polster-ziel` gegen `main`. Vorlage: Design-Canvas „Erbse – Polster-Ziel Mockups“, Screens 1–5. Layout und Texte kommen aus der Vorlage, die Zahlen aus der Rechnung.

Rahmen: Datenbankname, Subdomain und Export-Format bleiben gleich. Die neuen Felder sind additiv und haben keinen Dexie-Sprung. Alle Zahlen kommen aus `monthCard()` / `monthPlan()` (Rechnung: `src/lib/polster.ts`, in Cent). Es gibt keine neuen Hex-Werte, und im Repo stehen nur erfundene Testdaten.

## Punkte

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Felder: `cushionGoal`, `cushionBalance` + `cushionBalanceDate`, `cushionRule` (Standard `all`), `cushionShare` (Standard 50), `cushionMilestones`, `cushionConfirmed`; Beträge in Cent | ✓ | `src/db/settings.ts`. Unit `src/db/polster-ziel.test.ts`: Rundreise, Standardwerte, ungültige Werte |
| 1 Im Export, Import ohne Felder funktioniert | ✓ | Unit: Export → Import mit und ohne Felder |
| 1 Schalter „Überschuss als Polster mitnehmen“ entfällt; `cushion` beim Lesen ignoriert, beim Export weggelassen; Spalte und Meldung ab eingetragenem Stand | ✓ | Unit (zwei Stellen). `plan-optionen` Unit und E2E angepasst |
| 2 Sheet „Dein Polster“ (Screen 1): grüne Karte, Etappen-Marken, nächste Etappe im Warn-Token, „{p} % · fehlt € X“ | ✓ | `Polster.tsx` → `PolsterSheet`. E2E: „70 % · fehlt € 6.000“, Marke 75 |
| 2 Ansporn „Noch € X bis {Etappe} %.“ und „Dein {Monat}-Überschuss bringt dich auf {p} %.“ | ✓ | E2E: „Noch € 1.000 bis 75 %.“ |
| 2 „Damit zahlst du“: Stand ÷ Ø Fixkosten (12 Monate inkl. großer Zahlungen ÷ 12) und ÷ (Ø + Spielgeld), eine Stelle, abgerundet; „Am Ziel: …“; Fußzeile | ✓ | `cushionCover()`. Unit: 14.000 ÷ 3.425 = 4,0 (nicht 4,1) |
| 2 Eingaben Polster-Ziel und Schon geschafft (setzt Stand und Datum), leer = entfernen; Regel all/share | ✓ | Unit (Aktionen). E2E: Eingabe → Karte, Sheet, Plan |
| 2 Erreichbar über die Karte und Einstellungen → „Polster ›“ | ✓ | `settings-open-polster`, `polster-card` |
| 3 Karte im Monat-Tab (Screen 5), nur im aktiven Monat, unter der grünen Karte, vor „Nächster großer Monat“; ohne Ziel „Leg dein Polster-Ziel fest ›“ | ✓ | `PolsterCard`, `PolsterSlot`. E2E: ohne Ziel, mit Ziel, im Folgemonat keine Karte |
| 3 „Nächster großer Monat“: „Polster deckt es“, wenn der geplante Polster vor dem Monat dessen Lücke deckt | ✓ | `BigMonthCard` mit `cushionBefore()` |
| 4 Block „So verteilst du den Überschuss“ (Screen 2): laut Regel, höchstens bis zum Ziel, „{vorher} % → {nachher} %“, „Polster danach € X · noch € Y“, „Frei zum Investieren“, „Polster aufgefüllt“, „Anders aufteilen“ | ✓ | `CushionSplit`. Unit `distribution()`. E2E: Betrag = Überschuss, 70 % → 76 % |
| 4 Block „Dein Polster deckt die Lücke“ (Screen 3): min(Lücke, Stand), „Ab € {Netto + Lücke} Gehalt …“, „Aus Polster genommen“ | ✓ | Unit. E2E: Spielgeld über dem Überschuss → Entnahme |
| 4 Ziel erreicht: „Polster voll · Überschuss frei zum Investieren“ | ✓ | E2E |
| 4 Stand ändert sich nur durch Bestätigen oder Eingabe; je Monat einmal; Rückgängig (Hinweis 5 s und Knopf) | ✓ | Unit: zweites Bestätigen tut nichts. E2E: kein zweiter Knopf, Rückgängig |
| 4 Nur aktiver Monat und vergangene Monate ohne Bestätigung; künftige Monate gedämpfte Vorschau ohne Knopf | ✓ | E2E: Folgemonat `data-preview`, kein Knopf |
| 5 Dein Plan (Screen 4): Polster-Ziel-Zeile, „Heute € X · {p} % · {n} Monate Fixkosten“, „ändern ›“ | ✓ | `PlanCushionLine`. E2E: gleiche Werte wie Karte und Sheet |
| 5 Tabelle Monat · Überschuss · Polster ± · Polster; Start = Stand, Regel bis Ziel, Lücke ab, nie unter 0 | ✓ | `projectCushion()`. Unit und Golden Test. E2E: erste Zeile |
| 5 Meldung grün „Nach {Monat} fehlen nur noch € X.“ / „Ziel im {Monat Jahr} erreicht.“; Warn „Bei € {Gehalt} Gehalt sinkt dein Polster ab {Monat}.“; Rot aus #58 vorrangig | ✓ | `cushionMessage()`. Unit |
| 5 Box „Ziel im {Monat} erreicht, wenn dein {Monat}-Gehalt mindestens € X ist.“ | ✓ | `goalSalary()`. Unit: € 7.293 (Beispiel der Vorlage) |
| 6 Feier beim Überschreiten von 25/50/75 %, bei 100 % zusätzlich „Polster-Ziel erreicht“; jede Etappe einmal | ✓ | Unit `newStages`, Aktionen. E2E: Konfetti bei 75 %, nach Rückgängig und erneutem Bestätigen keins |

## Golden Test: Rechenweg

Ziel € 10.000, Stand € 7.000, drei Monate mit Überschuss +2.500 / −900 / +1.000 (`src/lib/polster.test.ts`).

**Regel „Alles in den Polster“**

| Monat | Überschuss | Platz bis Ziel | Polster ± | Polster |
|---|---|---|---|---|
| Start | | | | 7.000 |
| 1 | +2.500 | 3.000 | +2.500 | 9.500 |
| 2 | −900 | | −900 (min(900, 9.500)) | 8.600 |
| 3 | +1.000 | 1.400 | +1.000 | 9.600 |

Meldung: „Nach {Monat 3} fehlen nur noch € 400.“ Warnung: „Bei … Gehalt sinkt dein Polster ab {Monat 2}.“

**Regel „Fester Anteil 50 %“**

| Monat | Überschuss | 50 % | Platz bis Ziel | Polster ± | Polster |
|---|---|---|---|---|---|
| Start | | | | | 7.000 |
| 1 | +2.500 | 1.250 | 3.000 | +1.250 | 8.250 |
| 2 | −900 | | | −900 | 7.350 |
| 3 | +1.000 | 500 | 2.650 | +500 | 7.850 |

## Neue Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `cushion.title` | Dein Polster | 2 |
| `cushion.done` | Geschafft | 1 |
| `cushion.goal` | Ziel {betrag} | 2 |
| `cushion.progress` | {prozent} % · fehlt {betrag} | 3 |
| `cushion.nextStage` | Nächstes Etappenziel {prozent} % | 3 |
| `cushion.toStage` | Noch {betrag} bis {prozent} %. | 4 |
| `cushion.boost` | Dein {monat}-Überschuss bringt dich auf {prozent} %. | 6 |
| `cushion.pays` | Damit zahlst du | 3 |
| `cushion.months` | Monate Fixkosten | 2 |
| `cushion.monthsSpielgeld` | Monate Fixkosten + Spielgeld | 3 |
| `cushion.atGoal` | Am Ziel: {n} | 3 |
| `cushion.avg` | Ø nächste 12 Monate: Fixkosten ca. {fix} | 6 · 1 |
| `cushion.avgSpielgeld` | Ø nächste 12 Monate: Fixkosten ca. {fix}, Spielgeld {spielgeld} | 6 · 3 |
| `cushion.goalField` | Polster-Ziel | 1 |
| `cushion.balanceField` | Schon geschafft | 2 |
| `cushion.rule` | Überschuss bis zum Ziel | 4 |
| `cushion.rule.all` | Alles in den Polster: schnellster Weg | 6 |
| `cushion.rule.share` | Fester Anteil: {prozent} %, Rest investieren | 5 |
| `cushion.share` | Anteil für den Polster in % | 5 |
| `cushion.reached` | Polster-Ziel erreicht | 2 |
| `cushion.card` | Dein Polster | 2 |
| `cushion.of` | von {betrag} | 2 |
| `cushion.monthsN` | {n} Monate Fixkosten | 3 |
| `cushion.setGoal` | Leg dein Polster-Ziel fest › | 4 |
| `cushion.split.title` | So verteilst du den Überschuss | 5 |
| `cushion.split.in` | In den Polster | 3 |
| `cushion.split.pct` | {vorher} % → {nachher} % | 2 |
| `cushion.split.after` | Polster danach {betrag} · noch {rest} | 5 |
| `cushion.split.free` | Frei zum Investieren | 3 |
| `cushion.split.confirm` | Polster aufgefüllt | 2 |
| `cushion.split.other` | Anders aufteilen | 2 |
| `cushion.split.amount` | Betrag für den Polster | 4 |
| `cushion.gap.title` | Dein Polster deckt die Lücke | 5 |
| `cushion.gap.out` | Aus dem Polster | 3 |
| `cushion.gap.after` | Polster danach {betrag} · {prozent} % vom Ziel | 6 |
| `cushion.gap.salary` | Ab {betrag} Gehalt brauchst du den Polster nicht. | 8 |
| `cushion.gap.confirm` | Aus Polster genommen | 3 |
| `cushion.full` | Polster voll · Überschuss frei zum Investieren | 6 |
| `cushion.in.done` | {betrag} in den Polster gelegt. | 5 |
| `cushion.out.done` | {betrag} aus dem Polster genommen. | 5 |
| `cushion.undo` | Rückgängig | 1 |
| `cushion.toast.in` | Polster aufgefüllt: {betrag} | 3 |
| `cushion.toast.out` | Aus dem Polster genommen: {betrag} | 5 |
| `big.cushion` | Polster deckt es | 3 |
| `settings.cushion` | Polster | 1 |
| `plan2.cushion.missing` | Nach {monat} fehlen nur noch {betrag}. | 6 |
| `plan2.cushion.reached` | Ziel im {monat} erreicht. | 4 |
| `plan2.cushion.drop` | Bei {betrag} Gehalt sinkt dein Polster ab {monat}. | 8 |
| `plan2.cushion.goal` | Polster-Ziel {betrag} | 2 |
| `plan2.cushion.change` | ändern › | 1 |
| `plan2.cushion.today` | Heute {betrag} · {prozent} % · {n} Monate Fixkosten | 6 |
| `plan2.cushion.box.title` | Ziel im {monat} erreicht | 4 |
| `plan2.cushion.box.text` | wenn dein {gehalt} mindestens {betrag} ist. | 6 |
| `plan2.table.cushionDelta` | Polster ± | 1 |

Gelöscht: `plan2.cushion` („Überschuss als Polster mitnehmen“), `plan2.cushion.info`, `plan2.cushion.until`, `plan2.cushion.all`. `docs/fixkostenkonto/TEXTE.md` wurde neu erzeugt.

## Entscheidungen

- **Beträge in Cent:** Die neuen Felder speichern ganze Cent, wie verlangt. Die bestehenden Konto-Felder bleiben in Euro.
- **Prozent abgerundet:** „{p} %“ ist überall abgerundet. 92,9 % zeigt also 92 %, und 100 % erscheint erst am Ziel. Die Vorlage zeigt an einer Stelle 93 %.
- **„Monate Fixkosten“ abgerundet:** Wie verlangt. Die Vorlage zeigt 4,1, gerechnet sind es 4,0.
- **„ca. € X“:** Die Ø-Werte in der Fußzeile stehen auf ganze Euro gerundet.
- **Bestätigte Monate im Plan:** Sie stecken schon im Stand, ihr „Polster ±“ ist 0.
- **„Nach {Monat} fehlen nur noch € X“:** Gemeint ist der Monat, in dem der geplante Polster am höchsten ist.
- **Box beim festen Anteil:** Der Überschuss muss fehlt ÷ Anteil sein. Daraus folgt das Mindestgehalt, auf ganze Euro aufgerundet.
- **„Ab € X Gehalt“:** Netto plus Lücke, auf ganze Euro aufgerundet.
- **Ohne Ziel:** Kein Verteilen-Block bei Überschuss. Die Projektion legt die Überschüsse ohne Deckel in den Polster.
- **Polster-Karte:** Sie erscheint nur, wenn das Fixkostenkonto eingerichtet ist, unter der grünen Karte. Ein gesetzter Polster zählt nicht als „Fixkosten einplanen angefasst“, die Einladung bleibt.
- **Rückgängig nach einer Feier:** Die Etappe bleibt gefeiert. Ein erneutes Überschreiten feiert nicht noch einmal.
- **Namensprüfung:** „Monate Fixkosten“ und „Fixkosten ca.“ stehen auf der Ausnahmeliste von `scripts/check-colors.mjs`, wie frühere Fachbegriffe.

## Testergebnisse

- **Unit-Tests:** 1543 grün in 62 Dateien. Neu sind 22 in `src/lib/polster.test.ts` und 10 in `src/db/polster-ziel.test.ts`.
- **Build:** `pnpm build` (tsc, check-colors, check-bundle) ist sauber.
- **Neue E2E:** `e2e/polster-ziel.spec.ts` deckt iPhone SE, iPhone 15, iPhone Pro Max, iPad hoch/quer und Desktop 1440 ab, je hell und dunkel. Das sind 12 von 12 grün, nach dem Fix 3× wiederholt 36 von 36.
- **Volle Suite ohne Retries** (Lauf 4, nach der letzten Code-Änderung) mit 19 von 19 Projekten grün:

| Projekt | bestanden | übersprungen | fehlgeschlagen |
|---|---|---|---|
| desktop 1–5/5 | 610 | 40 | 0 |
| iphone-15 | 269 | 381 | 0 |
| iphone-pro-max | 241 | 409 | 0 |
| ipad-portrait | 257 | 393 | 0 |
| ipad-landscape | 245 | 405 | 0 |
| perf (Grenzen aus #59) | 3 | 0 | 0 |
| perf-feier (iPhone 15 und SE, 4× CPU-Drosselung) | 2 | 0 | 0 |
| WebKit iPhone SE hell/dunkel | 212 | 54 | 0 |
| WebKit iPhone 15 hell/dunkel | 230 | 36 | 0 |
| WebKit iPad hoch hell/dunkel | 228 | 38 | 0 |
| WebKit iPad quer hell/dunkel | 216 | 50 | 0 |
| **Summe** | **2513** | | **0** |

- **Frühere Läufe, offen berichtet:**
  - **Lauf 1:** Ein Fehler in `setup.spec` auf WebKit iPhone 15 dunkel: `page.reload` bricht mit „WebKit encountered an internal error“ ab. Das ist ein Absturz der Engine, keine Prüfung schlug fehl. Die Stelle ist in diesem Sprint unverändert.
  - **Lauf 2:** Ein echter Wackler im neuen `polster-ziel.spec`. Der Stand wurde nach „Aus Polster genommen“ einmal gelesen statt abgewartet. Behoben mit `expect.poll`, danach 36 von 36 grün.
  - **Lauf 3:** Ein Fehler in `spielgeld-zuordnung.spec` (Desktop): Nach dem Neuladen kam `hero` nicht innerhalb von 5 s. Einzeln 12× wiederholt war er 12 von 12 grün. Die Stelle ist unverändert und folgt demselben Muster wie die übrigen Specs.
  - **Lauf 4:** Nach dem Fix aus Lauf 2 gab es keine Code-Änderung mehr. Der Lauf ist komplett grün.

## Screenshots

`docs/screenshots/polster-ziel/`: Screens 1–5 nachgebaut, sechs Viewports in hell und dunkel.

## Merge

Squash-Merge von PR #60 nach `main` nach dem grünen Lauf 4. Die Merge-SHA steht im Abschlussprotokoll, sie kann nicht in dem Commit stehen, den sie bezeichnet.

## Hinweis Production-Deploy

Der Merge nach `main` löst den gewohnten Deploy aus. Die Subdomain bleibt gleich. Es gibt keine Datenänderung beim Start und keinen Dexie-Sprung. Neu sind die `cushion*`-Felder der Konto-Einstellungen, gespeichert nur, wenn gesetzt. Ältere Sicherungen bleiben importierbar. Ein gespeicherter Schalter `cushion` aus #58 wird ignoriert und beim nächsten Speichern entfernt.

Nach dem Deploy:
- Im aktiven Monat steht unter der grünen Karte die Polster-Karte, zuerst mit „Leg dein Polster-Ziel fest ›“.
- Der Schalter „Überschuss als Polster mitnehmen“ in „Dein Plan“ ist weg.
