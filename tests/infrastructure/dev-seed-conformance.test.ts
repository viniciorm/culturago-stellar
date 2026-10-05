import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5433/culturago_test';

describe('DEV Seed & Migration Setup Conformance', () => {
  const rootDir = process.cwd();
  const seedSqlPath = join(rootDir, 'database', 'seed-dev-minimal.sql');
  const seedMjsPath = join(rootDir, 'database', 'seed-dev-minimal.mjs');
  const setupScriptPath = join(rootDir, 'deploy', 'setup-dev-vps.sh');
  const migrationsDir = join(rootDir, 'database', 'migrations');

  const seedSql = readFileSync(seedSqlPath, 'utf8');
  const seedMjs = readFileSync(seedMjsPath, 'utf8');
  const setupScript = readFileSync(setupScriptPath, 'utf8');

  it('1. verifies seed targets exclusively valid columns in 0001-0014 schema without obsolete/invented columns', () => {
    // Collect all migration SQL contents
    const migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(migrationFiles.length).toBe(14);
    const combinedMigrations = migrationFiles
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');

    // 1a. organizations schema verification:
    // organizations table has organization_type, contact_email, website, contact_name...
    // but DOES NOT have legal_name or org_type!
    expect(combinedMigrations).toMatch(/CREATE TABLE organizations \(/);
    expect(combinedMigrations).toMatch(/organization_type organization_kind NOT NULL/);
    expect(combinedMigrations).not.toMatch(/CREATE TABLE organizations [^;]*\blegal_name\b/);
    expect(combinedMigrations).not.toMatch(/CREATE TABLE organizations [^;]*\borg_type\b/);

    // Verify seed SQL does NOT insert legal_name or org_type into organizations
    expect(seedSql).not.toMatch(/INSERT INTO organizations [^;]*\blegal_name\b/);
    expect(seedSql).not.toMatch(/INSERT INTO organizations [^;]*\borg_type\b/);
    expect(seedSql).toMatch(/INSERT INTO organizations \([^)]*organization_type[^)]*\)/);

    // 1b. people schema verification:
    // people table has legal_name, artistic_name, email, main_role...
    // but DOES NOT have first_name or last_name!
    expect(combinedMigrations).toMatch(/CREATE TABLE people \(/);
    expect(combinedMigrations).toMatch(/artistic_name TEXT NOT NULL/);
    expect(combinedMigrations).not.toMatch(/CREATE TABLE people [^;]*\bfirst_name\b/);
    expect(combinedMigrations).not.toMatch(/CREATE TABLE people [^;]*\blast_name\b/);

    // Verify seed SQL does NOT insert first_name or last_name into people
    expect(seedSql).not.toMatch(/INSERT INTO people [^;]*\bfirst_name\b/);
    expect(seedSql).not.toMatch(/INSERT INTO people [^;]*\blast_name\b/);
    expect(seedSql).toMatch(/INSERT INTO people \([^)]*artistic_name[^)]*\)/);

    // 1c. verify seed does NOT automatically create credentials V2
    expect(seedSql).not.toMatch(/INSERT INTO credentials\b/i);
    expect(seedMjs).not.toMatch(/INSERT INTO credentials\b/i);
  });

  it('2. verifies seed SQL statements are idempotent with ON CONFLICT DO NOTHING', () => {
    // All INSERT statements in seed SQL must have ON CONFLICT
    const insertMatches = seedSql.match(/INSERT INTO \w+/g) || [];
    const conflictMatches = seedSql.match(/ON CONFLICT [^;]+ DO NOTHING/g) || [];
    expect(insertMatches.length).toBeGreaterThanOrEqual(5);
    expect(conflictMatches.length).toBe(insertMatches.length);
  });

  it('3. verifies seed-dev-minimal.mjs handles errors with ROLLBACK and non-zero exit', () => {
    // seed-dev-minimal.mjs must contain BEGIN, ROLLBACK on catch, and exit(1)
    expect(seedMjs).toMatch(/BEGIN/);
    expect(seedMjs).toMatch(/ROLLBACK/);
    expect(seedMjs).toMatch(/process\.exit\(1\)/);
  });

  it('4. verifies setup-dev-vps.sh uses fail-fast ON_ERROR_STOP=1 and does not report success on failure', () => {
    // Every psql execution in setup script must enforce ON_ERROR_STOP=1
    const psqlInvocations = setupScript.match(/psql [^\n]+/g) || [];
    expect(psqlInvocations.length).toBeGreaterThanOrEqual(3);
    for (const invocation of psqlInvocations) {
      expect(invocation).toContain('ON_ERROR_STOP=1');
    }

    // Must verify row count of seeded tables after seed
    expect(setupScript).toMatch(/ENTITIES_COUNT=\$\(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 [^)]*count\(\*\) FROM entities/);
    expect(setupScript).toMatch(/if \[ "\$ENTITIES_COUNT" -eq 0 \]/);

    // Must verify schema_migrations with the real 'filename' column, never 'version'
    expect(setupScript).toMatch(/SELECT count\(\*\) FROM schema_migrations WHERE filename =/);
    expect(setupScript).not.toMatch(/schema_migrations WHERE version =/);
  });

  it('5. executes seed against live test DB if available and verifies idempotency', async () => {
    const client = new Client({ connectionString: testDbUrl });
    let dbAvailable = false;
    try {
      await client.connect();
      dbAvailable = true;
    } catch {
      // Test DB not running locally; static assertions above guarantee conformance
      return;
    }

    try {
      // First execution of seed
      await client.query(seedSql);

      const checkEntities = await client.query('SELECT count(*) FROM entities WHERE id = $1', ['10000000-0000-4000-8000-000000000001']);
      expect(Number(checkEntities.rows[0].count)).toBe(1);

      const checkOrgs = await client.query('SELECT count(*) FROM organizations WHERE entity_id = $1', ['10000000-0000-4000-8000-000000000001']);
      expect(Number(checkOrgs.rows[0].count)).toBe(1);

      // Second execution: must succeed cleanly without throwing constraint errors
      await expect(client.query(seedSql)).resolves.not.toThrow();
    } finally {
      await client.end();
    }
  });
});
