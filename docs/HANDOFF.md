# Handoff - CulturaGO Stellar

> **Auditoría del estado real, 26-ago-2026.** 

## Gates actuales

| Gate | Resultado |
|------|-----------|
| `pnpm typecheck` | ✅ Pasa |
| `pnpm test` | ✅ 88/88 pasan |
| `pnpm build` | ✅ Pasa |
| `pnpm lint` | ✅ 0 errores, 42 warnings |
| `pnpm lint --max-warnings=0` | ❌ Falla |
| `pnpm audit --prod` | ❌ Pendiente de correr con pnpm (falló con npm por no-lockfile) |
| `cargo test` contratos | ✅ 51/51 pasan |
| Build WASM | ✅ Pasa, hashes coinciden con manifiesto |
| `git diff --check` | ✅ Pasa |

**Nota:** los 88 tests cubren lógica de dominio y mocks. No cubren PostgreSQL, migraciones, WebAuthn real, Server Actions ni E2E Testnet.

## Estado por fase

| Fase | Estado auditado | Conclusión |
|------|-----------------|------------|
| 0 — Baseline | Parcial | Gates ejecutados, pero el working tree tiene decenas de archivos sin organizar, CI incompatible y vulnerabilidades abiertas. |
| 1 — Readback | ✅ Cumplida | Regresión corregida; `stellar-gateway` tests verdes. |
| 2 — Auth / perímetro | Bloqueada | Dashboard tiene guard, pero login, WebAuthn PG y endpoints mutantes siguen incompletos. |
| 3 — Passkey / XDR / WASM | Parcial | Implementación avanzada, faltan tests XDR reales; allowlist de WASM aprobada. |
| 4 — Dashboard real | Bloqueada | CRUD PG parcial; IDs/UUID pasan al contrato como si fueran `BytesN<32>` y el flujo contractual no funciona E2E. |
| 5 — Estado / reconciliación | Parcial | `prepareCredentialIssue` prepara, pero la UI descarta el `operationId` y no firma/envía/poll. |
| 6 — E2E Testnet | No ejecutada | No hay evidencia E2E frontend ni cleanup. `/smart-wallet` todavía llama a `/api/testnet/grant-roles`, que fue eliminado. |
| 7 — Retiro de mocks | Parcial | Eliminados `src/lib/stellar.ts`, `src/lib/hashes.ts` y `testnet/grant-roles`; `src/lib/db.ts` (mock) sigue activo. |
| 8 — Build / CI | No cumplida | CI con Node 20 / pnpm 9 cuando el proyecto pide Node ≥22 / pnpm ≥10; omite audit y contratos; Docker ignora errores de build. |
| 9 — Documentación | No cumplida | README, `architecture.md`, `supabase-schema.sql` y manifiesto siguen desactualizados. |
| 10 — Handoff | Documentada / diferida | Existe este documento, pero las responsabilidades operativas no están implementadas. |

## Bloqueadores críticos

1. **WebAuthn no funciona correctamente con PostgreSQL.** `PasskeyService` consume el challenge crudo, mientras PostgreSQL guarda SHA-256/digest. `auth_challenges.id` y `sessions.rotated_from` son UUIDs pero reciben otros formatos. Los tests usan solo `InMemoryIdentityStore`.
2. **La ruta PostgreSQL de operaciones Stellar sigue rota.** `chain_phase` no contiene `awaiting_signature` ni `signed`; `PostgreSQLOperationStore.save()` borra `signed_xdr` y `signer_address`, dejando una operación irrecuperable ante una caída.
3. **UUIDs pasan al contrato directamente.** `prepareCredentialIssue` envía `credentialId`, `issuerId`, `subjectId`, `eventId` como UUIDs en lugar de `BytesN<32>` de 64 hex. La preparación real falla.
4. **No se usa el hash canónico oficial.** `credentialMetadata.ts` usa SHA-256 simple; el proyecto tiene `CanonicalHashPort` con canonicalización recursiva y dominio. Los hashes no son equivalentes.
5. **Emisión y revocación no completan el ciclo on-chain.** En el dashboard, "revocar" actualiza PostgreSQL directamente. El panel organizer también emite/revoca con casos de uso de BD; no usa `SorobanStellarGateway`.
6. **El perímetro del harness no está protegido.** `/api/sign/prepare`, `/api/sign/submit` y `/api/smart-wallet/deploy` usan `assertTestnetHarnessAllowed` sin token obligatorio, sesión, rol/scope, CSRF ni rate limit.
7. **Fase 6 E2E no existe.** No hay evidencia de concesión/revocación de roles, unlink, XDR alterado, operaciones `unknown` reconciliadas, etc.
8. **CRUD PostgreSQL no están suficientemente probados.** Errores en `WHERE` de updates, `issued_by` usa `issuer_entity_id` en lugar de `accounts.id`, y no revalidan actor/rol. Faltan tests de integración.
9. **Lint warnings ocultan errores.** 42 warnings impiden `lint --max-warnings=0`.
10. **CI y dependencias desactualizadas.** CI usa Node 20 / pnpm 9; manifiesto tiene `ledger: null` y allowlist vacía; `next.config.ts` ignora erroles de build en Docker.

## Supuestos pendientes de validación

- Las tablas `0002_identity_prep.sql` y `0005_credential_title_description.sql` deben estar aplicadas en PostgreSQL. Marcos debe corroborar esto antes de deployar a producción.

## Pasos recomendados para Marcos

1. Corroborar que `0002_identity_prep.sql` y `0005_credential_title_description.sql` estén aplicadas en el Postgres objetivo.
2. Corregir `PasskeyService` y `PostgreSQLIdentityStore` para que el challenge/digest sean consistentes con el esquema.
3. Arreglar `PostgreSQLOperationStore` para no perder `signed_xdr`/`signer_address` y agregar los valores `awaiting_signature`/`signed` a `chain_phase`.
4. Derivar `BytesN<32>` desde UUIDs antes de llamar a `SorobanStellarGateway`.
5. Reemplazar SHA-256 simple por `CanonicalHashPort` en `credentialMetadata.ts`.
6. Implementar autorización productiva en `/api/sign/prepare`, `/api/sign/submit` y `/api/smart-wallet/deploy`.
7. Revisar y completar README, manifiesto y documentación de arquitectura.

## Contacto / dudas

- Cualquier error en producción probablemente esté en `src/lib/db.ts` (mock), en los endpoints que dependen de `assertTestnetHarnessAllowed`, o en la conversión UUID → `BytesN<32>`.
- Este handoff **no es un "estado completo"**; es una auditoría de bloqueadores para priorizar el trabajo restante.
