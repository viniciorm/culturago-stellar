#!/usr/bin/env node
/**
 * Seeds deterministic synthetic data into the isolated test PostgreSQL database
 * (`culturago_test` on 127.0.0.1 / localhost) for the D1 browser demonstration:
 *   1. Iniciar sesión (/login con passkey o sesión de operador sintético)
 *   2. Emitir Credencial V2 (/organizer -> familia participant)
 *   3. Abrir pasaporte (/p/camila-danzante-sintetica)
 *   4. Abrir credencial (/credentials/[publicId])
 *   5. Descargar PDF (/api/credentials/[publicId]/pdf)
 *   6. Comprobar QR (/api/credentials/[publicId]/qr)
 *
 * Refuses to run against any non-test or remote database.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

export const D1_DEMO_FIXTURES = {
  issuerId: 'd1000001-0000-4000-8000-000000000001',
  issuerSlug: 'agrupacion-danza-viva-sintetica',
  issuerName: 'Agrupación Danza Viva Sintética',
  eventId: 'd1000002-0000-4000-8000-000000000002',
  eventSlug: 'festival-sintetico-d1-2026',
  eventName: 'Festival Sintético D1 2026',
  subjectId: 'd1000003-0000-4000-8000-000000000003',
  subjectSlug: 'camila-danzante-sintetica',
  subjectDisplayName: 'Camila Danzante Sintética',
  subjectArtisticName: 'Kamila Nur',
  participationId: 'd1000004-0000-4000-8000-000000000004',
  presentationCode: 'D1-SINT-001',
  operatorAccountId: 'd1000005-0000-4000-8000-000000000005',
  claimId: 'd1000006-0000-4000-8000-000000000006',
  claimCode: 'D1-SINTETICO-2026',
};

function validateTestDatabaseUrl(connectionString) {
  if (!connectionString) {
    throw new Error('Test database guard: DATABASE_URL or TEST_DATABASE_URL is required');
  }
  const parsed = new URL(connectionString);
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
      `Test database guard: refusing database '${dbName}'. Must explicitly end with '_test' and never reference production/festival data`
    );
  }
  return dbName;
}

export async function seedD1SyntheticDemo(connectionString) {
  const expectedDbName = validateTestDatabaseUrl(connectionString);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const dbCheck = await client.query('SELECT current_database() AS db_name');
    const activeDb = dbCheck.rows[0]?.db_name ?? '';
    if (
      activeDb !== expectedDbName ||
      !/^[a-z0-9_]+_test$/i.test(activeDb) ||
      /(prod|festival|fdvc)/i.test(activeDb)
    ) {
      throw new Error(
        `Test database guard: active database '${activeDb}' does not match isolated test database '${expectedDbName}'`
      );
    }

    await client.query('BEGIN');

    // Clean only the deterministic UUIDs of this synthetic demo fixture
    await client.query(
      `DELETE FROM credential_evidence WHERE credential_id IN (
         SELECT id FROM credentials WHERE participation_id = $1 OR issuer_entity_id = $2
       )`,
      [D1_DEMO_FIXTURES.participationId, D1_DEMO_FIXTURES.issuerId]
    );
    await client.query(
      `DELETE FROM credentials WHERE participation_id = $1 OR issuer_entity_id = $2`,
      [D1_DEMO_FIXTURES.participationId, D1_DEMO_FIXTURES.issuerId]
    );
    await client.query(`DELETE FROM sessions WHERE account_id = $1`, [
      D1_DEMO_FIXTURES.operatorAccountId,
    ]);
    await client.query(`DELETE FROM passkey_credentials WHERE account_id = $1`, [
      D1_DEMO_FIXTURES.operatorAccountId,
    ]);
    await client.query(`DELETE FROM auth_challenges WHERE id = $1 OR account_id = $2`, [
      D1_DEMO_FIXTURES.claimId,
      D1_DEMO_FIXTURES.operatorAccountId,
    ]);
    await client.query(
      `DELETE FROM issuer_operators WHERE issuer_entity_id = $1 AND operator_account_id = $2`,
      [D1_DEMO_FIXTURES.issuerId, D1_DEMO_FIXTURES.operatorAccountId]
    );
    await client.query(`DELETE FROM account_roles WHERE account_id = $1`, [
      D1_DEMO_FIXTURES.operatorAccountId,
    ]);
    await client.query(`DELETE FROM accounts WHERE id = $1`, [
      D1_DEMO_FIXTURES.operatorAccountId,
    ]);
    await client.query(`DELETE FROM participations WHERE id = $1`, [
      D1_DEMO_FIXTURES.participationId,
    ]);

    // Upsert synthetic entities
    await client.query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES
         ($1, 'organization', $2, $3, 'Chile', 'Santiago', 'verified', true, true),
         ($4, 'event', $5, $6, 'Chile', 'Santiago', 'verified', true, true),
         ($7, 'person', $8, $9, 'Chile', 'Santiago', 'verified', true, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         slug = EXCLUDED.slug,
         status = EXCLUDED.status,
         is_public = EXCLUDED.is_public,
         active = EXCLUDED.active`,
      [
        D1_DEMO_FIXTURES.issuerId,
        D1_DEMO_FIXTURES.issuerName,
        D1_DEMO_FIXTURES.issuerSlug,
        D1_DEMO_FIXTURES.eventId,
        D1_DEMO_FIXTURES.eventName,
        D1_DEMO_FIXTURES.eventSlug,
        D1_DEMO_FIXTURES.subjectId,
        D1_DEMO_FIXTURES.subjectDisplayName,
        D1_DEMO_FIXTURES.subjectSlug,
      ]
    );

    await client.query(
      `INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email)
       VALUES ($1, 'school', 'Contacto Sintético D1', 'operador.sintetico@example.test')
       ON CONFLICT (entity_id) DO UPDATE SET
         organization_type = EXCLUDED.organization_type,
         contact_name = EXCLUDED.contact_name,
         contact_email = EXCLUDED.contact_email`,
      [D1_DEMO_FIXTURES.issuerId]
    );

    await client.query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, main_role)
       VALUES ($1, 'Camila Legal Sintética', $2, 'dancer')
       ON CONFLICT (entity_id) DO UPDATE SET
         legal_name = EXCLUDED.legal_name,
         artistic_name = EXCLUDED.artistic_name,
         main_role = EXCLUDED.main_role`,
      [D1_DEMO_FIXTURES.subjectId, D1_DEMO_FIXTURES.subjectArtisticName]
    );

    await client.query(
      `INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
       VALUES ($1, $2, 2026, '2026-11-16', '2026-11-18', 'Santiago', $3)
       ON CONFLICT (entity_id) DO UPDATE SET
         name = EXCLUDED.name,
         year = EXCLUDED.year,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         location = EXCLUDED.location,
         organizer_entity_id = EXCLUDED.organizer_entity_id`,
      [
        D1_DEMO_FIXTURES.eventId,
        D1_DEMO_FIXTURES.eventName,
        D1_DEMO_FIXTURES.issuerId,
      ]
    );

    await client.query(
      `INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
       VALUES ($1, $2, $3, 'participation_confirmed', $4)`,
      [
        D1_DEMO_FIXTURES.participationId,
        D1_DEMO_FIXTURES.subjectId,
        D1_DEMO_FIXTURES.eventId,
        D1_DEMO_FIXTURES.presentationCode,
      ]
    );

    // Seed operator account, role, issuer scope, and one-time passkey claim code
    await client.query(
      `INSERT INTO accounts (id, status, person_entity_id, wallet_contract_address)
       VALUES ($1, 'pending_claim', NULL, 'CD1SIMULATEDOPERATORWALLET000000000000000000000000000001')`,
      [D1_DEMO_FIXTURES.operatorAccountId]
    );

    await client.query(
      `INSERT INTO account_roles (account_id, role) VALUES ($1, 'operator')`,
      [D1_DEMO_FIXTURES.operatorAccountId]
    );

    await client.query(
      `INSERT INTO issuer_operators (issuer_entity_id, operator_account_id)
       VALUES ($1, $2)`,
      [D1_DEMO_FIXTURES.issuerId, D1_DEMO_FIXTURES.operatorAccountId]
    );

    const tokenDigest = createHash('sha256')
      .update(D1_DEMO_FIXTURES.claimCode)
      .digest();
    await client.query(
      `INSERT INTO auth_challenges (id, challenge_digest, purpose, account_id, expires_at)
       VALUES ($1, $2, 'claim_account', $3, NOW() + INTERVAL '7 days')`,
      [
        D1_DEMO_FIXTURES.claimId,
        tokenDigest,
        D1_DEMO_FIXTURES.operatorAccountId,
      ]
    );

    await client.query('COMMIT');
    return D1_DEMO_FIXTURES;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isDirectRun) {
  const dbUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:test@127.0.0.1:5433/culturago_test';

  seedD1SyntheticDemo(dbUrl)
    .then((f) => {
      console.log('D1 Synthetic Demo Seed complete (isolated test DB):');
      console.log(`  Issuer:        ${f.issuerName} (${f.issuerId})`);
      console.log(`  Subject:       ${f.subjectDisplayName} / "${f.subjectArtisticName}" (/p/${f.subjectSlug})`);
      console.log(`  Participation: [${f.presentationCode}] (${f.participationId})`);
      console.log(`  Claim Code:    ${f.claimCode} (use on /login -> "Registrar primer passkey")`);
    })
    .catch((err) => {
      console.error('Failed to seed D1 synthetic demo:', err.message);
      process.exit(1);
    });
}
