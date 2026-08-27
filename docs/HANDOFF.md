# Handoff - CulturaGO Stellar

> **Estado de auditoría, 26-ago-2026.** Refleja el estado real del repositorio y los bloqueadores que aún deben cerrarse antes del deploy productivo.

## Gates actuales

| Gate | Resultado |
|---|---|
| `pnpm lint --max-warnings=0` | ✅ Pasa |
| `pnpm typecheck` | ✅ Pasa |
| `pnpm test` | ✅ 94/94 pasan |
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
| 2 — Auth / perímetro | Bloqueada | WebAuthn/Passkey pendiente de persistencia PostgreSQL y tests de integración. |
| 3 — Passkey / XDR / WASM | Parcial | Implementación avanzada; allowlist de WASM vacía a la espera de aprobación. |
| 4 — Dashboard real | Parcial | UUID → BytesN<32> implementado en gateway y SQL; `culturago_canonical_hash` corregida; falta ejecutar la paridad contra PostgreSQL real y unificar metadata hash. |
| 5 — Estado / reconciliación | Parcial | `prepareCredentialIssue` prepara; falta cerrar durabilidad de `signed` y recovery del worker. |
| 6 — E2E Testnet | No ejecutada | Sin evidencia E2E frontend. |
| 7 — Retiro de mocks | Parcial | Eliminados `src/lib/stellar.ts`, `src/lib/hashes.ts` y `testnet/grant-roles`; `src/lib/db.ts` (mock) sigue activo. |
| 8 — Build / CI | ✅ Cumplida | CI con Node 22/pnpm 10, lint estricto, audit y contratos test/build. |
| 9 — Documentación | En progreso | README, `architecture.md` y manifiesto en actualización. |
| 10 — Handoff | En progreso | Este documento refleja el estado actual. |

## Bloqueadores críticos residuales

1. **F1 — WebAuthn no persiste en PostgreSQL.** `PasskeyService` y `PostgreSQLIdentityStore` deben alinear challenge/digest y passkeys con el esquema.
2. **F2 — Signed payload no es duradero.** Crash window entre submit y save; `StellarWorker` no maneja fase `signed`; `attempt_count` no se incrementa ni hay backoff.
3. **F4 — Metadata hash aún no usa CanonicalHashPort.** `credentialMetadata.ts` usa SHA-256 simple. Decisión pendiente: `hash_schema` 1 vs 2 y `allow_hash_schema` on-chain.
4. **F5 — Emisión/revocación on-chain no completa.** Dashboard/organizer usan BD directa; no fluyen por `SorobanStellarGateway`.
5. **F6 — E2E Testnet no existe.**
6. **F7 — `src/lib/db.ts` (mock) sigue activo.**

## Supuestos y advertencias operativas

- Las migraciones `0001`–`0007` deben aplicarse en orden en PostgreSQL real.
- `0006_canonical_hash.sql` y `0007_chain_phase_values.sql` son idempotentes.
- No hay pruebas automáticas contra PostgreSQL: se necesita un entorno con `DATABASE_URL` para validar paridad SQL/TS.
- `hash_schema` 1 es el único aceptado por los contratos desplegados actualmente.

## Pasos recomendados

1. Validar migraciones en base limpia y verificar `culturago_canonical_hash`.
2. Implementar `PostgreSQLIdentityStore` y tests de integración WebAuthn.
3. Cerrar durabilidad de `signed` en `SorobanStellarGateway` y `StellarWorker`.
4. Migrar `computeMetadataHash` a `CanonicalHashPort` tras decidir `hash_schema`.
5. Completar E2E Testnet y retirar `src/lib/db.ts`.
