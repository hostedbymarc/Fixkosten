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
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
