# CulturaGO — Pasaportes Culturales Verificables

MVP de CulturaGO para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones, eventos y proveedores culturales. El objetivo del MVP es registrar entidades culturales, vincularlas al evento, emitir credenciales verificables y preparar la integración con Stellar/Soroban y passkeys sin exponer datos personales sensibles en cadena.

> Estado actual: MVP con aplicación Next.js, PostgreSQL directo, contratos Soroban en Rust, preparación para Testnet, smart wallet/passkey signer y capa demo local separada.

---

## Principios del proyecto

- La app no debe sentirse como una app cripto.
- El público debe ver conceptos simples: **Pasaporte Cultural**, **Credencial verificable**, **Verificado por FDVC**, **Registro Stellar pendiente/verificado**.
- No usar públicamente conceptos como gas, seed phrase, NFT, token o smart contract en la UX principal.
- Los datos personales y la operación viven off-chain.
- Stellar/Soroban se usa como capa de verificación: hashes, estados, credenciales y pruebas verificables.
- Mainnet queda bloqueado hasta una aprobación humana separada.

---

## Stack actual

- **Frontend / App:** Next.js 16 App Router + React 19.
- **Lenguaje:** TypeScript.
- **UI:** Tailwind CSS v4 + componentes propios inspirados en shadcn/ui.
- **Persistencia principal:** PostgreSQL directo mediante `pg` y `DATABASE_URL` server-only.
- **Migraciones:** SQL versionado en `database/migrations/*.sql` con runner `database/migrate.mjs`.
- **Demo local:** `src/lib/db.ts` con memoria/localStorage. Solo demo/offline; no es la ruta productiva.
- **Blockchain:** Stellar / Soroban en Testnet.
- **Contratos:** Rust / Soroban.
- **Smart wallet / passkeys:** `passkey-kit` + SimpleWebAuthn, encapsulado detrás de puertos/adapters.
- **Deploy:** Next.js standalone, Docker, Caddy/VPS.
- **Package manager:** pnpm 10.
- **Runtime:** Node.js >= 22.

El proyecto declara estas versiones en `package.json`:

```json
{
  "packageManager": "pnpm@10.0.0",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  }
}
```

---

## Arquitectura resumida

```text
Cliente / navegador
  ├─ Vistas públicas mobile-first
  ├─ Dashboard admin
  └─ Passkey/WebAuthn ceremonies

Next.js 16 App Router
  ├─ Server Actions
  ├─ Route Handlers
  ├─ Use cases de aplicación
  ├─ Ports / adapters
  └─ Demo local opcional: src/lib/db.ts

Persistencia productiva
  └─ PostgreSQL directo vía pg / DATABASE_URL

Stellar / Soroban Testnet
  ├─ CulturalEntityRegistry
  ├─ CulturalCredentialRegistry
  └─ Smart wallet / passkeys
```

### Importante sobre Supabase

Esta versión **no usa Supabase como arquitectura principal**.

Puede existir una carpeta histórica o experimental llamada `supabase-docker/`, pero no forma parte del flujo principal del MVP actual. La persistencia productiva debe ir por PostgreSQL directo mediante `PostgreSQLDatabaseGateway`, `pg` y variables server-only.

`src/lib/db.ts` es solo una capa demo local/offline. El propio archivo lo declara como `DEMO-ONLY DATA LAYER`: la persistencia real debe fluir por Server Actions, casos de uso y `PostgreSQLDatabaseGateway`.

---

## Funcionalidades del MVP

- Dashboard administrativo para el evento FDVC 2026.
- Registro de entidades culturales:
  - Personas: bailarinas, profesoras, directoras, jurado, invitadas, staff.
  - Organizaciones: festival, escuelas, academias, compañías, asociaciones, productoras.
  - Proveedores culturales: teatro, pub, fotógrafos, camarógrafos, foodtrucks, sonido, iluminación, auspiciadores, streaming, seguridad, maquillaje, vestuario, ticketing, transporte, etc.
  - Eventos.
- Relaciones entre entidades:
  - `organizer_of`
  - `participant_of`
  - `member_of`
  - `teacher_at`
  - `director_of`
  - `founder_of`
  - `provider_of`
  - `venue_of`
  - `sponsor_of`
  - `official_photographer_of`
  - `official_videographer_of`
  - `technical_partner_of`
  - `food_partner_of`
  - `media_partner_of`
- Pasaportes públicos con QR.
- Credenciales públicas verificables.
- Estados Stellar preparados:
  - `not_registered`
  - `pending`
  - `registered`
  - `failed`
- Estados de wallet preparados:
  - `none`
  - `reserved`
  - `claimed`
- Preparación para activación de pasaporte con passkey.

---

## Rutas principales

### Públicas

- `/` — landing pública, búsqueda y validación.
- `/evento/[slug]` — perfil público de evento.
- `/p/[slug]` — pasaporte cultural de persona.
- `/o/[slug]` — pasaporte cultural de organización/escuela.
- `/proveedor/[slug]` — pasaporte cultural de proveedor.
- `/credencial/[credentialCode]` — credencial verificable pública.
- `/verify/...` — rutas de verificación, si aplican.
- `/passport/...` — rutas adicionales de pasaporte, si aplican.
- `/smart-wallet/...` — flujos de smart wallet/passkey, si aplican.

### Privadas / admin

- `/login` — acceso admin.
- `/dashboard` — home administrativo.
- `/dashboard/eventos/[eventId]` — panel principal del evento.
- `/dashboard/personas` — CRUD de personas.
- `/dashboard/organizaciones` — CRUD de organizaciones.
- `/dashboard/proveedores` — CRUD de proveedores.
- `/dashboard/credenciales` — gestión de credenciales.
- `/dashboard/configuracion` — configuración/diagnóstico.

---

## Estructura del repositorio

```text
culturago-stellar/
  src/
    app/                    # Rutas Next.js App Router
    application/            # Casos de uso / lógica de aplicación
    components/             # Componentes de UI y dominio
    domain/                 # Tipos, errores e invariantes de dominio
    infrastructure/         # Adapters reales: PostgreSQL, Stellar, auth, config, hashing
      database/
        PostgreSQLDatabaseGateway.ts
        pool.ts
      stellar/
      auth/
      config/
      hashing/
      observability/
    lib/                    # Utilidades y demo local
      db.ts                 # DEMO-ONLY localStorage/memory
      hashes.ts
      stellar.ts            # Mock/abstracción legacy útil para demo
      smartWallet/
        PasskeyKitSigner.ts
    ports/                  # Puertos/interfaces de arquitectura hexagonal
    generated/              # Código generado, ignorado por lint

  contracts/
    Cargo.toml
    cultural-entity-registry/
    cultural-credential-registry/

  database/
    migrate.mjs
    migrations/
      0001_core_schema.sql
      0002_identity_prep.sql
      0003_outbox_indexer_reconciliation.sql
      0004_observability.sql

  deploy/
    Dockerfile
    Caddyfile
    docker-compose.app.yml
    setup-vps.legacy.sh

  scripts/
    compute-golden-vectors.mjs
    fase7-gate.mjs
    postgres-backup.mjs
    postgres-restore.mjs
    testnet-exercise.mjs
    testnet-smoke.mjs
    vps-deploy.mjs
    vps-probe.mjs
    vps-restore-firewall.mjs

  docs/
    architecture.md
    soroban-contract-architecture.md
    stellar-integration.md
    testnet-readiness-plan.md
    supabase-schema.sql       # Histórico/legacy; no fuente principal actual
    ...
```

---

## Modelo de datos principal

La aplicación trabaja con las siguientes entidades relacionales:

- `entities`
- `people`
- `organizations`
- `providers`
- `events`
- `relationships`
- `credentials`
- `wallets`
- `stellar_transactions`

La tabla `entities` es la raíz polimórfica para persona, organización, proveedor y evento. Las tablas específicas contienen los campos propios de cada tipo.

Campos relevantes para integración Stellar:

- `metadata_hash`
- `stellar_status`
- `stellar_tx`
- `wallet_address`
- `wallet_status`

---

## Contratos Soroban

El repo incluye dos contratos de dominio en Rust/Soroban.

### 1. `CulturalEntityRegistry`

Contrato para registrar hashes versionados de entidades culturales.

Características:

- No almacena PII.
- Usa `BytesN<32>` para IDs y hashes.
- Maneja versiones de entidad.
- Permite desactivar sin borrar historial.
- Usa rol `REGISTRAR`.
- Valida esquemas de hash admitidos.
- Extiende TTL de storage persistente e instance storage.
- Publica eventos de registro, versionado y desactivación.

Funciones principales:

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

### 2. `CulturalCredentialRegistry`

Contrato para emitir atestaciones culturales no transferibles.

Características:

- No es NFT.
- No tiene `owner`, `balance`, `approve`, `transfer`, `burn` ni URI pública.
- Emite credenciales verificables por `credential_id` y `token_id` interno.
- Usa roles `ISSUER` y `REVOKER`.
- Exige vínculo institucional `IssuerOperator` para evitar suplantación de emisores.
- La emisión es idempotente por clave de negocio.
- La revocación preserva el registro.
- Valida catálogo de tipos de credencial.

Funciones principales:

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
- `allow_hash_schema`
- `transfer_admin`
- `accept_admin_transfer`

---

## Smart wallet y passkeys

La integración de passkeys vive en:

```text
src/lib/smartWallet/PasskeyKitSigner.ts
```

Responsabilidades:

- El servidor prepara la transacción.
- El navegador solicita autorización mediante passkey.
- El servidor nunca firma en nombre del usuario.
- El signer valida red, `walletWasmHash`, allowlist de hashes aceptados y RP ID.
- Permite crear/conectar wallets mediante Passkey Kit.

Estado recomendado:

- Usar en Testnet.
- Mantener fondos/autoridad mínimos.
- No usar en Mainnet sin revisión adicional, evidencia y aprobación humana.

---

## Variables de entorno

Partir desde `.env.example`.

### Aplicación

```env
NEXT_PUBLIC_CULTURAGO_ENV=demo
NEXT_PUBLIC_APP_URL=
```

Valores válidos de entorno:

- `demo`
- `testnet`
- `mainnet`

### PostgreSQL

```env
DATABASE_URL=
DATABASE_MIGRATION_URL=
DATABASE_BACKUP_URL=
DATABASE_RESTORE_URL=
POSTGRES_BACKUP_DIR=./backups
POSTGRES_BACKUP_RETENTION_DAYS=7
POSTGRES_RPO_SECONDS=86400
POSTGRES_RTO_SECONDS=3600
POSTGRES_RESTORE_TARGET_GUARD=
```

Reglas:

- `DATABASE_URL` es server-only.
- Nunca usar `NEXT_PUBLIC_DATABASE_URL`.
- Nunca loguear URLs de conexión.
- `DATABASE_MIGRATION_URL` debe tener privilegios suficientes para DDL.
- El usuario runtime debe tener privilegios mínimos.

### Stellar / Soroban

```env
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=
NEXT_PUBLIC_STELLAR_RPC_URL=
NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID=
NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID=
NEXT_PUBLIC_STELLAR_EXPLORER_BASE=
```

### Smart wallet / WebAuthn

```env
NEXT_PUBLIC_SMART_WALLET_WASM_HASH=
NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES=
SMART_WALLET_WASM_HASH=
SMART_WALLET_ACCEPTED_WASM_HASHES=
SMART_WALLET_RELAYER_BASE_URL=
SMART_WALLET_RELAYER_API_KEY=
WEBAUTHN_RP_ID=
WEBAUTHN_ORIGINS=
```

### Testnet / despliegue

```env
CULTURAGO_ALLOW_TESTNET_MUTATIONS=false
STELLAR_TESTNET_DEPLOYER_SECRET=
STELLAR_TESTNET_ADMIN_ADDRESS=
STELLAR_TESTNET_REGISTRAR_ADDRESS=
STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS=
TESTNET_MANIFEST_PATH=docs/manifests/testnet-manifest.json
TESTNET_SMOKE_RUN_ID=
TESTNET_POLL_TIMEOUT_SECONDS=120
```

Mainnet debe permanecer bloqueado hasta aprobación humana separada.

---

## Instalación local

```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Abrir:

```text
http://localhost:3000
```

---

## Migraciones PostgreSQL

El runner aplica todos los SQL en `database/migrations/*.sql` en orden y registra los archivos aplicados en `schema_migrations`.

```bash
DATABASE_MIGRATION_URL="postgres://usuario:password@host:5432/culturago" pnpm migrate
```

También puede usar `DATABASE_URL` si no existe `DATABASE_MIGRATION_URL`.

```bash
DATABASE_URL="postgres://usuario:password@host:5432/culturago" pnpm migrate
```

---

## Scripts principales

```bash
pnpm dev              # Servidor local Next.js
pnpm build            # Build Next.js standalone
pnpm start            # Ejecuta build de producción
pnpm lint             # ESLint
pnpm typecheck        # TypeScript sin emitir archivos
pnpm test             # Vitest
pnpm migrate          # Migraciones PostgreSQL
pnpm contracts:test   # Tests Rust/Soroban
pnpm contracts:lint   # fmt + clippy en contratos
pnpm contracts:build  # Build WASM contratos Soroban
```

Gates recomendados antes de merge o deploy:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:test
pnpm contracts:build
```

---

## Deploy / VPS

La estrategia actual usa Docker con Next.js standalone.

Archivos relevantes:

- `deploy/Dockerfile`
- `deploy/docker-compose.app.yml`
- `deploy/Caddyfile`
- `scripts/vps-deploy.mjs`
- `scripts/vps-probe.mjs`
- `scripts/vps-restore-firewall.mjs`

El Dockerfile:

- Usa Node 22 Alpine.
- Activa `pnpm@10.0.0`.
- Instala con lockfile congelado.
- Compila `pnpm run build`.
- Copia `.next/standalone`.
- Ejecuta la app como usuario no-root `nextjs`.
- Expone el puerto `3080`.

`deploy/setup-vps.legacy.sh` debe tratarse como legado si no coincide con el flujo actual.

---

## Estado de documentación

Documentos clave:

- `docs/architecture.md`
- `docs/soroban-contract-architecture.md`
- `docs/testnet-readiness-plan.md`
- `CODEMAP.md`

Documentos con posible contenido histórico/legacy:

- `docs/stellar-integration.md`
- `docs/supabase-schema.sql`
- referencias a Supabase self-hosted, Kong, PostgREST o `@supabase/supabase-js`

Si hay contradicción entre documentos, la fuente de verdad actual es:

1. Código actual.
2. `database/migrations/*.sql`.
3. Contratos en `contracts/`.
4. `docs/soroban-contract-architecture.md`.
5. `docs/testnet-readiness-plan.md`.

---

## Estado del proyecto

- App MVP creada.
- PostgreSQL directo definido como persistencia productiva.
- Demo local/offline separada.
- Contratos Soroban de entidades y credenciales implementados.
- Passkey signer inicial implementado.
- Testnet readiness plan documentado.
- Mainnet bloqueado.

Pendientes principales:

- Ejecutar gates completos en entorno limpio.
- Cerrar ambigüedades legacy en documentación.
- Confirmar variables reales de PostgreSQL en VPS.
- Confirmar deploy actual contra PostgreSQL directo.
- Completar smoke Testnet con contratos reales desplegados.
- Validar WebAuthn/passkeys con dominio HTTPS real.
