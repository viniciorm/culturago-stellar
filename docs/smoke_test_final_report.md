# 🚀 Reporte Final de Ejecución: Smoke Test CulturaGO (Stellar Testnet)

**Fecha de Finalización**: 2 de Septiembre de 2026  
**Dominio**: `https://culturago.cl` / `https://www.culturago.cl`  
**Servidor VPS**: `166.0.112.1`  
**Estado General**: **EXITOSO / APROBADO**  

---

## 1. 🏗️ Arquitectura e Infraestructura (Opción B)

Se desplegó y validó la arquitectura de contenedores Docker aislados con Nginx Reverse Proxy en el host VPS:

- **Nginx Reverse Proxy (Host)**: Maneja los certificados TLS/SSL HTTPS para `culturago.cl` y reenvía el tráfico internamente a `http://127.0.0.1:3080`.
- **`culturago-app`**: Contenedor Next.js 15 en modo `standalone`, expuesto **exclusivamente en `127.0.0.1:3080:3080`** (bucle local seguro, sin puertos públicos expuestos).
- **`culturago-postgres`**: Contenedor PostgreSQL 16 (Alpine) dentro de la red privada Docker `culturago`. **Sin puertos expuestos hacia el exterior**.
- **Seguridad de Red**: Eliminación total del servicio Caddy redundancy en Compose; Nginx gestiona la capa perimetral.

---

## 2. 🗄️ Migraciones de Base de Datos

Se aplicaron secuencialmente las **12 migraciones versionadas del repositorio** sin saltos ni intervenciones manuales en la estructura SQL:

1. `0001_core_schema.sql` (Esquema base de entidades, credenciales y transiciones).
2. `0002_identity_prep.sql` (Identidad, cuentas, passkeys, challenges y sesiones).
3. `0003_outbox_indexer_reconciliation.sql` (**Fix Idempotencia**: Se corrigió agregando `DROP TRIGGER IF EXISTS` antes de la recreación de triggers).
4. `0004_fix_transition_trigger_ambiguity.sql`
5. `0005_proofs_issuance_scopes.sql`
6. `0006_smart_wallet_deployments.sql`
7. `0007_indexer_checkpoints.sql`
8. `0008_event_stream_revocation.sql`
9. `0009_issuer_scoped_roles.sql`
10. `0010_passkey_sign_counters.sql`
11. `0011_sessions_schema_fix.sql`
12. `0012_smart_wallet_claims.sql` (Control de Smart Wallet claims on-chain).

- **Tabla de control**: `schema_migrations` registra las 12 migraciones en estado aplicado.

---

## 3. 🔑 Claim de Cuenta y Registro Passkey (Fase 2A)

Se ejecutó el flujo completo de autenticación y reclamo sin custodia de secretos:

1. **Reclamo de Invitación (`/api/claim`)**:
   - Código consumido: `SMOKE-TEST-CLAIM-2026`.
   - Registro en `auth_challenges`: Columna `consumed_at` actualizada atómicamente con la marca de tiempo de consumo.
   - Cambio de Estado: `accounts.status` cambió de `'pending_claim'` a `'active'`.
   - Emisión de Sesión: Cookie de sesión HTTP-Only `culturago_session` emitida.

2. **Registro de Credencial WebAuthn (`/api/auth/register`)**:
   - Dispositivo/Navegador generó un par de llaves asimétricas WebAuthn bajo el Relying Party ID **`culturago.cl`**.
   - Persistencia: Llave pública COSE y `credential_id` guardados en `passkey_credentials`.
   - **Cero Custodia**: Ni biometría ni llaves privadas fueron transmitidas o almacenadas.

---

## 4. ⚡ Despliegue de Passkey Smart Wallet en Stellar Testnet (Fase 2B)

Se realizó el despliegue del contrato Smart Wallet en Soroban Testnet:

1. **Firma de Intención Cliente (`PasskeyKitSigner`)**:
   - `passkey-kit` derivó determinísticamente el `contractId` y generó la transacción XDR de despliegue con auth entries firmadas mediante WebAuthn en el navegador.

2. **Relayer & Fee Sponsorship**:
   - La transacción fue enviada a `/api/smart-wallet/deploy`.
   - El relayer financió el fee de red Testnet y transmitió la transacción a Soroban RPC (`https://soroban-testnet.stellar.org`).

3. **Verificación On-Chain**:
   - **Hash de Transacción (`deploy_tx_hash`)**: Transacción confirmada en Stellar Testnet.
   - **Smart Wallet Contract ID**: Registrado y publicado on-chain.
   - **Stellar Expert Explorer**: Verificable públicamente en `https://stellar.expert/explorer/testnet`.

4. **Persistencia Post-Despliegue**:
   - `accounts.wallet_contract_address` actualizado con el `contractId`.
   - `wallets.wallet_type` establecido en `'passkey'` y `wallet_status` en `'claimed'`.
   - `smart_wallet_claims` vinculó la cuenta, contrato, WASM hash (`fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0`), hash de transacción y timestamp de despliegue.

---

## 5. 📊 Evidencias de Persistencia en Base de Datos (PostgreSQL)

| Tabla | Registro Clave / Estado | Verificación |
| :--- | :--- | :--- |
| `accounts` | `id = 'b2c3d4e5-f6a7-8901-bcde-222222222222'` | `status = 'active'`, `wallet_contract_address` poblado |
| `auth_challenges` | `purpose = 'claim_account'` & `'register_passkey'` | `consumed_at IS NOT NULL` (Consumo atómico) |
| `passkey_credentials` | `account_id = 'b2c3d4e5-f6a7-8901-bcde-222222222222'` | Credencial registrada con `sign_counter` y `display_name` |
| `wallets` | `entity_id = 'a1b2c3d4-e5f6-7890-abcd-111111111111'` | `wallet_type = 'passkey'`, `wallet_status = 'claimed'` |
| `smart_wallet_claims` | `account_id = 'b2c3d4e5-f6a7-8901-bcde-222222222222'` | Contrato vinculado, `network = 'testnet'`, `deploy_tx_hash` registrado |

---

## 6. 🔐 Variables Críticas de Entorno (Sin Expansión de Secretos)

Se constató el correcto aislamiento de variables públicas vs server-only en `/opt/culturago/.env`:

```text
# Entorno Público y Red
NEXT_PUBLIC_CULTURAGO_ENV=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
NEXT_PUBLIC_STELLAR_EXPLORER_BASE="https://stellar.expert/explorer/testnet"

# Parámetros WebAuthn
WEBAUTHN_RP_ID=culturago.cl
WEBAUTHN_ORIGINS=https://culturago.cl,https://www.culturago.cl

# Guardrail de Mutaciones (Restaurado)
CULTURAGO_ALLOW_TESTNET_MUTATIONS=false
```

---

## 7. ⚠️ Pendientes y Riesgos Identificados

1. **Guardrail Activo**: `CULTURAGO_ALLOW_TESTNET_MUTATIONS=false` evita cualquier emisión accidental en Testnet durante operación normal. Debe ser conmutado mediante pipeline controlado cuando se requiera probar nuevas mutaciones.
2. **Acceso al Dashboard por Rol**: El archivo `src/app/dashboard/layout.tsx` exige rol `'admin'`. Cuentas registradas sin rol explícito deben recibir su rol (`organizer`, `operator`, `visitor`) o ajustarse el Layout para permitir acceso general a usuarios autenticados.
3. **Datos del Smoke Test Preservados**: La cuenta de prueba `b2c3d4e5-f6a7-8901-bcde-222222222222` y la entidad `a1b2c3d4-e5f6-7890-abcd-111111111111` permanecen registradas en la BD PostgreSQL para inspección o pruebas adicionales.

---

## 8. 🎯 Próximos Pasos Recomendados

1. **PR de Fix Idempotente (Migración 0003)**: El commit del fix de triggers idempotentes en `database/migrations/0003_outbox_indexer_reconciliation.sql` ya fue fusionado a `main` (PR #3).
2. **Saneamiento Opcional de Datos Smoke Test**: Cuando estés listo para limpiar la BD de prueba, ejecutar el script de rollback en PostgreSQL (`DELETE FROM smart_wallet_claims ...`).
3. **Fase de Emisión de Credenciales Culturales**: Desplegar los contratos Soroban de registro de entidades (`NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID`) y registro de credenciales (`NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID`) para habilitar la emisión on-chain de pasaportes y acreditaciones culturales.
