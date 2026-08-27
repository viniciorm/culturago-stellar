-- 0008_worker_signed.sql
-- Update worker indexes to include the 'signed' phase so operations with a
-- persisted signed payload are picked up for resubmission after a crash.

DROP INDEX IF EXISTS idx_stellar_operations_phase_claim;

CREATE INDEX IF NOT EXISTS idx_stellar_operations_phase_claim
    ON stellar_operations (phase, next_retry_at, claimed_until)
    WHERE phase IN ('awaiting_signature', 'signed', 'submitted', 'confirming', 'failed_retryable', 'unknown', 'restoring');
