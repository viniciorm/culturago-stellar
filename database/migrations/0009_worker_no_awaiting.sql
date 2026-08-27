-- 0009_worker_no_awaiting.sql
-- Worker no longer signs: awaiting_signature is handled by the client-side
-- signer and the authenticated relay endpoint. The worker only resubmits
-- signed payloads and reconciles in-flight operations.

DROP INDEX IF EXISTS idx_stellar_operations_phase_claim;

CREATE INDEX IF NOT EXISTS idx_stellar_operations_phase_claim
    ON stellar_operations (phase, next_retry_at, claimed_until)
    WHERE phase IN ('signed', 'submitted', 'confirming', 'failed_retryable', 'unknown', 'restoring');
