#!/usr/bin/env node
/**
 * scripts/db-snapshot.mjs
 *
 * Crea un respaldo / snapshot JSON completo de todas las tablas de PostgreSQL
 * antes de realizar modificaciones en producción.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

function loadEnv() {
  const envPath = resolve('/opt/culturago/.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const [k, v] = line.split('=', 2);
        const key = k.trim();
        const val = v.trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function main() {
  loadEnv();
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL no encontrada en el entorno ni en /opt/culturago/.env');
    process.exit(1);
  }

  // Fallback para ejecución en el host fuera de la red interna de Docker Compose
  if (dbUrl.includes('culturago-postgres')) {
    try {
      const dns = await import('node:dns/promises');
      await dns.lookup('culturago-postgres');
    } catch {
      dbUrl = dbUrl.replace('@culturago-postgres:', '@172.20.0.2:').replace('@culturago-postgres/', '@172.20.0.2/');
    }
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('================================================================');
  console.log('  📦 CulturaGO — Snapshot / Respaldo Pre-Carga PostgreSQL');
  console.log('================================================================');

  try {
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesRes.rows.map((r) => r.table_name);
    console.log(`  Tablas encontradas en schema public: ${tables.length}`);

    const snapshot = {
      timestamp: new Date().toISOString(),
      database: dbUrl.replace(/\/\/.*@/, '//[REDACTED]@'),
      tables: {},
      counts: {},
    };

    for (const t of tables) {
      const rowsRes = await client.query(`SELECT * FROM "${t}"`);
      snapshot.tables[t] = rowsRes.rows;
      snapshot.counts[t] = rowsRes.rows.length;
      console.log(`  • ${t.padEnd(28)} : ${rowsRes.rows.length} registros`);
    }

    const backupDir = resolve('backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = join(backupDir, `snapshot-pre-fdvc2026-${ts}.json`);

    const jsonStr = JSON.stringify(snapshot, null, 2);
    writeFileSync(backupFile, jsonStr, 'utf8');

    const sha256 = createHash('sha256').update(jsonStr).digest('hex');

    console.log('----------------------------------------------------------------');
    console.log(`  ✅ Respaldo guardado exitosamente:`);
    console.log(`     Ruta   : ${backupFile}`);
    console.log(`     Tamaño : ${(Buffer.byteLength(jsonStr) / 1024).toFixed(2)} KB`);
    console.log(`     SHA-256: ${sha256}`);
    console.log('================================================================\n');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error creando snapshot de BD:', err);
  process.exit(1);
});
