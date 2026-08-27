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
BEGIN
  prefix := convert_to('CULTURAGO' || E'\000' || schema_id || E'\000', 'UTF8');
  body := convert_to(coalesce(canonical, ''), 'UTF8');
  RETURN encode(digest(prefix || body, 'sha256'), 'hex');
END;
$$;
