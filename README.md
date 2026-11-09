# CulturaGO - Pasaportes Culturales Verificables (FDVC 2026 MVP)

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones y proveedores del sector cultural. Este repositorio contiene el MVP diseñado para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

## Estado técnico — 9 de noviembre de 2026

Sitio: [culturago.cl](https://culturago.cl), alojado en VPS; Vercel no es el destino operativo.

- **Implementado:** persistencia Credential V2, payload canónico/digest, controles de operador y evidencia, perfiles y rutas públicas/PDF/QR. El gateway existente corresponde al flujo legacy; su presencia no acredita integración V2 completa.
- **Remediación previa al sprint:** [PR #9](https://github.com/viniciorm/culturago-stellar/pull/9), integrada en `develop`, con correcciones V2 y del indexador/verificación V1. Las credenciales locales sin registro confirmado se muestran como `unverified`.
- **Prueba aislada V2:** dos registros sintéticos confirmados en Testnet, con lectura posterior y comprobación independiente. El contrato de prueba usa claves efímeras; no es el contrato operativo del sitio ni demuestra adopción o un flujo completo del producto.
- **Pendiente de desarrollo:** emisión V2 desde la aplicación, firma con cuentas del proyecto, gateway y reconciliación integrados, publicación en pasaporte y comparación pública con Soroban. El SOW propone una familia, un emisor y tres credenciales nuevas durante el sprint; los registros preparatorios no cuentan como entregables financiados.
- **Piloto:** el Festival expresó interés por correo; carta formal y sesión pendientes. No se presenta como adopción confirmada.

Una coincidencia de digest demuestra integridad respecto del registro consultado; no prueba la verdad de la participación, identidad legal ni acreditación del emisor. Testnet es un entorno de prueba y no implica permanencia de los registros.

### Evidencia y trazabilidad

- [Informe de remediación V2](docs/evidence/review-remediation-2026-11-09.md), [registros sintéticos](docs/evidence/v2-canary.json), [verificación independiente](docs/evidence/v2-canary-verification.json) y [procedencia del artefacto](docs/evidence/v2-source-provenance.json).
- Corrección V1: `b0d343c209a008816e5565938d0aa6755379e3a2`; revisión con ajustes de pruebas: `dc5c3822d97c4142f9fc8f91b2ed24565f4649bf`. [CI de referencia](https://github.com/viniciorm/culturago-stellar/actions/runs/42702190611): 308 pruebas de aplicación aprobadas y 3 omitidas, según el informe de ejecución. La prueba V2 previa registró 56 pruebas de contratos aprobadas.
- El operador de despliegue reportó una imagen construida desde `b0d343c2`, también etiquetada `dc5c3822` por igualdad del código de aplicación. Las comprobaciones HTTP confirmaron salud y una respuesta V1 `unverified`; no equivalen a confirmar un registro on-chain.
- Son revisiones y pruebas de remediación, no una auditoría independiente de seguridad. Los resultados se refieren a sus revisiones identificadas y no garantizan ausencia de vulnerabilidades.

---

## 🏛️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas Públicas Mobile-First /p/ /o/ /credencial/]
        AdminUI[Dashboard Admin /dashboard/eventos]
    end

    subgraph Servidor / VPS
        NextApp[Next.js 16.4.1 Standalone / Node 22 + pnpm 10]
        PostgreSQL[(PostgreSQL)]
        StellarModule[Stellar / Soroban Gateway]
    end

    Public --> NextApp
    AdminUI --> NextApp
    NextApp --> PostgreSQL
    NextApp --> StellarModule
```

### Componentes de la Arquitectura:
1. **Core Web Engine**: Next.js 16.4.1 (App Router) con modo `output: "standalone"`.
2. **Base de Datos**: PostgreSQL con migraciones SQL en `database/migrations/`.
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
4. **Credenciales Verificables:** Registros culturales con estado local y resultados de consulta Stellar diferenciados. La existencia en PostgreSQL no acredita un anclaje; un QR o PDF tampoco demuestra confirmación on-chain.
5. **Motor de Datos Dual:** PostgreSQL con `pg` cuando `DATABASE_URL` está configurado; implementaciones en memoria (`InMemory*`) como fallback local para desarrollo y tests.

---

## 🛠️ Tecnologías Utilizadas
* **Core:** Next.js 16.4.1 (App Router)
* **Lenguaje:** TypeScript
* **Estilos (CSS):** Tailwind CSS v4
* **Base de datos:** PostgreSQL (`pg`); CI con PostgreSQL 17, compose de producción con PostgreSQL 16
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
* `database/migrations/` — Migraciones SQL (ej. `0001` a `0014`); no editar migraciones ya aplicadas.
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
Crear `.env.local` con las variables de desarrollo correspondientes. Este ejemplo es parcial y no contiene claves de firma:
```env
DATABASE_URL=postgres://user:pass@host:5432/culturago
NEXT_PUBLIC_CULTURAGO_ENV=testnet
CULTURAGO_ENV=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

### Baseline de calidad (local)

Configura `DATABASE_URL` y `TEST_DATABASE_URL` contra una base PostgreSQL aislada y aplica las migraciones antes de las pruebas. Nunca uses la base de producción para ejecutar suites. Las pruebas V2 y de regresión PostgreSQL requieren una conexión real; los adaptadores en memoria no las sustituyen. Exporta las variables al proceso de pruebas según tu entorno.

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
* **Cero jerga cripto para el público:** Mensajes claros como **Pasaporte Cultural** y **Registro local — sin confirmación Stellar**. Mostrar integridad confirmada solo después de leer el registro y comparar el digest; no atribuir acreditación oficial al emisor ni certificar la veracidad de la participación por ese resultado.

## Licencia

Código publicado bajo [MIT](LICENSE). Deben conservarse los avisos aplicables de dependencias y contribuciones de terceros.
