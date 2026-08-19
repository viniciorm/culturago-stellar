-- 0003_outbox_indexer_reconciliation.sql
-- Fase 7: workers transaccionales, inbox de eventos, cursors, índices y TTL.

-- ---------- Outbox: columnas necesarias para workers con lease ----------
ALTER TABLE stellar_operations
    ADD COLUMN IF NOT EXISTS subject_key TEXT,
    ADD COLUMN IF NOT EXISTS intent_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS prepared_xdr TEXT,
    ADD COLUMN IF NOT EXISTS signed_xdr TEXT,
    ADD COLUMN IF NOT EXISTS signer_address TEXT,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claimed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_stellar_operations_phase_claim
    ON stellar_operations (phase, next_retry_at, claimed_until)
    WHERE phase IN ('awaiting_signature', 'submitted', 'confirming', 'failed_retryable', 'unknown', 'restoring');

-- ---------- Inbox de eventos contractuales (deduplicación por red/contrato/ledger/índice) ----------
CREATE TABLE IF NOT EXISTS stellar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    ledger INTEGER NOT NULL,
    event_index INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    topics TEXT[] NOT NULL DEFAULT '{}',
    data JSONB NOT NULL DEFAULT '{}',
    tx_hash TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE (network, contract_id, ledger, event_index)
);

CREATE INDEX IF NOT EXISTS idx_stellar_events_cursor
    ON stellar_events (network, contract_id, ledger, event_index);

CREATE INDEX IF NOT EXISTS idx_stellar_events_unprocessed
    ON stellar_events (network, contract_id, processed_at)
    WHERE processed_at IS NULL;

-- ---------- Cursors por red/contrato (reinicio/backfill) ----------
CREATE TABLE IF NOT EXISTS stellar_cursors (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    last_ledger INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (network, contract_id)
);

-- ---------- Índice derivado de eventos para pasaporte/evento ----------
CREATE TABLE IF NOT EXISTS stellar_indexed_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_event_id UUID NOT NULL REFERENCES stellar_events(id) ON DELETE CASCADE,
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    ledger INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    entity_id TEXT,          -- bytes32 on-chain (e.g., entity id)
    credential_id TEXT,      -- bytes32 on-chain (e.g., credential id)
    subject_id TEXT,         -- bytes32 on-chain
    issuer_id TEXT,          -- bytes32 on-chain
    event_entity_id TEXT,    -- bytes32 on-chain (event)
    data JSONB NOT NULL DEFAULT '{}',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (network, contract_id, ledger, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_indexed_events_subject_event
    ON stellar_indexed_events (subject_id, event_entity_id) WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_indexed_events_entity
    ON stellar_indexed_events (entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_indexed_events_credential
    ON stellar_indexed_events (credential_id) WHERE credential_id IS NOT NULL;

-- ---------- Cola TTL / restauración ----------
CREATE TABLE IF NOT EXISTS stellar_ttl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    entry_kind TEXT NOT NULL CHECK (entry_kind IN ('contract_data', 'contract_code', 'instance')),
    expires_at_ledger INTEGER,
    last_extended_ledger INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'alerted', 'extended', 'failed')),
    alert_sent_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (network, contract_id, entry_key)
);

CREATE INDEX IF NOT EXISTS idx_ttl_jobs_next_run
    ON stellar_ttl_jobs (next_run_at) WHERE status IN ('pending', 'alerted');

CREATE TRIGGER trg_stellar_ttl_jobs_modtime
    BEFORE UPDATE ON stellar_ttl_jobs
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ---------- Trigger para updated_at de stellar_operations ----------
CREATE TRIGGER trg_stellar_operations_modtime
    BEFORE UPDATE ON stellar_operations
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
