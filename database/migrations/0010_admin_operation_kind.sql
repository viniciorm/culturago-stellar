-- Allow the stellar_operations outbox to record server-side admin provisioning
-- commands (grant/revoke roles, link/unlink issuer-operator). These are
-- testnet-only, durable, idempotent and audited, but never contain a signed
-- XDR or secret.
ALTER TYPE operation_kind ADD VALUE 'admin_provision';
