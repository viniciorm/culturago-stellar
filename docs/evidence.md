# Evidencia reproducible por fase

## Avance F2.3, F3.2, F4.2, F7.1 — 29 de agosto de 2026

**Implementado**

- **F2.3 Anti-toma/anti-enumeración**: `src/app/api/claim/route.ts`, `src/app/api/auth/login/options/route.ts`, `src/app/api/auth/login/verify/route.ts`, `src/app/api/auth/register/options/route.ts`, `src/app/api/auth/register/verify/route.ts` devuelven mensajes de error genéricos (`invalid or expired claim code`, `invalid authentication request`, `invalid authentication response`, `invalid registration request`, `unauthorized`) en lugar de detalles específicos. `tests/app/claim-route.test.ts`, `tests/app/login-route.test.ts` y `tests/app/register-route.test.ts` cubren códigos inválidos, consumidos, no pendientes, cuentas inexistentes, challenge de otra cuenta, respuesta replay/stale y ausencia de cookie de sesión. `docs/auth-stores.md` documenta los límites entre `InMemoryIdentityStore`, `PostgreSQLIdentityStore` y `createAuthBundle`.
- **F4.2 UI doble-clic**: `src/components/CredentialRevokeDialog.tsx` ahora bloquea múltiples clics en “Preparar revocación Stellar” con un estado `isPreparing` y deshabilita el botón mientras carga.
- **F7.1 Residuos del harness**: no quedan referencias a `STELLAR_HARNESS_RATE_LIMIT`, `grant-roles` ni `/smart-wallet` en `src/`, `tests/` o `.env.example`; se agregó aviso histórico en `docs/smart-wallet-e2e-remediation-plan.md`.
- **F3.2 E2E real con relayer**: `scripts/testnet-smart-wallet-deploy-e2e.mjs` despliega una smart wallet real en Stellar Testnet usando `PasskeyKit` con un WebAuthn software client, `PasskeyServer` y el relayer OpenZeppelin Channels. El fee payer es la wallet admin (`STELLAR_FEEPAYER_SECRET`/`STELLAR_FEEPAYER_ADDRESS`) con kill switch `CULTURAGO_ALLOW_TESTNET_MUTATIONS=true`. El contract id derivado y el tx hash se guardan en `docs/manifests/testnet-manifest.json`.

**Verificación (2026-08-29, post-cambios)**

- `pnpm lint --max-warnings=0` → cero warnings.
- `pnpm run typecheck` → limpio.
- `pnpm test` → **230/233 pasan**, 3 skipped por `DATABASE_URL`.

**Verificación F3.2 Testnet**

| Paso | Valor | Ledger |
|---|---|---|
| Smart wallet contract id | `CAW3QB5N4OLQ4CT3XRNJFTCEX7GNPGTAOJSS6ABM3CUTV2R44UZ5WKCG` | — |
| Deploy tx hash | `754e29c8ddf4064d68bd5a464cd0d629a277a54e28c8e6c3ffc40b8ea5b16b5b` | 1788047522 |

**Pendiente**: F6 “E2E Testnet completo desde frontend con passkey, adversariales, readback de permisos” requiere un navegador (Playwright) y una base de datos PostgreSQL para correr la app en modo testnet; o puede ejecutarse como E2E Node con el mismo flujo passkey/relayer.

## Avance F3.1, F4.2, F8.2, F9, F5-f, F6 — 29 de agosto de 2026

**Implementado**

- **F3.1 XDR/passkey**: `tests/infrastructure/soroban-stellar-gateway-xdr.test.ts` ahora cubre 16 casos adversariales con fixtures XDR reales; se agregaron `expired auth signature` y `RPC no disponible` en `enforcingSimulateAndAssemble`. `tests/lib/passkey-kit-signer.test.ts` (5 tests) cubre el signer cliente real: conexión de wallet, rechazo de passphrase distinta, firma con `latestLedger + 100`, fallback a `preparedAtLedger + 100` si el RPC falla, y rechazo si `signAuthEntry` devuelve una entrada idéntica.
- **F4.2 Gateway en UI**: nuevo `CredentialRevokeDialog` (`src/components/CredentialRevokeDialog.tsx`) con input de motivo de revocación y flujo completo `prepareCredentialRevoke` → `signAndSubmitOperation` → `updateCredential` en Stellar; integrado en la tabla de credenciales del evento (`src/app/dashboard/eventos/[eventId]/page.tsx`).
- **F8.2 Docker/TLS/health**: ruta `/api/health` (`src/app/api/health/route.ts`) con chequeo de base de datos y test `tests/app/health-route.test.ts`; `HEALTHCHECK` agregado a `deploy/Dockerfile`; `deploy/docker-compose.app.yml` extiende healthchecks para `app` y `postgres`, con `condition: service_healthy` para ordenar arranque y `caddy` dependiendo de app saludable.
- **F5-f Provisioning admin Testnet**: `scripts/testnet-exercise.mjs` ejecutó on-chain `grant_registrar`, `grant_issuer`, `grant_revoker` y `link_issuer_operator` desde el admin hacia una cuenta operator separada. Cada transacción incluye readback previo y fue confirmada en ledgers reales.
- **F6 E2E Testnet con cleanup**: flujo completo admin → roles → link → `register_entity` → `issue_credential` → `revoke_credential` → cleanup (`revoke_credential`, `unlink_issuer_operator`, `revoke_issuer`, `revoke_revoker`, `revoke_registrar`) ejecutado contra los contratos desplegados en Testnet. Ledger de inicio: 4403429; ledger de cleanup final: 4403440. Las cuentas admin y operator fueron fondeadas via Friendbot y la operator fue generada en la sesión.
- **F9 Documentación**: `docs/evidence.md`, `docs/testnet-manifest.json` y `docs/production-readiness-execution-plan.md` actualizados con estados completados, ledgers E2E reales y nueva baseline.

**Verificación (2026-08-29)**

- `pnpm lint --max-warnings=0` → cero warnings.
- `pnpm typecheck` → limpio.
- `pnpm test` → **220/223 pasan**, 3 skipped por `DATABASE_URL`.
- `pnpm build` → exitoso con Next.js 16.3.3 (Turbopack).
- `pnpm audit --prod` → sin vulnerabilidades conocidas.
- `pnpm contracts:lint/test/build` → 51/51 pasan, hashes WASM reproducibles.

**Verificación E2E Testnet (2026-08-29, contratos `CBUUM...JQGO` y `CBQPZ...2RJ6`)**

| Paso | Tx hash | Ledger |
|---|---|---|
| grant_registrar | `c1f1adec6fb810fa5c563121fe5ec3d2b5454e33eec2bbacdfe0197110a35c1d` | 4403429 |
| grant_issuer | `ad58042b90280c74184cc1606426182def0ed77e3949442a8cad8c2fc87f6c94` | 4403430 |
| grant_revoker | `79e05a7eb79a8892cfd488019abac1657cccd1a322eb4108593ff19f2388ec52` | 4403431 |
| link_issuer_operator | `aaa11efc2cb0b9b115ea2a6cc59c3d3ec441599a82c0ae28aa3db07c07f7a5d8` | 4403432 |
| register_entity | `b2792dc72a14a1a8e781b4fb2b0f1358991796544849eed021ba1a5217c712bc` | 4403433 |
| issue_credential | `8c5fd8a58a6b661fa5fdf4eb3f0bda7ebe53d0732bb1500315c2eecc788939eb` | 4403434 |
| revoke_credential | `ee486b33f8fb3b4b32ae9fa8fbe9ebe4b7f84f5f6b60a5b783fea1f88daa8703` | 4403435 |
| cleanup revoke_credential | `14b1ea487d47937d22358e943e98be9d17c6ec8729bf358d97b360146ad09f57` | 4403436 |
| cleanup unlink_issuer_operator | `551bf1f745d832972693ad9f04f9270b0f4d05480ba7ad701571126bb3c47e95` | 4403437 |
| cleanup revoke_issuer | `2ba8f4d49c7456ce10869ff525c0474957158ea722b6f2727b13aba8875ad87b` | 4403438 |
| cleanup revoke_revoker | `bc5ec0ca62fc7aecec077daaafcb8e765894e796ae1949610e48a699fd07e30b` | 4403439 |
| cleanup revoke_registrar | `0f5e22ed8c3d9526f67c4925a20840e7bfd6b2458b0010d6485c23ee30f94db4` | 4403440 |

**Pendiente / bloqueado**: F3.2 allowlist/deploy wallet requiere E2E con relayer; F8.3 branch protection en CI requiere configuración de GitHub; F10 infra/secrets/backup/restore/runbooks depende de entorno y aprobaciones.

---

## Producción y calidad — Fases 0, 4.2, 5.1, 7.1, 8.1, 9.1 (2026-08-29)

**Implementado**

- **F0 baseline**: `pnpm lint --max-warnings=0`, `pnpm typecheck`, `pnpm test` (191/194, 3 skipped por `DATABASE_URL`), `pnpm build`, `pnpm audit --prod` (clean), `pnpm contracts:lint/test/build` (51/51 tests Rust, WASM reproducibles) — todos verdes.
- **F4.2 Gateway en UI**: el dashboard de credenciales (`src/app/dashboard/credenciales/page.tsx`) emite y revoca credenciales en Stellar con `prepareCredentialIssue`/`prepareCredentialRevoke` y `signAndSubmitOperation`; `StellarStatusBlock` soporta `onSubmit`. Las `idempotencyKey` usan prefijos `issue:` y `revoke:` para que `/api/sign/submit` actualice `issuedLedger` y `revokedLedger`.
- **F5.1 Estado/polling**: `/api/operations/[operationId]` mantiene 404 uniforme y aplica `assertRateLimit` de 240/min por actor.
- **F7.1 Retiro del harness**: `src/app/api/sign/prepare/route.ts`, `src/infrastructure/harness/harnessHandler.ts` y `src/infrastructure/stellar/harnessGuard.ts` eliminados y commiteados. No quedan referencias a `harness` en `src/`.
- **F5.2 Worker runtime**: `parsePositiveInt` valida `STELLAR_WORKER_*`; `/api/metrics` expone `worker.staleMs` y `phases` (`countByPhase` en PostgreSQL e in-memory).
- **F9.1 Documentación**: `README.md` actualizado a Next.js 16.3, baseline pnpm, fallback en memoria y migraciones hasta `0011`; `docs/architecture.md` y `CODEMAP.md` refrescados; `testnet-manifest.json` actualizó `generatedAt`.

**Pendiente / bloqueado**: F6 E2E Testnet real requiere aprobación humana explícita para mutar Testnet; F8.2 Docker/TLS, F8.3 branch protection y F10 producción operativa dependen de decisiones externas.

---

## Fase 6 y 7 — Despliegue Testnet en VPS y gate final (2026-08-20)

**Implementado**

- `scripts/vps-deploy.mjs`: deploy automático con SSH, sube `.env`, `deploy/docker-compose.app.yml` y `deploy/Caddyfile`, build opcional con `SKIP_BUILD`, reutiliza `culturago-postgres` y recrea `culturago-app`/`culturago-caddy` sin tocar la base de datos.
- `deploy/docker-compose.app.yml`: puertos HTTP/HTTPS configurables via `CULTURAGO_HTTP_PORT` y `CULTURAGO_HTTPS_PORT`.
- `deploy/Caddyfile`: `tls internal` para Testnet con IP, cert autofirmado.
- `scripts/fase7-gate.mjs`: runner del gate local (install, lint, typecheck, test, build, contracts:build, contracts:test, cargo fmt) + smoke remoto (docker ps, caddy logs, HTTP/HTTPS curl).

**Verificación (2026-08-20)**

- `node --env-file=.env --env-file=.env.testnet scripts/fase7-gate.mjs` → **OK**:
  - `pnpm install --frozen-lockfile` ok
  - `pnpm lint` ok (sólo warnings)
  - `pnpm typecheck` ok
  - `pnpm test` → **85/85**
  - `pnpm build` ok
  - `pnpm contracts:build` ok
  - `pnpm contracts:test` → **51/51** (28 + 23)
  - `cargo fmt --all --check` ok
- Smoke remoto:
  - Contenedores `culturago-app`, `culturago-caddy` y `culturago-postgres` arriba
  - HTTP 308 redirect a HTTPS
  - Caddy obtuvo certificado autofirmado para `166.0.112.1`
  - App Next.js ready en `http://166.0.112.1:8080` / `https://166.0.112.1:8444`

**Pendiente / no en esta iteración**: WCAG 2.2 AA, matriz móvil, caos/performance, smart wallet signing real, revisión de seguridad/privacidad formal, y aprobación de Mainnet.

## Testnet readiness — Fases 0 a 5 (2026-08-19)

**Implementado**

- **Fase 0 baseline**: `.env` limpio para demo, `middleware.ts` usa `globalThis.crypto.randomUUID()` (no dependencias Node en Edge), `pnpm build` y `pnpm test` verdes.
- **Fase 1 backup/restore**: `scripts/postgres-backup.mjs` y `scripts/postgres-restore.mjs` con guardias (`POSTGRES_RESTORE_TARGET_GUARD` rechaza producción), medición RPO/RTO, dry-run por defecto; `docs/runbooks/postgres-restore.md` ampliado con variables y criterios.
- **Fase 2 VPS/HTTPS/PostgreSQL privado**: `deploy/Dockerfile` con pnpm 10 y lockfile congelado, args de build `NEXT_PUBLIC_*`; `deploy/docker-compose.app.yml` con `app`, `caddy` (HTTPS) y `postgres` en red privada sin publicar 5432; `deploy/Caddyfile` con headers de seguridad; `deploy/setup-vps.sh` archivado como legado.
- **Fase 3 ABI y golden vectors**: bindings `src/generated/stellar/{entity,credential}` con `stellar contract bindings typescript`; `fixtures/golden-vectors.json` versionado; `scripts/compute-golden-vectors.mjs` genera el fixture; `tests/infrastructure/canonical-hash.test.ts` lee vectores del fixture.
- **Fase 4 WebAuthn + smart wallet**: `PasskeyService` acepta `expectedOrigins` como lista; `factory.ts` requiere `WEBAUTHN_RP_ID` y `WEBAUTHN_ORIGINS` para testnet/mainnet (sin defaults); `.env.example` documenta todas las variables; `PasskeyKitSigner` recibe `acceptedWasmHashes` y `rpId` y expone `createWallet`/`connectWallet`; `sign()` aún requiere el contract client del dominio generado para `AssembledTransaction`.
- **Fase 5 smoke Testnet**: `scripts/testnet-smoke.mjs` dry-run con validación de entorno, lectura del manifiesto y flag `--execute` protegida por `CULTURAGO_ALLOW_TESTNET_MUTATIONS`; no se ejecuta deploy real sin fondos/cuentas.

**Verificación (2026-08-19)**:

- `pnpm build` → exitoso (middleware limpio, .env demo coherente).
- `pnpm typecheck` → limpio.
- `pnpm test` → **85/85** pasaron.
- `pnpm contracts:build` → exitoso con hashes reproducibles:
  - `cultural_entity_registry` → `76f229bf36817460e7eff531e8cc8b7967d3d419365edc2d8bd630298443a941` (13.346 B)
  - `cultural_credential_registry` → `6c1d1a64d48afd8e3be11f14036f44dbcdbdf2b7253eb82ec1b7833e00982d2b` (15.981 B)

**Fase 5 real ejecutada (2026-08-19)**:

- `scripts/testnet-smoke.mjs --execute` desplegó los contratos en Testnet (protegido por `CULTURAGO_ALLOW_TESTNET_MUTATIONS=true`):
  - `cultural_entity_registry` → `CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO`
  - `cultural_credential_registry` → `CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6`
- `scripts/testnet-exercise.mjs` ejercitó el flujo completo:
  - `register_entity` → retornó token `1`
  - `link_issuer_operator` → idempotente
  - `issue_credential` → retornó token `1`
- Se generó `.env.testnet` con los `contractId` listos.
- `docs/manifests/testnet-manifest.json` actualizado con los `contractId` desplegados.

**Restricciones siguientes**: `PasskeyKitSigner.sign()` sigue pendiente del contract client del dominio; Fase 6 requiere el despliegue real del app/VPS con HTTPS.

## Fase 8 — UX, identidad, smart wallet passkey-based y exportaciones (2026-08-19)

**Implementado**

- **Decisión SDK**: `@simplewebauthn/server` 13.3.2 + `@simplewebauthn/browser` 13.3.0 (mantenimiento activo, ampliamente auditado, compatible con Next.js 16 y Node 20+). `qrcode` 1.5.4 para exportación QR.
- **Esquema identidad** (migración 0002): `accounts`, `account_roles`, `issuer_operators`, `passkey_credentials`, `auth_challenges` (digest), `sessions` (digest), `account_claims`.
- **WebAuthn server-side** (`PasskeyService`): registro/autenticación con challenges de un uso, expiración corta, consumo atómico, anti-replay; verificación de origin, RP ID, flags, firma y counter.
- **Sesiones** (`SessionService`): token opaco en cookie `HttpOnly`/`Secure`/`SameSite=Lax`, expiración idle/absolute, rotación al autenticar, revocación por sesión/cuenta.
- **Resolución de actor** (`resolveActor`): roles e issuer scope cargados server-side desde DB; nunca desde la wallet o sesión sola.
- **Pasaporte** (`PassportService`): trayectoria reconstruida desde `stellar_indexed_events` por sujeto/evento; revocadas se conservan visibles.
- **Verificación pública** (`/verify/[credentialId]`, `/api/verify/[credentialId]`): estado, ledger, red, contrato, sujeto, emisor, evento.
- **Exportaciones**: JSON verificable (`/api/export/[credentialId].json`) y QR SVG (`/api/export/[credentialId].qr.svg`).
- **API routes**: `/api/auth/register/options|verify`, `/api/auth/login/options|verify`, `/api/auth/logout`, `/api/auth/me`.

**Verificación (2026-08-19)**:

- `pnpm typecheck` limpio.
- `pnpm test` → **85/85** pasaron:
  - `identity.test.ts` (6 tests): cuenta, challenge single-use/expiración, roles vs issuer scope separados, sesión create/validate/revoke, rotación invalida vieja, idle expiry.
  - `stellar-worker.test.ts` (7 tests) sigue pasando.
- `npx eslint` limpio en archivos nuevos.

**Pendiente / no en esta iteración**: smart wallet contract signing con Passkey Kit SDK y WASM allowlist, claim/recovery UI con step-up, PDF export, y panel del organizador.

## Fase 8 (continuación) — Smart wallet, claim/recovery, PDF, panel organizador (2026-08-19)

**Implementado**

- **Smart wallet**: `passkey-kit` 0.16.5 instalado; `SmartWalletConfig` con allowlist WASM por entorno; `PasskeyKitSigner` client-side listo para conectar wallet y firmar (requiere contract client generado para `AssembledTransaction`).
- **Claim/recovery**: `ClaimService` con códigos de un uso, expiración, anti-enumeración, activación de cuenta y recuperación sin cambiar `subject_id` ni wallet.
- **PDF export**: `/api/export/[credentialId].pdf` genera PDF simple accesible sin dependencias externas.
- **Panel organizador**: `/organizer` con acciones de check-in, emisión y revocación.
- **Consent signing API**: `/api/sign/prepare` y `/api/sign/submit` para el flujo interactivo.

**Verificación (2026-08-19)**:

- `pnpm typecheck` limpio.
- `pnpm test` → **85/85** pasaron.

**Notas**: la firma smart wallet completa requiere generar el contract client del dominio con `passkey-kit-sdk`; el adapter `PasskeyKitSigner` está listo para conectarlo. El relayer/fee sponsorship se configurará con credenciales server-only cuando se apruebe.

## Fase 9 — Calidad, observabilidad y supply chain (2026-08-19)

**Implementado**

- **Supply chain**: `packageManager` fijado a `pnpm@10.0.0`; `package-lock.json` eliminado; `pnpm-lock.yaml` único lockfile; `.env` ajustado a `demo` para build reproducible sin valores reales.
- **Build estricto**: `typescript.ignoreBuildErrors` eliminado de `next.config.ts`; rutas de export movidas de `[credentialId].json` a `[credentialId]/json` para evitar el error de tipos de Next.js con puntos en segmentos dinámicos; `pnpm build` pasa.
- **Logs estructurados**: `Logger` (`src/infrastructure/observability/Logger.ts`) con JSON, redacción de PII/secrets, contexto `correlationId/idempotencyKey/network/contractId/method/phase/ledger/code`, integrado en `StellarWorker`.
- **Correlation/Idempotency**: middleware `src/middleware.ts` inyecta `x-correlation-id` e `idempotency-key` en API routes y `Logger.setContext`. Migración 0004 agrega `correlation_id` y `context` a `stellar_operations` y tabla `log_lines`.
- **Métricas/alertas**: `Metrics` (`src/infrastructure/observability/Metrics.ts`) con contadores/gauges; `/api/metrics` expone snapshot y health de PostgreSQL. `StellarWorker` emite `stellar.worker.signature` y `stellar.worker.reconcile`.
- **WCAG básica**: `lang="es"` en `src/app/layout.tsx`.

**Verificación (2026-08-19)**:

- `pnpm install --frozen-lockfile` → ok (solo `pnpm-lock.yaml`).
- `pnpm typecheck` → limpio.
- `pnpm test` → **85/85** pasaron.
- `pnpm build` → exitoso (sin `ignoreBuildErrors`).
- `pnpm lint` → reporta advertencias/errores preexistentes en `src/lib/db.ts` y `src/app/dashboard/*` (UI legacy/mock no tocada en esta fase); nada en archivos nuevos.

## Fase 10 — Testnet, artefactos y readiness de despliegue (2026-08-19)

**Implementado**

- **Stellar CLI verificado**: `stellar --help` y `stellar contract build --help` confirmados; build con `stellar contract build --manifest-path contracts/Cargo.toml --locked`.
- **WASM reproducible**: ambos contratos compilados; checksums registrados:
  - `cultural_entity_registry` → `76f229bf36817460e7eff531e8cc8b7967d3d419365edc2d8bd630298443a941`
  - `cultural_credential_registry` → `6c1d1a64d48afd8e3be11f14036f44dbcdbdf2b7253eb82ec1b7833e00982d2b`
- **Manifiesto Testnet**: `docs/manifests/testnet-manifest.json` sin secretos (hash WASM, versión passkey-kit, herramientas).
- **Smoke script**: `scripts/testnet-smoke.sh` (dry-run, requiere aprobación y fondos Testnet).
- **Runbook restore**: `docs/runbooks/postgres-restore.md`.
- **Decisión upgradeability**: `docs/decisions/upgradeability.md` (dominio sin Upgradeable/Pausable; smart wallet allowlist separada).
- **Revisión seguridad/privacidad**: `docs/review/security-privacy-checklist.md`.
- **Gate Mainnet**: `docs/gates/mainnet.md` (acción separada y explícitamente autorizada).

**Verificación (2026-08-19)**:

- `pnpm install --frozen-lockfile` → ok.
- `pnpm typecheck` → limpio.
- `pnpm test` → **85/85** pasaron.
- `pnpm build` → exitoso.
- `pnpm contracts:lint` → `cargo fmt --check` y `cargo clippy --workspace --all-targets` limpios.
- `pnpm contracts:test` → **23/23** pasaron.
- `stellar --help` → CLI presente y funcional.

**No ejecutado**: despliegue real a Testnet y smart wallet con fondos reales; requiere aprobación, cuentas/fondos Testnet y hash WASM allowlist.

## Fase 7 — Outbox, workers, indexador, reconciliación y TTL (2026-08-19)

**Implementado**

- **Migración 0003**: `stellar_operations` ahora soporta lease de worker (`claimed_by`, `claimed_until`, `max_attempts`, `next_retry_at`), `stellar_events` inbox con deduplicación por `(network, contract_id, ledger, event_index)`, `stellar_cursors` para reinicio/backfill, `stellar_indexed_events` para proyección por sujeto/evento/entidad, `stellar_ttl_jobs` para restauración/alertas.
- **PostgreSQLOperationStore**: outbox durable con `claimBatch` usando `FOR UPDATE SKIP LOCKED` en una transacción atómica. El intento, intento y lease se actualizan juntos.
- **SorobanStellarGateway.reconcile()**: poll + readback para operaciones `submitted`/`confirming`/`unknown`/`restoring`/`failed_retryable`. Idempotente; nunca reenvía a ciegas.
- **StellarWorker**: consume `claimBatch`, separa `awaiting_signature` (firma con SignerPort) de reconciliación; un worker abortado libera el lease por expiración; otro worker reclama el trabajo.
- **Indexer**: `StellarIndexer` port con `InMemoryIndexer` (dedup, cursors, rebuild de proyecciones) y `PostgreSQLIndexer` (ingesta transaccional, dedup por constraint, proyección reconstruible desde eventos).
- **TTL / restore**: `StellarTtlQueue` port con `InMemoryTtlQueue` y `PostgreSQLTtlQueue`; `claimDue` con `FOR UPDATE SKIP LOCKED`, `getAtRisk` para alertas antes del vencimiento.

**Verificación (2026-08-19)**:

- `pnpm typecheck` limpio.
- `pnpm test` → **79/79** pasaron:
  - `stellar-worker.test.ts` (7 tests): worker firma y confirma, reconciliación de `unknown`, dos workers concurrentes no reclaman la misma operación, indexer deduplica y reconstruye pasaporte, TTL job claim/resolve.
- `npx eslint` limpio en archivos nuevos.

**Notas**: los 127 problemas de lint preexistentes en `src/lib/` no afectan a esta fase. El mock viejo `src/lib/stellar.ts` sigue marcado como obsoleto; su reemplazo completo entra con la UI en Fase 8.

## Fase 6 — Gateway Soroban, preparación de transacción y estados reales (2026-08-19)

**Implementado**

- **Puertos**: `SignerPort` (firma separada; el servidor NUNCA custodia clave/seed/passkey), `SorobanTransport` (simulate/submit/poll/readback/verifySignedMatches), `OperationStore` (idempotency key atómica), `StellarGateway` extendido a dos fases: `prepare*` (hasta el límite de firma) + `submitSigned`.
- **Máquina de estados** (`domain/operations/operationState.ts`): 9 fases con transiciones explícitas; `unknown`/`restoring` reconciliables pero nunca reenvío a ciegas (`mustNotResubmit` cubre submitted/confirming/unknown/restoring/terminal).
- **`SorobanStellarGateway`**: pipeline completo — intención con fingerprint sha256, simulación, detección de restauración, preparación, verificación firma↔intención (hash de tx Stellar excluye firmas: igualdad de hashes prueba mismo cuerpo), submit, poll, readback contractual ANTES de `confirmed`. Un tx hash jamás marca confirmado.
- **`SdkSorobanTransport`**: adaptador real sobre `@stellar/stellar-sdk` 16.2.0 (simulate → prepareTransaction → send → getTransaction). Errores RPC/contrato mapeados a códigos de dominio sanitizados (secretos S… enmascarados). `Option<T>` de Soroban: None=void, Some=valor plano.
- **`MockStellarGateway` fiel**: MISMO gateway real sobre `InMemoryChainTransport` (semántica de los contratos en memoria: idempotencia, claves de negocio, revocación aislada). La suite Liskov cubre ambos a la vez por construcción.
- **Config tipada** (`networkConfig.ts`): passphrase/RPC/IDs/allowlist WASM/explorador nunca se cruzan entre entornos; demo lanza error si se intenta config de chain. Fixture signer Testnet con doble guarda (`testnet` + `CULTURAGO_ALLOW_TESTNET_FIXTURE_SIGNER=true`), etiquetado como fixture, no como sesión de usuario.

**Verificación (2026-08-19)**: `pnpm test` → **72/72** (14 nuevos en la suite Liskov del gateway: readback antes de confirmed, idempotencia, conflicto de payload, payload firmado manipulado rechazado, signer≠actor rechazado, re-submit bloqueado, timeout→unknown reconciliable); `pnpm typecheck` limpio; `npx eslint` limpio en archivos nuevos.

**Notas**: el mock viejo `src/lib/stellar.ts` (prototipo UI con hashes falsos) queda obsoleto — la demo debe migrar a `MockStellarGateway` en la fase de UX (Fase 8). Los 127 problemas de lint en `src/lib/` son preexistentes a esta fase.

## Fase 5 — Pruebas adversariales de contratos (2026-08-18)

**Implementado**

- `src/adversarial.rs` en cada crate (25 tests nuevos, además de los 26 de Fase 4):
  - **Auth real**: `register_requires_operator_auth` ejecuta SIN `mock_all_auths` y verifica que el host rechaza la invocación sin firma (no es un error de dominio).
  - **Combinaciones rol/vínculo**: rol ISSUER sin vínculo → `IssuerOperatorNotLinked`; vínculo sin rol → `Unauthorized`; vínculo a otro `issuer_id` no transfiere scope; issuer no revoca y revoker no emite (roles disjuntos).
  - **Aislamiento**: revocar A nunca cambia B; mismo sujeto en Evento A y B produce credenciales independientes; `token_id` nunca retrocede tras revocación.
  - **Claves de negocio alternativas**: conflicto con `credential_id` distinto pero misma clave; conflicto reutilizando `credential_id` con otra clave.
  - **Doble envío**: tres emisiones consecutivas idénticas devuelven el mismo `token_id` sin duplicar estado.
  - **Fallos limpios**: registro con esquema desconocido, desactivación/versionado de entidad inexistente → error tipado, cero eventos, cero estado parcial.
  - **Historia inmutable**: v1 intacta tras dos versionados + desactivación.
  - **TTL**: todas las entradas persistentes (head, versiones, índices ById/ByToken/ByBusinessKey) quedan por encima del umbral tras escritura, verificado con `get_ttl`.
  - **Admin**: no es registrar implícito; transferencia admin expira pasado `live_until_ledger` y el admin original sigue vigente.
  - **Eventos exactos**: tópicos distinguibles (`entity_registered`/`entity_versioned`, `issuer_operator_linked`), unlink no-op sin evento duplicado.

**Baseline de presupuesto (última invocación, host nativo; no incluye instanciación WASM ni rent)**

| Operación | Instrucciones | Write bytes | Event bytes |
|---|---|---|---|
| `register_entity` | 142.198 | 644 | 324 |
| `version_entity` | 145.212 | 644 | 320 |
| `deactivate_entity` | 94.169 | 292 | 252 |
| `issue_credential` | 286.956 | 1.352 | 536 |
| `revoke_credential` | 183.237 | 812 | 292 |
| `verify_credential` | 49.644 | 0 | 0 |

WASM: entity 13.346 B, credential 15.981 B (Fase 4).

**Verificación (2026-08-18)**: `cargo test --workspace` → **51/51**; `cargo fmt --check` y `cargo clippy --workspace --all-targets` limpios.

## Fase 4 — Workspace y dos contratos de dominio (2026-08-18)

**Implementado**

- Workspace `contracts/` con exactamente dos crates de dominio, sin llamadas contract-to-contract ni contrato smart-wallet propio: `cultural-entity-registry` (registro v1 idempotente, versionado optimista `expected_version`, desactivación sin borrar historia, verificación pública) y `cultural-credential-registry` (atestaciones no transferibles, `token_id` monotónico, índice por ID/token/digest de clave de negocio, revocación idempotente por razón, catálogo de tipos 1..=6).
- Versiones fijadas verificadas en crates.io: `soroban-sdk =26.1.1`, `stellar-access =0.7.2` (AccessControl requiere `soroban-sdk ^26.1.0`, confirmado vía API de crates.io).
- OpenZeppelin Stellar `AccessControl`: admin superior, roles `registrar`/`issuer`/`revoker`, transferencia admin en dos pasos con expiración en ledger, eventos de roles. Sin Pausable/Upgradeable (decisión documentada en `docs/soroban-contract-architecture.md`).
- Emitir/revocar exige simultáneamente rol + `operator.require_auth()` + vínculo `IssuerOperator` activo (administrado solo por admin, idempotente, con eventos). Un rol global no permite suplantar otro emisor.
- Errores `#[contracterror]` tipados, eventos con tópicos indexables, storage instance (config/roles) vs persistent (heads/versiones/registros/índices), TTL con umbral 50k y extensión a 500k ledgers en cada lectura/escritura relevante. Sin `Temporary`.
- Scripts: `pnpm contracts:test`, `contracts:lint`, `contracts:build`; `.gitignore` para `contracts/target/` y snapshots.

**Verificación (2026-08-18, Rust 1.97/clippy, stellar-cli v27.1.0)**

- `cargo test --workspace` → **26/26 tests pasan** (12 entity + 14 credential), incluyendo adversariales: rol sin vínculo, tipo/esquema desconocido, conflicto de versión, doble revocación con razón distinta, suplantación de emisor.
- `cargo fmt --all --check` y `cargo clippy --workspace --all-targets` limpios (lint `too_many_arguments` permitido a nivel workspace: firmas dictadas por el dominio).
- `stellar contract build` → WASM release reproducible: `cultural_entity_registry.wasm` (13.346 B), `cultural_credential_registry.wasm` (15.981 B), target `wasm32v1-none` (requerido por Rust 1.84+; `wasm32-unknown-unknown` ya no es soportado por el entorno Soroban).

**Gotchas documentadas**

- `stellar-access` activa la feature `experimental_spec_shaking_v2` de soroban-sdk → el WASM solo se construye con `stellar contract build`, no con `cargo build` plano.
- En SDK 26, `env.events().all()` refleja el frame de la última invocación: en tests hay que leer eventos inmediatamente tras la mutación, antes de cualquier otro call.
- `#[contractevent]` publica el tópico 0 como el nombre del tipo en snake_case (`entity_registered`).
- `access::has_role` desde tests requiere `env.as_contract(contract_id, ...)` (storage no accesible fuera del contexto del contrato).
- `grant_role_no_auth`/`revoke_role_no_auth` en stellar-access 0.7.2 toman `caller: &Address` (cuarto argumento) para los datos del evento.

## Pivote arquitectónico (2026-08-18)

**Decisión (plan actualizado)**: sin Supabase. Persistencia = PostgreSQL directo en VPS (privado, `DATABASE_URL` server-only). Autenticación = smart wallet Stellar + passkeys, recién en Fase 8; antes no hay login ni sesiones.

**Removido**: `@supabase/supabase-js`, `@supabase/ssr`, `src/infrastructure/supabase/` (3 archivos), `src/proxy.ts`, `src/app/login/actions.ts` + `LoginForm.tsx`, `supabase/migrations/` (0001/0002 RLS), `supabase/tests/rls_verification.sql`, rama Supabase de `src/lib/db.ts` (ahora mock-only demo).

**Nuevo**:
- `database/migrations/0001_core_schema.sql` (dominio, sin `auth.users`) y `0002_identity_prep.sql` (accounts, roles, issuer_operators, passkeys, challenges, sesiones, claims — INACTIVAS hasta Fase 8).
- `database/migrate.mjs` (runner con tracking `schema_migrations`, transaccional).
- `src/infrastructure/database/pool.ts` (pool acotado, timeouts explícitos, `withTransaction`, errores PG→dominio) y `PostgreSQLDatabaseGateway.ts` (adaptador del puerto con SQL parametrizado).
- `src/infrastructure/auth/actorContext.ts` (`ActorContext` explícito, `assertRole`/`assertIssuerScope`, `createTestActor` marcado como service identity).
- `.env.example` reescrito (`DATABASE_URL` server-only; sin claves Supabase).
- Deps fijadas: `pg@8.23.0`, `@types/pg@8.23.1`.

**Verificación**: `pnpm test` 58/58, `tsc --noEmit` pasa, `pnpm run build` pasa (15 rutas). Pendiente: ejecutar migraciones contra PostgreSQL real del VPS (requiere `DATABASE_URL` + aprobación), suite de contrato del gateway contra DB aislada.

## Fase 1 — Dominio y casos de uso (2026-08-17)

**Implementado**

- `src/domain/`: `errors.ts` (errores tipados), `entities/entity.ts` (registro idempotente, versionado optimista con `expected_version`, desactivación sin borrar historia), `credentials/catalog.ts` (catálogo versionado v1, 6 tipos con códigos u32), `credentials/credential.ts` (clave de negocio `issuer|subject|event|type`, emisión idempotente, revocación con historial e idempotencia por razón), `participation/participation.ts` (máquina `registered -> checked_in -> participation_confirmed -> credential_issued`), `participation/relationships.ts` (matriz origen/destino/contexto + detección de ciclos), `passport/passport.ts` (proyección estable multi-evento con vigentes, pendientes y revocadas).
- `src/ports/`: `DatabaseGateway`, `StellarGateway` (fases `signing|submitted|confirming|confirmed|failed_retryable|failed_terminal|unknown|restoring`), `CanonicalHashPort`, `WalletGateway`.
- `src/application/use-cases/`: `manage-participation`, `issue-credential`, `revoke-credential` (+`verifyCredential`), `manage-entity`, `get-passport-trajectory`.
- `tests/fixtures/inMemoryDatabaseGateway.ts`: doble con mismas restricciones de unicidad/transición.
- Runner: `vitest@4.1.10` (devDependency fijada con `--save-exact`), `pnpm test` / `pnpm typecheck`.

**Verificación (2026-08-17)**

- `pnpm test` → 5 archivos, **39/39 tests pasan**.
- `pnpm exec tsc --noEmit` → pasa.
- `pnpm exec eslint src/domain src/application src/ports tests` → limpio (los 72 errores de lint restantes son preexistentes en `src/lib`, `src/components`, `src/app`).
- El dominio no importa React, Next.js, Supabase ni Stellar SDK (solo imports relativos).

## Fase 2 — Supabase, auth, RLS (2026-08-17, parcial)

**Decisión**: Supabase Auth aprobado por el usuario, con variables de entorno reales (sin entorno local separado, directo contra proyecto de producción). Passkeys habilitadas via `experimental.passkey`.

**Implementado**

- `supabase/migrations/0001_core_schema.sql`: reescritura del esquema con enums, FKs estrictas, claves de negocio únicas (`credentials.issuer+subject+event+type`, `relationships` con `NULLS NOT DISTINCT`, `participations.subject+event`), historial append-only (`entity_versions`, `participation_transitions`), `issuer_operators` (vínculo institucional), `user_profiles`, `stellar_operations` (outbox).
- `supabase/migrations/0002_rls.sql`: RLS en las 14 tablas, helpers `current_app_role`/`is_operator_of`/`owns_entity`/`is_event_organizer`, políticas con alcance institución+evento, `stellar_operations` solo service_role, vista pública `public_credential_verification` sin PII.
- `supabase/tests/rls_verification.sql`: 5 tests ejecutables (anon solo ve público, anon no inserta, operador sin vínculo no emite, historial no actualizable, outbox inaccesible).
- `src/infrastructure/config/env.ts`: carga estricta, demo rechaza vars Stellar, passphrase validada contra testnet/mainnet, explorador prohibido en demo.
- `src/infrastructure/supabase/`: `browser.ts` (anon + passkeys), `server.ts` (cookies + service role aislado), `SupabaseDatabaseGateway.ts` (adaptador del puerto, traduce 23505/23503 a errores de dominio).
- `src/infrastructure/auth/dal.ts`: `getSessionContext` cacheado con `auth.getUser()` validado en servidor, `requireSession`/`requireRole`/`requireIssuerScope`.
- `src/proxy.ts` (Next.js 16: `middleware` renombrado a `proxy`, Node runtime): refresh de sesión + redirect; autorización re-verificada en DAL. Login real (`src/app/login/`): mock `admin@culturago.cl/admin123` en sessionStorage ELIMINADO, reemplazado por Server Action con `signInWithPassword`; `dashboard/layout.tsx` ahora es Server Component con `requireRole`.
- Deps fijadas: `@supabase/supabase-js@2.111.0`, `@supabase/ssr@0.12.4`, `server-only@0.0.1`.
- Puerto `DatabaseGateway.saveEntityRecord` ahora recibe `NewEntityDetails` obligatorios en primera inserción (sin placeholders).

**Verificación**: `tsc --noEmit` pasa; `vitest` 39/39. Pendiente: correr migraciones y tests RLS contra el proyecto real (requiere `.env.local` con credenciales), reemplazo del mockDb en páginas del dashboard, y generación de tipos DB.

## Fase 3 — Hash canónico y metadata (2026-08-17)

**Implementado**

- `src/infrastructure/hashing/canonicalize.ts`: canonicalización JCS (claves ordenadas por UTF-16, sin whitespace, rechazo de undefined/funciones/NaN/Infinity/ciclos con errores tipados). Sobre de separación de dominio: `SHA-256("CULTURAGO\0" || schemaId || "\0" || bytes)`.
- `sha256Web.ts` (WebCrypto) y `sha256Node.ts` (node:crypto) como backends inyectados en `createCanonicalHashPort`.
- `src/domain/metadata/metadataUri.ts`: `culturago:entity:v1:<uuid>` y `culturago:credential:v1:<uuid}`, estables, sin versión en la URI.
- `tests/infrastructure/canonical-hash.test.ts`: 3 vectores golden congelados verificados contra AMBOS backends (paridad browser/Node probada), rechazo de esquemas desconocidos.
- `scripts/compute-golden-vectors.mjs`: recomputa los vectores (los primeros calculados inline por shell salieron corruptos por mangling de PowerShell; el script es la fuente de verdad reproducible).
- `tests/contracts/databaseGateway.contract.ts`: suite de contrato Liskov (unicidad de clave de negocio, historial no-reducible, búsquedas por clave) ejecutada contra el adaptador in-memory; lista para repetir contra Supabase.
- `hash_schema` persistido desde Fase 2 (`entity_versions.hash_schema`, `credentials.hash_schema`, ambos CHECK > 0).

**Verificación (2026-08-17)**: `vitest` **58/58 verdes** (7 archivos), `tsc --noEmit` pasa.

**Aceptación cubierta**: Evento B crea otra credencial sin tocar A; no existe operación para anexar eventos a una credencial; revocar A conserva A visible y B vigente; operador sin vínculo `issuer_id` rechazado aunque tenga rol en otra organización; `participant_of` sin confirmación no habilita emisión; `issuedIntentAt` (servidor) separado de `issuedLedger` (derivado on-chain, null hasta readback).
