#!/usr/bin/env node
import { Client } from 'ssh2';
import { createConnection } from 'net';
import { existsSync, readFileSync } from 'node:fs';

const host = process.env.VPS_HOST;
const user = process.env.VPS_USER;
const password = (process.env.VPS_SSH_KEY || process.env.VPS_PASSWORD || '').trim();

const tempKeyPath = 'scripts/vps-temp';
const useTempKey = existsSync(tempKeyPath);

if (!host || !user || (!password && !useTempKey)) {
  console.error('Missing VPS_HOST, VPS_USER or a password/temp key');
  process.exit(1);
}

const candidatePorts = [
  process.env.VPS_PORT,
  '22',
  '222',
  '2222',
  '2200',
  '2022',
  '1022',
  '8022',
  '10022',
  '65022',
  '22022',
  '22222',
  '10000',
  '10001',
  '10002',
  '10003',
  '10004',
].filter(Boolean).map(Number).filter((v, i, a) => a.indexOf(v) === i);

function isTcpOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 5000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => resolve(false));
  });
}

function trySsh(port) {
  return new Promise((resolve) => {
    const conn = new Client();
    let ready = false;

    conn.on('ready', () => {
      ready = true;
      conn.exec('uname -a', (err, stream) => {
        if (err) {
          conn.end();
          resolve({ ok: false, port, err: err.message });
          return;
        }
        let out = '';
        stream.on('data', (data) => { out += data.toString(); });
        stream.on('close', () => {
          conn.end();
          resolve({ ok: true, port, out: out.trim() });
        });
      });
    });

    conn.on('error', (err) => {
      if (!ready) resolve({ ok: false, port, err: err.message });
    });

    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      finish([password]);
    });

    const connectConfig = {
      host,
      port,
      username: user,
      readyTimeout: 12000,
    };
    if (useTempKey) {
      connectConfig.privateKey = readFileSync(tempKeyPath);
    } else {
      connectConfig.password = password;
      connectConfig.tryKeyboard = true;
    }
    conn.connect(connectConfig);
  });
}

async function main() {
  console.log(`Probing SSH on ${host} for user ${user}...`);
  for (const port of candidatePorts) {
    const open = await isTcpOpen(port);
    if (!open) {
      console.log(`  port ${port}: TCP closed`);
      continue;
    }
    const result = await trySsh(port);
    if (result.ok) {
      console.log(`SSH found on port ${port}`);
      console.log(result.out);
      return;
    }
    console.log(`  port ${port}: TCP open but SSH failed — ${result.err}`);
  }
  console.error('Could not connect via SSH on any candidate port.');
  process.exit(1);
}

main();
