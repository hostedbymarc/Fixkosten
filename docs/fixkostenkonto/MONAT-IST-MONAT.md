# Monat ist Monat

**Grundsatz:** „Dein Monat“ zeigt den aktiven Zeitraum, finanziert vom Gehalt an seinem Anfang. Bei Monatsbeginn 25 ist das im November der Zeitraum 25.10.–24.11. mit dem Oktober-Gehalt. Das nächste Gehalt plant nur noch „Dein Plan“.

**Rahmen:**
- Datenbankname, Subdomain und Export-Format bleiben unverändert.
- Es gibt kein neues Feld und keinen Dexie-Sprung. „Aus anderer Quelle“ nutzt das vorhandene, optionale Feld `fromNet`.
- Alle Zahlen kommen aus `monthPlan()` (neu: `current`) und `monthCard()`, das nur `monthPlan`, `monthItems` und `dueItems` liest.
- Es gibt keine neuen Hex-Werte. Die Warn-Pille nutzt `--c-warn` auf `--c-warn-soft`.
- Im Repo stehen nur erfundene Testdaten.

## Übersicht

| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Kopf: „{Auszahlungsmonat}-Gehalt“ des Gehalts am Zeitraum-Anfang, gedämpft „ausgezahlt am …“, Betrag antippbar | ✓ | `DeinMonatCard.tsx` schreibt in `monthClose[aktiver Zeitraum]`. Das ist derselbe Eintrag wie die Netto-Kachel dieses Zeitraums (`salaryView`). Belege: Golden Test, E2E `monat-ist-monat`, `monat-feinschliff` |
| 1 Fallback zuletzt eingetragen | ✓ | Golden Test „Jänner ohne eigenes Gehalt“ |
| 2 ① laut gewähltem Plan für diesen Zeitraum | ✓ | `monthPlan().current`: Vor der Überweisung ist es der erste Plan-Monat. Danach wird derselbe Plan ab Zeitraum-Anfang gerechnet. Belege: `monthCard.test.ts` (Bei Fälligkeit und Gleichmäßig, vor und nach der Überweisung) |
| 2 ② Direkt: Summe und Anzahl, ohne Vermögensaufbau, ohne späteren Start | ✓ | Golden Test (14 Posten, „Fitness“ ab Februar fehlt) |
| 2 ③ Vermögensaufbau nur vom Netto, „nicht vom Netto“ gedämpft | ✓ | `monthCard.test.ts` |
| 2 ④ Nicht eingeplant (neu), inkl. Einmalzahlungen; „aus anderer Quelle“ gedämpft, zählt nicht | ✓ | Golden Test (Dezember: € 450 gezählt, „Geschenk von Oma“ € 200 gedämpft), E2E |
| 2 Jede Zeile aufklappbar (Name · Betrag · Datum), Summe der Liste = Zeile | ✓ | Unit (alle Zeilen, drei Zeiträume) und E2E (alle vier Zeilen, sechs Viewports, hell und dunkel) |
| 3 „Übrig in diesem Monat“ = Netto − ① − ② − ③ − ④; „Vor Spielgeld frei“ = Netto − ① − ② − ③ | ✓ | Golden Test, E2E |
| 3 Spielgeld-Pille „€ ④ von € Limit · € Rest übrig / € Überschuss drüber“ (Warnton) | ✓ | Golden Test, E2E (kippt beim Anlegen auf „drüber“), Kontrast-Test warn auf warn-soft |
| 3 Rechnungen-Zeile und Konfetti wie bisher | ✓ | E2E `monat-verdichtet`, `monat-feinschliff`, `feier` |
| 4 Zeile „{Monat}-Gehalt · kommt am {Datum} · Plan ansehen ›“ öffnet „Dein Plan“ | ✓ | E2E |
| 4 „Nächster großer Monat“ unverändert | ✓ | E2E Layout |
| 5 Abweichung: „in diesem Monat € X statt € Y“ beim Posten | ✓ | `monthDeviation()`, Unit, E2E (Lebensmittel im November: € 450 statt € 480) |
| 6 Golden Test, drei Zeiträume | ✓ | `src/lib/golden-month-card.test.ts`, Daten `tests/fixtures/golden-month.ts` |

## Woher Abweichungen kommen (Punkt 5)

Der Kategorie-Betrag eines Monats ist die Summe dessen, was in diesem Monat zählt. Die Positionen-Liste zeigt dagegen den üblichen Betrag. Die beiden weichen in diesen Fällen ab:

1. **Anders abgebucht.** Ein abgehakter Posten zählt mit dem tatsächlich abgebuchten Betrag. Beispiel: Lebensmittel mit € 450 statt € 480. Das ist der Fall im November der Testdaten.
2. **Eigener Monatsbetrag.** Ein Zahlungsplan hat für einen Monat einen anderen Betrag, davor und danach gilt der alte. Beispiel: Strom im Dezember € 95 statt € 80.
3. **Abgehakt vor einer Planänderung.** Der Haken behält den Schnappschuss von damals.
4. **Einmalbeträge** wie Nachzahlung oder Gutschrift. Sie stehen in einer eigenen Zeile unter dem Posten und zählen zur Kategorie.
5. **Entfallen und „nicht eingeplant“.** Diese Posten stehen in der Liste, zählen aber nicht.

Die neue Zeile erklärt die Fälle 1–3 direkt beim Posten. Die Fälle 4 und 5 waren schon vorher sichtbar.

## Golden Test: Rechenweg

**Szenario:** erfundene Daten, Monatsbeginn 25, Plan „Bei Fälligkeit“, noch nichts angespart, Spielgeld € 300, Netto € 4.000. Im Jänner ist kein Netto eingetragen; die Karte nimmt das zuletzt eingetragene.

| Posten | Konto | Betrag | fällig |
|---|---|---|---|
| Miete, Strom, Internet, Handy, Haftpflicht, Lebensmittel | Direkt | 900 · 80 · 40 · 25 · 12 · 350 | monatlich (Strom im Dezember 95) |
| Kredit, Betriebskosten, Hausverwaltung | Direkt | 650 · 180 · 30 | monatlich |
| Streaming, Musik, Cloud, Zeitung, Software | Direkt | 13 · 11 · 3 · 15 · 9 | monatlich |
| Fitness | Direkt | 30 | ab Februar 2027 |
| ETF-Sparplan, Bausparen | Vermögensaufbau | 300 · 50 | monatlich |
| Kfz-Versicherung | Rücklage | 360 | Juni, Dezember |
| Steuerberater | Rücklage | 600 | Jänner |
| Konzert, Fahrrad | nicht eingeplant | 120 (14.11.) · 450 (5.12.) | einmalig |
| Geschenk von Oma | nicht eingeplant, andere Quelle | 200 (20.12.) | einmalig |

| | November | Dezember | Jänner |
|---|---|---|---|
| Kopf | Oktober-Gehalt € 4.000 | November-Gehalt € 4.000 | Dezember-Gehalt € 4.000 (zuletzt eingetragen) |
| ① Aufs Fixkostenkonto | 0 | 360 (Kfz) | 600 (Steuerberater) |
| ② Direkt bezahlt (14 Posten) | 1.407 + 860 + 51 = 2.318 | 1.422 + 860 + 51 = 2.333 | 2.318 |
| ③ Vermögensaufbau | 350 | 350 | 350 |
| ④ Nicht eingeplant | 120 | 450 (+ 200 gedämpft) | 0 |
| Vor Spielgeld frei | 4.000 − 0 − 2.318 − 350 = 1.332 | 4.000 − 360 − 2.333 − 350 = 957 | 4.000 − 600 − 2.318 − 350 = 732 |
| Übrig in diesem Monat | 1.332 − 120 = 1.212 | 957 − 450 = 507 | 732 |
| Spielgeld-Pille | 120 von 300 · 180 übrig | 450 von 300 · 150 drüber | 0 von 300 · 300 übrig |
| Nächstes Gehalt | November-Gehalt · 25. November | Dezember-Gehalt · 25. Dezember | Jänner-Gehalt · 25. Jänner |

**Gleiche Zahlen an zwei Stellen, im Test geprüft:**
- **Netto-Kachel = Kopf:** `salaryView` ergibt genau das Gehalt im Kopf.
- **„Dein Plan“:** Der erste Plan-Monat hat dieselben Werte für ①, ② und ③. Der Plan vom November zeigt Dezember und Jänner mit denselben ② und ③ wie deren Karten.
- **Hero dieses, des vergangenen und des künftigen Monats:** Die Abzüge sind ① + ② + ③, und Netto − Abzüge ergibt „Vor Spielgeld frei“. ④ zählt in keiner Summe des Hero.
- **Positionen-Ø:** Im November 2.318 + 360·2/12 + 600/12 = 2.428. Im Dezember 2.443, weil der Strom € 95 kostet. Einmalzahlungen und der spätere Start zählen nicht.
- **Listen:** Jede Liste ergibt ihre Zeile. Bei ① gleicht die Zeile „Für später zur Seite“ bzw. „Aus dem Angesparten“ die Differenz zum Überweisungsbetrag aus.

## Neue und geänderte Texte

| Schlüssel | Text | Wörter |
|---|---|---|
| `month.free` | Übrig in diesem Monat (vorher „Frei für dich“) | 4 |
| `month.before` | Vor Spielgeld frei: {betrag} | 4 |
| `month.unplanned` | Nicht eingeplant | 2 |
| `month.pill.rest` | Spielgeld: {betrag} von {limit} · {rest} übrig | 6 |
| `month.pill.over` | Spielgeld: {betrag} von {limit} · {over} drüber | 6 |
| `month.wealth.notFromNet` | {betrag} nicht vom Netto | 4 |
| `month.unplanned.other` | {betrag} aus anderer Quelle | 4 |
| `month.list.save` | Für später zur Seite | 4 |
| `month.list.take` | Aus dem Angesparten | 3 |
| `month.list.empty` | Nichts in diesem Monat | 4 |
| `month.list.notFromNet` | nicht vom Netto | 3 |
| `month.list.other` | aus anderer Quelle | 3 |
| `month.next` | {gehalt} · {wann} | 3 |
| `month.next.plan` | Plan ansehen | 2 |
| `month.deviation` | in diesem Monat {x} statt {y} | 6 |
| `source.label` | Bezahlt aus | 2 |
| `source.salary` / `source.other` | Gehalt / Andere Quelle | 1 / 2 |
| `source.info` | Andere Quelle zählt nicht gegen dein Spielgeld. | 7 |
| entfernt | „Dein Spielgeld {betrag} passt“, „Dir fehlen {betrag} für dein Spielgeld“ | – |

Unter ② steht jetzt die Anzahl („14 Posten“). Die Namen stehen in der aufgeklappten Liste. Alle Sätze haben höchstens 12 Wörter; `monthCard.test.ts` prüft das.

## Hinweise

- **Zuordnung der Posten.** Ein Posten gehört weiter über seinen Fälligkeitsmonat zum Zeitraum, wie im Hero und in den Kategorien. Ein Posten am 28.11. steht also im November, obwohl der Zeitraum am 24.11. endet. Diese Zuordnung ist unverändert.
- **„Aus anderer Quelle“.** Die Wahl steht im Formular, sobald „Nicht einplanen“ an ist („Bezahlt aus: Gehalt / Andere Quelle“). Bei einmaligen Vermögensaufbau-Zahlungen bleibt der bestehende Schalter „Von ‚Frei verfügbar‘ abziehen“.
- **Was die Pille vergleicht.** Sie vergleicht nur noch ④ dieses Monats mit dem Spielgeld. Ob ein Plan das Spielgeld in allen zwölf Monaten hält, steht unverändert in „Dein Plan“.

## Tests

| Lauf | Ergebnis |
|---|---|
| Unit (vitest) | 1351 grün, 55 Dateien. Neu: `golden-month-card.test.ts` (29), `monthCard.test.ts` (12) |
| E2E `monat-ist-monat` | 12 grün: iPhone SE, 15, Pro Max, iPad hoch/quer, Desktop 1440, je hell und dunkel |
| Volle E2E-Suite, desktop | 534 grün, 40 übersprungen. „Start ohne Netz“ (Splash, 6× CPU-Drosselung) einmal rot, danach 3 von 3 grün |
| Volle E2E-Suite, iphone-15 | 269 grün |
| Volle E2E-Suite, iphone-pro-max | 241 grün |
| Volle E2E-Suite, ipad-portrait | 257 grün |
| Volle E2E-Suite, ipad-landscape | 245 grün |
| Perf | 3 grün. Perf-Feier: 2 grün |
| WebKit (geänderte Specs: monat-ist-monat, monat-feinschliff, monat-verdichtet, month-once, from-net, tooltips) | 74 grün, 11 übersprungen. `from-net` einmal Zeitüberschreitung, einzeln 3 von 3 grün |

**Angepasste bestehende Tests:**
- `dom-figures` prüft jetzt auch die Abweichungszeile.
- `tooltips` schließt „Dein Plan“ mit `closePlan`. Das Escape konnte im Spielgeld-Feld landen.
- `monat-feinschliff` und `monat-verdichtet` folgen der neuen Karte: aktiver Zeitraum, Pille mit ④.

## Merge

Per Squash nach `main`. Merge-SHA und Deploy-Hinweis stehen im Abschlussbericht des PRs.
