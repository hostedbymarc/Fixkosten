import { execSync } from 'node:child_process';

/**
 * Builds the legacy versions once: for the upgrade tests 2776e95 (schema v1) and aad3d27 (live, schema v3);
 * 9eb9938 (main before the glass-layers fix) for the screen comparison in glass-layers.spec.ts.
 */
export default function globalSetup() {
  execSync('node scripts/build-legacy.mjs 2776e95', { stdio: 'inherit' });
  execSync('node scripts/build-legacy.mjs aad3d27', { stdio: 'inherit' });
  execSync('node scripts/build-legacy.mjs 9eb9938', { stdio: 'inherit' });
}
