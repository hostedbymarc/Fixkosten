# Import-Hänger vom 31.10.2026 (ipad-landscape)

Erster echter Hänger, den der Import-Watchdog (`e2e/import-watchdog.ts`) in der vollen Suite
erfasst hat. Lauf auf Commit c2ea8df (Branch `import-hang`, PR #34): 1.184 bestanden,
**1 fehlgeschlagen**, 120 übersprungen, 3 nicht gelaufen, 1,1 h.

- Test: `e2e/month.spec.ts:108` – „Meine Immos: first group; Baurechtszins only in Kommt bald for
  October, due in December“, Projekt **ipad-landscape** (1180 × 820).
- Import über den Setup-Dialog (Datei `tests/fixtures/seed.json`, Modus `first`).
- Browser: Chromium 141.0.7390.37 (Playwright 1.56.1), Trace-Build `dist-e2e`.

## Befund

1. **Der Import selbst ist fertig.** Alle Schritte im Protokoll, im Abstand von Millisekunden:
   `file-chosen` → `file-read` → `json-parsed` → `validated` → `tx-start` → 7 × `table-written`
   → `committed` (08:21:22.105) → `livequery-dataset {"loaded":true}` (08:21:22.109).
   Die Daten sind gespeichert; der Hänger kommt danach.
2. **Danach steht der ganze Renderer-Prozess, nicht nur JavaScript.**
   - `Runtime.evaluate("1")`: keine Antwort in 2 s.
   - `Debugger.pause`: Timeout (der Debugger war vor dem Laden aktiviert). Bei einem reinen
     JavaScript-Einfrieren kommt `Debugger.pause` durch – im Watchdog-Test (Endlosschleife)
     liefert es den Stack.
   - `Performance.getMetrics` und Screenshot: Timeout.
   - Chromium-Trace (13 s während des Hängers): **0 Ereignisse aus dem Renderer**. Browser- und
     GPU-Prozess laufen normal (Viz-Compositor tickt mit 60 Hz). Zum Vergleich: der künstlich
     eingefrorene Haupt-Thread im Watchdog-Test lieferte 4.392 Renderer-Ereignisse.
   - Kein `crash`-Ereignis der Seite.
   - Damit: keine Endlosschleife in unserem Code, nicht IndexedDB.
3. **Zeitpunkt:** Danach kommt `livequery-setup {"setup":false}` nicht mehr, ebenso wenig
   `setup-dialog-closed`; React hat den Wechsel vom Setup-Dialog zur App nicht mehr gezeigt.
   Der letzte Screencast-Frame (08:21:22.244) zeigt noch den Splash mit den drei Erbsen, etwa
   720 ms nach Beginn der Navigation. Der Splash beginnt nach `SPLASH_MIN_MS` = 700 ms
   auszublenden (`#splash.splash-out`, `src/lib/entrance.ts`) und gibt dabei den Setup-Dialog mit
   Blur (`.glass`, backdrop-filter) frei. Danach wird nichts mehr gezeichnet.
   **Das ist ein zeitliches Zusammentreffen, kein Beweis für die Ursache.**

## Einschätzung

Der Renderer-Prozess von Chromium hängt in nativem Code, ausgelöst vermutlich durch das, was in
diesem Moment gezeichnet wird (Splash blendet über dem geblurrten Dialog aus), oder durch einen
Fehler im Browser. Ohne native Stacks ist die Ursache nicht eindeutig.

## Nächste Schritte (Abschluss-Sprint, neue Session)

- **A:** Watchdog um die Betriebssystem-Sicht auf den Renderer-Prozess erweitern: native Stacks
  aller Threads (`gdb`), Prozesszustand, Kernel-Wartestelle (`wchan`), CPU-Verbrauch.
- **B:** Experiment-PR zur Splash-Theorie (z. B. Blur erst nach dem Ausblenden des Splash, oder
  Setup-Dialog erst danach), über mehrere Suite-Läufe beobachtet.

## Dateien

| Datei | Inhalt |
|---|---|
| `report.json` | Bericht des Watchdogs: Haupt-Thread-Check, Debugger, Schritte, Konsolenzeilen |
| `chromium-trace.json.gz` | Chromium-Performance-Trace, 13 s ab dem Auslösen des Watchdogs (gzip) |
| `playwright-trace.zip` | Playwright-Trace des ganzen Tests (Aktionen, Konsole, Screencast); öffnen mit `npx playwright show-trace` |
| `frames/01-datei-gewaehlt.jpeg` | Screencast 08:21:22.056 – Datei gewählt, Splash noch sichtbar |
| `frames/02-nach-commit.jpeg` | Screencast 08:21:22.109 – direkt nach `committed` |
| `frames/03-letzter-frame.jpeg` | Screencast 08:21:22.244 – letzter Frame vor dem Hänger |

Gekürzt wurde nichts: Alles zusammen ist etwa 0,75 MB. Der Chromium-Trace beginnt erst mit dem
Watchdog, also nach dem Hänger, und enthält deshalb keine Zeit davor. Die Zeit vor dem Hänger
steht im Playwright-Trace.
