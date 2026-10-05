# Fixkosten

Mobile-first PWA für monatliche Fixkosten (ersetzt die Apple-Notes-Notiz). Daten bleiben lokal im Browser (IndexedDB), kein Backend, kein Login.

## Entwicklung

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest: calc.ts inkl. Kontrollwerte + Summen-Invarianz
pnpm build        # tsc + vite build → dist/
pnpm test:e2e     # Playwright: iPhone 15, iPad hoch/quer, Desktop 1440 (erzeugt docs/screenshots/)
```

## Architektur

- `src/lib/calc.ts` – **einzige** Stelle für Berechnungen (Summen, Umlage, Fälligkeit, Sparquote). Reine Funktionen `(dataset, period)`; die UI rechnet nie selbst.
- `src/db/db.ts` – Dexie-Schema (versioniert), `src/db/seed.ts` – Seed Oktober 2026, `src/db/repo.ts` – Schreiboperationen.
- `src/screens/`, `src/components/` – UI (React + Tailwind).

## Deploy (Netlify)

`netlify.toml` ist enthalten: Build-Command `pnpm build`, Publish-Verzeichnis `dist`, Node 22.
