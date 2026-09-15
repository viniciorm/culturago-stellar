#!/usr/bin/env node
// VPS deploy script for CulturaGO Testnet.
// Reads root credentials from .env (VPS_USER / VPS_PASSWORD / VPS_SSH_KEY) and deploys to the VPS.
// Never logs the password or other secrets.
import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env/.env.vini en process.env para que las credenciales del VPS
// estén disponibles sin tener que exportarlas manualmente.
const localEnv = { ...readLocalEnv('.env'), ...readLocalEnv('.env.vini') };
for (const [key, value] of Object.entries(localEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const host = process.env.VPS_HOST;
const user = process.env.VPS_USER;
const password = (process.env.VPS_SSH_KEY || process.env.VPS_PASSWORD || '').trim();
const deployDir = '/opt/culturago';
const repoUrl = 'https://github.com/viniciorm/culturago-stellar.git';

if (!host || !user || !password) {
  console.error('Missing VPS_HOST, VPS_USER or VPS_PASSWORD/VPS_SSH_KEY in .env');
  process.exit(1);
}

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) { reject(err); return; }
      let out = '';
      let errOut = '';
      let exit = null;
      stream.on('data', (data) => { out += data.toString(); process.stdout.write(data); });
      stream.stderr.on('data', (data) => { errOut += data.toString(); process.stderr.write(data); });
      stream.on('exit', (code) => { exit = code; });
      stream.on('close', () => { resolve({ exit: exit ?? 0, out, err: errOut }); });
    });
  });
}

function uploadFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      const writeStream = sftp.createWriteStream(remotePath);
      writeStream.on('close', () => resolve({ exit: 0 }));
      writeStream.on('error', (e) => reject(e));
      writeStream.end(content);
    });
  });
}

function readLocalEnv(filename) {
  try {
    const path = resolve(__dirname, '..', filename);
    const text = readFileSync(path, 'utf8');
    const result = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

async function updateEnvOnly(conn) {
  console.log('\nVerifying production env at /opt/culturago/.env...');
  const envCheck = await exec(conn, 'test -f /opt/culturago/.env');
  if (envCheck.exit !== 0) {
    console.error(red('Production env file /opt/culturago/.env does not exist on the VPS.'));
    process.exit(1);
  }

  console.log('Removing old app container...');
  await exec(conn, 'docker rm -f culturago-app 2>/dev/null || true');

  console.log(green('Recreating containers with /opt/culturago/.env (no build)...'));
  const up = await exec(conn, `cd ${deployDir} && docker compose -f deploy/docker-compose.app.yml --env-file /opt/culturago/.env up -d --no-build`);
  if (up.exit !== 0) {
    console.error(red('Docker compose recreate failed'));
    process.exit(1);
  }

  console.log('\nContainer status:');
  await exec(conn, `docker ps --filter name=culturago-`);
  console.log(green('\nEnv update finished.'));
  conn.end();
}

async function main() {
  const conn = new Client();

  conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
    finish([password]);
  });

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({
      host,
      port: Number(process.env.VPS_PORT || 22),
      username: user,
      password,
      tryKeyboard: true,
      readyTimeout: 12000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    });
  });

  console.log(green(`Connected to ${host} as ${user}`));

  if (process.env.ENV_ONLY === '1') {
    return updateEnvOnly(conn);
  }

  console.log('\nChecking firewall ports (80/443 managed by host Nginx)...');
  await exec(conn, '(ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw reload) 2>/dev/null || true');

  console.log('\n=== Firewall status ===');
  const ufwStatus = await exec(conn, 'ufw status verbose 2>/dev/null || echo "ufw not available"');
  console.log(ufwStatus.out);
  console.log('\n=== Listening ports ===');
  const listening = await exec(conn, 'ss -tlnp 2>/dev/null | grep -E "3080|80|443" || netstat -tlnp 2>/dev/null | grep -E "3080|80|443"');
  console.log(listening.out);

  console.log('\nChecking Docker...');
  await exec(conn, 'docker compose version || docker-compose --version');
  const docker = await exec(conn, 'docker --version');
  if (!docker.out.includes('Docker version')) {
    console.log('Docker not found, installing...');
    const install = await exec(conn, 'apt-get update && apt-get install -y docker.io docker-compose-v2');
    if (install.exit !== 0) {
      console.error(red('Docker installation failed'));
      process.exit(1);
    }
    await exec(conn, 'systemctl enable docker && systemctl start docker');
  }

  console.log('\nVerifying production configuration (/opt/culturago/.env)...');
  const envCheck = await exec(conn, 'test -f /opt/culturago/.env');
  if (envCheck.exit !== 0) {
    console.error(red('Production env file /opt/culturago/.env does not exist on the VPS. Aborting deploy to prevent misconfiguration.'));
    process.exit(1);
  }

  console.log('\nPreparing app directory...');
  // Preserve /opt/culturago/.env during code deployment
  await exec(conn, `cp /opt/culturago/.env /tmp/culturago.env.bak && rm -rf ${deployDir} && git clone --depth 1 ${repoUrl} ${deployDir} && cp /tmp/culturago.env.bak /opt/culturago/.env && rm -f /tmp/culturago.env.bak`);

  console.log('\nUploading deploy config...');
  const composeLocal = readFileSync(resolve(__dirname, '..', 'deploy/docker-compose.app.yml'), 'utf8');
  await uploadFile(conn, `${deployDir}/deploy/docker-compose.app.yml`, composeLocal);

  if (process.env.SKIP_BUILD !== '1') {
    console.log(green('\nBuilding...'));
    const build = await exec(conn, `cd ${deployDir} && docker compose -f deploy/docker-compose.app.yml --env-file /opt/culturago/.env build`);
    if (build.exit !== 0) {
      console.error(red('Docker build failed'));
      process.exit(1);
    }
  }

  console.log('\nRemoving old app container...');
  await exec(conn, `docker rm -f culturago-app 2>/dev/null || true`);

  console.log('\nStarting all services...');
  const up = await exec(conn, `cd ${deployDir} && docker compose -f deploy/docker-compose.app.yml --env-file /opt/culturago/.env up -d --no-recreate`);
  if (up.exit !== 0) {
    console.error(red('Docker compose up failed'));
    process.exit(1);
  }

  console.log('\nContainer status:');
  await exec(conn, `docker ps --filter name=culturago-`);

  const publicHost = process.env.CULTURAGO_DOMAIN || 'culturago.cl';
  console.log(green('\nDeploy command finished. Run "docker logs culturago-app -f" on the VPS to watch startup.'));
  console.log(`URL: https://${publicHost}`);
  conn.end();
}

main().catch((err) => {
  console.error(red(`Deploy failed: ${err.message}`));
  process.exit(1);
});
