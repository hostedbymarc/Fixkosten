# Plan

## Phase 1 – Fundament ✅
Setup, Dexie-Schema v1, `calc.ts` + Kontrollwerte, Monats-Screen mit Abhaken.

## Phase 1.1 – Anpassungen ✅
- Schema v2 mit Migration: Kategorie „Meine Immos“, `isVariable` entfernt, `IncomeEntry` → `MonthClose`
- Monatsabschluss pro Monat: Netto-Gehalt, frei verfügbar (tatsächlich), Notiz; Kachel „Frei verfügbar“ mit Differenz und Sparquote
- Seed nicht mehr im Bundle: Erststart mit Import-Dialog; `seed.local.json` lokal, Test-Fixture unter `tests/fixtures/`

## Phase 2 – Positionen verwalten ✅
- Schema v3: versionierter Zahlungsplan `history` (Betrag, Häufigkeit, Monate, Tag ab `validFrom`), Payment-`status`, abhakbare OneOffs
- Positionen anlegen/bearbeiten; Plan-Änderung „Ab wann gilt das?“ (ChangeLog = Optimierung/Erhöhung) oder „Tippfehler korrigieren“ (keine Optimierung)
- Detailansicht mit Verlauf und letzten 12 Zahlungen
- Archivieren (Swipe / ⋯ / Entf) mit Undo, Archiv in den Einstellungen: Wiederherstellen ab aktuellem Monat oder endgültig löschen
- Kategorien: anlegen, umbenennen, 8 Farben, Typ, sortieren, löschen mit Verschieben-Dialog
- Sortieren per Drag-Handle (Touch, Maus, Tastatur mit Screenreader-Ansage)
- Einmalbeträge (Nachzahlung/Gutschrift) als Unterzeile im Monat
- „Offen aus Vormonat“ mit Bezahlt / Entfallen

## Vorgezogen aus Phase 4: Sicherung ✅ (dieser Stand)
- JSON-Export in den Einstellungen, Import mit Vergleich, „Zusammenführen“ oder „Ersetzen“, Rückgängig
- Lesezeichen-Export (`docs/export-bookmarklet.txt`) für Seiten ohne Export-Button, z. B. alte Deploy Previews

## Phase 3 – Analyse
1. Entwicklung (echte Monatsbelastung, gestapelt nach Kategorie, 6M/12M/Alles)
2. Plan vs. Ist
3. Jahresvorschau (fällige Beträge + Linie der Umlage)
4. Verteilung (Donut nach Kategorie, umgelegt)
5. **Frei verfügbar: rechnerisch vs. tatsächlich** – pro Monat aus `MonthClose` (`freeCalculated` vs. `freeActual`, Differenz hervorgehoben)
6. **Sparquote** – Verlauf in %, aus `MonthClose.netSalary` (`savingsRate`)
7. Optimierungen (Timeline aus ChangeLog, eingesparte €/Jahr)

Netto-Einkommen wird nicht mehr in den Einstellungen gepflegt, sondern pro Monat im Monatsabschluss.

## Phase 4 – PWA & Sicherheit
Manifest, Icons, Offline, Install-Hinweis, `storage.persist()`, CSV-Export, Backup-Erinnerung, Lighthouse ≥ 95. (JSON-Export/Import ist bereits vorgezogen.)
