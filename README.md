# CulturaGO - Pasaportes Culturales Verificables (FDVC 2026 MVP)

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones y proveedores del sector cultural. Este repositorio contiene el MVP diseñado y construido para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

---

## 🚀 Características del MVP
1.  **Dashboard de Eventos:** Panel principal en `/dashboard/eventos/fdvc-2026` con administración de participantes, organizaciones, proveedores, credenciales y verificación QR.
2.  **CRUDs de Entidades:** Interfaces para agregar, modificar y eliminar Personas, Organizaciones y Proveedores.
3.  **Generación de Códigos QR Dinámicos:** Códigos QR para pasaportes, perfiles y credenciales públicas.
4.  **Emisión de Credenciales Verificables:** Certificados oficiales con estados vigentes, pendientes o revocados; anclaje opcional a Stellar/Soroban.
5.  **Persistencia PostgreSQL:** Cuando se configura `DATABASE_URL`, el dashboard usa PostgreSQL vía `pg`. Sin `DATABASE_URL`, el cliente usa un mock en memoria (`localStorage`) solo para demostraciones locales.
6.  **Integración Stellar/Soroban:** Preparación y firma de transacciones on-chain mediante `SorobanStellarGateway`, `OperationStore` y `SignerPort`; no es un módulo mock.

---

## 🛠️ Tecnologías Utilizadas
*   **Core:** [Next.js 16 (App Router)](https://nextjs.org/)
*   **Lenguaje:** [TypeScript](https://www.typescriptlang.org/)
*   **Estilos (CSS):** [Tailwind CSS v4](https://tailwindcss.com/)
*   **Base de datos / Auth:** [PostgreSQL](https://www.postgresql.org/) (`pg`) + migraciones SQL
*   **Blockchain:** [Stellar Soroban](https://soroban.stellar.org/) (`@stellar/stellar-sdk`)
*   **Passkeys:** [`@simplewebauthn/*`](https://simplewebauthn.dev/) y `passkey-kit`
*   **Iconos:** [Lucide React](https://lucide.dev/)
*   **Generador QR:** [QRCode (npm)](https://www.npmjs.com/package/qrcode)

---

## 📂 Estructura del Proyecto

*   `src/app/` - Rutas de Next.js (públicas y privadas) y Server Actions.
*   `src/components/` - Layouts y componentes reutilizables.
*   `src/components/ui/` - Librería de componentes visuales.
*   `src/lib/` - Utilidades, modelos de dominio y helpers. **Nota:** `src/lib/db.ts` es un mock en memoria que se debe reemplazar por Server Actions reales antes de producción.
*   `src/infrastructure/` - Adaptadores de PostgreSQL, Stellar, auth y operaciones.
*   `src/ports/` - Contratos (interfaces) para database, dashboard, operation store, etc.
*   `database/migrations/` - Migraciones SQL (`0001` a `0005`).
*   `contracts/` - Contratos Rust para Soroban.
*   `docs/` - Documentación técnica:
    *   `HANDOFF.md` - Estado real y bloqueadores actuales (leer antes de deployar).
    *   `architecture.md` - Decisiones de arquitectura (puede estar desactualizado).
    *   `stellar-integration.md` - Especificación de contratos y SDK.

---

## 💻 Instalación y Desarrollo Local

Requisitos: **Node.js >=22**, **pnpm >=10**.

### 1. Clonar e instalar
```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
pnpm install
```

### 2. Variables de entorno
Crear `.env.local` con al menos:
```env
DATABASE_URL=postgres://user:pass@host:5432/culturago
NEXT_PUBLIC_CULTURAGO_ENV=testnet
CULTURAGO_ENV=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

### 3. Aplicar migraciones
```bash
pnpm migrate
```

### 4. Ejecutar el servidor de desarrollo
```bash
pnpm dev
```
Abre [http://localhost:3000](http://localhost:3000).

### 5. Acceso al Dashboard
Ve a `/login`. El sistema soporta autenticación real vía WebAuthn/Passkey + cuentas de `accounts`. No hay credenciales de demo hardcodeadas.

---

## 🎨 Principios de Diseño
*   **Estética Cultural:** El fondo de la plataforma es de color marfil cálido (`#FCFBF7`), con tipografías serif y geométricas, detalles en burdeo profundo (`#5C061E`) y acentos en dorado suave (`#C5A880`).
*   **Cero jerga cripto para el público:** Las interfaces públicas evitan conceptos como "gas", "NFT", "wallet address" o "smart contract". Se usan términos amigables e institucionales como **Pasaporte Cultural**, **Acreditación Oficial** y **Verificado por FDVC**.
*   **Mobile-First:** Las vistas del pasaporte, de escuelas y credenciales públicas se adaptan perfectamente a pantallas de celulares para ser escaneadas cómodamente en las puertas del teatro Aula Magna Manuel de Salas.
