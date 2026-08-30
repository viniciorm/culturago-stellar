import { execSync } from 'node:child_process';

async function globalSetup() {
  // Re-seed the E2E test account and fixtures before every test run.
  execSync('node --env-file=.env --env-file=.env.local scripts/seed-e2e-test.mjs', {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

export default globalSetup;
