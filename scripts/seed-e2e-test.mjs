#!/usr/bin/env node
// scripts/seed-e2e-test.mjs — creates a deterministic admin test account + person
// and writes a single-use claim code for the Playwright E2E suite.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_JSON_PATH = resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'e2e-seed.json');

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

async function main() {
  const E2E_PERSON_ID = randomUUID();
  const E2E_ORG_ID = randomUUID();
  const E2E_ACCOUNT_ID = randomUUID();
  const E2E_EVENT_ID = '22222222-2222-2222-2222-333333333333';
  const personSlug = `e2e-admin-${Date.now()}`;
  const orgSlug = `e2e-org-${Date.now()}`;

  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    // 1. Person entity
    await pool.query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES ($1, 'person', $2, $3, 'Chile', 'Santiago', 'verified', true, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         slug = EXCLUDED.slug,
         status = EXCLUDED.status,
         is_public = EXCLUDED.is_public,
         active = EXCLUDED.active`,
      [E2E_PERSON_ID, 'E2E Admin Bailarina', personSlug]
    );

    // 1b. Organization entity (issuer for credential tests)
    await pool.query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES ($1, 'organization', $2, $3, 'Chile', 'Santiago', 'verified', true, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         slug = EXCLUDED.slug,
         status = EXCLUDED.status,
         is_public = EXCLUDED.is_public,
         active = EXCLUDED.active`,
      [E2E_ORG_ID, 'E2E Organizer', orgSlug]
    );

    await pool.query(
      `INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email)
       VALUES ($1, 'festival', 'E2E Contact', 'e2e-org@example.com')
       ON CONFLICT (entity_id) DO UPDATE SET
         organization_type = EXCLUDED.organization_type,
         contact_name = EXCLUDED.contact_name,
         contact_email = EXCLUDED.contact_email`,
      [E2E_ORG_ID]
    );

    // 1c. Event entity for credential tests (fixed id used by CredentialForm fallback)
    await pool.query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES ($1, 'event', 'FDVC 2026 E2E', 'fdvc-2026-e2e', 'Chile', 'Santiago', 'verified', true, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         slug = EXCLUDED.slug,
         status = EXCLUDED.status,
         is_public = EXCLUDED.is_public,
         active = EXCLUDED.active`,
      [E2E_EVENT_ID]
    );

    await pool.query(
      `INSERT INTO events (entity_id, name, year, start_date, end_date, location, address, description, organizer_entity_id)
       VALUES ($1, 'FDVC 2026 E2E', 2026, '2026-03-01', '2026-03-05', 'Santiago', 'Av. Principal 123', 'Evento E2E', $2)
       ON CONFLICT (entity_id) DO UPDATE SET
         name = EXCLUDED.name,
         year = EXCLUDED.year,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         location = EXCLUDED.location,
         address = EXCLUDED.address,
         description = EXCLUDED.description,
         organizer_entity_id = EXCLUDED.organizer_entity_id`,
      [E2E_EVENT_ID, E2E_ORG_ID]
    );

    // 2. Person details
    await pool.query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, email, main_role)
       VALUES ($1, 'E2E Admin', 'E2E Admin', 'e2e@example.com', 'dancer')
       ON CONFLICT (entity_id) DO UPDATE SET
         legal_name = EXCLUDED.legal_name,
         artistic_name = EXCLUDED.artistic_name,
         email = EXCLUDED.email,
         main_role = EXCLUDED.main_role`,
      [E2E_PERSON_ID]
    );

    // 3. Active admin account with a person link
    await pool.query(
      `INSERT INTO accounts (id, status, person_entity_id)
       VALUES ($1, 'active', $2)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         person_entity_id = EXCLUDED.person_entity_id`,
      [E2E_ACCOUNT_ID, E2E_PERSON_ID]
    );

    // 4. Admin role
    await pool.query(
      `INSERT INTO account_roles (account_id, role)
       VALUES ($1, 'admin')
       ON CONFLICT (account_id, role) DO NOTHING`,
      [E2E_ACCOUNT_ID]
    );

    // 5. Playwright session cookie (bypasses login passkey in the E2E harness)
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionDigest = createHash('sha256').update(sessionToken).digest('hex');
    const sessionId = randomUUID();
    const idleExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const absoluteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO sessions (id, session_token_digest, account_id, idle_expires_at, absolute_expires_at, rotated_from)
       VALUES ($1, decode($2, 'hex'), $3, $4, $5, NULL)
       ON CONFLICT (id) DO UPDATE SET
         session_token_digest = EXCLUDED.session_token_digest,
         account_id = EXCLUDED.account_id,
         idle_expires_at = EXCLUDED.idle_expires_at,
         absolute_expires_at = EXCLUDED.absolute_expires_at,
         revoked_at = NULL`,
      [sessionId, sessionDigest, E2E_ACCOUNT_ID, idleExpiresAt, absoluteExpiresAt]
    );

    const seed = {
      accountId: E2E_ACCOUNT_ID,
      personId: E2E_PERSON_ID,
      orgId: E2E_ORG_ID,
      sessionToken,
    };
    writeFileSync(SEED_JSON_PATH, JSON.stringify(seed, null, 2));
    console.log('E2E seed written to', SEED_JSON_PATH);
    console.log(JSON.stringify(seed, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
