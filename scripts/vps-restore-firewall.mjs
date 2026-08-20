#!/usr/bin/env node
// Restaura el firewall del VPS al estado anterior al deploy temporal de CulturaGO.
// Lee credenciales de .env (VPS_HOST, VPS_USER, VPS_PASSWORD/VPS_SSH_KEY).
import { Client } from 'ssh2';

const host = process.env.VPS_HOST;
const user = process.env.VPS_USER;
const password = (process.env.VPS_SSH_KEY || process.env.VPS_PASSWORD || '').trim();

if (!host || !user || !password) {
  console.error('Faltan VPS_HOST, VPS_USER o VPS_PASSWORD/VPS_SSH_KEY en .env');
  process.exit(1);
}

function exec(conn, command) {
  return new Promise((resolve) => {
    conn.exec(command, (err, stream) => {
      if (err) return resolve({ exit: 1, out: '', err: err.message });
      let out = '';
      let errOut = '';
      stream.on('close', (code) => resolve({ exit: code, out, err: errOut }));
      stream.on('data', (d) => { out += d; });
      stream.stderr.on('data', (d) => { errOut += d; });
    });
  });
}

async function main() {
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({
      host,
      port: 22,
      username: user,
      password,
      tryKeyboard: true,
      readyTimeout: 12000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    });
  });

  console.log(`Conectado a ${host} como ${user}`);

  console.log('\nRestaurando reglas ufw...');
  await exec(conn, 'ufw delete allow 8080/tcp 2>/dev/null || true');
  await exec(conn, 'ufw delete allow 8444/tcp 2>/dev/null || true');
  await exec(conn, 'ufw reload 2>/dev/null || true');

  console.log('\nRestaurando reglas iptables...');
  await exec(conn, 'iptables -D INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null || true');
  await exec(conn, 'iptables -D INPUT -p tcp --dport 8444 -j ACCEPT 2>/dev/null || true');

  console.log('\nFirewall restaurado. Puerto 22 sigue abierto para SSH.');

  const status = await exec(conn, 'ufw status numbered 2>/dev/null || iptables -L INPUT -n --line-numbers | head -20');
  console.log(status.out);

  conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
