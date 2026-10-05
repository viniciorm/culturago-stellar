#!/usr/bin/env node
// database/seed-dev-minimal.mjs — Dataset mínimo ficticio para ambiente DEV.
// Cero PII, cero datos del FDVC real. 100% ficticio para validar el stack.
import pg from 'pg';

const { Pool } = pg;
const dbUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL or DATABASE_MIGRATION_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function seed() {
  console.log('--- Aplicando seed mínimo ficticio para DEV ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Entidad Organización Emisora Demo
    const orgId = '10000000-0000-4000-8000-000000000001';
    await client.query(`
      INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
      VALUES ($1, 'organization', 'Academia Demo DEV', 'academia-demo-dev', 'Chile', 'Santiago', 'verified', true, true)
      ON CONFLICT (id) DO NOTHING
    `, [orgId]);

    await client.query(`
      INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email, website)
      VALUES ($1, 'academy', 'Contacto Demo DEV', 'contacto@demo.dev.culturago.example', 'https://demo.dev.culturago.example')
      ON CONFLICT (entity_id) DO NOTHING
    `, [orgId]);

    // 2. Entidad Evento Demo
    const eventId = '20000000-0000-4000-8000-000000000001';
    await client.query(`
      INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
      VALUES ($1, 'event', 'Festival Demo DEV 2026', 'festival-demo-dev-2026', 'Chile', 'Santiago', 'verified', true, true)
      ON CONFLICT (id) DO NOTHING
    `, [eventId]);

    await client.query(`
      INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
      VALUES ($1, 'Festival Demo DEV 2026', 2026, '2026-10-15', '2026-10-15', 'Teatro Demo', $2)
      ON CONFLICT (entity_id) DO NOTHING
    `, [eventId, orgId]);

    // 3. Entidad Persona Demo (Artista)
    const personId = '30000000-0000-4000-8000-000000000001';
    await client.query(`
      INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
      VALUES ($1, 'person', 'Artista Demo DEV', 'artista-demo-dev', 'Chile', 'Santiago', 'verified', true, true)
      ON CONFLICT (id) DO NOTHING
    `, [personId]);

    await client.query(`
      INSERT INTO people (entity_id, legal_name, artistic_name, email, main_role)
      VALUES ($1, 'Persona Ficticia DEV', 'Artista Demo DEV', 'artista@demo.dev.culturago.example', 'dancer')
      ON CONFLICT (entity_id) DO NOTHING
    `, [personId]);

    // 4. Participación Demo
    const partId = '40000000-0000-4000-8000-000000000001';
    await client.query(`
      INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code, registration_email)
      VALUES ($1, $2, $3, 'registered', 'DEV-DEMO-001', 'artista@demo.dev.culturago.example')
      ON CONFLICT (id) DO NOTHING
    `, [partId, personId, eventId]);

    // 5. Relaciones Mínimas
    // 5a. Relación Artista -> Escuela (member_of)
    const relMemberId = '50000000-0000-4000-8000-000000000001';
    await client.query(`
      INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, status)
      VALUES ($1, $2, $3, 'member_of', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [relMemberId, personId, orgId]);

    // 5b. Relación Organización -> Evento (organizer_of)
    const relOrgId = '50000000-0000-4000-8000-000000000002';
    await client.query(`
      INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, status)
      VALUES ($1, $2, $3, 'organizer_of', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [relOrgId, orgId, eventId]);

    await client.query('COMMIT');
    console.log('✓ Seed mínimo para DEV completado exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error aplicando seed DEV:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
