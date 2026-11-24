export function validateTestDatabaseUrl(connectionString: string | undefined): {
  host: string;
  dbName: string;
} {
  if (!connectionString) {
    throw new Error('Test database guard: connection string is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Test database guard: invalid database URL format');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Test database guard: unsupported protocol '${parsed.protocol}'`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `Test database guard: refusing non-local host '${host}'. Only 127.0.0.1 or localhost is allowed`
    );
  }

  const dbName = parsed.pathname.replace(/^\/+/, '');
  if (!dbName || !/^[a-z0-9_]+_test$/i.test(dbName) || /(prod|festival|fdvc)/i.test(dbName)) {
    throw new Error(
      `Test database guard: refusing database '${dbName}'. Database name must explicitly end with '_test' and never reference production/festival data`
    );
  }

  return { host, dbName };
}

export async function assertIsolatedTestDatabase(
  connectionString: string | undefined,
  queryFn: <T extends Record<string, unknown>>(sql: string) => Promise<{ rows: T[] }>
): Promise<void> {
  const { dbName: expectedDbName } = validateTestDatabaseUrl(connectionString);

  const res = await queryFn<{ db_name: string }>('SELECT current_database() AS db_name');
  const activeDb = res.rows[0]?.db_name ?? '';

  if (
    activeDb !== expectedDbName ||
    !/^[a-z0-9_]+_test$/i.test(activeDb) ||
    /(prod|festival|fdvc)/i.test(activeDb)
  ) {
    throw new Error(
      `Test database guard: active database '${activeDb}' does not match isolated test database '${expectedDbName}'`
    );
  }
}
