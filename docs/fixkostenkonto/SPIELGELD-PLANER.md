# Spielgeld-Planer

Sprint `spielgeld-planer`. Spielgeld ist nur noch ein Planungswert, keine Zahlungsquelle. Erbse prüft, ob Spielgeld, Rücklage und Fixkosten bis zum nächsten großen Posten ins Gehalt passen. Dazu gibt Erbse einen Tipp.

**Rahmen:**
- Datenbankname, Subdomain und Export-Format sind unverändert. Es gibt keinen Dexie-Sprung und keine neuen Felder.
- „Nicht einplanen“ nutzt den bestehenden Wert `account: 'spielgeld'`. Gespeicherte Daten ändern sich nicht.
- `spielgeldOverflow` bleibt gespeichert und wird beim Import weiter gelesen. Die App nutzt es aber nicht mehr.
- Alle Zahlen kommen aus `kontoState()` und den bestehenden Rechenfunktionen. Die neue Rechnung `spielgeldPlan.ts` liest nur `kontoState().months` und die Teile der Gehalts-Aufteilung.
- Keine neuen Hex-Werte. Der Regler nutzt das Token `--c-accent`.

## Punkt · erledigt · Beleg

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Konfetti einmal, dann liegen | ✅ | Die Erbsen fallen nur live, wenn im aktiven Monat die letzte Position abgehakt wird. Beim Öffnen fallen sie nie, und der Haken ist kein Knopf mehr. Bei jedem weiteren Öffnen liegen die Erbsen still am Boden. Ihre Lage kommt aus der Monats-ID, deshalb ist sie immer gleich. Wird eine Position wieder offen, verschwinden sie. Bei erneut 100 % fallen sie wieder einmal. Mit reduzierter Bewegung fällt nichts, die Erbsen liegen nur. Unit: `celebration.test.ts`. E2E: `feier.spec.ts`, Details unten. |
| **2** „Direkt bezahlt“ | ✅ | Hero: „Direkt bezahlt“. Dialog: „Rücklage \| Direkt“, das ⓘ ist angepasst, intern bleibt `girokonto`. Liste: Chip „Direkt“. Aufteilung: Zeile „Direkt bezahlt“, Namen in gedämpfter zweiter Zeile. E2E: `ruecklage-spielgeld.spec.ts`. |
| **3** „Nicht einplanen“ | ✅ | Schalter unter der Quelle, mit dem ⓘ-Text aus dem Auftrag. Gespeichert als `account: 'spielgeld'`. Beim Ausschalten wird `girokonto` gespeichert. Die Position bleibt in Liste und Monat sichtbar, gedämpft, abhakbar, mit Chip „nicht eingeplant“. Sie zählt an keiner Summenstelle, Liste unten. Regressionstest: ohne solche Positionen sind alle Kennzahlen gleich wie vorher. |
| **4** Spielgeld-Karte und Überzug weg | ✅ | Karte, Balken, „Woher kommt der Rest?“ und Teilbetrag sind entfernt. Die Aufteilung zeigt „Spielgeld“ als geplanten Betrag, in beiden Ansichten. Eine Zeile „Spielgeld-Überzug“ gibt es nicht mehr. Einstellungen: neues ⓘ. |
| **5** Karte „Dein Spielgeld“ | ✅ | Nur im aktiven Monat und nur mit „Fixkosten einplanen“. Regler in € 50-Schritten und Betragsfeld mit Cent schreiben dieselbe Einstellung. Darunter: möglich je Gruppe, Status grün oder rot, Tipp, „Gerechnet mit …“. Ohne Netto erscheint der Hinweis mit Knopf. Unit: `spielgeld-planer.test.ts` mit deinen Zahlen. E2E: `spielgeld-planer.spec.ts`. |
| **6** Walkthrough Karte 3 | ✅ | Die Grafik zeigt Gehalt → Rücklage / Direkt bezahlt / Spielgeld / Vermögensaufbau. Untertext: „Manches zahlst du direkt. Spielgeld planst du nur ein.“ |

## „Nicht einplanen“: alle Stellen

Eine Position mit `account: 'spielgeld'` gilt als nicht eingeplant (`isPlanned` in `calc.ts`). Ihre Einmalbeträge (Nachzahlung / Gutschrift) zählen auch nicht.

| Stelle | Wo im Code | Wirkung |
|---|---|---|
| Fixkosten-Summe, Hero Gesamt / Abgebucht / Offen | `counted()` → `monthEntries` → `monthFigures` | zählt nicht |
| Fortschritt (Ring, %), „Alle n Rechnungen bezahlt“, Erledigt-Zustand | `monthFigures.count/openCount/ratio` | zählt nicht. Ein Haken daran ändert nichts. |
| „Abzüge vom Netto“, „Frei verfügbar“, Sparquote | `monthFigures`, `expectedSpend`, `wealthFromNet` | zählt nicht |
| „Woraus du bezahlst“ (Quellen) | `costSources` | in keiner Quelle; Rücklage + Direkt = Summe |
| Kategorie-Köpfe im Monat (Summe, „n/m bezahlt“) | `groupByCategory` → `counted()` | zählt nicht |
| Ø pro Monat, „davon nicht monatlich“, Ø Vermögensaufbau, Ø je Kategorie (Monat und Positionen) | `matchingPositions` → `sumMonthlyEquivalent` | zählt nicht |
| „Offen aus {Monat}“ (Banner: Anzahl, Betrag, Zeilen) | `openFromPrevious` | erscheint nicht |
| Monatsraster („✓“ / „n offen“) | `monthStatus` → `monthFigures` | zählt nicht |
| „Kommt bald“ | `upcomingDue` | erscheint nicht |
| Rücklage-Rechnung: Grundbetrag, Simulation, Lücke, Kontostand | `onKonto` (nur `fixkostenkonto`) | zählt nicht, wie bisher |
| Gehalts-Aufteilung (aktuell und nächstes Gehalt), „Dein Spielgeld“ | `monthItems` → `salarySplit` / `spielgeldPlan` | zählt nicht |
| Empfehlung „auf einmal / verteilt“ | `tileAdvice` → `nextSalarySplit` | zählt nicht |
| Jahresvorschau | `yearForecast` (`fixedCosts`, einmalige, Einmalbeträge) | zählt nicht |
| Analyse: Verteilung | `categoryDistribution` | zählt nicht |
| Analyse: Plan vs. Ist (Summen und Abweichungen) | `plannedForPeriod`, `actualForPeriod`, `planVsActual` | zählt nicht |
| Analyse: Optimierungen und Verlauf | `planChanges` → `optimizationTimeline`, `burdenTrend` | zählt nicht |
| Analyse: Sparquote-Karte (Aufteilung) | `savingsParts` | zählt nicht |
| Walkthrough „{n} Posten zahlst du direkt.“ | `directCount` (nur `girokonto`) | zählt nicht |
| Liste und Monat | `dueItems` (Feld `unplanned`), `PositionRow`, Positionen | sichtbar, gedämpft, Chip „nicht eingeplant“, abhakbar |

**Regressionstest:**
- Vor allen Änderungen habe ich alle Kennzahlen mit dem alten Code gespeichert, in `tests/fixtures/kennzahlen-vorher.json`.
- Fünf nachgebaute Datensätze sind dabei, jeweils über 18 Monate.
- Geprüft werden:
  - `monthFigures`, Plan und Ist, Kategorie-Köpfe
  - alle Ø-Werte, Ø je Kategorie
  - „Offen aus …“, Monatsraster, „Kommt bald“, Quellen
  - Verteilung, Jahresvorschau, Verlauf, Plan vs. Ist, Optimierungen, Sparquote
  - Dauerauftrag, `kontoState`, Gehalts-Aufteilung
- `nicht-eingeplant-regression.test.ts` vergleicht den neuen Code damit. Alle Werte sind identisch.

## Rechnung „Dein Spielgeld“

- Gerechnet wird je Monat m ab dem nächsten Zur-Seite-Betrag (`state.next`), so weit `kontoState` plant.
- möglich_m = Netto_m − Zur-Seite-Betrag_m (mit Extra) − Direkt bezahlt_m − Vermögensaufbau_m (vom Netto).
- Fehlt das Netto eines Monats, gilt das zuletzt eingetragene. Die Karte sagt dann „Netto geschätzt wie zuletzt.“
- Läuft ein Extra:
  - A ist das Minimum über die Extra-Monate.
  - B ist das Minimum über die Monate danach.
- Ohne Extra gibt es nur B.
- Status:
  - Spielgeld ≤ A (sonst B) heißt „Passt.“.
  - Darüber heißt es „Zu viel.“.
- Der Tipp rundet A und B auf € 50 ab, nie unter 0.

**Deine Zahlen (Unit-Test, nachgebaut):**
- Netto € 8.302, Zur Seite € 3.235,81 bis Februar, danach € 2.909, Direkt € 480, Vermögensaufbau € 800.
- Bis Februar möglich: € 3.786,19. Ab März möglich: € 4.113,00.
- Bei Spielgeld € 1.200 heißt es „Passt.“, es bleiben € 2.586,19 übrig. Der Tipp nennt € 3.750 und € 4.100.
- Zwei Einmalzahlungen sind nicht eingeplant (€ 1.800 und € 1.228,45). Sie stehen nicht im Hero, nicht in den Summen und nicht in der Rechnung.

## Entscheidungen, bitte prüfen

- **Liegende Erbsen in vergangenen Monaten:**
  - Ein vergangener Monat im Erledigt-Zustand zeigt die Erbsen liegend.
  - Fallen tut dort nie etwas.
  - Wenn sie dort gar nicht liegen sollen, ändere ich es.
- **„Nicht einplanen“ auch ohne „Fixkosten einplanen“:**
  - Der Schalter steht immer im Dialog.
  - Der Chip „nicht eingeplant“ erscheint immer.
  - „Direkt“ erscheint nur mit dem Modus.
- **Spielgeld nicht gesetzt:**
  - Die Karte zeigt die möglichen Beträge und den Tipp, aber keinen Status.
  - Der Regler steht auf 0.
- **Reglerbereich:**
  - Er reicht von 0 bis ein Viertel über den höchsten möglichen Betrag, gerundet auf € 50.
  - Beim Ziehen bleibt er fest.
  - Ein größeres gespeichertes Spielgeld erweitert ihn.
- **Speichern:**
  - Regler und Feld ändern den Status sofort.
  - Die Einstellung wird 250 ms nach der letzten Änderung geschrieben.
- **Lump-Modus:**
  - Bei „auf einmal“ gibt es kein Extra in den Monatsbeträgen.
  - Die Karte zeigt dann eine Zeile „Möglich“.
  - Den Einmalbetrag behandelt weiter die Empfehlung der Zur-Seite-Kachel.
- **Prüfskript:** Das Namens-Prüfskript erlaubt jetzt genau den diktierten Satz „Zählt nicht zu Fixkosten, Rücklage und Aufteilung“.

## Neue und geänderte Texte

| Wo | vorher | jetzt |
|---|---|---|
| Hero, Quelle | „Gehalt“ | „Direkt bezahlt“ |
| Dialog, Quelle | „Rücklage \| Gehalt \| Spielgeld“ | „Rücklage \| Direkt“ |
| Dialog, ⓘ | „… Gehalt: zahlst du direkt. Spielgeld: aus deinem Spielgeld.“ | „Rücklage: Geld, das du jeden Monat zur Seite legst. Direkt: zahlst du sofort vom Gehalt.“ |
| Dialog, neu | – | „Nicht einplanen“ · ⓘ „Zählt nicht zu Fixkosten, Rücklage und Aufteilung. Zum Beispiel Käufe aus deinem Spielgeld.“ |
| Liste und Monat, Chip | „Gehalt“ / „Spielgeld“ | „Direkt“ / „nicht eingeplant“ |
| Aufteilung | „Direkt vom Gehalt“ · „Spielgeld-Überzug“ | „Direkt bezahlt“ · (entfällt) |
| Einstellungen, ⓘ | „So viel willst du jeden Monat frei ausgeben.“ | „Dein geplantes Spielgeld. Erbse prüft, ob es neben der Rücklage passt.“ |
| Sheet, ⓘ „Eingeplante Rechnungen“ | „… Zahlst du eine direkt vom Gehalt? …“ | „… Zahlst du eine direkt? …“ |
| Hero, Haken | „Feier noch einmal abspielen“ | (entfällt, kein Knopf mehr) |
| Spielgeld-Karte | „Spielgeld {Monat}“, „Ausgegeben“, „Limit“, „Woher kommt der Rest?“ … | (entfällt) |
| Karte „Dein Spielgeld“ | – | „Dein Spielgeld“ · „Spielgeld pro Monat“ · „Bis {Monat} möglich: € A“ · „Ab {Monat} möglich: € B“ · „Möglich: € B“ |
| Status, passt | – | „Passt. Du schaffst jeden Monat die € X bis {Monat}. Es bleiben dir € Y übrig.“ (ohne Extra ohne „bis {Monat}“) |
| Status, zu viel | – | „Zu viel. Bis {Monat} fehlen dir jeden Monat € X für deine Rücklage.“ · ohne Extra: „Dir fehlen jeden Monat € X für deine Rücklage.“ |
| Tipp | – | „Bis {Monat} kannst du dir bis zu € A Spielgeld erlauben. Ab {Monat} bis zu € B.“ · ohne Extra: „Du kannst dir bis zu € B Spielgeld erlauben.“ |
| Rechnung | – | „Gerechnet mit: Netto … − Zur Seite … − Direkt … − Vermögensaufbau …“ · „Netto geschätzt wie zuletzt.“ |
| Ohne Netto | – | „Trag dein Netto-Gehalt ein, dann rechnet Erbse dein Spielgeld.“ · „Gehalt eintragen“ |
| Walkthrough 3 | „Manches zahlst du direkt vom Gehalt oder aus deinem Spielgeld.“ · „Gehalt direkt“ | „Manches zahlst du direkt. Spielgeld planst du nur ein.“ · „Direkt bezahlt“ |

Die vollständige Liste mit Wortzahl je Satz steht in `TEXTE.md`.

## Screenshots (Chromium)

- `docs/screenshots/feier/*-03-hero-erledigt-liegend`: Hero erledigt mit liegenden Erbsen
- `docs/screenshots/feier/*-02-hero-erledigt`: direkt nach dem einen Fallen
- `docs/screenshots/spielgeld-planer/*-02-dein-spielgeld-passt`, `*-03-dein-spielgeld-zu-viel`, `*-01-dein-spielgeld-ohne-netto`
- `docs/screenshots/spielgeld-planer/*-04-nicht-einplanen`: Bearbeiten-Dialog
- `docs/screenshots/spielgeld-planer/*-05-monat-nicht-eingeplant`: die gedämpfte Zeile im Monat
- `docs/screenshots/ruecklage-spielgeld/*-01-woraus-zahlst-du`, `*-02-chip-direkt`, `*-04-gehalt-aufteilung`

## Testergebnisse

**Unit und Build:**
- Unit (vitest): 49 Dateien, 1232 Tests grün.
- `tsc -b` ist ohne Fehler.
- `pnpm build` ist grün, mit check-colors, check-glass-layers und check-bundle.

**Volle E2E-Suite (Chromium), einmal komplett:**

| Projekt | Ergebnis |
|---|---|
| desktop | 513 grün, 32 übersprungen. 16 rot, nur alte Texte: `fixkostenkonto` (Radio „Gehalt“), `tooltips` (alte ⓘ-Texte), `walkthrough` (Karte 3). Angepasst und neu gelaufen: 76 grün, danach `tooltips` mit dem neuen ⓘ „Nicht einplanen“ 10 grün. |
| iphone-15 | 269 grün |
| iphone-pro-max | 240 grün, 320 übersprungen. 1 rot: Screenshot-Test Positionen, Zeitlimit 30 s. Allein braucht er 25 s. Er hat jetzt `test.slow()` und läuft allein grün. |
| ipad-portrait | 257 grün |
| ipad-landscape | 245 grün |
| perf | Scrollen Monat, Scrollen Analyse, Tabwechsel grün. Feier: offen, siehe unten. |

Übersprungen heißt: Das Spec läuft absichtlich nur in bestimmten Projekten.

**WebKit:** `feier`, `hero-abzuege`, `spielgeld-planer`: 41 grün, 8 absichtlich übersprungen. Die WebKit-Screenshots sind verworfen und in Chromium neu erzeugt.

**Viewports:** iPhone SE, iPhone 15, iPad hoch und quer, Desktop 1440, je hell und dunkel. Das gilt in `feier`, `spielgeld-planer` und `ruecklage-spielgeld`.

**Offen: Perf-Messung der Feier:**
- Bisher hat der Test die Feier per Tipp auf den Haken neu gestartet. Das geht nicht mehr.
- Jetzt hakt er die letzte Position live ab und misst das Fallen ab 1,5 s danach.
- Allein läuft er grün: Ø 11,9 ms (iPhone 15) und 14,2 ms (iPhone SE), normalisiert, 4× gedrosselt.
- Im Lauf des ganzen Perf-Projekts ist iPhone 15 rot: 18,1 bis 21,3 ms.
- Mit den ersten 1,5 s gemessen sind es etwa 20 ms. Dann schaltet der Hero auf „erledigt“ und die Kategorie klappt zu.
- Ohne Fallen ist es ruhig: 2 Frames in 2,6 s. Die liegenden Erbsen kosten also nichts.
- Die Grenze 16 ms habe ich nicht geändert. Sag mir, ob ich das Fallen leichter machen soll, zum Beispiel mit weniger Erbsen.
- `docs/perf/liquid-glass.json` bleibt auf dem Stand von main.
