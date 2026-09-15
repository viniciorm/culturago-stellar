#!/usr/bin/env node
// Fase 7 — Revisión final y gate de readiness
// Ejecuta localmente pnpm, contratos y tests, luego smoke remoto en el VPS.
import { spawn } from 'node:child_process';
import { Client } from 'ssh2';

const host = process.env.VPS_HOST;
const user = process.env.VPS_USER;
const password = (process.env.VPS_SSH_KEY || process.env.VPS_PASSWORD || '').trim();
const publicHost = process.env.CULTURAGO_DOMAIN || 'culturago.cl';

if (!host || !user || !password) {
  console.error('Faltan VPS_HOST, VPS_USER o VPS_PASSWORD/VPS_SSH_KEY en .env');
  process.exit(1);
}

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }

function runLocal(name, cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${name} ===`);
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`${name} falló con código ${code}`));
    });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) { reject(err); return; }
      let exit = null;
      let out = '';
      let errOut = '';
      stream.on('data', (data) => { out += data.toString(); process.stdout.write(data); });
      stream.stderr.on('data', (data) => { errOut += data.toString(); process.stderr.write(data); });
      stream.on('exit', (code) => { exit = code; });
      stream.on('close', () => { resolve({ exit: exit ?? 0, out, err: errOut }); });
    });
  });
}

async function main() {
  const localSteps = [
    ['Install', 'pnpm', ['install', '--frozen-lockfile']],
    ['Lint', 'pnpm', ['lint']],
    ['Typecheck', 'pnpm', ['typecheck']],
    ['Tests', 'pnpm', ['test']],
    ['Build', 'pnpm', ['build']],
    ['Contracts build', 'pnpm', ['contracts:build']],
    ['Contracts test', 'pnpm', ['contracts:test']],
    ['Cargo fmt', 'cargo', ['fmt', '--manifest-path', 'contracts/Cargo.toml', '--all', '--check']],
  ];

  for (const [name, cmd, args] of localSteps) {
    await runLocal(name, cmd, args);
  }

  console.log(green('\nLocal gate OK. Conectando al VPS para smoke...'));

  const conn = new Client();
  conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => finish([password]));

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
    });
  });

  console.log('\n=== Remote container status ===');
  await exec(conn, 'docker ps --filter name=culturago-');

  console.log('\n=== Local app container health check (port 3080) ===');
  const localCheck = await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/api/health');
  console.log(`Local app health code: ${localCheck.out.trim()}`);

  console.log('\n=== Host Nginx HTTPS smoke (port 443 with SNI) ===');
  const httpsCheck = await exec(conn, `curl --resolve "${publicHost}:443:127.0.0.1" -s -o /dev/null -w "%{http_code}" "https://${publicHost}/login"`);
  console.log(`HTTPS login code: ${httpsCheck.out.trim()}`);
  if (httpsCheck.out.trim() !== '200' && httpsCheck.out.trim() !== '308') {
    throw new Error(`HTTPS smoke falló con código ${httpsCheck.out.trim()}`);
  }

  console.log('\n=== App logs (tail) ===');
  await exec(conn, 'docker logs --tail 30 culturago-app');

  conn.end();

  console.log(green('\nFase 7 OK.'));
  console.log(`URL: https://${publicHost}`);
}

main().catch((err) => {
  console.error(red(`\nFase 7 falló: ${err.message}`));
  process.exit(1);
});
