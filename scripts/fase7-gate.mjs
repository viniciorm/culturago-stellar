#!/usr/bin/env node
// Fase 7 — Revisión final y gate de readiness
// Ejecuta localmente pnpm, contratos y tests, luego smoke remoto en el VPS.
import { spawn } from 'node:child_process';
import { Client } from 'ssh2';

const host = process.env.VPS_HOST;
const user = process.env.VPS_USER;
const password = (process.env.VPS_SSH_KEY || process.env.VPS_PASSWORD || '').trim();
const publicHost = process.env.CULTURAGO_DOMAIN || host;
const publicHttp = process.env.CULTURAGO_HTTP_PORT || '8080';
const publicHttps = process.env.CULTURAGO_HTTPS_PORT || '8444';

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

  console.log('\n=== Caddy logs ===');
  await exec(conn, 'docker logs --tail 30 culturago-caddy');

  console.log('\n=== HTTP smoke ===');
  const httpCheck = await exec(conn, `curl -s -o /dev/null -w '%{http_code}' http://localhost:${publicHttp}`);
  console.log(`HTTP code: ${httpCheck.out.trim()}`);
  if (httpCheck.out.trim() !== '200' && httpCheck.out.trim() !== '308') {
    throw new Error('HTTP smoke no retornó 200/308');
  }

  console.log('\n=== HTTPS smoke ===');
  const httpsCheck = await exec(conn, `curl -k -s -o /dev/null -w '%{http_code}' https://localhost:${publicHttps}`);
  console.log(`HTTPS code: ${httpsCheck.out.trim()}`);

  console.log('\n=== App logs (tail) ===');
  await exec(conn, 'docker logs --tail 30 culturago-app');

  conn.end();

  console.log(green('\nFase 7 OK.'));
  console.log(`URLs:`);
  console.log(`  http://${publicHost}:${publicHttp}`);
  console.log(`  https://${publicHost}:${publicHttps}`);
}

main().catch((err) => {
  console.error(red(`\nFase 7 falló: ${err.message}`));
  process.exit(1);
});
