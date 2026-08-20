#!/usr/bin/env node
// PostgreSQL logical backup. Default: dry-run.
// Requires: DATABASE_BACKUP_URL, POSTGRES_BACKUP_DIR, POSTGRES_BACKUP_RETENTION_DAYS
// Never logs the connection URL or PII.

import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const EXECUTE = process.argv.includes('--execute');
const CUTOFF_ENV = process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS;
const BACKUP_DIR = process.env.POSTGRES_BACKUP_DIR ?? './backups';
const RETENTION_DAYS = Number(process.env.POSTGRES_BACKUP_RETENTION_DAYS ?? '7');
const DATABASE_BACKUP_URL = process.env.DATABASE_BACKUP_URL;
const RPO = Number(process.env.POSTGRES_RPO_SECONDS ?? '86400');

if (!DATABASE_BACKUP_URL) {
  console.error('DATABASE_BACKUP_URL is required');
  process.exit(1);
}

if (EXECUTE && CUTOFF_ENV !== 'true') {
  console.error('Backup with --execute requires CULTURAGO_ALLOW_TESTNET_MUTATIONS=true');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `culturago-${timestamp}.pgdump`;
const filepath = join(BACKUP_DIR, filename);

async function pgDump() {
  await mkdir(BACKUP_DIR, { recursive: true });
  if (!EXECUTE) {
    console.log(`[DRY-RUN] Would run: pg_dump -Fc -f ${filepath} <redacted>`);
    return { path: filepath, size: 0, sha256: 'dry-run', elapsedMs: 0, rpoSeconds: RPO };
  }
  const start = Date.now();
  await new Promise((resolve, reject) => {
    const proc = spawn('pg_dump', ['-Fc', '-f', filepath, DATABASE_BACKUP_URL], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PGPASSWORD: undefined },
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`pg_dump failed: ${stderr}`));
    });
  });
  const elapsedMs = Date.now() - start;
  const { size } = await stat(filepath);
  const sha256 = createHash('sha256').setEncoding('hex');
  // In a real run we would stream the file through the hash; kept simple here.
  const file = await import('node:fs/promises');
  const buf = await file.readFile(filepath);
  sha256.update(buf);
  const hash = sha256.digest('hex');

  // Retention cleanup
  const files = await readdir(BACKUP_DIR);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const f of files) {
    if (!f.endsWith('.pgdump')) continue;
    const p = join(BACKUP_DIR, f);
    const s = await stat(p);
    if (s.mtime.getTime() < cutoff) {
      await unlink(p);
      console.log(`removed old backup: ${f}`);
    }
  }

  return { path: filepath, size, sha256: hash, elapsedMs, rpoSeconds: RPO };
}

const result = await pgDump().catch((e) => {
  console.error('backup failed:', e.message);
  process.exit(1);
});

console.log(JSON.stringify({ ...result, backupUrl: '[REDACTED]' }, null, 2));
