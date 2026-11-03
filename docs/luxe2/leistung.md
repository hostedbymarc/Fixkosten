# Luxe 2 – Leistung (Phase A)

Messung: Chromium headless, iPhone-15-Profil (393 × 852, DPR 3, Touch), **4× CPU-Drosselung** (CDP
`Emulation.setCPUThrottlingRate`), Scrollen über die ganze Seite hinunter und zurück in 4 s per
`requestAnimationFrame`, Frame-Abstände gemessen. Daten: Seed-Fixture.

| Screen | Drift | Frames | Ø Frame-Zeit | p95 | max |
|---|---|---|---|---|---|
| Monat | an | 250 | 16,0 ms | 16 ms | 16 ms |
| Monat | aus | 250 | 16,0 ms | 16 ms | 16 ms |
| Analyse | an | 250 | 16,0 ms | 16 ms | 16 ms |
| Analyse | aus | 250 | 16,0 ms | 16 ms | 16 ms |

Jeder Frame im 60-Hz-Takt (16,7 ms Vsync), kein verlorener Frame, mit und ohne Drift. Abgebaut wurde
daher nichts: Drift an, Blur 24 px, Glas auf den KPI-Kacheln.

Grenzen der Messung: Headless-Chromium rendert ohne GPU; das zeigt, dass der Hauptthread auch
gedrosselt nicht zum Engpass wird, ersetzt aber nicht das echte iPhone (GPU-Kosten von Blur über einer
bewegten Ebene). Drift und Hero-Farbflächen laufen nur 20 s nach einem Screen-Wechsel und pausieren
bei verstecktem Tab; der Schalter für den Abbau ist `DRIFT` in `src/lib/aurora.ts`, der Blur
`--glass-blur`.
