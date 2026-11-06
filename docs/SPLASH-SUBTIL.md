# Splash subtil (splash-subtil)

Nur Start-Bildschirm und Ladeanimation, keine Logik.

## Ursache des doppelten Logos
- Das iOS-Startbild (`apple-touch-startup-image`) enthielt selbst ein Logo.
  Es saß um eine geschätzte Statusleistenhöhe tiefer, weil die Web-Ansicht unter der Statusleiste beginnt.
- iOS zeigt beim Kaltstart zuerst das Startbild und blendet dann in den ersten Paint der Seite über.
- Während dieser Überblendung waren zwei Logos zu sehen:
  - das blasse, ausblendende Logo des Startbilds, versetzt,
  - das grüne Logo aus `index.html`.
- Die geschätzte Höhe passte nicht genau, darum lagen die beiden Logos nicht übereinander.
- Abhilfe: Die Startbilder zeigen nur noch den Hintergrund. Das einzige Logo ist das Element in `index.html`.
  Es lebt vom ersten Paint bis zum Ausblenden. Die App startet nichts neu und erzeugt kein zweites Logo.
- iPad und Desktop: Das Seitenmenü-Logo bleibt verborgen, solange der Start-Bildschirm da ist,
  auch während des Ausblendens (`[data-splash]`).

## Punkt · erledigt · Beleg
| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Genau ein Logo | ✅ | Ein Element `.splash-mark` von Anfang bis Ende; Startbilder ohne Logo; Seitenmenü-Logo verborgen. E2E zählt in jedem Frame der Startphase die sichtbaren Logos (≤ 1, unter dem Start-Bildschirm genau 1) und prüft per Pixel, dass außerhalb der Logo-Box keine Erbsenkanten sind. |
| 2 Kleiner | ✅ | 48 pt (iPhone), 56 pt ab 768 px (iPad, Desktop), mittig. Geometrie des App-Icons: drei überlappende Kreise, flach, Deckkraft 100 / 85 / 70 %. E2E misst Breite, Höhe und Mitte. |
| 3 Einblenden links → rechts | ✅ | Reines CSS im statischen Start-Bildschirm: je Erbse 240 ms von 0 auf ihre Deckkraft, 4 pt Gleiten von links, Versatz 120 ms. E2E misst die Deckkraft bei 60 / 180 / 300 / 470 ms, mit und ohne JavaScript. |
| 3 · Puls | ✅ | Danach, solange geladen wird: Deckkraft als Welle links → rechts zwischen Grund-Deckkraft und 40 %, 1,4 s je Zyklus, Versatz 150 ms. |
| 3 · Ende | ✅ | Logo und Hintergrund blenden zusammen in 200 ms aus. Kein Flug, kein Zoom. |
| 3 · nur opacity und translateX | ✅ | Unit- und E2E-Test prüfen die Keyframes: kein Filter, kein Skalieren. |
| 3 · Bewegung reduzieren | ✅ | Erbsen stehen sofort, kein Gleiten, kein Puls, nur das Ausblenden. |
| 3 · Übernahme ohne Neustart | ✅ | Die App fasst das Element nicht an. E2E: gleiche `startTime` der Animationen und gleiche Logo-Box (≤ 1 px) vor und nach dem App-Start. |
| 4 Startbilder | ✅ | 60 PNGs neu erzeugt (`scripts/make-startup-images.mjs`), nur Grundfarbe, 888 KB. E2E prüft Größe und dass jedes Bild nur die Grundfarbe zeigt. |

## Manuell prüfen
- [ ] iPhone: App ganz schließen, vom Home-Bildschirm öffnen → kein Weiß, ein kleines Logo, Erbsen kommen von links nach rechts, sanftes Pulsieren, kein doppeltes Logo
- [ ] iPhone: „Bewegung reduzieren“ an → Erbsen stehen sofort da, kein Pulsieren
- [ ] iPad hoch und quer: Logo mittig, nichts verzerrt

Wichtig: iOS übernimmt neue Startbilder erst nach einer Neuinstallation.
Die App also vom Home-Bildschirm entfernen, die Seite in Safari einmal öffnen, dann neu hinzufügen.
Sonst zeigt iOS noch das alte Startbild mit Logo.
