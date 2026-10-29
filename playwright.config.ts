import { defineConfig } from '@playwright/test';

const PORT = 4173;

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
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
