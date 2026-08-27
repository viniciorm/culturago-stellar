-- Canonical SHA-256 hash function used to map domain UUIDs to on-chain BytesN<32>.
-- Must match CanonicalHashService.hashDocument exactly:
-- SHA-256("CULTURAGO\0" || schema_id || "\0" || canonical_utf8_bytes)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION culturago_canonical_hash(schema_id TEXT, canonical TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  prefix bytea;
  body bytea;
  zero bytea := decode('00', 'hex');
BEGIN
  -- Domain separation prefix: CULTURAGO\0 || schema_id || \0
  -- Built as bytea so PostgreSQL never sees U+0000 inside a TEXT value.
  prefix := convert_to('CULTURAGO', 'UTF8') || zero || convert_to(schema_id, 'UTF8') || zero;
  body := convert_to(coalesce(canonical, ''), 'UTF8');
  RETURN encode(digest(prefix || body, 'sha256'), 'hex');
END;
$$;
