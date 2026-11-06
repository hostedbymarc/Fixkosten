# Start ohne Weiß (fix-white-start)

Nur Startverhalten, keine Logik. Daten, Dexie-DB-Name, `start_url` und Scope bleiben gleich.

## Ursache
- **Render-blockierendes Stylesheet:** Das App-CSS stand als `<link rel="stylesheet">` im `<head>`.
  Bis es geladen war, malte der Browser gar nichts. Bei einem langsamen Kaltstart war das der weiße Bildschirm.
- **Splash-Styles:** Auch Hintergrund und Splash kamen nur aus diesem CSS.
- **Startbild:** Die installierte App hatte kein iOS-Startbild. iOS zeigt dann bis zum ersten Paint eine leere Fläche.
- **Offline:** Es gab keinen Service Worker. `vite-plugin-pwa` war installiert, aber nie eingebunden.
  Ohne Netz startete die App gar nicht.

## Punkt · erledigt · Beleg
| Punkt | erledigt | Beleg |
|---|---|---|
| 1 Statischer Start-Bildschirm in `index.html` | ✅ | Grundfarbe, Mesh (Monat-Komposition als CSS-Verläufe) und flaches Logo inline, ohne JS und ohne externe Dateien. `src/lib/bootSplash.ts` füllt das beim Build aus `tokens.css`. |
| 1 · hell und dunkel, theme-color, html/body | ✅ | `prefers-color-scheme` und `data-theme`. `theme-color` je Theme kommt aus `--nebel-base`. `html,body` haben die Grundfarbe ab dem ersten Byte CSS. Unit-Test: jede Farbe stammt aus den Tokens. |
| 1 · Übergang ohne Springen | ✅ | Das Layout des Splash steht nur im Inline-CSS. Die App ergänzt nur Bewegung: Die drei Erbsen des Logos wellen an Ort und Stelle, dann fliegen sie ins Seitenmenü-Logo oder blenden aus. E2E: Logo-Box vor und nach App-Start gleich (≤ 1 px). |
| 1 · App-CSS blockiert nicht | ✅ | `rel="preload" … onload` statt `rel="stylesheet"` (Vite-Plugin im Build). `src/main.tsx` startet React und die Hintergrundebenen erst, wenn das CSS greift. |
| 2 iOS-Startbilder | ✅ | 60 PNGs in `public/startup/`: 12 iPhones hoch, 9 iPads hoch und quer, je hell und dunkel. Erzeugt mit `scripts/make-startup-images.mjs` aus dem Start-Bildschirm (Playwright). |
| 2 · hell und dunkel | ✅ | Dunkle Bilder zuerst mit `(prefers-color-scheme: dark)`, helle danach ohne Bedingung. Begründung unten. |
| 2 · Meta-Tags | ✅ | `apple-mobile-web-app-capable` = yes, `mobile-web-app-capable` = yes. `apple-mobile-web-app-status-bar-style` bleibt „default“ (black-translucent wäre hell unlesbar, contrast.test.ts). |
| 3 Service Worker | ✅ | `vite-plugin-pwa` (generateSW): `index.html`, Skripte, Styles, Schrift, Icons und alle Startbilder im Precache. `navigateFallback` auf `index.html`. Neue Version wartet, bis die App geschlossen ist: kein Neuladen mitten in der Eingabe. |

## Entscheidungen
- **Dunkle Startbilder:** Apple dokumentiert `prefers-color-scheme` im `media` von `apple-touch-startup-image` nicht.
  Reale Projekte nutzen es aber erfolgreich (z. B. Stacker News).
  - Darum: Dunkle Bilder kommen zuerst, mit Bedingung. Die hellen folgen ohne Bedingung.
  - Versteht iOS die Bedingung nicht, gilt das helle Bild. Dann gibt es nie Weiß und nie ein fehlendes Bild.
  - Bitte am iPhone prüfen. iOS speichert das Startbild beim Hinzufügen zum Home-Bildschirm.
    Nach einem Wechsel hell/dunkel braucht es eventuell eine Neuinstallation.
- **Startbild ohne Mesh:** Das Startbild ist das erste Bild des Start-Bildschirms, also Grundfarbe und Logo.
  - Das Mesh blendet danach in 600 ms ein (nur CSS).
  - Grund ist die Größe: Mit Mesh wären die 60 Bilder mehrere MB groß, so sind es 1,2 MB.
  - Der Übergang Startbild → Seite ist dadurch ohne Sprung.
- **Statusleiste:** Die Web-Ansicht der installierten App beginnt unter der Statusleiste („default“).
  - Das Startbild deckt den ganzen Bildschirm ab. Darum sitzt das Logo im Startbild um die Statusleistenhöhe tiefer.
  - Die Höhen je Gerät (20 bis 62 pt) stehen in `STARTUP_DEVICES`. Sie sind Erfahrungswerte, bitte am Gerät prüfen.
- **Ladeanimation:** Fallen und Verschmelzen der drei Erbsen entfallen. Sie würden das schon sichtbare Logo erst
  verschwinden lassen, also springen. Die Welle danach und der Ausflug ins Seitenmenü bleiben.
- **Kein Mindestauftritt mehr unsichtbar:** Der Start-Bildschirm ist ab dem ersten Bild da, nicht erst nach 300 ms.
  Bei schnellen Daten geht er nach etwa 0,6 s.
- **Failsafe:** Lädt das App-Skript gar nicht, verschwindet der Start-Bildschirm nach 15 s (vorher 8 s).
  Ein langsamer Erststart behält so das Logo.
- **E2E-Tests:** Service Worker sind in Playwright global blockiert. So sieht `page.route()` jede Anfrage.
  Nur der Offline-Test schaltet ihn ein.

## Manuell prüfen
- [ ] iPhone: App ganz schließen, vom Home-Bildschirm öffnen → kein weißer Moment, hell und dunkel
- [ ] iPhone: Flugmodus an, App öffnen → gleicher Start, kein Weiß
- [ ] iPad hoch und quer: Startbild passt, nichts verzerrt

Hinweise dazu:
- Zuerst die Seite einmal mit Netz öffnen, damit der Service Worker installiert ist.
- Danach die App vom Home-Bildschirm entfernen und neu hinzufügen. Erst dann übernimmt iOS die neuen Startbilder.
