# Handoff - CulturaGO Stellar

> **Estado de auditoría, 26-ago-2026.** Refleja el estado real del repositorio y los bloqueadores que aún deben cerrarse antes del deploy productivo.

## Gates actuales

| Gate | Resultado |
|---|---|
| `pnpm lint --max-warnings=0` | ✅ Pasa |
| `pnpm typecheck` | ✅ Pasa |
| `pnpm test` | ✅ 108/108 pasan (2 skipped por falta de PG) |
| `pnpm build` | ✅ Pasa |
| `pnpm audit --prod` | ✅ Sin vulnerabilidades productivas |
| `cargo test` contratos | ✅ 51/51 pasan |
| Build WASM | ✅ Pasa, hashes coinciden con manifiesto |
| `git diff --check` | ✅ Pasa |

**Nota:** los tests cubren lógica de dominio y mocks. No cubren PostgreSQL real, migraciones, WebAuthn real, Server Actions con PG ni E2E Testnet.

## Estado por fase

| Fase | Estado | Conclusión |
|---|---|---|
| 0 — Baseline | ✅ Cumplida | Working tree limpio, lint 0 warnings, CI con Node 22/pnpm 10, README/HANDOFF/architecture en actualización, dependencias mitigadas. |
| 1 — Readback | ✅ Cumplida | `stellar-gateway` tests verdes. |
| 2 — Auth / perímetro | ✅ Cumplida | `PasskeyService` y `PostgreSQLIdentityStore` alineados con digest de challenge; tests de passkey/sesión/claim verdes. |
| 3 — Passkey / XDR / WASM | Parcial | Implementación avanzada; allowlist de WASM vacía a la espera de aprobación. |
| 4 — Dashboard real | ✅ Cumplida | UUID → BytesN<32> implementado en gateway y SQL; `culturago_canonical_hash` corregida; `computeMetadataHash` usa `CanonicalHashService`. |
| 5 — Estado / reconciliación | ✅ Cumplida | `signed` persiste antes del submit; worker maneja `signed` y resubmit; `attempt_count`/`next_retry_at` con backoff. |
| 6 — E2E Testnet | No ejecutada | Sin evidencia E2E frontend. |
| 7 — Retiro de mocks | Parcial | Eliminados `src/lib/stellar.ts`, `src/lib/hashes.ts` y `testnet/grant-roles`; `src/lib/db.ts` (mock) sigue activo. |
| 8 — Build / CI | ✅ Cumplida | CI con Node 22/pnpm 10, lint estricto, audit y contratos test/build. |
| 9 — Documentación | En progreso | README, `architecture.md` y manifiesto en actualización. |
| 10 — Handoff | En progreso | Este documento refleja el estado actual. |

## Bloqueadores críticos residuales

1. **F5 — Emisión/revocación on-chain no completa.** Dashboard/organizer usan BD directa; no fluyen por `SorobanStellarGateway`.
2. **F6 — E2E Testnet no existe.**
3. **F7 — `src/lib/db.ts` (mock) sigue activo.**

## Supuestos y advertencias operativas

- Las migraciones `0001`–`0007` deben aplicarse en orden en PostgreSQL real.
- `0006_canonical_hash.sql` y `0007_chain_phase_values.sql` son idempotentes.
- No hay pruebas automáticas contra PostgreSQL: se necesita un entorno con `DATABASE_URL` para validar paridad SQL/TS.
- `hash_schema` 1 es el único aceptado por los contratos desplegados actualmente.

## Pasos recomendados

1. Validar migraciones `0001`–`0008` en base limpia y verificar `culturago_canonical_hash`.
2. Ejecutar tests de integración `PostgreSQLIdentityStore` contra `DATABASE_URL`.
3. Conectar emisión/revocación de credenciales con `SorobanStellarGateway` y `StellarWorker`.
4. Retirar `src/lib/db.ts` y los mocks restantes.
5. Completar E2E Testnet.
