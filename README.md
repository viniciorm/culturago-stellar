# CulturaGO — Pasaportes Culturales Digitales Verificables

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

CulturaGO es una plataforma de reputación cultural para artistas, escuelas, festivales y organizaciones. Permite documentar participaciones culturales mediante credenciales digitales verificables, reunirlas en un pasaporte público y compartirlas mediante QR y certificados PDF. El Festival Nacional Danza del Vientre Chile (FDVC) es un caso de uso inicial, no el límite del producto.

Sitio: [culturago.cl](https://culturago.cl) · [Documentación técnica](docs/) · [CI](https://github.com/viniciorm/culturago-stellar/actions)

## Estado técnico — 24 de noviembre de 2026

El desarrollo integra los avances D1 y D2 en `develop`. La evidencia de D2 corresponde a Stellar Testnet, no a un despliegue del nuevo flujo en el VPS público ni a adopción por usuarios reales.

| Hito | Estado técnico |
| --- | --- |
| Week 1 / D1 | Emisión Credential V2 de participación desde la aplicación, validación de operador, emisor y evidencia, digest canónico, pasaporte público, PDF y QR. [PR #12](https://github.com/viniciorm/culturago-stellar/pull/12). |
| Week 2 / D2 | Gateway V2 conectado a un contrato operativo en Soroban Testnet, firma con cuentas diferenciadas del proyecto, confirmación de transacción, reconciliación idempotente y comparación del digest leído. [PR #13](https://github.com/viniciorm/culturago-stellar/pull/13). |
| Week 3 / D3 | Pendiente: completar la verificación pública independiente y los estados previstos en el SOW. |
| Week 4 / D4 | Pendiente: completar pruebas, despliegue y conjunto de tres nuevas credenciales del sprint. |

La autenticación WebAuthn/Passkey protege la sesión web; las operaciones Soroban se firman con cuentas del proyecto. Los registros históricos locales no se presentan como confirmados en Stellar. Los canaries anteriores a D2 no cuentan como entregables financiados.

### Evidencia técnica D2

- [Despliegue del contrato V2](docs/evidence/v2-d2-contract-deployment.json).
- [Emisión sintética desde la aplicación y anclaje](docs/evidence/v2-d2-anchoring.json).
- [Procedencia del artefacto](docs/evidence/v2-source-provenance.json).
- Credencial: `cg2_5bjYVuqiWWw0JEWP`; ledger: `5887587`; digest local y leído del contrato: coincidencia byte a byte de 32 bytes.
- Contrato Testnet: `CBKX6WIZ25IKKPHIDSTEPLLLMQMRK3DFO5UD3H5YZVXJZ452JNIYHYW6`.
- Transacción: `a11f5c4c81ae80db6fb7b9d6f73290fb3cb82085606568ce25954f35db1073f1`.
- El informe de implementación registra reconciliación sin duplicar la emisión, build, lint, typecheck, 44 pruebas focalizadas de aplicación/gateway y 33 pruebas del contrato aprobadas. Los rechazos de registro no autorizado en Testnet se comprobaron mediante simulación, sin enviar transacciones adicionales.
- Estos resultados son evidencia de desarrollo reportada, no una auditoría independiente ni confirmación de aceptación administrativa del entregable.

Una coincidencia de digest demuestra integridad respecto del registro consultado; no prueba la verdad de la participación, identidad legal ni acreditación del emisor. Testnet no garantiza permanencia de los registros. El piloto formal y el despliegue público del nuevo flujo quedan por validar.

### Antecedentes de remediación

- [PR #9](https://github.com/viniciorm/culturago-stellar/pull/9) y [registro de remediación](docs/evidence/review-remediation-2026-11-09.md).
- [Canary V2 previo](docs/evidence/v2-canary.json) y [verificación](docs/evidence/v2-canary-verification.json).

---

## 🏛️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas públicas y credenciales]
        AdminUI[Panel organizador y dashboard]
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
   - Gateway Credential V2: registra y consulta el digest canónico en el contrato Soroban, con confirmación y reconciliación.
4. **Contratos Rust**: en `contracts/`; se testean y compilan con `pnpm contracts:test` / `pnpm contracts:build`.

---

## 🚀 Características del MVP
1. **Panel de organización:** Emisión V2 de participación desde `/organizer`, validación del alcance del operador y la evidencia, estado de confirmación y referencias de transacción.
2. **Dashboard de Eventos:** Panel principal en `/dashboard/eventos/[eventId]` para administrar participantes, organizaciones, proveedores, credenciales y verificación QR.
3. **CRUDs de Entidades:** Personas, organizaciones y proveedores técnicos.
4. **Códigos QR Dinámicos:** Pasaportes, perfiles y credenciales públicas.
5. **Credenciales Verificables:** Registros culturales con estado local y resultados de consulta Stellar diferenciados. La existencia en PostgreSQL no acredita un anclaje; un QR o PDF tampoco demuestra confirmación on-chain.
6. **Motor de Datos Dual:** PostgreSQL con `pg` cuando `DATABASE_URL` está configurado; implementaciones en memoria (`InMemory*`) como fallback local para desarrollo y tests.

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

## 📁 Estructura del Proyecto

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
