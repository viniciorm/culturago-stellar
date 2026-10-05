import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DEV Deployment Port & Healthcheck Invariants', () => {
  const rootDir = process.cwd();
  const composeDevPath = join(rootDir, 'deploy', 'docker-compose.dev.yml');
  const dockerfilePath = join(rootDir, 'deploy', 'Dockerfile');
  const setupScriptPath = join(rootDir, 'deploy', 'setup-dev-vps.sh');
  const composeProdPath = join(rootDir, 'deploy', 'docker-compose.app.yml');

  const composeDev = readFileSync(composeDevPath, 'utf8');
  const dockerfile = readFileSync(dockerfilePath, 'utf8');
  const setupScript = readFileSync(setupScriptPath, 'utf8');
  const composeProd = readFileSync(composeProdPath, 'utf8');

  it('1. verifies docker-compose.dev.yml binds host 3081 to container 3080', () => {
    // Host 3081 -> Container 3080
    expect(composeDev).toMatch(/["']127\.0\.0\.1:3081:3080["']/);
    expect(composeDev).not.toMatch(/["']127\.0\.0\.1:3081:3081["']/);
  });

  it('2. verifies culturago-app-dev runs with internal PORT=3080 and HOSTNAME=0.0.0.0', () => {
    // Internal Next.js server port must be 3080
    expect(composeDev).toMatch(/- PORT=3080/);
    expect(composeDev).not.toMatch(/- PORT=3081/);
    expect(composeDev).toMatch(/- HOSTNAME=0\.0\.0\.0/);
  });

  it('3. verifies healthcheck explicitly queries http://127.0.0.1:3080/api/health (no localhost)', () => {
    // Dockerfile healthcheck uses IPv4 127.0.0.1:3080
    expect(dockerfile).toMatch(/fetch\(['"]http:\/\/127\.0\.0\.1:3080\/api\/health['"]\)/);
    expect(dockerfile).not.toMatch(/fetch\(['"]http:\/\/localhost:3080\/api\/health['"]\)/);

    // compose dev healthcheck also uses IPv4 127.0.0.1:3080
    expect(composeDev).toMatch(/fetch\(['"]http:\/\/127\.0\.0\.1:3080\/api\/health['"]\)/);
    expect(composeDev).not.toMatch(/fetch\(['"]http:\/\/localhost:3080\/api\/health['"]\)/);
  });

  it('4. verifies Dockerfile runner stage exposes and defaults to port 3080', () => {
    expect(dockerfile).toMatch(/ENV PORT=3080/);
    expect(dockerfile).toMatch(/EXPOSE 3080/);
  });

  it('5. verifies setup-dev-vps.sh configures PORT=3080 and migrates existing PORT=3081 in /opt/culturago-dev/.env', () => {
    // Template must set internal PORT=3080
    expect(setupScript).toMatch(/PORT=3080/);
    // Setup script must have migration for existing .env with PORT=3081
    expect(setupScript).toMatch(/sed -i 's\/\^PORT=3081\.\*\/PORT=3080\/' \/opt\/culturago-dev\/\.env/);
    // Nginx must proxy to host port 3081
    expect(setupScript).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:3081;/);
    // Smoke test must probe host port 3081
    expect(setupScript).toMatch(/http:\/\/127\.0\.0\.1:3081/);
  });

  it('6. verifies production compose remains completely untouched and on 3080', () => {
    expect(composeProd).toMatch(/["']127\.0\.0\.1:3080:3080["']/);
    expect(composeProd).toMatch(/- PORT=3080/);
  });
});
