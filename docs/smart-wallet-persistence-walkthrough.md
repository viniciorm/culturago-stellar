# Walkthrough - Persistencia PostgreSQL para Smart Wallet Claims y Wallets

Hemos completado la integración de persistencia directa con PostgreSQL para los reclamos de pasaportes y el despliegue de smart wallets basadas en passkeys (WebAuthn / Soroban) en **CulturaGO Stellar**.

---

## 🎯 Cambios Realizados

### 1. Migración SQL (`database/migrations/0012_smart_wallet_claims.sql`)
- Creada la tabla `smart_wallet_claims` para almacenar:
  - `id` (UUID PK)
  - `account_id` (FK -> `accounts(id)`)
  - `entity_id` (FK -> `entities(id)`)
  - `contract_id` (TEXT UNIQUE)
  - `key_id` (TEXT, identificador de credencial pública WebAuthn)
  - `wallet_wasm_hash` (TEXT)
  - `network` (TEXT default 'testnet')
  - `deploy_tx_hash` (TEXT)
  - `deployed_at` (TIMESTAMPTZ)
- Agregados índices en `account_id`, `entity_id`, y `contract_id`.
- Agregado trigger `trg_smart_wallet_claims_modtime` para mantener `updated_at`.

### 2. Puerto e Infraestructura de Identidad (`src/ports/IdentityStore.ts`, `PostgreSQLIdentityStore.ts`, `InMemoryIdentityStore.ts`)
- Definidas interfaces del puerto `SmartWalletClaim` y `WalletRecord`.
- Implementados en `PostgreSQLIdentityStore` e `InMemoryIdentityStore`:
  - `saveSmartWalletClaim(claim)`: Guarda o actualiza (on conflict) el registro de deploy de la smart wallet.
  - `getSmartWalletClaimByAccount(accountId)`: Obtiene la última claim por cuenta.
  - `upsertWallet(wallet)`: Actualiza o inserta la fila de la entidad en `wallets` fijando `wallet_type = 'passkey'`, `wallet_status = 'claimed'`, `wallet_address = contractId` y `claimed_at = NOW()`.
  - `getWalletByEntity(entityId)`: Obtiene el registro de wallet de la entidad.

### 3. Validación de Perímetro (`src/infrastructure/perimeter/perimeter.ts`)
- Actualizado `DeployBody` y `validateDeployBody` para aceptar opcionalmente los campos operacionales `keyId` y `walletWasmHash`.
- Mantiene strictly los controles anti-replay, sanitización de payloads y validación de orígenes.

### 4. Cliente WebAuthn (`src/lib/smartWallet/PasskeyKitSigner.ts`)
- Actualizado el `fetch('/api/smart-wallet/deploy')` para enviar `keyId` y `walletWasmHash` junto a la transacción firmada.

### 5. Endpoint de Despliegue (`src/app/api/smart-wallet/deploy/route.ts`)
- Al completar con éxito la llamada al relayer de Soroban (`passkeyServer.send`):
  1. Actualiza `accounts.wallet_contract_address`.
  2. Obtiene los detalles de la cuenta y su `personEntityId`.
  3. Ejecuta `upsertWallet` en `wallets` para marcar el pasaporte como **reclamado** (`wallet_status = 'claimed'`).
  4. Ejecuta `saveSmartWalletClaim` para auditar la activación.
  5. Retorna `{ success: true, txHash, contractId, walletStatus: 'claimed' }`.

---

## 🧪 Resultados de Verificación

- **Migraciones SQL**: `database/migrate.mjs` lee y aplica en orden secuencial `0012_smart_wallet_claims.sql`.
- **Chequeo de Tipos (`pnpm typecheck`)**: 0 errores (Pasó con éxito).
- **Linter (`pnpm lint`)**: 0 errores/warnings (Pasó con éxito).
- **Pruebas Unitarias (`pnpm test`)**: 25 test suites pasadas, 190 pruebas pasadas.
- **Construcción de Producción (`pnpm build`)**: Compilado y estático generado con éxito.

---

## 🔐 Garantías de Seguridad e Identidad

1. **Cero Custodia de Secretos**: Ninguna llave privada, semilla ni biometría es manipulada o guardada en servidor.
2. **Gateway Server-Only**: La comunicación con PostgreSQL se realiza únicamente mediante Server Actions / API routes usando `DATABASE_URL` aislada del cliente.
3. **Vocabulario Amigable**: La interfaz refleja el estado como *"Pasaporte Reclamado"* y *"Wallet Passkey Activa"*.
