import { execSync } from 'node:child_process';

/**
 * Builds old app versions once for the upgrade/export tests:
 * 2776e95 = version live on fixkosten.netlify.app, 0d997aa = Deploy Preview of PR #3.
 */
export default function globalSetup() {
  for (const sha of ['2776e95', '0d997aa']) execSync(`node scripts/build-legacy.mjs ${sha}`, { stdio: 'inherit' });
}
