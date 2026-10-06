import { execSync } from 'node:child_process';

/** Builds the currently live version (2776e95) once for the upgrade test. */
export default function globalSetup() {
  execSync('node scripts/build-legacy.mjs 2776e95', { stdio: 'inherit' });
}
