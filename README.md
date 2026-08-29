# CulturaGO - Pasaportes Culturales Verificables (FDVC 2026 MVP)

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones y proveedores del sector cultural. Este repositorio contiene el MVP diseñado para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

---

## 🏛️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas Públicas Mobile-First /p/ /o/ /credencial/]
        AdminUI[Dashboard Admin /dashboard/eventos]
    end

    subgraph Servidor / VPS
        NextApp[Next.js 16.3 Standalone / Node 22 + pnpm 10]
        PostgreSQL[(PostgreSQL 17)]
        StellarModule[Stellar / Soroban Gateway]
    end

    Public --> NextApp
    AdminUI --> NextApp
    NextApp --> PostgreSQL
    NextApp --> StellarModule
```

### Componentes de la Arquitectura:
1. **Core Web Engine**: Next.js 16.3 (App Router) con modo `output: "standalone"`.
2. **Base de Datos**: PostgreSQL 17 con migraciones SQL en `database/migrations/`.
   - **Producción**: conectado vía `DATABASE_URL`.
   - **Desarrollo / Offline**: `InMemoryOperationStore`, `InMemoryIdentityStore` y `InMemoryRateBudgetStore` proveen fallback en memoria; no hay credenciales de demo hardcodeadas.
3. **Capa Blockchain Stellar/Soroban**:
   - `CanonicalHashService` (`src/infrastructure/hashing/`): canonicalización JCS + SHA-256 con separación de dominio.
   - `SorobanStellarGateway` (`src/infrastructure/stellar/`): prepara, firma, envía y reconcilia operaciones on-chain.
4. **Contratos Rust**: en `contracts/`; se testean y compilan con `pnpm contracts:test` / `pnpm contracts:build`.

---

## 🚀 Características del MVP
1. **Dashboard de Eventos:** Panel principal en `/dashboard/eventos/[eventId]` para administrar participantes, organizaciones, proveedores, credenciales y verificación QR.
2. **CRUDs de Entidades:** Personas, organizaciones y proveedores técnicos.
3. **Códigos QR Dinámicos:** Pasaportes, perfiles y credenciales públicas.
4. **Credenciales Verificables:** Certificados oficiales con estados vigente/pendiente/revocado y anclaje opcional a Stellar/Soroban.
5. **Motor de Datos Dual:** PostgreSQL con `pg` cuando `DATABASE_URL` está configurado; implementaciones en memoria (`InMemory*`) como fallback local para desarrollo y tests.

---

## 🛠️ Tecnologías Utilizadas
* **Core:** Next.js 16.3 (App Router)
* **Lenguaje:** TypeScript
* **Estilos (CSS):** Tailwind CSS v4
* **Base de datos:** PostgreSQL 17 (`pg`)
* **Auth:** WebAuthn / Passkeys (`@simplewebauthn/*`, `passkey-kit`)
* **Blockchain:** Stellar Soroban (`@stellar/stellar-sdk`)
* **Gestor de Paquetes:** `pnpm 10` (Node ≥22)
* **Iconos:** Lucide React
* **Generador QR:** QRCode (npm)

---

## � Estructura del Proyecto

* `src/app/` — Rutas de Next.js (públicas y dashboard) y Server Actions.
* `src/components/` — Layouts y componentes reutilizables.
* `src/components/ui/` — Librería de componentes visuales.
* `src/infrastructure/` — Adaptadores de PostgreSQL, Stellar, auth y observabilidad.
* `src/ports/` — Contratos (interfaces) de dominio.
* `src/lib/` — Utilidades, helpers y hooks del cliente.
* `database/migrations/` — Migraciones SQL (ej. `0001` a `0011`); no editar migraciones ya aplicadas.
* `contracts/` — Contratos Rust para Soroban.
* `docs/` — Documentación técnica (`HANDOFF.md`, `architecture.md`, manifiestos).

---

## 💻 Instalación y Desarrollo Local

Requisitos: **Node.js ≥22**, **pnpm ≥10**.

```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
pnpm install
```

### Variables de entorno
Crear `.env.local` con al menos:
```env
DATABASE_URL=postgres://user:pass@host:5432/culturago
NEXT_PUBLIC_CULTURAGO_ENV=testnet
CULTURAGO_ENV=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

### Baseline de calidad (local)
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
pnpm contracts:lint
pnpm contracts:test
pnpm contracts:build
```

### Aplicar migraciones
```bash
pnpm migrate
```

### Ejecutar el servidor de desarrollo
```bash
pnpm dev
```
Abre [http://localhost:3000](http://localhost:3000).

### Acceso al Dashboard
Ve a `/login`. El sistema soporta autenticación real vía WebAuthn/Passkey. No hay credenciales de demo hardcodeadas.

---

## 🎨 Principios de Diseño
* **Estética Cultural:** Fondo marfil cálido (`#FCFBF7`), tipografías serif y geométricas, detalles en burdeo profundo (`#5C061E`) y acentos en dorado suave (`#C5A880`).
* **Cero jerga cripto para el público:** Términos institucionales y amigables como **Pasaporte Cultural**, **Acreditación Oficial** y **Verificado por FDVC**.
