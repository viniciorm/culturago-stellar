-- 0004_observability.sql — Observabilidad Fase 9.
-- Columnas para trazabilidad y tablas de logs/métricas. Ninguna tabla
-- almacena PII, secrets, cookies, challenges o respuestas WebAuthn.

-- Correlación y contexto en operaciones Stellar.
ALTER TABLE stellar_operations
    ADD COLUMN IF NOT EXISTS correlation_id TEXT,
    ADD COLUMN IF NOT EXISTS context JSONB;

CREATE INDEX IF NOT EXISTS idx_stellar_operations_correlation
    ON stellar_operations (correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Logs estructurados server-side (sin PII).
CREATE TABLE IF NOT EXISTS log_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL,
    component TEXT NOT NULL,
    message TEXT NOT NULL,
    correlation_id TEXT,
    idempotency_key TEXT,
    network TEXT,
    contract_id TEXT,
    method TEXT,
    phase TEXT,
    ledger BIGINT,
    code TEXT,
    extra JSONB,
    CHECK (extra IS NULL OR jsonb_typeof(extra) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_log_lines_time ON log_lines (time DESC);
CREATE INDEX IF NOT EXISTS idx_log_lines_correlation ON log_lines (correlation_id);
