# Arquitectura del Sistema - CulturaGO

Este documento detalla la arquitectura técnica, el modelo de datos y las decisiones de diseño del proyecto **CulturaGO (FDVC 2026 MVP)**.

---

## 1. Visión General de la Arquitectura

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas Públicas Mobile-First /p/ /o/ /credencial/]
        AdminUI[Dashboard Admin /dashboard/eventos/fdvc-2026]
    end

    subgraph VPS Ubuntu 24.04 LTS (IP: 166.0.112.1)
        subgraph Docker App (Puerto 80)
            NextApp[Next.js 16 Standalone Container / Node 22 + pnpm v9]
        end

        subgraph Docker Supabase Self-Hosted Stack
            Kong[Kong API Gateway - Puerto 8000]
            Studio[Supabase Studio UI - Puerto 8001]
            Auth[GoTrue Auth Service]
            REST[PostgREST Engine]
            PostgreSQL[(PostgreSQL 17 DB - Puerto 5432)]
        end
      
        subgraph Capa Blockchain (Simulador / Soroban)
            Hashes[SHA-256 Metadata Generator lib/hashes.ts]
            StellarModule[Stellar / Soroban Abstraction lib/stellar.ts]
        end
    end

    Public --> NextApp
    AdminUI --> NextApp
    NextApp -->|@supabase/supabase-js| Kong
    Kong --> REST
    Kong --> Auth
    REST --> PostgreSQL
    Studio --> PostgreSQL
    AdminUI --> Hashes
    AdminUI --> StellarModule
```

---

## 2. Componentes Técnicos

### 2.1 Core Web Engine
* **Framework**: Next.js 16.2.10 (App Router) con React 19.
* **Empaquetado**: Modo `output: "standalone"` en Docker (Node 22 Alpine), eliminando `node_modules` innecesarios en producción para optimizar memoria RAM.
* **Gestor de Paquetes**: `pnpm v9` vía Corepack.

### 2.2 Base de Datos Dual y Persistencia
* **Producción**: PostgreSQL 17 en Docker orquestado con el stack completo de Supabase Self-Hosted (Kong, PostgREST, GoTrue, Studio).
* **Desarrollo / Offline**: Fallback automático en `localStorage` con los datos semilla iniciales de FDVC 2026 (`src/lib/db.ts`).

### 2.3 Esquema Relacional de Base de Datos
* `entities`: Entidades poli-mórficas base (Bailarinas, Escuelas, Proveedores, Eventos) con hash SHA-256 y atributos blockchain.
* `people`: Extensión para personas (bailarinas, profesoras, directores).
* `organizations`: Extensión para escuelas y academias.
* `providers`: Extensión para proveedores técnicos (fotógrafos, sonido, salones).
* `events`: Registro de eventos culturales.
* `relationships`: Vínculos relacionales entre entidades (organizador, participante, miembro, profesor).
* `credentials`: Certificados digitales oficiales verificables (`credential_code`, estado vigente/revocado).
* `wallets`: Identidades Stellar y llaves Passkeys.

---

## 3. Acceso y Administración de la Base de Datos

### Usuarios de PostgreSQL:
* `postgres`: Usuario principal de la base de datos.
* `supabase_admin`: Superadministrador interno del contenedor Docker.

### Métodos de Acceso:
1. **Supabase Studio (Web UI)**: Disponible en `http://166.0.112.1:8001`
2. **Terminal psql (CLI)**: `docker exec -it supabase-db psql -U postgres -d postgres`
3. **Cliente SQL Remoto (DBeaver / TablePlus)**: Port `5432`, Host `166.0.112.1`, DB `postgres`.
