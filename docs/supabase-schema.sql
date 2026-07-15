-- Esquema de Base de Datos Supabase para CulturaGO MVP
-- Festival Nacional Danza del Vientre Chile 2026

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla: entities
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('person', 'organization', 'provider', 'event')),
    display_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'verified', 'archived')),
    metadata_hash TEXT,
    stellar_status TEXT NOT NULL DEFAULT 'not_registered' CHECK (stellar_status IN ('not_registered', 'pending', 'registered', 'failed')),
    stellar_tx TEXT,
    wallet_address TEXT,
    wallet_status TEXT NOT NULL DEFAULT 'none' CHECK (wallet_status IN ('none', 'reserved', 'claimed')),
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla: people
CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    legal_name TEXT,
    artistic_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    bio TEXT,
    photo_url TEXT,
    main_role TEXT NOT NULL CHECK (main_role IN ('dancer', 'teacher', 'director', 'judge', 'guest', 'staff', 'other')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla: organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    organization_type TEXT NOT NULL CHECK (organization_type IN ('festival', 'school', 'academy', 'company', 'association', 'producer', 'community', 'other')),
    website TEXT,
    instagram TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla: providers
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN ('venue', 'pub', 'photographer', 'videographer', 'foodtruck', 'sound', 'lighting', 'sponsor', 'streaming', 'security', 'makeup', 'costume', 'ticketing', 'transport', 'other')),
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    website TEXT,
    public_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabla: events
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    year INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    location TEXT,
    address TEXT,
    description TEXT,
    organizer_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabla: relationships
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'organizer_of', 'participant_of', 'member_of', 'teacher_at', 'director_of',
        'founder_of', 'provider_of', 'venue_of', 'sponsor_of', 'official_photographer_of',
        'official_videographer_of', 'technical_partner_of', 'food_partner_of', 'media_partner_of'
    )),
    context_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'ended', 'rejected', 'archived')),
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabla: credentials
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_code TEXT UNIQUE NOT NULL,
    issuer_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    credential_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'revoked')),
    metadata_hash TEXT,
    stellar_status TEXT NOT NULL DEFAULT 'not_registered' CHECK (stellar_status IN ('not_registered', 'pending', 'registered', 'failed')),
    stellar_tx TEXT,
    issued_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Tabla: stellar_transactions
CREATE TABLE stellar_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
    tx_hash TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('register_entity', 'issue_credential', 'revoke_credential', 'link_wallet')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Tabla: wallets
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    wallet_address TEXT,
    wallet_type TEXT NOT NULL DEFAULT 'none' CHECK (wallet_type IN ('none', 'stellar_classic', 'smart_wallet', 'passkey')),
    wallet_status TEXT NOT NULL DEFAULT 'none' CHECK (wallet_status IN ('none', 'reserved', 'claimed', 'disabled')),
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Triggers automáticos para actualizar el campo updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_entities_modtime BEFORE UPDATE ON entities FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_people_modtime BEFORE UPDATE ON people FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_organizations_modtime BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_providers_modtime BEFORE UPDATE ON providers FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_events_modtime BEFORE UPDATE ON events FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_relationships_modtime BEFORE UPDATE ON relationships FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_credentials_modtime BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_wallets_modtime BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==========================================
-- DATOS SEMILLA (SEED DATA)
-- ==========================================

-- Variables de ID fijas para mantener integridad en la semilla
-- 1. Organización: Festival Nacional Danza del Vientre Chile (FDVC)
-- 2. Evento: FDVC 2026
-- 3. Organización: Escuela Demo Danza Árabe
-- 4. Persona: Bailarina Demo
-- 5. Persona: Profesora Demo
-- 6. Proveedor: Fotografía Cultural Demo

-- 1. Organición Principal (FDVC)
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('11111111-1111-1111-1111-111111111111', 'organization', 'Festival Nacional Danza del Vientre Chile', 'fdvc', 'Chile', 'Santiago', 'verified', true);

INSERT INTO organizations (id, entity_id, name, organization_type, instagram, contact_name, contact_email)
VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Festival Nacional Danza del Vientre Chile', 'festival', '@fdvc_chile', 'Directora FDVC', 'contacto@fdvc.cl');

-- 2. Evento FDVC 2026
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('22222222-2222-2222-2222-222222222222', 'event', 'Festival Nacional Danza del Vientre Chile 2026', 'fdvc-2026', 'Chile', 'Santiago', 'verified', true);

INSERT INTO events (id, entity_id, name, slug, year, start_date, end_date, location, address, description, organizer_entity_id)
VALUES ('22222222-2222-2222-2222-333333333333', '22222222-2222-2222-2222-222222222222', 'FDVC 2026', 'fdvc-2026', 2026, '2026-09-05', '2026-09-07', 'Aula Magna Manuel de Salas', 'Irarrázaval 3780, Ñuñoa, Santiago', 'El encuentro nacional de danza oriental más importante de Chile, reuniendo a escuelas, maestras, bailarinas y proveedores de todo el país.', '11111111-1111-1111-1111-111111111111');

-- Relación: FDVC (Organización) es organizador de FDVC 2026 (Evento)
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'organizer_of', '22222222-2222-2222-2222-333333333333', 'active');

-- 3. Escuela Demo Danza Árabe
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('33333333-3333-3333-3333-333333333333', 'organization', 'Escuela Demo Danza Árabe', 'escuela-demo', 'Chile', 'Santiago', 'verified', true);

INSERT INTO organizations (id, entity_id, name, organization_type, instagram, contact_name, contact_email)
VALUES (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Escuela Demo Danza Árabe', 'school', '@escuela_demo_danza', 'Directora Demo', 'escuelademo@gmail.com');

-- Relación: Escuela Demo participa en FDVC 2026
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'participant_of', '22222222-2222-2222-2222-333333333333', 'active');

-- 4. Persona: Bailarina Demo
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('44444444-4444-4444-4444-444444444444', 'person', 'Bailarina Demo', 'bailarina-demo', 'Chile', 'Santiago', 'verified', true);

INSERT INTO people (id, entity_id, legal_name, artistic_name, email, phone, instagram, bio, main_role)
VALUES (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'María José Bailarina', 'Bailarina Demo', 'bailarinademo@gmail.com', '+56912345678', '@bailarina_demo', 'Bailarina solista e intérprete de danzas árabes, apasionada por la música folclórica del Medio Oriente.', 'dancer');

-- Relación: Bailarina Demo es miembro de Escuela Demo Danza Árabe
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'member_of', '22222222-2222-2222-2222-333333333333', 'active');

-- Relación: Bailarina Demo participa en FDVC 2026
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'participant_of', '22222222-2222-2222-2222-333333333333', 'active');

-- 5. Persona: Profesora Demo
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('55555555-5555-5555-5555-555555555555', 'person', 'Profesora Demo', 'profesora-demo', 'Chile', 'Valparaíso', 'verified', true);

INSERT INTO people (id, entity_id, legal_name, artistic_name, email, phone, instagram, bio, main_role)
VALUES (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'Camila Paz Profesora', 'Profesora Demo', 'profesorademo@gmail.com', '+56987654321', '@profesora_demo', 'Maestra y coreógrafa de danza oriental con más de 12 años de trayectoria. Directora de la Escuela Demo.', 'teacher');

-- Relación: Profesora Demo es profesora en Escuela Demo
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'teacher_at', '22222222-2222-2222-2222-333333333333', 'active');

-- Relación: Profesora Demo es directora de Escuela Demo
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'director_of', '22222222-2222-2222-2222-333333333333', 'active');

-- Relación: Profesora Demo participa en FDVC 2026
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'participant_of', '22222222-2222-2222-2222-333333333333', 'active');

-- 6. Proveedor: Fotografía Cultural Demo
INSERT INTO entities (id, type, display_name, slug, country, city, status, is_public)
VALUES ('66666666-6666-6666-6666-666666666666', 'provider', 'Fotografía Cultural Demo', 'fotografia-demo', 'Chile', 'Santiago', 'verified', true);

INSERT INTO providers (id, entity_id, name, provider_type, contact_name, email, phone, instagram, public_description)
VALUES (gen_random_uuid(), '66666666-6666-6666-6666-666666666666', 'Fotografía Cultural Demo', 'photographer', 'Juan Foto', 'juanfoto@gmail.com', '+56944445555', '@fotografia_cultural_demo', 'Especializados en fotografía escénica, capturando la esencia del arte y el movimiento en el escenario.');

-- Relación: Fotografía Cultural Demo es fotógrafo oficial de FDVC 2026
INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status)
VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'official_photographer_of', '22222222-2222-2222-2222-333333333333', 'active');

-- 7. Credenciales Demo

-- Credencial A: Escuela participante FDVC 2026 (Para Escuela Demo)
INSERT INTO credentials (id, credential_code, issuer_entity_id, subject_entity_id, event_id, credential_type, title, description, status, issued_at)
VALUES (
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'CRED-FDVC26-SCH-DEMO',
    '11111111-1111-1111-1111-111111111111', -- Emisor: FDVC
    '33333333-3333-3333-3333-333333333333', -- Sujeto: Escuela Demo
    '22222222-2222-2222-2222-333333333333', -- Evento
    'school_participant',
    'Escuela Participante FDVC 2026',
    'Acreditación oficial que certifica la participación de la escuela en las galas del Festival Nacional Danza del Vientre Chile 2026.',
    'issued',
    NOW()
);

-- Credencial B: Bailarina participante FDVC 2026 (Para Bailarina Demo)
INSERT INTO credentials (id, credential_code, issuer_entity_id, subject_entity_id, event_id, credential_type, title, description, status, issued_at)
VALUES (
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    'CRED-FDVC26-DCR-DEMO',
    '11111111-1111-1111-1111-111111111111', -- Emisor: FDVC
    '44444444-4444-4444-4444-444444444444', -- Sujeto: Bailarina Demo
    '22222222-2222-2222-2222-333333333333', -- Evento
    'dancer_participant',
    'Bailarina Participante FDVC 2026',
    'Acreditación oficial que certifica la participación de la bailarina solista en las muestras artísticas de FDVC 2026.',
    'issued',
    NOW()
);

-- Credencial C: Profesora / directora FDVC 2026 (Para Profesora Demo)
INSERT INTO credentials (id, credential_code, issuer_entity_id, subject_entity_id, event_id, credential_type, title, description, status, issued_at)
VALUES (
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    'CRED-FDVC26-TCH-DEMO',
    '11111111-1111-1111-1111-111111111111', -- Emisor: FDVC
    '55555555-5555-5555-5555-555555555555', -- Sujeto: Profesora Demo
    '22222222-2222-2222-2222-333333333333', -- Evento
    'teacher_director',
    'Profesora / Directora FDVC 2026',
    'Acreditación oficial de la labor docente y dirección artística de Escuela Demo Danza Árabe en el marco de FDVC 2026.',
    'issued',
    NOW()
);

-- Credencial D: Fotógrafo oficial FDVC 2026 (Para Fotografía Cultural Demo)
INSERT INTO credentials (id, credential_code, issuer_entity_id, subject_entity_id, event_id, credential_type, title, description, status, issued_at)
VALUES (
    'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    'CRED-FDVC26-PHO-DEMO',
    '11111111-1111-1111-1111-111111111111', -- Emisor: FDVC
    '66666666-6666-6666-6666-666666666666', -- Sujeto: Fotografía Cultural Demo
    '22222222-2222-2222-2222-333333333333', -- Evento
    'official_photographer',
    'Fotógrafo Oficial FDVC 2026',
    'Acreditación de prensa y cobertura fotográfica autorizada para capturar las presentaciones del festival en el Aula Magna Manuel de Salas.',
    'issued',
    NOW()
);

-- Wallets iniciales asociadas
INSERT INTO wallets (id, entity_id, wallet_address, wallet_type, wallet_status)
VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'GBFDVCORGANIZERKEYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'stellar_classic', 'claimed');
INSERT INTO wallets (id, entity_id, wallet_address, wallet_type, wallet_status)
VALUES (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'GBAILARINADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'passkey', 'reserved');
INSERT INTO wallets (id, entity_id, wallet_address, wallet_type, wallet_status)
VALUES (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'GBPROFESORADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'passkey', 'reserved');
INSERT INTO wallets (id, entity_id, wallet_address, wallet_type, wallet_status)
VALUES (gen_random_uuid(), '66666666-6666-6666-6666-666666666666', 'GBFOTOGRAFIADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'stellar_classic', 'claimed');
