# Erbse

Erbse ist eine Mobile-first-PWA für monatliche Fixkosten (ersetzt die Apple-Notes-Notiz). Daten bleiben lokal im Browser (IndexedDB), kein Backend, kein Login.

## Entwicklung

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest: calc.ts inkl. Kontrollwerte + Summen-Invarianz
pnpm build        # tsc + vite build → dist/ + check-bundle (keine privaten Daten im Bundle)
pnpm test:e2e     # Playwright: iPhone 15, iPad hoch/quer, Desktop 1440 (erzeugt docs/screenshots/)
```

E2E-Details: Chromium-Suite mit `--project=iphone-15 --project=iphone-pro-max --project=ipad-portrait --project=ipad-landscape --project=desktop --project=perf`, WebKit (Safari) mit `--project='webkit-*'` (iPhone SE, iPhone 15, iPad hoch/quer, je hell und dunkel; einmalig `npx playwright install webkit && npx playwright install-deps webkit`). Jede Spec-Datei bekommt einen eigenen Browser-Prozess (`FRESH_BROWSER=0` schaltet das ab). Hängt ein Import, schreibt der Watchdog (`e2e/import-watchdog.ts`, `e2e/native-dump.ts`, nur im Trace-Build `dist-e2e`) einen Dump mit nativen Stacks (gdb) der Browser-Prozesse nach `docs/diagnose/import-hang/<Datum>-<Projekt>/`.

## Architektur

- `src/lib/calc.ts` – **einzige** Stelle für Berechnungen (Summen, Umlage, Fälligkeit, Sparquote). Reine Funktionen `(dataset, period)`; die UI rechnet nie selbst.
  - **Fixkosten** = Kategorien mit `kind: 'expense'`, **Vermögensaufbau** = jede Kategorie mit `kind: 'savings'`. Jede Position zählt in genau einem Topf.
  - `fixedCosts` / `wealthBuilding` (fällig im Monat: Ist wenn abgehakt, sonst Plan, + Einmalbeträge), `fixedCostsAvg` / `wealthBuildingAvg` (umgelegt).
  - „Frei verfügbar“ = `freeAfterFixed` (Netto − Fixkosten − Vermögensaufbau), Ø-Monat = `freeAfterFixedAvg` (Netto − Ø Fixkosten − Ø Vermögensaufbau), Sparquote = `savingsRate` (Vermögensaufbau inkl. Einmaliger ÷ Netto).
- `src/db/db.ts` – Dexie-Schema (versioniert, v1 nie ändern; Migrationen per `db.version(n).upgrade`), `src/db/repo.ts` – Schreiboperationen, `src/db/backup.ts` – Import beim Erststart.
- `src/screens/`, `src/components/` – UI (React + Tailwind), Umschalter System/Hell/Dunkel in den Einstellungen (`src/lib/theme.ts`).
- Farben: **nur** in `src/styles/tokens.css` (hell + dunkel); `pnpm check:colors` findet Hex-Werte anderswo, `src/lib/contrast.test.ts` prüft alle Text/Hintergrund-Paare gegen Nebel und Glas.
- Glas: eine Klasse `.glass` / `.glass-strong` in `src/index.css`; Hintergrund „Nebel + Papierkorn“ als `body::before/::after`.
- App-Icon: Quellen `scripts/brand/icon-*.svg`, PNGs in `public/` mit `node scripts/make-icons.mjs` neu erzeugen, `pnpm check:icons` prüft Manifest und Icons.

## Deploy (Netlify)

`netlify.toml` ist enthalten: Build-Command `pnpm build`, Publish-Verzeichnis `dist`, Node 22.

## Daten & Erststart

Echte Beträge sind **nicht** im JS-Bundle. Beim ersten Start auf leerer Datenbank fragt die App „Daten importieren“ (JSON-Sicherung) oder „Leer starten“. Eine bestehende Datenbank wird nie überschrieben.

- `seed.local.json` – persönlicher Startstand, liegt nur lokal (`.gitignore`).
- `tests/fixtures/seed.json` – gleicher Stand für Unit-/E2E-Tests (Kontrollwerte).
- `scripts/check-bundle.mjs` – bricht den Build ab, wenn Positionsnamen oder Beträge aus dem Seed in `dist/` auftauchen.

Plan: siehe `docs/PLAN.md`.

## Name „Erbse“ und was bewusst „fixkosten“ heißt

Die App heißt Erbse. Damit die Daten der Nutzer:innen nicht verloren gehen, bleiben unverändert: die Netlify-Subdomain `fixkosten.netlify.app` (eigener Origin = eigene Datenbank), der IndexedDB-Name `fixkosten`, das Sicherungsformat `fixkosten-backup` (alte `fixkosten-*.json` und neue `erbse-backup-*.json` lassen sich importieren), der localStorage-Schlüssel `fixkosten-theme`, `start_url` und der Repo-Name.

## Rechenlogik

Alle Beträge in ganzen Cent (`src/lib/calc.ts`, `monthFigures`), je Monat; eine Zeile pro Begriff.

- **Fixkosten gesamt** = Σ fällige Positionen außerhalb Vermögensaufbau + Einmalbeträge des Monats; je Position abgehakt → Ist (`actualAmount`), offen → Plan, übersprungen → 0 (Ist/Plan-Regel). Abgebucht = abgehakter Teil, Offen = Gesamt − Abgebucht.
- **Abzüge vom Netto** = Fixkosten gesamt + Vermögensaufbau vom Netto.
- **Frei verfügbar** = Netto-Gehalt − Abzüge vom Netto (ohne Netto-Gehalt: keine Zahl).
- **Vermögensaufbau** = vom Netto + nicht vom Netto; „nicht vom Netto“ = einmalige Zahlungen in Vermögensaufbau-Kategorien mit Schalter „Von ‚Frei verfügbar‘ abziehen“ aus (zählen nicht in Abzüge, Frei verfügbar, Sparquote).
- **Sparquote** = Vermögensaufbau vom Netto ÷ Netto-Gehalt (ohne Netto-Gehalt oder bei Netto ≤ 0: keine Zahl).
- **Ø pro Monat** = Σ Fixkosten-Positionen (Betrag × Fälligkeitsmonate pro Jahr) ÷ 12; einmalige Zahlungen und Einmalbeträge zählen nicht; „davon nicht monatlich“ = derselbe Wert nur für nicht monatliche Positionen.
- **im Ø-Monat** = Netto-Gehalt − Ø pro Monat − Ø Vermögensaufbau (Vermögensaufbau-Positionen × Fälligkeitsmonate ÷ 12).
- **Aktiver Monat / Stichtag** = Kalendermonat bei Monatsbeginn 1.; sonst ab dem Stichtag (15.–28. oder Monatsletzter, in kurzen Monaten der letzte Tag) der Folgemonat (`src/lib/activeMonth.ts`).
- **Import (atomar, mit Timeout)** = eine IndexedDB-Transaktion über alle Tabellen: ganz oder gar nicht; nach `IMPORT_TIMEOUT_MS` = 20 s Abbruch mit Rollback und Fehlermeldung, die bisherigen Daten bleiben unverändert (`src/db/backup.ts`).
