# Überarbeitung PR #40 · Punkt · erledigt · Beleg

Basis: `main` mit #41 (`176ce44`). Die Schote ist entfernt. Alle Zahlen kommen aus `kontoState`.

| Punkt | erledigt | Beleg |
|---|---|---|
| **0** Rebase auf `main` inkl. #41 | ✅ | ohne Konflikte; `top-fade` und `top-shimmer` laufen mit |
| **1** Schote raus | ✅ | `PeaPod.tsx`, `schote.ts`, `/dev/schote`, Pod-CSS und `docs/schote` sind gelöscht; `vite.config.ts` wie `main`. Unit-Test „keine Schote“ prüft alle Texte. Erbsen nur noch als Logo, Haken, Kategorie-Punkte. |
| **2** Eine Wahrheit | ✅ | `kontoState()` (`src/lib/kontoBalance.ts`) liefert Dauerauftrag, Lücke, Monat, Status und Plan. Kachel, Sheet, „Dein Plan“, Einstellungen und Analyse lesen nur das. `setupCoverage` (die zweite Rechnung) ist weg. E2E vergleicht alle vier Stellen. |
| **3** Status in Worten, 3 Zustände | ✅ | `KontoStatusLine`: „Fixkostenkonto einrichten“ + „1 von 3 erledigt“ · „Im Februar 2027 fehlen € 865,79.“ + „Zahl einmalig … ein, dann passt alles.“ + „Erledigt, eingezahlt“ · „Alles gedeckt bis Oktober 2027.“ mit Häkchen. `statusOf`: „setup“, solange Konto oder Dauerauftrag offen ist. Unit-Test über 72 Kombinationen. |
| **4** Einrichtung in 2 Fragen, Plan als Checkliste | ✅ | `KontoSetupSheet`: Kontostand oder „Ich habe noch keins“; „Läuft dein Dauerauftrag schon?“ Ja/Nein. Danach gespeichert, Plan mit 3 Punkten, Pop je „Erledigt“, Erfolgs-Moment. Monats-Check und Serie unverändert. |
| **5** Monatsliste und Klappbereiche | ✅ | `MonthList`: Monat · Einzahlung · Abbuchungen · Stand, mit „+“ und „−“. „€ X ab“ gibt es nicht mehr. „Alle Monate“, „Im Dauerauftrag“, „Kontostand und Rundung“ sind zu. |
| **6** Datum aus „Neuer Monat beginnt am“ | ✅ | `orderDay()` in Plan, Kachel, Sheet, Einstellungen. Prüfung unten. |

## Ursache der verschiedenen Zahlen

- „Dein Plan“ rechnete mit `setupCoverage` selbst, aus den noch nicht gespeicherten Antworten.
- Dabei galt eine eigene Annahme, ob diesen Monat noch eine Einzahlung kommt.
- Sheet, Kachel und Einstellungen rechneten mit dem gespeicherten Stand (`kontoState`).
- Dazu kam die Rundung: Sie ist im Sheet änderbar, „Dein Plan“ zeigte den Wert von vorher.
- Jetzt speichert die Einrichtung zuerst. Der Plan liest denselben Stand wie alle anderen.
- Beim Öffnen von Sheet oder Einstellungen blitzte kurz „einrichten“ auf. Grund: Standardwerte vor dem Laden.
- Jetzt startet jede Stelle mit dem zuletzt gelesenen Stand (`useKonto`). Der E2E-Vergleich fand das.

## Punkt 6 · Tag ≠ 1

- Der aktive Monat beginnt am eingestellten Tag, z. B. am 25. (`activeMonth`).
- Der Dauerauftrag kommt an diesem Tag. Er ist die erste Buchung des neuen Monats.
- Die Simulation rechnet in Monaten, nicht in Kalendertagen. Das passt zu dieser Annahme.
- Beispiel: Am 25. Oktober wird November aktiv. Die Liste beginnt dann mit November.
- „Monatsletzter“ im Februar: Der 28. ist der Beginn.
- Monatsnamen meinen den Erbse-Monat. „Februar 2027“ heißt bei Tag 25: 25. Jänner bis 24. Februar.
- Belege: Unit-Tests „Datum: Tag aus ‚Neuer Monat beginnt am‘“, E2E „Neuer Monat beginnt am 25.“.

## Entscheidungen

- „Ja, läuft schon“: Die Einzahlung dieses Monats steckt schon im Kontostand.
- „Nein“: Der neue Dauerauftrag startet nächsten Monat. Diesen Monat kommt nichts dazu.
- In beiden Fällen rechnet der Plan vorsichtig. Die Lücke deckt den Monat ohne Einzahlung.
- „Im {Monat} fehlen“ nennt den Monat mit dem tiefsten Stand. Dort fehlt genau die Lücke.
- Plan immer 3 Punkte: Konto, Dauerauftrag, Einzahlung. Was nicht nötig ist, ist erledigt.
- „Dauerauftrag prüfen“ bleibt offen, bis du „Erledigt“ tippst. Erst dann gilt „gedeckt“.
- Der Polster-Zustand entfällt, es gibt nur noch 3 Zustände.
- Daten aus #39 (eingerichtet, nie gefragt): Konto und Dauerauftrag gelten als erledigt.
- Meilenstein „Erste Schote voll“ heißt jetzt „Zum ersten Mal alles gedeckt“. Die gespeicherte ID bleibt.
