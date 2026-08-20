// Migration runner for direct PostgreSQL. Applies database/migrations/*.sql
// in order, tracking applied files in schema_migrations. Requires DATABASE_URL
// in the environment (or .env loaded by the caller). NEVER logs the URL.
// Usage: node database/migrate.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_MIGRATION_URL or DATABASE_URL is required');
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );
    if (applied.rowCount > 0) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`FAIL  ${file}: ${error.message}`);
      process.exit(1);
    }
  }
  console.log('migrations complete');
} finally {
  await client.end();
}
