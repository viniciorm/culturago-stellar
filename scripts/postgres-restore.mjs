#!/usr/bin/env node
// PostgreSQL restore drill to an isolated database. Default: dry-run.
// Requires: DATABASE_RESTORE_URL, POSTGRES_RESTORE_TARGET_GUARD, POSTGRES_BACKUP_DIR
// Rejects any guard that looks like production.

import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const EXECUTE = process.argv.includes('--execute');
const MUTATION_OK = process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS === 'true';
const GUARD = process.env.POSTGRES_RESTORE_TARGET_GUARD;
const RESTORE_URL = process.env.DATABASE_RESTORE_URL;
const BACKUP_DIR = process.env.POSTGRES_BACKUP_DIR ?? './backups';
const RTO = Number(process.env.POSTGRES_RTO_SECONDS ?? '3600');

if (!RESTORE_URL || !GUARD) {
  console.error('DATABASE_RESTORE_URL and POSTGRES_RESTORE_TARGET_GUARD are required');
  process.exit(1);
}

const lower = GUARD.toLowerCase();
if (lower.includes('prod') || lower.includes('mainnet') || lower.includes('live')) {
  console.error('Refusing to restore: guard looks like a production target');
  process.exit(1);
}

if (EXECUTE && !MUTATION_OK) {
  console.error('Restore with --execute requires CULTURAGO_ALLOW_TESTNET_MUTATIONS=true');
  process.exit(1);
}

async function latestBackup() {
  const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.pgdump'));
  if (files.length === 0) throw new Error('no .pgdump files found');
  let chosen = null;
  let chosenMtime = 0;
  for (const f of files) {
    const s = await stat(join(BACKUP_DIR, f));
    if (s.mtime.getTime() > chosenMtime) {
      chosen = f;
      chosenMtime = s.mtime.getTime();
    }
  }
  return join(BACKUP_DIR, chosen);
}

const backup = await latestBackup().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

async function pgRestore() {
  if (!EXECUTE) {
    console.log(`[DRY-RUN] Would run: pg_restore -d <redacted> -v ${backup}`);
    return { backup, restored: false, elapsedMs: 0, rtoSeconds: RTO, guard: GUARD };
  }
  const start = Date.now();
  await new Promise((resolve, reject) => {
    const proc = spawn('pg_restore', ['-d', RESTORE_URL, '-v', '--no-owner', backup], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0 || code === 1) return resolve();
      reject(new Error(`pg_restore failed: ${stderr}`));
    });
  });
  const elapsedMs = Date.now() - start;
  return { backup, restored: true, elapsedMs, rtoSeconds: RTO, guard: GUARD };
}

const result = await pgRestore().catch((e) => {
  console.error('restore failed:', e.message);
  process.exit(1);
});

console.log(JSON.stringify({ ...result, restoreUrl: '[REDACTED]' }, null, 2));
