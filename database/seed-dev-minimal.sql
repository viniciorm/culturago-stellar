-- ==============================================================================
-- CulturaGO DEV — Minimal Fictive Seed Dataset
-- 100% ficticio para verificación del stack DEV (sin PII, sin datos reales)
-- Esquema real: migraciones 0001–0014
-- ==============================================================================

BEGIN;

-- 1. Organización Emisora Demo
INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
VALUES ('10000000-0000-4000-8000-000000000001', 'organization', 'Academia Demo DEV', 'academia-demo-dev', 'Chile', 'Santiago', 'verified', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email, website)
VALUES ('10000000-0000-4000-8000-000000000001', 'academy', 'Contacto Demo DEV', 'contacto@demo.dev.culturago.example', 'https://demo.dev.culturago.example')
ON CONFLICT (entity_id) DO NOTHING;

-- 2. Evento Demo
INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
VALUES ('20000000-0000-4000-8000-000000000001', 'event', 'Festival Demo DEV 2026', 'festival-demo-dev-2026', 'Chile', 'Santiago', 'verified', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
VALUES ('20000000-0000-4000-8000-000000000001', 'Festival Demo DEV 2026', 2026, '2026-10-15', '2026-10-15', 'Teatro Demo', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (entity_id) DO NOTHING;

-- 3. Persona Artista Demo
INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
VALUES ('30000000-0000-4000-8000-000000000001', 'person', 'Artista Demo DEV', 'artista-demo-dev', 'Chile', 'Santiago', 'verified', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO people (entity_id, legal_name, artistic_name, email, main_role)
VALUES ('30000000-0000-4000-8000-000000000001', 'Persona Ficticia DEV', 'Artista Demo DEV', 'artista@demo.dev.culturago.example', 'dancer')
ON CONFLICT (entity_id) DO NOTHING;

-- 4. Participación Demo
INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code, registration_email)
VALUES ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'registered', 'DEV-DEMO-001', 'artista@demo.dev.culturago.example')
ON CONFLICT (id) DO NOTHING;

-- 5. Relaciones Mínimas
-- 5a. Relación Artista -> Escuela (member_of)
INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, status)
VALUES ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'member_of', 'active')
ON CONFLICT (id) DO NOTHING;

-- 5b. Relación Organización -> Evento (organizer_of)
INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, status)
VALUES ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'organizer_of', 'active')
ON CONFLICT (id) DO NOTHING;

COMMIT;
