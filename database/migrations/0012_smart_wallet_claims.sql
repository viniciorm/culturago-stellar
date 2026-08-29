-- 0012_smart_wallet_claims.sql — Registro de activación/deploy de smart wallets passkey.

CREATE TABLE smart_wallet_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    contract_id TEXT NOT NULL UNIQUE,
    key_id TEXT,
    wallet_wasm_hash TEXT,
    network TEXT NOT NULL DEFAULT 'testnet',
    deploy_tx_hash TEXT,
    deployed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_smart_wallet_claims_account ON smart_wallet_claims (account_id);
CREATE INDEX idx_smart_wallet_claims_entity ON smart_wallet_claims (entity_id);
CREATE INDEX idx_smart_wallet_claims_contract ON smart_wallet_claims (contract_id);

CREATE TRIGGER trg_smart_wallet_claims_modtime BEFORE UPDATE ON smart_wallet_claims FOR EACH ROW EXECUTE FUNCTION update_modified_column();
