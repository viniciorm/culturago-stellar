import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const seed = JSON.parse(readFileSync(resolve('tests/e2e/fixtures/e2e-seed.json'), 'utf8'));
const { Pool } = pg;

function getDatabaseUrl() {
  const direct = process.env.DATABASE_URL;
  if (direct && direct.trim().length > 0) return direct;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? 5432;
  const user = process.env.DB_USER ?? 'culturago_app';
  const password = process.env.DB_PASSWORD ?? 'dev';
  const name = process.env.DB_NAME ?? 'culturago';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
}

const pool = new Pool({ connectionString: getDatabaseUrl() });

try {
  const [opResult, walletResult] = await Promise.all([
    pool.query(
      `SELECT id, phase, idempotency_key, error_code, tx_hash, prepared_xdr, created_at
       FROM stellar_operations
       WHERE idempotency_key = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [`register:${seed.personId}`]
    ),
    pool.query(
      `SELECT contract_id, deployed_at
       FROM smart_wallet_claims
       WHERE account_id = $1
       ORDER BY deployed_at DESC
       LIMIT 1`,
      [seed.accountId]
    ),
  ]);
  console.log('operations:', JSON.stringify(opResult.rows, null, 2));
  console.log('wallet:', JSON.stringify(walletResult.rows, null, 2));
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}
