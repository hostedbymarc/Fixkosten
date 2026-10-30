/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify sets COMMIT_REF during builds; locally the version reads "dev".
const commit = process.env.COMMIT_REF?.slice(0, 7) || 'dev';
const buildDate = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
    // step log of the import for the import-hang harness only (src/lib/importTrace.ts)
    __IMPORT_TRACE__: JSON.stringify(process.env.ERBSE_IMPORT_TRACE === '1'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
