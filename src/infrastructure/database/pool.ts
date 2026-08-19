import 'server-only';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getDatabaseUrl } from '../config/env';
import { domainError } from '../../domain/errors';

/**
 * Bounded PostgreSQL pool, server-only. The browser never sees this module
 * nor DATABASE_URL. Statement/lock/idle timeouts are explicit; the runtime
 * role is least-privilege (no DDL, no ownership).
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 15_000,
      // TLS is enabled via sslmode in DATABASE_URL when the topology
      // crosses a network boundary; loopback/private Docker net does not.
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, [...params]);
}

/** Runs fn inside a transaction; rolls back on any error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Translates PostgreSQL errors into typed domain errors. */
export function translatePgError(error: unknown): never {
  const pgError = error as { code?: string; message?: string };
  switch (pgError?.code) {
    case '23505':
      throw domainError('ALREADY_EXISTS', pgError.message ?? 'Unique constraint violated');
    case '23503':
      throw domainError('INVALID_RELATIONSHIP', pgError.message ?? 'Foreign key violated');
    case '23514':
      throw domainError('INVALID_INPUT', pgError.message ?? 'Check constraint violated');
    default:
      throw domainError('INVALID_INPUT', pgError?.message ?? 'Database operation failed');
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
