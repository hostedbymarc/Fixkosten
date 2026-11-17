# Walkthrough „So funktioniert Erbse“ (walkthrough)

**Anlass:** Ein Nutzer dachte, er zahlt die „Abzüge vom Netto“ und den Zur-Seite-Betrag zusätzlich. Der Walkthrough erklärt den Zusammenhang. Die Zeile im Monats-Screen verbindet beides.

**Rahmen:**
- Datenbankname, Netlify-Subdomain und Export-Format sind unverändert.
- Ein neues Feld im Einstellungs-Eintrag `fixkostenkonto`: `walkthroughSeen`. Es ist additiv und wird nur gespeichert, wenn es `true` ist.
- Es gibt keinen Dexie-Sprung und keine neuen Hex-Werte.
- Es gibt keine neue Rechenlogik. Alle Zahlen kommen aus `kontoState()`.
- Die Simulation liefert pro Monat ein reines Lesefeld `bills`. Das ist dieselbe Summe, die sie schon bildet, jetzt ohne Abzug der bezahlten Rechnungen. Sonst wäre der laufende Monat zu niedrig dargestellt. Stände, Beträge und Lücken bleiben gleich.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Walkthrough-Sheet | ✅ | `WalkthroughSheet.tsx`: 5 Karten, Punkte-Fortschritt, „Weiter“ / „Zurück“ / „Fertig“, jederzeit schließbar (×, Hintergrund, Esc). Wischen auf Touch, Pfeiltasten auf dem Desktop. |
| 1 · Karte 1 | ✅ | Balken mit allen Abbuchungen der 12 Monate. Der teuerste und der günstigste Monat tragen ihren Betrag. Bei Gleichstand zählt der erste. Text „Im {teuer} zahlst du € X, im {günstig} nur € Y.“ |
| 1 · Karte 2 | ✅ | Dieselben Balken plus gestrichelte Linie beim Grundbetrag (`state.order`). |
| 1 · Karte 3 | ✅ | Grafik Gehalt → Topf → Rechnungen mit beiden Texten. |
| 1 · Karte 4 | ✅ | Grund wie auf Kachel und Sheet (`reasonText`). Darauf folgt „verteilt“ (`state.extra`), „auf einmal“ (`state.lump` bis `gapBy`) oder ohne Lücke „Bei dir reicht es schon. Gut gemacht.“ |
| 1 · Karte 5 | ✅ | Der Tag kommt aus „Neuer Monat beginnt am“: „Am 1.“, „Am 25.“ oder „Am Monatsletzten“. |
| 1 · Beispielzahlen | ✅ | Ohne Einrichtung gibt es feste Beispielzahlen mit Chip „Beispiel“ und Hinweis. Ein Unit-Test prüft, dass sie zusammenpassen: Grundbetrag = Summe ÷ 12, Lücke auf 3 Einzahlungen. |
| 1 · Einstieg Einstellungen | ✅ | Abschnitt „Fixkosten einplanen“, letzte Zeile „So funktioniert Erbse“ mit Pfeil. Sie ist immer da, auch wenn der Modus aus ist; dann mit Beispielzahlen. |
| 1 · Einstieg ⓘ der Kachel | ✅ | Am Ende des ⓘ steht der Link „So funktioniert's“. Er schließt das ⓘ und öffnet den Walkthrough. |
| 1 · automatisch einmal | ✅ | Er öffnet nach „Fertig“ in der Einrichtung, wenn `walkthroughSeen` noch `false` ist. Jedes Öffnen setzt das Feld. Eine zweite Einrichtung öffnet ihn nicht mehr (E2E). |
| **2** Monats-Screen | ✅ | Unter „Abzüge vom Netto“ steht „Bezahlt aus deinem Topf“ mit ⓘ, nur mit eingeschaltetem „Fixkosten einplanen“. |
| Unit-Tests | ✅ | `walkthrough.test.ts` (18 Tests):<br>• Fälle: mit Lücke verteilt, auf einmal, Frist vorbei, ohne Lücke, ohne Einrichtung.<br>• 12-Wörter-Regel für alle erzeugten Sätze und alle festen Texte.<br>• Roundtrip von `walkthroughSeen`. |
| E2E | ✅ | `walkthrough.spec.ts`:<br>• Geräte: iPhone SE, iPhone 15, iPad hoch und quer, Desktop 1440, jeweils hell und dunkel.<br>• Alle drei Einstiege, Wischen und Pfeiltasten, kein Wischen über die letzte Karte hinaus.<br>• Automatisch nur einmal.<br>• Beispielzahlen. |
| Screenshots | ✅ | `docs/screenshots/walkthrough/`: alle 5 Karten, Monats-Screen mit ⓘ und Beispiel, je Gerät hell und dunkel. |

## Nebenbei behoben: ⓘ (InfoTip)

Beim Testen fielen drei Fehler auf, alle in `InfoTip.tsx`:

| Fehler | Behebung |
|---|---|
| Nach „Fertig“ verschwindet das Sheet. Der Browser meldet dann ein Hover unter dem ruhenden Zeiger. Das öffnete das ⓘ „Bezahlt aus deinem Topf“. | Hover öffnet nur bei echter Mausbewegung über dem Symbol. |
| Ein Tipp erzeugt auf Touch-Geräten ein Maus-Echo an derselben Stelle. | Das Echo öffnet nichts: 800 ms und 12 px um den letzten Tipp. Ein echtes Trackpad-Hover auf dem iPad öffnet weiter. |
| Mit der Maus war der Link im ⓘ nicht erreichbar. Beim Verlassen des Symbols schloss es sofort. | Es gibt 250 ms Zeit für den Weg ins Popover. Dort bleibt es offen, beim Verlassen schließt es. |

Bestehende Tests richten „Fixkosten einplanen“ ein. Danach öffnet jetzt der Walkthrough. Der Helfer `closeWalkthrough()` schließt ihn dort.

## Neue Texte

| Wo | Text |
|---|---|
| Monats-Screen | „Bezahlt aus deinem Topf“ |
| Monats-Screen, ⓘ | „Diese Fixkosten zahlst du aus dem Geld, das du zur Seite legst.“ |
| Einstellungen | „So funktioniert Erbse“ |
| ⓘ der Kachel, Link | „So funktioniert's“ |
| Sheet | Titel „So funktioniert Erbse“, „Weiter“, „Zurück“, „Fertig“, Punkte „Karte {n} von 5“ |
| Beispiel | Chip „Beispiel“, Hinweis „Beispielzahlen. Richte „Fixkosten einplanen“ ein, dann siehst du deine.“ |
| Karte 1 | „Deine Fixkosten schwanken.“ · „Im {teuer} zahlst du € X, im {günstig} nur € Y.“ |
| Karte 2 | „Darum legst du jeden Monat gleich viel zur Seite.“ · „Das sind € {Grundbetrag} pro Monat. Teure Monate gleicht dein Topf aus.“ |
| Karte 3 | „Aus diesem Topf zahlst du alle Rechnungen.“ · Grafik „Gehalt“ → „Topf“ → „Rechnungen“ · „Das ist kein Extra-Geld. Es ist dasselbe Geld, nur gleichmäßig verteilt.“ · „Oben in der App siehst du, was diesen Monat abgebucht wird. Bezahlt wird es aus deinem Topf.“ |
| Karte 4 | „Am Anfang fehlt manchmal etwas.“ · „Im {Monat} kommen {Rechnungen}. Dein Topf ist bis dahin noch nicht voll.“ · „Darum bis dahin € Z extra pro Monat.“ / „Darum einmalig € Y bis {Datum}.“ / „Darum jetzt einmalig € Y.“ · „Das fällt nur einmal an.“ · ohne Lücke „Bei dir reicht es schon. Gut gemacht.“ |
| Karte 5 | „Jeden Monat ein Tipp.“ · „Am {Tag} fragt Erbse, ob du den Betrag zur Seite gelegt hast. Den Rest rechnet Erbse.“ |

Die vollständige Liste mit Wortzahl je Satz steht in `TEXTE.md`.

## Entscheidungen, bitte prüfen

- **Balken = ganze Monate:** Die Balken zeigen alle Abbuchungen des Monats, auch schon bezahlte. Sonst wäre der laufende Monat fast leer.
- **Karte 4, Lücke im laufenden Monat:** Bei „Diesen Monat reicht das Geld nicht.“ fehlt der Satz „bis dahin noch nicht voll“, weil „bis dahin“ nicht passt.
- **Frist für den Einmalbetrag vorbei:** Dann steht dort „Darum jetzt einmalig € Y.“
- **Zeile in den Einstellungen auch bei ausgeschaltetem Modus:** Die Erklärung hilft bei der Entscheidung. Dann gibt es Beispielzahlen.
- **„Gesehen“:** Jedes Öffnen zählt, egal über welchen Einstieg. Wer ihn vor der Einrichtung schon über die Einstellungen gesehen hat, bekommt ihn danach nicht mehr automatisch.
