# CulturaGO Stellar — Pasaportes Culturales Verificables

MVP técnico de **CulturaGO** para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

CulturaGO permite registrar entidades culturales —personas, escuelas, organizaciones, eventos y proveedores— y emitir credenciales verificables con QR. La experiencia pública evita fricción cripto: las bailarinas, escuelas y proveedores ven un **Pasaporte Cultural**, una **Credencial verificable** y un estado de validación; la capa Stellar/Soroban funciona como respaldo técnico de autenticidad.

> Estado actual: MVP web + base de datos + contratos Soroban + preparación de smart wallets/passkeys. Mainnet queda fuera de alcance hasta una aprobación humana separada.

---

## Alcance del MVP FDVC 2026

El MVP está pensado para operar un piloto real en el festival:

- Panel de administración para el evento FDVC 2026.
- Registro de personas: bailarinas, profesoras, directoras, invitadas y staff.
- Registro de organizaciones: festival, escuelas, academias, compañías y productoras.
- Registro de proveedores culturales: teatro/sede, fotógrafos, camarógrafos, foodtrucks, sonido, iluminación, auspiciadores, seguridad, vestuario, maquillaje y otros aliados.
- Relaciones entre entidades: escuela participante, bailarina de escuela, solista, profesora/directora, proveedor oficial, sede, sponsor, etc.
- Pasaportes públicos con URL y QR.
- Credenciales verificables con estado: vigente, pendiente, registrada, fallida o revocada.
- Preparación para anclar entidades y credenciales en Stellar/Soroban mediante hashes, sin publicar PII on-chain.
- Flujo de smart wallet/passkey en preparación para que una persona pueda activar su pasaporte sin usar una wallet tradicional.

---

## Stack

- **Frontend / Backend:** Next.js 16 App Router
- **Lenguaje:** TypeScript
- **UI:** Tailwind CSS v4 + componentes propios tipo shadcn/ui
- **DB:** PostgreSQL directo con migraciones SQL
- **Modo demo:** motor local/mock para desarrollo sin infraestructura
- **Blockchain:** Stellar / Soroban
- **Contratos:** Rust, workspace Cargo
- **Wallet UX:** Passkey Kit + SimpleWebAuthn en fase Testnet
- **QR:** `qrcode`
- **Deploy:** Docker standalone + Caddy + scripts VPS
- **Package manager:** pnpm 10
- **Node:** >= 22

---

## Estructura principal

```text
.
├── contracts/                         # Workspace Rust/Soroban
│   ├── cultural-entity-registry/        # Registro versionado de entidades culturales
│   └── cultural-credential-registry/    # Credenciales/atestaciones no transferibles
├── database/
│   ├── migrate.mjs                     # Runner de migraciones PostgreSQL
│   └── migrations/                     # Migraciones SQL versionadas
├── deploy/                             # Docker, Caddy y compose de aplicación
├── docs/                               # Arquitectura, readiness, evidencia y runbooks
├── scripts/                            # Gates, smoke Testnet, backup/restore y deploy VPS
├── src/
│   ├── app/                            # Rutas públicas, dashboard y API routes
│   ├── components/                     # Componentes UI y de dominio
│   ├── domain/                         # Errores e invariantes de dominio
│   ├── infrastructure/                 # Adaptadores concretos
│   ├── lib/                            # Utilidades legacy/mocks y smart wallet signer
│   └── ports/                          # Interfaces/puertos de arquitectura
├── .env.example
├── CODEMAP.md
└── package.json
```

---

## Rutas principales

### Públicas

- `/` — landing pública, búsqueda rápida y validador.
- `/evento/[slug]` — página pública del evento.
- `/p/[slug]` — Pasaporte Cultural de persona.
- `/o/[slug]` — Pasaporte Cultural de organización/escuela.
- `/proveedor/[slug]` — perfil público de proveedor cultural.
- `/credencial/[credentialCode]` — página pública de validación de credencial.
- `/verify` — flujo de verificación.
- `/passport` — flujo de pasaporte.
- `/smart-wallet` — flujo de smart wallet/passkey.

### Admin

- `/login` — acceso administrador.
- `/dashboard` — home del panel.
- `/dashboard/eventos/[eventId]` — panel principal del evento.
- `/dashboard/personas`
- `/dashboard/organizaciones`
- `/dashboard/proveedores`
- `/dashboard/credenciales`
- `/dashboard/configuracion`

---

## Contratos Soroban

El repositorio incluye dos contratos de dominio en Rust/Soroban.

### `CulturalEntityRegistry`

Contrato para registrar entidades culturales mediante IDs opacos y hashes de metadata.

Características:

- No almacena PII.
- Registro versionado de entidades.
- Control de rol `registrar`.
- Esquemas de hash permitidos.
- Desactivación sin borrar historial.
- Verificación pública por `entity_id`, versión, hash y esquema.
- Eventos: `EntityRegistered`, `EntityVersioned`, `EntityDeactivated`.

Funciones relevantes:

- `register_entity`
- `version_entity`
- `deactivate_entity`
- `get_entity`
- `get_entity_version`
- `verify_entity`
- `grant_registrar`
- `revoke_registrar`
- `allow_hash_schema`
- `transfer_admin`
- `accept_admin_transfer`

### `CulturalCredentialRegistry`

Contrato para emitir credenciales culturales no transferibles.

Importante: **no es un NFT**. No tiene `owner`, `balance`, `approve`, `transfer`, `burn` ni URI pública. Funciona como registro de atestaciones verificables.

Características:

- Roles `issuer` y `revoker`.
- Vínculo institucional `IssuerOperator` para evitar suplantación de emisores.
- Idempotencia por clave de negocio `issuer | subject | event | type`.
- Revocación preservando el registro.
- Verificación pública por `credential_id`, hash y esquema.
- Catálogo v1 de tipos de credencial con códigos `1..=6`.
- Eventos: `CredentialIssued`, `CredentialRevoked`, `IssuerOperatorLinked`, `IssuerOperatorUnlinked`.

Funciones relevantes:

- `issue_credential`
- `revoke_credential`
- `get_credential`
- `get_credential_by_token_id`
- `verify_credential`
- `link_issuer_operator`
- `unlink_issuer_operator`
- `is_issuer_operator`
- `grant_issuer`
- `revoke_issuer`
- `grant_revoker`
- `revoke_revoker`

---

## Smart wallets y passkeys

El repo ya incluye una primera implementación cliente en:

```text
src/lib/smartWallet/PasskeyKitSigner.ts
```

La intención es que el servidor prepare transacciones y el navegador solicite autorización mediante passkey. El servidor no debe firmar por el usuario.

Estado actual:

- Usa `passkey-kit` en cliente.
- Permite crear y conectar wallet mediante `createWallet` / `connectWallet`.
- Valida `networkPassphrase` al firmar.
- Usa allowlist de hashes WASM para la smart wallet.
- Requiere revisar RP ID, origins HTTPS y riesgo de implementación antes de un piloto Testnet real.

---

## Instalación local

Requisitos:

- Node.js >= 22
- pnpm >= 10
- Rust + Cargo, si se trabajará con contratos
- Stellar CLI, si se compilan/despliegan contratos Soroban

```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
pnpm install
pnpm dev
```

Abrir:

```text
http://localhost:3000
```

---

## Variables de entorno

Copia la plantilla:

```bash
cp .env.example .env.local
```

Modo demo:

```env
NEXT_PUBLIC_CULTURAGO_ENV=demo
```

En modo `demo`, las variables Stellar pueden quedar vacías y la app no debe generar claims reales.

Para Testnet, completar solo con valores públicos o secretos según corresponda. No commitear `.env.local`, llaves, secrets, URLs privadas ni credenciales VPS.

Variables clave:

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `NEXT_PUBLIC_CULTURAGO_ENV`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_STELLAR_RPC_URL`
- `NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID`
- `NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID`
- `NEXT_PUBLIC_SMART_WALLET_WASM_HASH`
- `NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES`
- `WEBAUTHN_RP_ID`
- `WEBAUTHN_ORIGINS`
- `STELLAR_TESTNET_DEPLOYER_SECRET`

---

## Base de datos

El repo usa migraciones SQL versionadas en:

```text
database/migrations/
```

Para aplicar migraciones sobre PostgreSQL:

```bash
DATABASE_URL="postgres://..." pnpm migrate
```

El runner crea/usa `schema_migrations` y aplica archivos `.sql` en orden.

Migraciones actuales:

- `0001_core_schema.sql`
- `0002_identity_prep.sql`
- `0003_outbox_indexer_reconciliation.sql`
- `0004_observability.sql`

---

## Scripts útiles

```bash
pnpm dev                # Desarrollo local
pnpm build              # Build Next.js
pnpm start              # Servidor producción
pnpm lint               # ESLint
pnpm test               # Vitest
pnpm typecheck          # TypeScript sin emitir
pnpm migrate            # Migraciones PostgreSQL
pnpm contracts:test     # Tests Rust/Soroban
pnpm contracts:lint     # fmt + clippy contratos
pnpm contracts:build    # Build contratos con Stellar CLI
```

Scripts adicionales en `scripts/`:

- `fase7-gate.mjs` — gate local/remoto de calidad.
- `testnet-smoke.mjs` — smoke Testnet.
- `testnet-exercise.mjs` — ejercicios Testnet.
- `vps-deploy.mjs` — despliegue por SSH.
- `vps-probe.mjs` — prueba de VPS.
- `postgres-backup.mjs` — backup PostgreSQL.
- `postgres-restore.mjs` — restore PostgreSQL.
- `compute-golden-vectors.mjs` — vectores de hash/canonicalización.

---

## Gates recomendados antes de integrar con el MVP visual

Ejecutar al menos:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:test
pnpm contracts:build
```

Para Testnet real, seguir `docs/testnet-readiness-plan.md`. No considerar exitoso un hash de transacción hasta tener ledger confirmado y readback contractual.

---

## Documentación relevante

- `CODEMAP.md` — mapa rápido de rutas, componentes y carpetas.
- `docs/architecture.md` — arquitectura general.
- `docs/soroban-contract-architecture.md` — diseño e invariantes de contratos.
- `docs/testnet-readiness-plan.md` — plan operativo para cerrar Testnet.
- `docs/kimi3-implementation-plan.md` — plan detallado de implementación.
- `docs/stellar-integration.md` — guía inicial de integración; parte de su contenido es histórico y debe leerse junto con los contratos actuales.
- `docs/manifests/` — manifiestos operativos.
- `docs/runbooks/` — procedimientos de operación.

---

## Seguridad y privacidad

Principios obligatorios:

- No publicar datos personales completos on-chain.
- Anclar solo IDs opacos, hashes, estados y referencias verificables.
- No registrar ni persistir secrets Stellar, credenciales de relayer, cookies, challenges WebAuthn, respuestas WebAuthn, URLs privadas o PII sensible en logs.
- Mainnet permanece bloqueado hasta aprobación humana explícita.
- Passkey Kit debe tratarse como infraestructura de Testnet hasta revisar riesgos, hashes WASM, RP ID y origins HTTPS.
- El rollback de la app no revierte estado on-chain; cualquier corrección on-chain debe hacerse con operaciones compensatorias o redeploy Testnet documentado.

---

## Próximos pasos sugeridos

1. Ejecutar gates locales y contratos.
2. Completar manifiesto Testnet con contract IDs, hashes WASM y ledgers reales.
3. Integrar los clientes TypeScript generados desde ABI Soroban.
4. Conectar el MVP visual de CulturaGO con los puertos `StellarGateway`, `SignerPort`, `WalletGateway` y `OperationStore`.
5. Validar WebAuthn en dominio HTTPS real.
6. Cargar un piloto FDVC 2026 con festival, escuela, bailarina, profesora y proveedor.
7. Emitir credencial Testnet y verificar readback desde contrato.

---

## Nota de producto

La app debe mantener una experiencia cultural e institucional. Evitar en la interfaz pública términos como `gas`, `seed phrase`, `NFT`, `smart contract` o `token`. Usar lenguaje simple:

- Pasaporte Cultural
- Credencial verificable
- Verificado por FDVC
- Registro Stellar pendiente
- Registro Stellar verificado
- Pasaporte reclamado
