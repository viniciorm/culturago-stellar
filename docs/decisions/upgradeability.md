# Decisión: upgradeability / pausability de contratos de dominio

**Estado**: aceptada para Testnet y producción inicial.

## Contratos de dominio

Los dos contratos de dominio (`cultural_entity_registry` y `cultural_credential_registry`) **no implementan** `Upgradeable` ni `Pausable`. Razón: minimizar superficie de ataque y garantizar que el comportamiento sea inmutable y auditable.

## Smart wallet

La smart wallet se selecciona de una implementación auditada (passkey-kit u otra allowlisted). Si esa implementación soporta upgrades, el hash del WASM allowlisted se registra en `SMART_WALLET_WASM_HASH` y cualquier upgrade requiere revisión y re-allowlist por red.

## Cambio futuro

Si se aprueba explícitamente, se documentará el esquema de upgrade, migración, rollback y gobernanza antes de desplegarlo.
