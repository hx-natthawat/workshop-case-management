import { execSync } from 'node:child_process';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://casemgmt:casemgmt@localhost:54329/casemgmt_test';

export default function setup() {
  const env = { ...process.env, DATABASE_URL: TEST_DB, SEED_SAMPLES: 'false' };
  execSync('pnpm exec tsx scripts/reset.mts && pnpm exec drizzle-kit push --force && pnpm exec tsx scripts/seed.ts', { env, stdio: 'pipe' });
}
