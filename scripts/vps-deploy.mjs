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

function buildRemoteEnv() {
  const localEnv = readLocalEnv('.env');
  const testnetEnv = readLocalEnv('.env.testnet');
  const merged = { ...localEnv, ...testnetEnv };

  const safeVars = [
    'NEXT_PUBLIC_CULTURAGO_ENV',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE',
    'NEXT_PUBLIC_STELLAR_RPC_URL',
    'NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID',
    'NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID',
    'NEXT_PUBLIC_STELLAR_EXPLORER_BASE',
    'NEXT_PUBLIC_SMART_WALLET_WASM_HASH',
    'NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES',
    'WEBAUTHN_RP_ID',
    'WEBAUTHN_ORIGINS',
    'STELLAR_FEEPAYER_ADDRESS',
    'STELLAR_FEEPAYER_SECRET',
    'STELLAR_TESTNET_ADMIN_ADDRESS',
    'STELLAR_TESTNET_DEPLOYER_SECRET',
    'SMART_WALLET_RELAYER_API_KEY',
    'CULTURAGO_DOMAIN',
    'ACME_EMAIL',
    'CULTURAGO_IMAGE',
    'CULTURAGO_IMAGE_TAG',
    'HOSTNAME',
    'PORT',
    'NODE_ENV',
    'NEXT_TELEMETRY_DISABLED',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'DATABASE_URL',
    'CULTURAGO_HTTP_PORT',
    'CULTURAGO_HTTPS_PORT',
  ];

  merged.CULTURAGO_HTTP_PORT ||= '8080';
  merged.CULTURAGO_HTTPS_PORT ||= '8444';
  merged.CULTURAGO_DOMAIN ||= host;

  const out = [];
  for (const key of safeVars) {
    if (merged[key] !== undefined && merged[key] !== '') {
      const v = String(merged[key]);
      const needsQuotes = /[\s;#"']/.test(v);
      out.push(needsQuotes ? `${key}="${v.replace(/"/g, '\\"')}"` : `${key}=${v}`);
    }
  }

  if (!out.some((l) => l.startsWith('DATABASE_URL='))) {
    const u = merged.POSTGRES_USER || 'culturago_app';
    const p = merged.POSTGRES_PASSWORD || 'dev';
    const db = merged.POSTGRES_DB || 'culturago';
    out.push(`DATABASE_URL=postgres://${u}:${p}@culturago-postgres:5432/${db}`);
  }
  const port = merged.CULTURAGO_HTTPS_PORT || '8443';
  if (!out.some((l) => l.startsWith('NEXT_PUBLIC_APP_URL='))) {
    const domain = merged.CULTURAGO_DOMAIN || host;
    const portSuffix = port !== '443' ? `:${port}` : '';
    out.push(`NEXT_PUBLIC_APP_URL=https://${domain}${portSuffix}`);
  }
  if (!out.some((l) => l.startsWith('WEBAUTHN_RP_ID='))) {
    const domain = merged.CULTURAGO_DOMAIN || host;
    out.push(`WEBAUTHN_RP_ID=${domain}`);
  }
  if (!out.some((l) => l.startsWith('WEBAUTHN_ORIGINS='))) {
    const domain = merged.CULTURAGO_DOMAIN || host;
    const portSuffix = port !== '443' ? `:${port}` : '';
    out.push(`WEBAUTHN_ORIGINS=https://${domain}${portSuffix}`);
  }
  return out.join('\n') + '\n';
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
  const remoteEnv = buildRemoteEnv();
  console.log('\nUploading .env to VPS (ENV_ONLY)...');
  const upload = await uploadFile(conn, `${deployDir}/.env`, remoteEnv);
  if (upload.exit !== 0) {
    console.error(red('Failed to write .env'));
    process.exit(1);
  }

  console.log('Removing old containers...');
  await exec(conn, 'docker rm -f culturago-app culturago-caddy 2>/dev/null || true');

  console.log(green('Recreating containers with new env (no build)...'));
  const up = await exec(conn, `cd ${deployDir} && docker compose --env-file .env -f deploy/docker-compose.app.yml up -d --no-build`);
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

  console.log('\nOpening firewall ports...');
  await exec(conn, '(ufw allow 22/tcp && ufw allow 8080/tcp && ufw allow 8444/tcp && ufw reload) 2>/dev/null || true');
  await exec(conn, 'iptables -C INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 8080 -j ACCEPT');
  await exec(conn, 'iptables -C INPUT -p tcp --dport 8444 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 8444 -j ACCEPT');

  console.log('\n=== Firewall status ===');
  const ufwStatus = await exec(conn, 'ufw status verbose 2>/dev/null || echo "ufw not available"');
  console.log(ufwStatus.out);
  const iptablesStatus = await exec(conn, 'iptables -L INPUT -n --line-numbers 2>/dev/null | head -20');
  console.log(iptablesStatus.out);
  console.log('\n=== Listening ports ===');
  const listening = await exec(conn, 'ss -tlnp 2>/dev/null | grep -E "8080|8444" || netstat -tlnp 2>/dev/null | grep -E "8080|8444"');
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

  console.log('\nPreparing app directory...');
  await exec(conn, `rm -rf ${deployDir} && git clone --depth 1 ${repoUrl} ${deployDir}`);

  console.log('\nUploading deploy config...');
  const composeLocal = readFileSync(resolve(__dirname, '..', 'deploy/docker-compose.app.yml'), 'utf8');
  await uploadFile(conn, `${deployDir}/deploy/docker-compose.app.yml`, composeLocal);

  const caddyLocal = readFileSync(resolve(__dirname, '..', 'deploy/Caddyfile'), 'utf8');
  await uploadFile(conn, `${deployDir}/deploy/Caddyfile`, caddyLocal);

  const remoteEnv = buildRemoteEnv();
  console.log('\nUploading .env to VPS...');
  const upload = await uploadFile(conn, `${deployDir}/.env`, remoteEnv);
  if (upload.exit !== 0) {
    console.error(red('Failed to write .env'));
    process.exit(1);
  }

  if (process.env.SKIP_BUILD !== '1') {
    console.log(green('\nBuilding...'));
    const build = await exec(conn, `cd ${deployDir} && docker compose --env-file .env -f deploy/docker-compose.app.yml build`);
    if (build.exit !== 0) {
      console.error(red('Docker build failed'));
      process.exit(1);
    }
  }

  console.log('\nRemoving old app and caddy containers...');
  await exec(conn, `docker rm -f culturago-app culturago-caddy`);

  console.log('\nStarting all services...');
  const up = await exec(conn, `cd ${deployDir} && docker compose --env-file .env -f deploy/docker-compose.app.yml up -d --no-recreate`);
  if (up.exit !== 0) {
    console.error(red('Docker compose up failed'));
    process.exit(1);
  }

  console.log('\nContainer status:');
  await exec(conn, `docker ps --filter name=culturago-`);

  const publicHttp = process.env.CULTURAGO_HTTP_PORT || '8080';
  const publicHttps = process.env.CULTURAGO_HTTPS_PORT || '8444';
  const publicHost = process.env.CULTURAGO_DOMAIN || host;
  console.log(green('\nDeploy command finished. Run "docker logs culturago-app -f" on the VPS to watch startup.'));
  console.log(`HTTP:  http://${publicHost}:${publicHttp}`);
  console.log(`HTTPS: https://${publicHost}:${publicHttps}`);
  conn.end();
}

main().catch((err) => {
  console.error(red(`Deploy failed: ${err.message}`));
  process.exit(1);
});
