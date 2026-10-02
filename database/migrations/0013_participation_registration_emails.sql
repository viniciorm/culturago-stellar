-- Migration 0013: Add registration and delivery contact emails to participations
-- CulturaGO FDVC 2026 Pilot

ALTER TABLE participations
    ADD COLUMN IF NOT EXISTS presentation_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS registration_email TEXT,
    ADD COLUMN IF NOT EXISTS credential_delivery_email TEXT;

CREATE INDEX IF NOT EXISTS idx_participations_presentation_code
    ON participations (event_id, presentation_code);
