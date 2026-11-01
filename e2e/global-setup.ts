import { execSync } from 'node:child_process';

/**
 * Builds the legacy versions once: for the upgrade tests 2776e95 (schema v1) and aad3d27 (live, schema v3);
 * 6e618fd (main as accepted before the import-hang sprint) for the end-image comparison in splash-blur.spec.ts.
 */
export default function globalSetup() {
  execSync('node scripts/build-legacy.mjs 2776e95', { stdio: 'inherit' });
  execSync('node scripts/build-legacy.mjs aad3d27', { stdio: 'inherit' });
  execSync('node scripts/build-legacy.mjs 6e618fd', { stdio: 'inherit' });
}
