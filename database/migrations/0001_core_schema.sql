-- 0001_core_schema.sql — Esquema de dominio CulturaGO (PostgreSQL directo).
-- Sin dependencias de proveedores externos. La identidad (accounts/sesiones/
-- passkeys) vive en 0002 y permanece inactiva hasta Fase 8.

-- ---------- Tipos enumerados ----------
CREATE TYPE entity_kind AS ENUM ('person', 'organization', 'provider', 'event');
CREATE TYPE entity_status AS ENUM ('draft', 'pending', 'verified', 'archived');
CREATE TYPE person_role AS ENUM ('dancer', 'teacher', 'director', 'judge', 'guest', 'staff', 'other');
CREATE TYPE organization_kind AS ENUM ('festival', 'school', 'academy', 'company', 'association', 'producer', 'community', 'other');
CREATE TYPE provider_kind AS ENUM ('venue', 'pub', 'photographer', 'videographer', 'foodtruck', 'sound', 'lighting', 'sponsor', 'streaming', 'security', 'makeup', 'costume', 'ticketing', 'transport', 'other');
CREATE TYPE relationship_kind AS ENUM (
    'organizer_of', 'participant_of', 'member_of', 'teacher_at', 'director_of',
    'founder_of', 'provider_of', 'venue_of', 'sponsor_of', 'official_photographer_of',
    'official_videographer_of', 'technical_partner_of', 'food_partner_of', 'media_partner_of'
);
CREATE TYPE relationship_status AS ENUM ('pending', 'active', 'ended', 'rejected', 'archived');
CREATE TYPE participation_state AS ENUM ('registered', 'checked_in', 'participation_confirmed', 'credential_issued');
CREATE TYPE credential_status AS ENUM ('issued', 'revoked');
CREATE TYPE chain_phase AS ENUM ('signing', 'awaiting_signature', 'signed', 'submitted', 'confirming', 'confirmed', 'failed_retryable', 'failed_terminal', 'unknown', 'restoring');
CREATE TYPE wallet_kind AS ENUM ('none', 'stellar_classic', 'smart_wallet', 'passkey');
CREATE TYPE wallet_state AS ENUM ('none', 'reserved', 'claimed', 'disabled');
CREATE TYPE operation_kind AS ENUM ('register_entity', 'issue_credential', 'revoke_credential', 'link_wallet');

-- ---------- Entidades base ----------
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind entity_kind NOT NULL,
    display_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    status entity_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    latest_version INTEGER NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial inmutable de versiones (append-only)
CREATE TABLE entity_versions (
    entity_id UUID NOT NULL REFERENCES entities(id),
    version INTEGER NOT NULL CHECK (version > 0),
    metadata_hash CHAR(64) NOT NULL CHECK (metadata_hash ~ '^[0-9a-f]{64}$'),
    hash_schema INTEGER NOT NULL CHECK (hash_schema > 0),
    registrar_id TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    recorded_ledger INTEGER,
    PRIMARY KEY (entity_id, version)
);

CREATE TABLE people (
    entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    legal_name TEXT,
    artistic_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    bio TEXT,
    photo_url TEXT,
    main_role person_role NOT NULL
);

CREATE TABLE organizations (
    entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    organization_type organization_kind NOT NULL,
    website TEXT,
    instagram TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT
);

CREATE TABLE providers (
    entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    provider_type provider_kind NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    website TEXT,
    public_description TEXT
);

CREATE TABLE events (
    entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    start_date DATE NOT NULL,
    end_date DATE,
    location TEXT,
    address TEXT,
    description TEXT,
    organizer_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ---------- Grafo de relaciones ----------
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type relationship_kind NOT NULL,
    context_event_id UUID REFERENCES events(entity_id) ON DELETE SET NULL,
    status relationship_status NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_entity_id <> to_entity_id),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    UNIQUE NULLS NOT DISTINCT (from_entity_id, to_entity_id, relationship_type, context_event_id)
);
CREATE INDEX idx_relationships_to ON relationships (to_entity_id, relationship_type);
CREATE INDEX idx_relationships_from ON relationships (from_entity_id, relationship_type);

-- ---------- Participación auditada ----------
CREATE TABLE participations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(entity_id) ON DELETE RESTRICT,
    state participation_state NOT NULL DEFAULT 'registered',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subject_entity_id, event_id)
);

CREATE TABLE participation_transitions (
    participation_id UUID NOT NULL REFERENCES participations(id) ON DELETE RESTRICT,
    seq INTEGER NOT NULL CHECK (seq > 0),
    from_state participation_state NOT NULL,
    to_state participation_state NOT NULL,
    actor_account_id UUID,          -- FK a accounts se añade en 0002
    actor_label TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (participation_id, seq),
    CHECK (from_state <> to_state)
);

-- ---------- Credenciales ----------
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_code TEXT NOT NULL UNIQUE,
    issuer_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    issued_by UUID NOT NULL,         -- account id; FK en 0002
    subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(entity_id) ON DELETE RESTRICT,
    credential_type INTEGER NOT NULL CHECK (credential_type BETWEEN 1 AND 6),
    metadata_hash CHAR(64) NOT NULL CHECK (metadata_hash ~ '^[0-9a-f]{64}$'),
    hash_schema INTEGER NOT NULL CHECK (hash_schema > 0),
    status credential_status NOT NULL DEFAULT 'issued',
    issued_intent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_ledger INTEGER,
    revoked_ledger INTEGER,
    revoked_reason_hash CHAR(64) CHECK (revoked_reason_hash IS NULL OR revoked_reason_hash ~ '^[0-9a-f]{64}$'),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,                 -- account id; FK en 0002
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (issuer_entity_id <> subject_entity_id),
    UNIQUE (issuer_entity_id, subject_entity_id, event_id, credential_type)
);
CREATE INDEX idx_credentials_subject ON credentials (subject_entity_id, event_id);
CREATE INDEX idx_credentials_issuer ON credentials (issuer_entity_id, event_id);

-- ---------- Wallets (vinculación, nunca custodia de credenciales) ----------
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    wallet_address TEXT,
    wallet_type wallet_kind NOT NULL DEFAULT 'none',
    wallet_status wallet_state NOT NULL DEFAULT 'none',
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE NULLS NOT DISTINCT (entity_id, wallet_address)
);

-- ---------- Outbox de operaciones on-chain ----------
CREATE TABLE stellar_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    operation_type operation_kind NOT NULL,
    payload JSONB NOT NULL,
    phase chain_phase NOT NULL DEFAULT 'signing',
    tx_hash TEXT,
    ledger INTEGER,
    error_code TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entities_modtime BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER trg_participations_modtime BEFORE UPDATE ON participations FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER trg_credentials_modtime BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER trg_wallets_modtime BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER trg_stellar_operations_modtime BEFORE UPDATE ON stellar_operations FOR EACH ROW EXECUTE FUNCTION update_modified_column();
