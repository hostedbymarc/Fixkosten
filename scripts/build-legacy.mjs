// Builds an old commit (default: 2776e95, the version currently live) into
// .legacy/<sha>/dist for the upgrade E2E test. The output is gitignored and
// never deployed: the phase-1 bundle still contains the seed data.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const sha = process.argv[2] ?? '2776e95';
const root = join('.legacy', sha);
const dist = join(root, 'dist');

if (existsSync(join(dist, 'index.html'))) {
  console.log(`build-legacy: ${dist} exists`);
  process.exit(0);
}
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
run(`git archive ${sha} | tar -x -C ${root}`, '.');
run('pnpm install --frozen-lockfile --prefer-offline');
run('pnpm exec vite build');
console.log(`build-legacy: built ${sha} into ${dist}`);
