# Polish „Fixkosten einplanen“ · Punkt · erledigt · Beleg

Nur Darstellung und Texte. Keine Rechenlogik geändert: alle Zahlen kommen weiter aus `kontoState()`.
Interne IDs, Feldnamen und testids bleiben. Neu sind nur testids für neue Elemente.

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Seitenmenü-Logo überlappend wie das App-Icon | ✅ | `PeaMark` in `src/components/Logo.tsx`: drei flache Kreise, r 3,4 bei cx 9 / 14 / 19 im 28-px-Raster, Deckkraft 100 / 85 / 70 %. Kein Verlauf, kein Glanz, kein Schatten. Farbe Token `--c-mark`: hell brand-500, dunkel brand-300. E2E `rebrand`: Geometrie, Deckkraft, Farbe = Token, kein Filter. Screenshots 07 und 08. |
| **2** Kachel zeigt die nächste Aufgabe | ✅ | `NextTask` in `KontoStatusView.tsx`: Satz mit Betrag und Termin, „Erledigt“, darunter der Balken. Ohne beantwortete Fragen: Satz und „Jetzt starten“. Unit-Test `kontoTile.test.ts` für alle Fälle, E2E `konto-tile-polish`: Start · Dauerauftrag · Lücke · eingeplant. |
| **3** Keine doppelten Titel | ✅ | Kachel: nur die kleine Überschrift mit ⓘ. Status „Fixkosten einplanen“ ist nur noch für Screenreader da (Kachel, Sheet, Plan, Einstellungen). Analyse: kein Status und kein Fortschritt mehr. E2E zählt die sichtbaren Titel. |
| **4** Fortschrittsbalken | ✅ | `.progress-track`: hell brand-100, dunkel Weiß mit 12 %, Rand 1 px aus `--c-track-edge` (hell brand-500, dunkel brand-400). Balken und Text linksbündig in einer Zeile. Kontrast im Unit-Test über Tokens und im E2E aus echten Pixeln. |
| **5** Einstellungen mit Termin | ✅ | „Einmalig zur Seite legen“: „€ 1.087,34 bis 24. Jänner“ (`konto-summary-gap` + `konto-summary-gap-by`). E2E vergleicht mit dem Satz der Kachel. |

## Entscheidungen, bitte prüfen
- **Kontrast der Spur:** brand-100 hat gegen die helle Kachel nur etwa 1,1:1. 3:1 geht mit dieser Fläche nicht.
  Darum hat die Spur einen 1-px-Rand in Brand-Grün. Der Rand erreicht ≥ 3:1, die Fläche bleibt brand-100.
- **Datum ohne Jahr:** „24. Jänner“ statt „24. Jänner 2027“, wie in deinem Beispiel. Liegt der Tag ein Jahr
  oder weiter weg, steht das Jahr dabei. Gilt für Kachel, Plan, Sheet und Einstellungen.
- **Lücke in der Kachel:** Unter der Aufgabe steht klein „Ab Februar 2027 reicht das Geld nicht.“ mit dem Warnsymbol.
  So bleibt der Grund sichtbar.
- **Knöpfe:** Dauerauftrag: „Erledigt“. Lücke: weiter „Erledigt, zur Seite gelegt“.
- **Start-Ansicht:** Satz „Erbse sagt dir, wie viel du monatlich zur Seite legst.“ (wie die Einladung) und „Jetzt starten“.
- **Monatsbetrag in der Kachel:** steht nur noch im Zustand „Alles eingeplant“. Davor zeigt die Kachel die Aufgabe.

## Neue Texte
| Wo | Text |
|---|---|
| Kachel, Start | „Jetzt starten“ |
| Kachel, Aufgabe mit Konto | „Dauerauftrag einrichten: € X am 1.“ / „Dauerauftrag prüfen: € X am 1.“ |
| Kachel, Aufgabe ohne Konto | „Leg monatlich am 1. € X zur Seite.“ |
| Einstellungen | „€ Y bis 24. Jänner“ / „€ Y jetzt“ |
| überall | Datum „24. Jänner“ statt „24. Jänner 2027“ |

Entfallen sichtbar: die große Wiederholung „Fixkosten einplanen“ in Kachel, Sheet, Plan und Einstellungen und der Status in der Analyse.
