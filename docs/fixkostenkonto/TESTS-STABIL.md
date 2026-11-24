# Tests stabil

Branch `tests-stabil` gegen `main`. Für Nutzer ändert sich nichts: kein Text, keine Rechnung, kein Layout. Datenbankname, Subdomain und Export-Format bleiben gleich.

Diese Tests waren in den letzten Sprints je einmal rot und beim Wiederholen grün. Hier stehen die Ursachen und die Fixes, ohne Wiederholung.

## Test · Ursache · Fix · Beleg

| Test | Ursache | Fix | Beleg |
|---|---|---|---|
| perf-feier iPhone SE (16,0–16,2 ms bei Grenze 16) | Die 60 Erbsen hatten eigene Verzögerungen (0–0,9 s) und eigene Falldauern (1,6–3,2 s). Chrome weckt den Haupt-Thread, wenn eine Compositor-Animation startet oder endet. Fast jeder Frame war so ein Wechsel, und dann wurden alle Erbsen neu berechnet. Dazu kamen 60 `animationend`-Events über React. Die Messgröße „Ø Frame-Zeit“ zählt die Leerlaufzeit bis zum nächsten Vsync mit, daher ~16 ms. | `Confetti.tsx`: Web Animations statt CSS-Keyframes. Alle Erbsen laufen auf einer gemeinsamen Zeitleiste von 4,1 s. Verzögerung und Dauer stecken als Haltepunkte in den Keyframe-Offsets. Gleiches Bild, gleiche Easing-Kurve, nur `transform`/`opacity`. `perf.spec.ts` misst jetzt die Haupt-Thread-Arbeit pro Frame. | Haupt-Thread-Frames im Fenster: 94–117 → 5–8. Haupt-Thread-Zeit: 312–511 ms → 21–34 ms. Perf-Feier 10 von 10 grün (je 5 × iPhone 15 und SE) |
| month.spec „bottom sheet: pay open position …“ (iPad quer) | `fill()` und `click()` kamen, während das Sheet noch hereinglitt. Unter Last trifft der Klick dann den Hintergrund, und das Sheet schließt ohne Speichern. Zusätzlich setzt `BottomSheet` den Fokus erst nach dem ersten Paint aufs Panel. Das kann mitten in `fill()` landen. | Neue Helfer `sheetSettled()` und `openDetails()`: warten, bis das Sheet kein `data-animating` mehr hat und den Fokus hält. In allen Sheet-Tests von `month.spec` eingesetzt. | 40 von 40 grün bei 12-facher CPU-Drosselung und 4 Workern. Die Anzeige brauchte höchstens 2,7 s |
| Splash „Start ohne Netz“ | Offline kommt die App aus dem Service-Worker-Cache. Der Test fragte den Splash in mehreren Schritten ab, während die App schon übernehmen konnte. Unter Last: Logo weg, `boundingBox()` leer oder Screenshot nach der Übernahme. | Der Test-Build hat einen Schalter `holdStart`. Die App wartet dann auf ein Tor, das der Test nach dem Screenshot öffnet. Das entspricht dem Online-Test, der die Unterressourcen hält. Im Produktions-Build ist der Schalter immer aus (`IMPORT_TRACE`). | Unter Last vorher 4 von 10 grün, nachher 10 von 10 |
| from-net in WebKit (30-s-Grenze) | Das rote Mal kam aus einer Prüfkonfiguration außerhalb des Repos. Sie lief als Projekt „desktop“ mit Playwrights Standard von 30 s. Die offiziellen WebKit-Projekte haben 60 s, weil WebKit ohne GPU in Software rendert. Der erste Test einer Datei zahlt den Kaltstart des Browsers. | WebKit nur noch mit den offiziellen Projekten `webkit-*` prüfen. In der Spec selbst gibt es keine feste Wartezeit, die man ersetzen könnte. | `webkit-*` from-net 24 von 24 grün, längster Test 17 s. Siehe Nachweis |
| Testhelfer: feste Wartezeiten | Feste Pausen vor Screenshots und nach Gesten. Unter Last zu kurz, sonst zu lang. | Neuer Helfer `settled(page)`: Schriften geladen, jede endliche Animation und Transition fertig (ohne die Hintergrund-Drift), danach zwei gezeichnete Frames. | Liste unten |

## Messgröße der Feier, Begründung

Die Grenze bleibt 16 ms. Die Ausnahme von 22 ms für das iPhone 15 fällt weg, beide Geräte bekommen 16 ms.

Die alte Größe war die Spanne jedes Haupt-Thread-Frames, also von der ersten Aufgabe bis zum fertigen Rendern. Wartezeit innerhalb des Frames zählte mit. Solange jeder Frame Arbeit hatte, passte das. Jetzt läuft der Fall im Compositor, und der Haupt-Thread zeichnet in 2,6 s nur noch 5 bis 8 Frames. Deren Spanne ist vor allem das Warten auf den nächsten Vsync: 10–27 ms bei 2–4 ms Arbeit. Ein Median aus 5 Läufen hilft da nicht, die Größe misst schlicht keine Arbeit mehr.

Darum prüft der Test jetzt drei Dinge:
- Die Arbeit pro Frame bleibt unter 16 ms.
- Es gibt weniger als 30 Haupt-Thread-Frames im Fenster. Das sichert den Fix gegen Rückfall, vorher waren es rund 100.
- Die Erbsen fallen, wenn das Fenster beginnt.

Die alte Spanne steht weiter als `avgFrameMs` in `docs/perf/liquid-glass.json`.

Zur Ehrlichkeit: Die Arbeit pro Frame lag auch vorher nur bei 3–5 ms. Mit der neuen Messgröße allein wäre `main` also schon grün. Der eigentliche Gewinn ist die Zahl der Frames und damit die Haupt-Thread-Zeit: minus 93 %.

## Perf-Werte vorher / nachher

Je 5 Läufe, CPU-Drosselung 4×, Werte normalisiert mit dem Kalibrierfaktor. Vorher = `main` (21b8330) mit den Tests dieses Branches gemessen.

| Messung | | Haupt-Thread-Frames | Haupt-Thread-Zeit (ms) | Arbeit pro Frame (ms) | alte Spanne (ms) |
|---|---|---|---|---|---|
| Feier iPhone 15 | vorher | 113, 94, 108, 117, 105 | 460, 391, 481, 511, 449 | 4,0 · 3,8 · 4,5 · 3,1 · 4,0 (Median 4,0) | 17,5 · 18,8 · 18,1 · 12,0 · 17,3 (Median 17,5) |
| Feier iPhone 15 | nachher | 5, 8, 7, 6, 6 | 23, 27, 34, 32, 22 | 4,6 · 2,8 · 4,0 · 5,3 · 3,7 (Median 4,0) | 27,3 · 16,9 · 15,0 · 20,6 · 15,7 (Median 16,9) |
| Feier iPhone SE | vorher | 107, 110, 101, 116, 110 | 387, 370, 341, 312, 334 | 2,7 · 3,4 · 3,4 · 2,6 · 3,0 (Median 3,0) | 12,2 · 15,8 · 17,5 · 15,0 · 15,7 (Median 15,7) |
| Feier iPhone SE | nachher | 7, 6, 8, 6, 8 | 21, 33, 32, 23, 22 | 2,0 · 3,7 · 4,1 · 3,8 · 2,8 (Median 3,7) | 11,0 · 11,5 · 16,1 · 15,7 · 17,4 (Median 15,7) |

Grün nachher: Feier 10 von 10 (je 5 × iPhone 15 und SE). Vorher war das iPhone SE mit der alten Größe in 1 von 5 Läufen über 16 ms (17,5), der Median lag mit 15,7 ms knapp darunter. Mit den neuen Prüfungen ist `main` rot, weil es rund 100 Haupt-Thread-Frames statt unter 30 braucht. Die alte Spanne bleibt nachher so laut wie vorher. Sie misst bei wenigen Frames das Warten auf den Vsync.

| Perf (iPhone-Profil, Ø Frame-Zeit normalisiert, ms) | | Scrollen Monat | Scrollen Analyse | Tabwechsel | grün |
|---|---|---|---|---|---|
| | vorher | 13,2 · 13,5 · 14,7 · 9,9 · 10,1 (Median 13,2) | 13,0 · 13,2 · 13,8 · 13,3 · 10,5 (Median 13,2) | 12,3 · 14,2 · 11,1 · 12,5 · 13,3 (Median 12,5) | 5/5 |
| | nachher | 14,1 · 12,1 · 13,6 · 13,2 · 12,7 (Median 13,2) | 11,4 · 12,1 · 10,7 · 12,3 · 10,1 (Median 11,4) | 11,7 · 12,5 · 13,6 · 14,0 · 12,8 (Median 12,8) | 5/5 |

Perf (Scrollen, Tabwechsel) misst unverändert die alte Größe mit Grenze 16 ms, dieser Sprint ändert dort nichts.

## Ersetzte feste Wartezeiten

| Datei | Helfer | vorher | nachher |
|---|---|---|---|
| `e2e/fixtures.ts` | `touchSwipe` | 250 ms | `settled()` |
| `e2e/alle-monate-gleich.spec.ts` | `shot` | Sheet-Animation + 400 ms + Schriften | `settled()` |
| `e2e/monat-feinschliff.spec.ts` | `shot` | Sheet-Animation + 400 ms + Schriften | `settled()` |
| `e2e/monat-ist-monat.spec.ts` | `shot` | Sheet-Animation + 400 ms + Schriften | `settled()` |
| `e2e/plan-optionen.spec.ts` | `shot` | Sheet-Animation + 400 ms + Schriften | `settled()` |
| `e2e/komplett-ansparen.spec.ts` | `shot` | Sheet-Animation + 400 ms + Schriften | `settled()` |
| `e2e/feinschliff-puffer.spec.ts` | `shot` | Sheet-Animation + 300 ms + Schriften | `settled()` |
| `e2e/walkthrough.spec.ts` | `shot` | Sheet-Animation + 350 ms + Schriften | `settled()` |
| `e2e/monat-verdichtet.spec.ts` | `shot` | Sheet-Animation, Scrollen + 300 ms + Schriften | Scrollen + `settled()` |
| `e2e/tooltips-screens.spec.ts` | `shot` | Sheet-Animation + Schriften + 200 ms | `settled()` |
| `e2e/savings.spec.ts` | `shot` | Stil-Tag + 250 ms | Stil-Tag + `settled()` |
| `e2e/ein-popover.spec.ts` | `shot` | 250 ms + Schriften | `settled()` |
| `e2e/glass-layers.spec.ts` | `settle` | Animationen + 150 ms | `settled()` |
| `e2e/print-glass.spec.ts` | `settle` | Animationen + 150 ms | `settled()` |
| `e2e/top-fade.spec.ts` | `settle` | Animationen + 150 ms | `settled()` |
| `e2e/fullpage.spec.ts` | `settle` | Animationen + 250 ms | `settled()` |
| `e2e/monat-layout.spec.ts` | `settle` | Schimmer weg + 700 ms + Schriften | Schimmer weg + `settled()` |
| `e2e/month.spec.ts` | Sheet öffnen | Klick, dann sofort `fill()` | `openDetails()` / `sheetSettled()` |
| `e2e/start-screen.spec.ts` | Start ohne Netz | `waitFor('attached')`, dann Rennen gegen die App | `holdStart`-Tor, `waitFor('visible')` |
| `e2e/plan-optionen.spec.ts` | Import (PR #58) | Neuladen während des Imports | Warten auf „Sicherung importiert“ |

Feste Wartezeiten bleiben dort, wo die Zeit selbst geprüft wird. Beispiele sind Perf-Messfenster, „bleibt offen ohne Hover“ und Animationsphasen der Feier. Diese Stellen sind keine Helfer.

## Nachweis

NACHWEIS

## Merge

MERGE
