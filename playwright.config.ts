import { defineConfig, type Project } from '@playwright/test';

const PORT = 4173;

/**
 * WebKit (Safari's engine on iPhone and iPad), light and dark: the parts of the suite that matter
 * on the devices. Run with `--project='webkit-*'`; the Chromium suite with `--project='!webkit-*'`
 * is not needed, the Chromium projects are listed by name (see README).
 */
const WEBKIT_SPECS = [
  /month\.spec\.ts/,
  /audit\.spec\.ts/,
  /dom-figures\.spec\.ts/,
  /analyse\.spec\.ts/,
  /setup\.spec\.ts/,
  /backup\.spec\.ts/,
  /liquid-glass\.spec\.ts/,
  /fullpage\.spec\.ts/,
  /from-net\.spec\.ts/,
  /aktiver-monat\.spec\.ts/,
  /splash-blur\.spec\.ts/,
  /import-watchdog\.spec\.ts/,
];
const WEBKIT_DEVICES = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true },
} as const;
const webkitProjects: Project[] = Object.entries(WEBKIT_DEVICES).flatMap(([device, use]) =>
  (['light', 'dark'] as const).map((scheme) => ({
    name: `webkit-${device}-${scheme}`,
    testMatch: WEBKIT_SPECS,
    use: { ...use, browserName: 'webkit' as const, colorScheme: scheme },
  })),
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    trace: 'retain-on-failure',
  },
  // perf.spec.ts runs in its own project after all others: no other test competes for the CPU
  projects: [
    {
      name: 'iphone-15',
      testIgnore: /perf\.spec\.ts/,
      use: {
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // reference device: iPhone Pro Max
      name: 'iphone-pro-max',
      testIgnore: /perf\.spec\.ts/,
      use: {
        viewport: { width: 440, height: 956 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ipad-portrait',
      testIgnore: /perf\.spec\.ts/,
      use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
    },
    {
      name: 'ipad-landscape',
      testIgnore: /perf\.spec\.ts/,
      use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true },
    },
    {
      name: 'desktop',
      testIgnore: /perf\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      // iPhone profile for the performance measurements (Sprint B), after every other project
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['iphone-15', 'iphone-pro-max', 'ipad-portrait', 'ipad-landscape', 'desktop'],
      use: {
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    ...webkitProjects,
  ],
  // the production build with all its checks, then the e2e build with the import step log for the
  // import watchdog (e2e/import-watchdog.ts) in its own folder: dist/ stays exactly what ships
  webServer: {
    command: `pnpm build && ERBSE_IMPORT_TRACE=1 pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
