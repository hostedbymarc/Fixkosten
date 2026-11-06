/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { renderBootHtml } from './src/lib/bootSplash';

/**
 * The static start screen: index.html gets its inline stylesheet, theme-color and iOS start images
 * from src/styles/tokens.css (src/lib/bootSplash.ts) – the first paint never is white.
 */
function bootSplash(): Plugin {
  const tokens = new URL('./src/styles/tokens.css', import.meta.url);
  return {
    name: 'erbse-boot-splash',
    transformIndexHtml: { order: 'pre', handler: (html) => renderBootHtml(html, readFileSync(tokens, 'utf8')) },
  };
}

/**
 * The app's stylesheet must not hold back the first paint: a <link rel="stylesheet"> in the head blocks
 * all rendering until it has loaded – on a slow cold start that is the white screen. It is preloaded
 * instead and switches itself on when it is there; src/main.tsx starts the app only then.
 */
function nonBlockingAppCss(): Plugin {
  return {
    name: 'erbse-non-blocking-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
          `<link rel="preload" as="style" crossorigin href="$1" data-app-css onload="this.onload=null;this.rel='stylesheet'">`,
        ),
    },
  };
}

// Netlify sets COMMIT_REF during builds; locally the version reads "dev".
const commit = process.env.COMMIT_REF?.slice(0, 7) || 'dev';
const buildDate = new Date().toISOString();

export default defineConfig({
  plugins: [
    bootSplash(),
    nonBlockingAppCss(),
    react(),
    // Service worker: the app shell (index.html, scripts, styles, fonts, icons) and the iOS start images
    // in the precache – the start works offline and without a white screen. A new version waits until
    // every window of the app is closed (no reload while someone is typing); the data stays in IndexedDB.
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script-defer',
      manifest: false, // public/manifest.webmanifest stays the manifest
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
    // step log of the import for the import-hang harness only (src/lib/importTrace.ts)
    __IMPORT_TRACE__: JSON.stringify(process.env.ERBSE_IMPORT_TRACE === '1'),
  },
  // the e2e/harness build gets source maps, so the import watchdog's stacks point into src/
  build: { sourcemap: process.env.ERBSE_IMPORT_TRACE === '1' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
