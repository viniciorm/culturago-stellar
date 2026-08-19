-- 0002_identity_prep.sql — Esquema de identidad PREPARADO para Fase 8.
-- Ninguna tabla aquí activa login: no hay verificación WebAuthn ni emisión
-- de sesiones implementada todavía. CulturaGO nunca custodia passkeys,
-- biometría ni seed phrases: solo material público y metadatos mínimos.

CREATE TYPE account_status AS ENUM ('pending_claim', 'active', 'suspended', 'closed');
CREATE TYPE app_role AS ENUM ('admin', 'organizer', 'operator', 'visitor');
CREATE TYPE challenge_purpose AS ENUM ('register_passkey', 'authenticate', 'claim_account', 'recovery', 'sign_operation');

-- ---------- Cuentas ----------
-- account_id es la raíz de identidad de aplicación. El vínculo con la
-- identidad cultural (person/subject) es auditable y estable: reclamar o
-- recuperar una cuenta NUNCA cambia subject_id ni reasigna credenciales.
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status account_status NOT NULL DEFAULT 'pending_claim',
    -- La persona/sujeto cultural vinculado (entities.kind = 'person')
    person_entity_id UUID REFERENCES entities(id) ON DELETE RESTRICT,
    -- Dirección contractual de la smart wallet (cuenta contractual Soroban)
    wallet_contract_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (person_entity_id),
    UNIQUE (wallet_contract_address)
);

-- Roles de aplicación por cuenta (rol global NO otorga issuer scope)
CREATE TABLE account_roles (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    granted_by UUID REFERENCES accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, role)
);

-- Vínculo institucional auditable: operador -> organización emisora.
CREATE TABLE issuer_operators (
    issuer_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    operator_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID REFERENCES accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (issuer_entity_id, operator_account_id)
);

-- ---------- Passkeys (WebAuthn public-key credentials) ----------
-- Solo material público: credential id, public key, sign counter. Jamás
-- la clave privada ni datos biométricos.
CREATE TABLE passkey_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,       -- WebAuthn credential ID
    public_key BYTEA NOT NULL,                 -- COSE public key
    sign_counter BIGINT NOT NULL DEFAULT 0,
    display_name TEXT NOT NULL,                -- nombre amigable del dispositivo
    transports TEXT[],
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_passkeys_account ON passkey_credentials (account_id) WHERE revoked_at IS NULL;

-- ---------- Challenges de un uso (anti-replay) ----------
-- Se almacena el DIGEST del challenge, nunca el challenge en claro.
CREATE TABLE auth_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_digest BYTEA NOT NULL UNIQUE,    -- SHA-256 del challenge
    purpose challenge_purpose NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,                   -- consumo atómico y único
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);
CREATE INDEX idx_challenges_expiry ON auth_challenges (expires_at) WHERE consumed_at IS NULL;

-- ---------- Sesiones (inactivas hasta Fase 8) ----------
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token_digest BYTEA NOT NULL UNIQUE, -- cookie opaca: solo su digest
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    rotated_from UUID REFERENCES sessions(id),
    revoked_at TIMESTAMPTZ,
    CHECK (idle_expires_at <= absolute_expires_at)
);
CREATE INDEX idx_sessions_account ON sessions (account_id) WHERE revoked_at IS NULL;

-- ---------- Claim / recovery (códigos de un uso, como digest) ----------
CREATE TABLE account_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    code_digest BYTEA NOT NULL UNIQUE,         -- invitación/código: solo digest
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- FKs diferidas desde 0001 ----------
ALTER TABLE participation_transitions
    ADD CONSTRAINT fk_transition_actor
    FOREIGN KEY (actor_account_id) REFERENCES accounts(id);

ALTER TABLE credentials
    ADD CONSTRAINT fk_credential_issued_by
    FOREIGN KEY (issued_by) REFERENCES accounts(id);

ALTER TABLE credentials
    ADD CONSTRAINT fk_credential_revoked_by
    FOREIGN KEY (revoked_by) REFERENCES accounts(id);

CREATE TRIGGER trg_accounts_modtime BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_modified_column();
