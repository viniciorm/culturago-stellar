-- 0007_chain_phase_values.sql
-- Idempotent backfill: add awaiting_signature / signed to chain_phase for
-- databases created before 0001 was updated with these values.

DO $$
DECLARE
  label TEXT;
BEGIN
  FOREACH label IN ARRAY ARRAY['awaiting_signature', 'signed']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'chain_phase'::regtype
        AND enumlabel = label
    ) THEN
      EXECUTE 'ALTER TYPE chain_phase ADD VALUE ' || quote_literal(label);
    END IF;
  END LOOP;
END $$;
