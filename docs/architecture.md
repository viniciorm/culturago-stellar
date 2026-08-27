# Arquitectura del Sistema - CulturaGO

Este documento detalla la arquitectura técnica, el modelo de datos y las decisiones de diseño del proyecto **CulturaGO (FDVC 2026 MVP)**.

---

## 1. Visión General de la Arquitectura

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas Públicas Mobile-First /p/ /o/ /credencial/]
        AdminUI[Dashboard Admin /dashboard/eventos]
    end

    subgraph Servidor / VPS
        NextApp[Next.js 16.2 Standalone / Node 22 + pnpm 10]
        PostgreSQL[(PostgreSQL 17)]
        StellarModule[Stellar / Soroban Gateway]
    end

    Public --> NextApp
    AdminUI --> NextApp
    NextApp --> PostgreSQL
    NextApp --> StellarModule
```

---

## 2. Componentes Técnicos

### 2.1 Core Web Engine
* **Framework**: Next.js 16.2.11 (App Router) con React 19.
* **Empaquetado**: Modo `output: "standalone"` en Docker (Node 22), optimizando memoria RAM.
* **Gestor de Paquetes**: `pnpm 10` vía Corepack.

### 2.2 Base de Datos y Persistencia
* **Producción**: PostgreSQL 17 conectado directamente vía `pg` y migraciones en `database/migrations/`.
* **Desarrollo / Offline**: `src/lib/db.ts` es un mock en memoria respaldado en `localStorage` que se debe retirar antes de producción.

### 2.3 Esquema Relacional de Base de Datos
* `entities`: entidades polimórficas base (person, organization, provider, event).
* `people`, `organizations`, `providers`, `events`: extensiones tipadas.
* `relationships`: vínculos entre entidades.
* `participations`: estados de participación en eventos.
* `credentials`: certificados digitales oficiales.
* `wallets`: direcciones Stellar y passkeys (sin custodia).
* `stellar_operations`: outbox durable de operaciones on-chain.
* `accounts`, `sessions`, `passkeys`: identidad y autenticación (Fase 8 / F1).

### 2.4 Capa Blockchain Stellar/Soroban
* `CanonicalHashService`: canonicalización JCS + SHA-256 con separación de dominio (`CULTURAGO\0<schema>\0<canonical-json>`).
* `SorobanStellarGateway`: máquina de estados para `prepare` → `awaiting_signature` → `signed` → `submitted` → `confirming` → `confirmed`.
* `StellarWorker`: consume `OperationStore.claimBatch` y maneja firma/reconciliación.

---

## 3. Acceso y Administración de la Base de Datos

### Requisito principal
Una instancia PostgreSQL 17 y la variable `DATABASE_URL`.

### Métodos de Acceso:
1. **CLI**: `psql $DATABASE_URL` o `pnpm migrate`.
2. **Cliente SQL**: host, puerto, usuario y contraseña definidos en `DATABASE_URL`.
