import { defineConfig } from '@playwright/test';

/**
 * Import-hang harness (e2e-harness/import-hang.spec.ts): only import → hero, many repetitions.
 * Its own build with the import step log (ERBSE_IMPORT_TRACE=1) on its own port, so the normal
 * suite never runs against it. Workers as in the full run (default: half of the cores).
 *
 *   HARNESS_REPS=167 npx playwright test -c playwright.harness.config.ts --project=desktop
 */
const PORT = 4174;

export default defineConfig({
  testDir: './e2e-harness',
  outputDir: 'harness-results/pw',
  fullyParallel: true,
  retries: 0,
  // a frozen page needs the watchdog (10 s), the dumps and the recovery wait
  timeout: 90_000,
  reporter: [['line']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    // tracing is started per iteration by the spec (kept only for a hang)
    trace: 'off',
  },
  projects: [
    { name: 'iphone-se', use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'iphone-15', use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'iphone-pro-max', use: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'ipad-portrait', use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true } },
    { name: 'ipad-landscape', use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `ERBSE_IMPORT_TRACE=1 pnpm exec vite build --outDir dist-harness && pnpm exec vite preview --outDir dist-harness --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
