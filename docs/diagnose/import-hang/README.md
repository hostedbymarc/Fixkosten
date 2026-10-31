# Diagnose: Import-Hänger („Setup-Dialog sichtbar, Hero nicht“)

Stand: 31.10.2026, Branch `import-hang`.

## Ergebnis in einem Satz

In 18.000 Importen unter Last (2 Läufe × 6 Geräte × 3 Importwege × 500) ist **kein einziger Hänger**
aufgetreten. Damit gibt es keinen Befund (kein Schritt, kein Stack-Trace, kein Dump), und die
Ursache ist **nicht eindeutig**. Laut Merge-Regel: nicht raten, PR offen.

## Harness

- `e2e-harness/import-hang.spec.ts`, eigene Config `playwright.harness.config.ts`, eigener Build mit
  Schrittprotokoll (`ERBSE_IMPORT_TRACE=1`, `src/lib/importTrace.ts`). Im normalen Build ist das
  Protokoll nicht enthalten (grep auf `dist/`: keine Treffer).
- Nur Import → Hero sichtbar; Worker-Zahl wie im Gesamtlauf (2 bei 4 Kernen), jede Iteration in
  einem frischen Kontext, Browser pro Worker wiederverwendet wie in der Suite.
- Importwege:
  - **Fixture**: Setup-Dialog → Datei `e2e/fixtures/…` wählen.
  - **`importSprint`**: Setup-Dialog → Puffer aus `sprintBackup()`.
  - **UI-Import**: „Leer starten“ → Einstellungen → Sicherung importieren → Ersetzen → Monat.
- Geräte: iPhone SE, iPhone 15, iPhone Pro Max (zusätzlich, weil auch in der Suite), iPad hoch,
  iPad quer, Desktop.
- Watchdog nach 10 s: eigene CDP-Session mit `Runtime.evaluate("1")` (2 s Timeout),
  `Debugger.pause` und Call-Frames, bei antwortendem Thread Dump (Dexie-Zustand, offene
  IDB-Transaktionen, IDB-Ereignisse inkl. `blocked`/`versionchange`, Importschritte,
  `serviceWorker.controller`, letzte 50 Konsolenzeilen), Playwright-Trace und Chromium-Performance-
  Trace. Ablage: `harness-results/hangs/…` – **in keinem Lauf angelegt**, der Watchdog hat nie
  ausgelöst.
- Last: mittlere CPU-Auslastung 77–89 % (p90 84–96 %) gegenüber 67,5 % in einem Ausschnitt des
  Gesamtlaufs. Kein zusätzlicher Lastgenerator nötig.

## Hänger-Rate je Gerät und Importweg

Je Zelle: Hänger / Iterationen, Median und Maximum bis Hero.

### Lauf 1 – vor dem Timeout-Patch (Commit ee78fa5)

| Gerät | Fixture | `importSprint` | UI-Import |
|---|---|---|---|
| iPhone SE | 0/500 · 615 / 843 ms | 0/500 · 630 / 817 ms | 0/500 · 1.736 / 2.634 ms |
| iPhone 15 | 0/500 · 635 / 1.007 ms | 0/500 · 655 / 871 ms | 0/500 · 1.828 / 2.300 ms |
| iPhone Pro Max | 0/500 · 625 / 865 ms | 0/500 · 649 / 851 ms | 0/500 · 1.828 / 2.407 ms |
| iPad hoch | 0/500 · 714 / 1.069 ms | 0/500 · 700 / 977 ms | 0/500 · 2.150 / 2.681 ms |
| iPad quer | 0/500 · 785 / 984 ms | 0/500 · 757 / 1.006 ms | 0/500 · 2.262 / 2.771 ms |
| Desktop | 0/500 · 803 / 1.160 ms | 0/500 · 791 / 981 ms | 0/500 · 2.306 / 2.841 ms |

### Lauf 2 – nach dem Timeout-Patch (Commit fe80443)

| Gerät | Fixture | `importSprint` | UI-Import |
|---|---|---|---|
| iPhone SE | 0/500 · 602 / 1.123 ms | 0/500 · 619 / 898 ms | 0/500 · 1.708 / 2.430 ms |
| iPhone 15 | 0/500 · 625 / 974 ms | 0/500 · 646 / 898 ms | 0/500 · 1.814 / 2.363 ms |
| iPhone Pro Max | 0/500 · 653 / 969 ms | 0/500 · 676 / 972 ms | 0/500 · 1.937 / 2.594 ms |
| iPad hoch | 0/500 · 747 / 1.124 ms | 0/500 · 728 / 1.020 ms | 0/500 · 2.202 / 2.933 ms |
| iPad quer | 0/500 · 816 / 1.411 ms | 0/500 · 781 / 1.165 ms | 0/500 · 2.312 / 3.120 ms |
| Desktop | 0/500 · 840 / 1.269 ms | 0/500 · 817 / 1.245 ms | 0/500 · 2.372 / 3.047 ms |

Rohdaten: `run-*/results.jsonl.gz` (eine Zeile je Iteration), `run-*/cpu.json`, `run-*/runs.txt`.

**Statistische Einordnung (95 %, „Dreierregel“ 3/n):** je Lauf 0/9.000 → Rate < 1/3.000 je
Import; beide Läufe zusammen 0/18.000 → < 1/6.000. Je Gerät (0/3.000 über beide Läufe) nur
< 1/1.000, je Gerät und Weg (0/1.000) < 1/333.

## Schritt, Stack-Trace

| | Befund |
|---|---|
| Hänger-Rate | 0 in 18.000 |
| Hängender Schritt | – (nie aufgetreten) |
| Stack-Trace | nein – kein Hänger, also nichts zu pausieren |

## Was das bedeutet

- Der Import selbst hängt isoliert nicht, auch nicht unter mehr Last als im Gesamtlauf. Die
  Signatur aus PR #33 trat bisher nur **mitten in der vollen Suite** auf (Desktop, iPad hoch), wo
  derselbe Browser vorher viele andere Tests (Analyse mit Charts, Tabwechsel mit View
  Transitions, Wischen) ausgeführt hat. Das ist die naheliegende Differenz – aber eine
  Vermutung, kein Befund.
- Die volle Suite lief auf fe80443 **zweimal hintereinander grün ohne Ausnahme-Regel**
  (je 1.185 bestanden, 108 übersprungen, 0 fehlgeschlagen, je ca. 1,1 h). Auch dort kein Hänger.

## Was trotzdem geändert wurde (unabhängig von der Ursache)

Datensicherheit laut Auftrag §3:

- Import in **einer** Dexie-Transaktion über alle Tabellen (`importTransaction`, `src/db/backup.ts`).
- **Timeout** 20 s (`IMPORT_TIMEOUT_MS`): Transaktion wird abgebrochen, IndexedDB rollt zurück;
  Meldung „Der Import hat zu lange gedauert und wurde abgebrochen. Es wurde nichts geändert –
  bitte erneut versuchen.“ Hat die Transaktion noch nicht begonnen (Datenbank öffnet noch, z. B.
  `blocked`), läuft sie danach gar nicht mehr.
- **Einstellungen → Import**: Fehler wurden bisher nicht abgefangen (unbehandelte Ablehnung, keine
  Meldung); jetzt erscheint die Meldung, Daten bleiben unverändert.
- Tests (`src/db/import-safety.test.ts`): Fehler in Tabelle 3 (Erststart, Ersetzen,
  Zusammenführen) und echter Constraint-Fehler → Datenbank exakt wie vorher; blockiertes Öffnen →
  Timeout innerhalb der Frist, nichts geschrieben, erneuter Versuch klappt.

## Vorschlag für den nächsten Schritt (nicht umgesetzt)

Den Watchdog aus dem Harness als Fixture in die **normale e2e-Suite** einbauen (nur im
Trace-Build), damit das nächste echte Auftreten in der Suite einen Dump mit Schritt, Stack und
Traces hinterlässt. Erst mit diesem Befund lässt sich die Ursache zuordnen.
