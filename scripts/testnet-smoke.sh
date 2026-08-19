#!/usr/bin/env bash
set -euo pipefail

# Testnet smoke script. Requires TESTNET_RPC, TESTNET_PASSPHRASE, and funded identities.
# Do NOT run without explicit approval; this deploys contracts to Testnet.

echo "Testnet smoke (dry-run). Actual deploy requires: stellar keys, funded accounts, and approval."
echo "1. Deploy cultural_entity_registry with wasm hash $(cat docs/manifests/testnet-manifest.json | jq -r '.contracts.cultural_entity_registry.wasmSha256')"
echo "2. Deploy cultural_credential_registry with wasm hash $(cat docs/manifests/testnet-manifest.json | jq -r '.contracts.cultural_credential_registry.wasmSha256')"
echo "3. Create/connect smart wallet using passkey-kit WASM allowlist"
echo "4. Smoke: register entity, issue credential A/B, verify, revoke A, restore TTL"
echo "5. Restart Next.js/workers and verify outbox/indexer continuity"
