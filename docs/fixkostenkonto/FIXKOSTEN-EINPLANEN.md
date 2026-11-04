# Fixkosten einplanen · Punkt · erledigt · Beleg

Basis: PR #40 nach der Überarbeitung. Interne IDs, Feldnamen und testids bleiben (`fixkostenkonto`,
`konto-*`, `hasAccount`, `orderRuns`). Neu sind nur testids für neue Elemente.

| Punkt | erledigt | Beleg |
|---|---|---|
| **1** Für alle: „Fixkosten einplanen“, Handlung „zur Seite legen“ | ✅ | Alle sichtbaren Texte in `src/lib/kontoTexts.ts`. Unit-Test: kein „einzahlen“, „gedeckt“, „Fixkostenkonto eröffnen“. |
| 1 · Einrichtung, ein Schritt pro Screen | ✅ | `KontoSetupSheet`: Konto ja/nein → „Wie viel hast du heute schon …?“ mit „Noch nichts“ → Dauerauftrag nur bei „Ja“. „Frage n von 3“ bzw. „von 2“. E2E beide Varianten. |
| 1 · „Fixkostenkonto eröffnen“ entfällt | ✅ | Plan hat zwei Punkte: Monatsbetrag, Einmalbetrag. Unit-Test über 72 Kombinationen: immer `order`, `gap`. |
| 1 · Plan mit Konto | ✅ | „Dauerauftrag einrichten/prüfen: € X monatlich am {Tag} auf dein Fixkostenkonto“ + „Betrag kopieren“. |
| 1 · Plan ohne Konto | ✅ | „Leg jeden Monat € X für Fixkosten zur Seite.“ + `<InfoTip>` „Mit einem eigenen Konto und Dauerauftrag passiert das automatisch.“ E2E öffnet das ⓘ. |
| 1 · Lücke: „Leg bis {Datum} einmalig € Y zur Seite.“ | ✅ | `kontoState`: `gapFrom` = erster Monat mit Stand < 0, `gapBy` = letzter Tag davor (mit „Neuer Monat beginnt am“), Betrag = tiefster Stand. Unit-Test mit verschiedenem erstem und tiefstem Minus-Monat, Tag 1, 25, Monatsletzter. |
| 1 · Nur der nächste offene Punkt primär | ✅ | `PlanList`: `data-primary` am nächsten offenen Punkt, andere sekundär. E2E: Einmalbetrag zuerst abhaken geht, Status bleibt „Fixkosten einplanen“. |
| 1 · Fortschritt als Balken | ✅ | `PlanProgress` (`role="progressbar"`, Brand-Grün) in Plan, Kachel, Sheet, Einstellungen. E2E prüft `aria-valuenow`. |
| 1 · Kachel, 3 Zustände | ✅ | „Fixkosten einplanen“ + „0 von 2 erledigt“ · „Ab {Monat} reicht das Geld nicht.“ + „Leg bis …“ + „Erledigt, zur Seite gelegt“ · „Alles eingeplant bis {Monat}.“ mit Häkchen. Screenshots 01, 05, 07. |
| 1 · Monats-Check | ✅ | Mit Konto „Neuer Monat. Ist dein Dauerauftrag eingegangen?“, ohne Konto „Neuer Monat. Hast du € X zur Seite gelegt?“. E2E beide. |
| 1 · Einstellungen | ✅ | Schalter „Fixkosten einplanen“, Aus/An-Texte, „Schon zur Seite gelegt“. E2E prüft den An-Text. |
| 1 · Bearbeiten-Dialog | ✅ | Unverändert: „Von welchem Konto geht das weg?“ mit „Fixkostenkonto \| Alltagskonto“. |
| 1 · Eine Wahrheit | ✅ | E2E vergleicht Status, Satz, Monatsbetrag und Einmalbetrag an Kachel, Sheet, Plan, Einstellungen. |
| **2** Nur Währung, kein Land | ✅ | Einstellungen: Abschnitt „Währung“ mit „Euro (€)“ und „Schweizer Franken (CHF)“. Onboarding Schritt 1: dieselben 2 Optionen. „Land und Währung“ ist weg. |
| 2 · Land intern aus `navigator.language` | ✅ | `countryForCurrency`: CHF → CH; Euro: de-DE → DE, sonst AT. Kein Schema-Umbau (Meta-Schlüssel `country` bleibt). Unit-Test; E2E-Onboarding mit de-AT, de-DE, CHF. |
| **3** Altes Icon zurück | ✅ | Aus Commit `afaa0bc` (#13, Sprint `rebrand-erbse`): `Logo.tsx`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `scripts/make-icons.mjs`, `scripts/brand/*.svg`. Nicht neu gezeichnet. `favicon.png` (aus #38) entfällt. |
| 3 · Manifest, Safe Zone | ✅ | `scripts/check-icons.mjs`: Manifest valide, 4 Icons ok, apple-touch-icon ohne Rundung, maskable mit Safe Zone. E2E `rebrand`: alle Icons 200. |
| 3 · Erbsen für Haken, Kategorie-Punkte, FAB | ✅ | Unverändert (`<Pea>`). |
| **4** Seitenmenü iPad und Desktop | ✅ | `PeaMark`: nur drei Erbsen aus `--pea-1/2/3` (im Dunkelmodus heller), kein Quadrat, kein Schriftzug, `aria-label="Erbse"`. iPhone unverändert. E2E `rebrand` und Screenshots 14. |

## Geänderte Texte

**Status (Kachel, Sheet, Plan, Einstellungen, Analyse)**
- „Fixkostenkonto einrichten“ → „Fixkosten einplanen“
- „1 von 3 erledigt“ mit drei Kreisen → „0 von 2 erledigt“ mit Balken
- „Im {Monat} fehlen {Betrag}.“ → „Ab {Monat} reicht das Geld nicht.“
- „Zahl einmalig {Betrag} ein, dann passt alles.“ → „Leg bis {Datum} einmalig {Betrag} zur Seite.“
- neu: „Leg jetzt einmalig {Betrag} zur Seite.“ (wenn das Datum schon vorbei ist)
- „Erledigt, eingezahlt“ → „Erledigt, zur Seite gelegt“
- „Alles gedeckt bis {Monat}.“ → „Alles eingeplant bis {Monat}.“

**Kachel und Einladung**
- Titel „Fixkostenkonto“ → „Fixkosten einplanen“
- ohne Konto: „Dauerauftrag € X am 1.“ → „Monatlich € X am 1.“
- ⓘ „Dauerauftrag“ → „Monatsbetrag“: „So viel legst du jeden Monat zur Seite. Alle Abbuchungen der nächsten 12 Monate, geteilt durch 12, aufgerundet. So sind Preiserhöhungen und Jahreszahlungen schon drin.“
- „Neu: Fixkostenkonto. Erbse rechnet deinen Dauerauftrag aus.“ → „Neu: Fixkosten einplanen. Erbse sagt dir, wie viel du monatlich zur Seite legst.“

**Einrichtung**
- Titel „Fixkostenkonto einrichten“ → „Fixkosten einplanen“
- neu: „Hast du ein eigenes Konto für Fixkosten?“ – „Ja“ / „Nein, ich plane nur“
- „Wie viel liegt heute auf deinem Fixkostenkonto?“ → „Wie viel hast du heute schon für Fixkosten zur Seite gelegt?“
- Feld „Kontostand heute“ → „Schon zur Seite gelegt“
- „Ich habe noch keins“ → „Noch nichts“
- „Frage n von 2“ → „Frage n von 3“ (mit Konto) bzw. „von 2“ (ohne)

**Dein Plan**
- „Fixkostenkonto eröffnen“, „Ein zweites Konto, nur für deine Rechnungen.“, „Fixkostenkonto ist da“ → entfallen
- „Dauerauftrag einrichten/prüfen: € X monatlich am 1.“ → „… am 1. auf dein Fixkostenkonto“
- neu ohne Konto: „Leg jeden Monat € X für Fixkosten zur Seite.“ + ⓘ „Mit einem eigenen Konto und Dauerauftrag passiert das automatisch.“
- „Einmalig € Y einzahlen“ → „Leg bis {Datum} einmalig € Y zur Seite.“
- „Keine Einzahlung nötig“ → „Kein Extra-Betrag nötig.“

**Monats-Check**
- neu ohne Konto: „Neuer Monat. Hast du € X zur Seite gelegt?“ / „Hast du für {Monat} € X zur Seite gelegt?“
- neu ohne Konto: „Liegen noch € Z für Fixkosten bereit?“
- „Trag deinen Kontostand ein. Dann rechnet Erbse genauer.“ → „Trag ein, was du schon zur Seite gelegt hast. Dann rechnet Erbse genauer.“

**Meilensteine**
- „Zum ersten Mal alles gedeckt“ → „Zum ersten Mal alles eingeplant“
- „Ein Jahr gedeckt“ → „Ein Jahr eingeplant“

**Sheet**
- Titel „Fixkostenkonto“ → „Fixkosten einplanen“
- „Wie viel überweise ich monatlich?“ → „Wie viel lege ich monatlich zur Seite?“
- „Kontostand am Monatsende“ → „Stand am Monatsende“; Annahme: „Dauerauftrag“ → „Monatsbetrag“
- „Im Dauerauftrag (n)“ → „Eingeplante Rechnungen (n)“
- „Kontostand und Rundung“ → „Zur Seite gelegt und Rundung“
- „Kontostand heute“ → „Schon zur Seite gelegt“; ⓘ „Was heute auf deinem Fixkostenkonto liegt.“ → „Was heute für deine Fixkosten bereitliegt.“
- ohne Konto: „Dauerauftrag für {Monat} schon eingegangen?“ → „Für {Monat} schon zur Seite gelegt?“
- „Dauerauftrag aufrunden auf“ → „Monatsbetrag aufrunden auf“
- „Dein Kontostand steigt … Der Dauerauftrag ist höher als nötig …“ → „Dein Stand steigt … Der Monatsbetrag ist höher als nötig …“

**Einstellungen**
- Abschnitt und Schalter „Fixkostenkonto“ / „Fixkostenkonto verwenden“ → „Fixkosten einplanen“
- An: „Erbse rechnet deinen Dauerauftrag aus und warnt, bevor das Konto knapp wird.“ → „Erbse sagt dir, wie viel du monatlich zur Seite legst. Und warnt, bevor es knapp wird.“
- ⓘ → „Erbse rechnet aus, wie viel du monatlich zur Seite legst. Und ob es jeden Monat reicht. Ohne Banklogin.“
- „Kontostand“ → „Schon zur Seite gelegt“; ohne Konto „Dauerauftrag“ → „Monatlich zur Seite“
- „Einmalig einzahlen“ → „Einmalig zur Seite legen“
- „Land“ / „Land und Währung“ → „Währung“: „Euro (€)“, „Schweizer Franken (CHF)“

**Onboarding**
- „Wo wohnst du?“ → „In welcher Währung zahlst du?“
- ⓘ „Davon hängen Währung und Vorlagen ab. …“ → „Erbse zeigt alle Beträge in dieser Währung. Du kannst sie später in den Einstellungen ändern.“
- ⓘ Vorlagen: „… deinen Dauerauftrag fürs Fixkostenkonto.“ → „… wie viel du monatlich zur Seite legst.“

**Analyse**: Titel „Fixkostenkonto“ → „Fixkosten einplanen“; ohne Konto „Dauerauftrag“ → „Monatlich zur Seite“.

## Eigene Formulierungen (bitte prüfen)
- Einstellungen „An“: Dein Satz hat 16 Wörter. Ich habe ihn geteilt: „… zur Seite legst. Und warnt, bevor es knapp wird.“
- „Leg jetzt einmalig … zur Seite.“: wenn der erste Minus-Monat schon der aktive ist.
- „Kein Extra-Betrag nötig.“: Plan-Punkt, wenn keine Lücke da ist.
- „Monatlich € X am 1.“ und „Monatlich zur Seite“: ohne Konto statt „Dauerauftrag“.
- „Eingeplante Rechnungen (n)“ und „Stand am Monatsende“: passen mit und ohne Konto.
- Ohne Konto startet das Zur-Seite-Legen nächsten Monat, wie ein neuer Dauerauftrag.
- Die Spalte „Einzahlung“ in der Monatsliste bleibt, wie in der letzten Runde gewünscht.
