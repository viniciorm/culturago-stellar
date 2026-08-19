# Fase 0 — Evidencia de baseline y decisiones de versiones

Fecha: 2026-08-17. Rama: `main` (HEAD `ce9cdc4`). Sin cambios del usuario sobrescritos; archivos sin seguimiento al inicio: `docs/kimi3-implementation-plan.md`, `docs/recommended-improvements.md`, `docs/soroban-contract-architecture.md`, `.atl/` (no incorporados a ningún build ni commit).

## Herramientas verificadas

| Herramienta | Versión | Nota |
|---|---|---|
| Node | v22.13.1 | Runtime del frontend |
| pnpm | 10.0.0 | Único gestor autorizado |
| Rust (rustup stable) | 1.97.1 (2026-07-14) | Toolchain activo real |
| Cargo | 1.97.1 | Idem |
| Stellar CLI | 27.1.0 (stellar-xdr 27.0.0) | Instalado vía `cargo install --locked stellar-cli` |
| Target WASM | `wasm32v1-none` | Agregado con `rustup target add` |

Nota: una verificación inicial reportó `rustc 1.84.1` por un estado previo del entorno; el toolchain activo verificado con `rustup show` es 1.97.1 y es el que compila los contratos.

## Decisiones de versiones (exactas, sin rangos flotantes)

| Componente | Versión fijada | Justificación |
|---|---|---|
| `soroban-sdk` | **26.1.1** (2026-07-21) | Línea 27.0.x publicada hace <7 días (27.0.6, 2026-08-13) queda excluida por política de madurez. Requiere Rust ≥1.91 — cubierto por 1.97.1. |
| `stellar-access` (OpenZeppelin Stellar) | **0.7.2** (2026-06-09) | Última estable; declara `soroban-sdk ^26.1.0`, compatible con 26.1.1. Provee `AccessControl` y transferencia admin en dos pasos. |
| Stellar CLI | **27.1.0** | Instalado; `stellar contract build` invoca Cargo con target `wasm32v1-none`. |

Sin rangos flotantes en manifiestos: se fijarán con `=` en `Cargo.toml` y versiones exactas en `package.json`.

## Baseline ejecutado (pnpm)

| Comando | Resultado |
|---|---|
| `pnpm run lint` | **FALLA (preexistente)**: 72 errores, 63 warnings. Destacados: `react-hooks/purity` en `src/components/ui/Select.tsx:23` (`Math.random` en render), `no-explicit-any` en `src/lib/db.ts` y `src/lib/hashes.ts`, `no-require-imports` en `src/lib/hashes.ts:17`, vars sin uso varios. |
| `pnpm exec tsc --noEmit` | Pasa |
| `pnpm run build` | Pasa (11 rutas; arranca en modo MOCK LOCAL). OJO: `next.config.ts` tiene `typescript.ignoreBuildErrors: true` — se elimina en Fase 9. |

Los fallos de lint son **preexistentes**, no regresiones de este trabajo.

## Matriz de configuración por entorno (sin secretos)

Ver `.env.example` para la plantilla. Reglas:

| Variable | demo | testnet | mainnet |
|---|---|---|---|
| `NEXT_PUBLIC_CULTURAGO_ENV` | `demo` | `testnet` | `mainnet` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | opcional (mock local si ausente) | requerida | requerida |
| `SUPABASE_SERVICE_ROLE_KEY` | no usada | solo servidor, nunca commiteada | solo servidor, nunca commiteada |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | — (sin red) | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | — | RPC público aprobado (Fase 6) | solo tras aprobación Mainnet |
| `NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID` | — | tras despliegue Testnet (Fase 10) | tras aprobación Mainnet |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID` | — | tras despliegue Testnet (Fase 10) | tras aprobación Mainnet |
| `NEXT_PUBLIC_STELLAR_EXPLORER_BASE` | — (prohibido enlazar) | `https://stellar.expert/explorer/testnet` | `https://stellar.expert/explorer/public` |

Reglas no negociables registradas: en `demo` nunca se generan enlaces de explorador ni textos de verificación real; red, contrato y explorador nunca se cruzan entre entornos; ningún secreto aparece en diff, logs ni manifiestos.

## Pendientes heredados a fases siguientes

- Instalación limpia `pnpm install --frozen-lockfile` se validará en Fase 9 junto a la eliminación de `package-lock.json` y fijación de `packageManager`.
- No existen pruebas automatizadas en el repo; Fase 1 introduce el runner y las primeras suites de dominio.
