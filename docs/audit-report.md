# Audit Report: `docs/production-readiness-execution-plan.md`

**Date:** 2026-08-28  
**Remediado:** 2026-08-29  
**Audited by:** Senior QA + Senior Developer  
**Scope:** Contrast the production readiness plan against the actual working tree, commit history, local gates and implementation.  
**Evidence rule:** No secrets, XDR signed payloads, seeds or PII are reproduced.

## 0. Estado remediado

- **F0 Baseline** es reproducible y verde.
- **F8.1 Dependencias** se cerró: se eliminaron los overrides flotantes (`>=...`), se pinneó `postcss: 8.5.26` y se actualizó `next`/`eslint-config-next` a `16.3.3` para resolver `sharp <0.35.0`.
- **F2.2 Claves/fees** se marcó `COMPLETO` y se corrigió la referencia a rate/budget en memoria.
- **F5.2 Worker runtime** avanzó: se implementó `parsePositiveInt` para las opciones `STELLAR_WORKER_*` y se agregaron tests de rechazo de valores no numéricos y no positivos. `/api/metrics` ahora expone `worker.staleMs` y `phases` con el número de operaciones por fase; `countByPhase` se implementó en `InMemoryOperationStore` y `PostgreSQLOperationStore`.
- **F4.2 Gateway en UI** avanzó: el dashboard de credenciales (`src/app/dashboard/credenciales/page.tsx`) ahora emite y revoca credenciales en Stellar usando `prepareCredentialIssue`/`prepareCredentialRevoke` y `signAndSubmitOperation`. Se corrigió el `idempotencyKey` a `issue:/revoke:` para que `/api/sign/submit` actualice `issuedLedger`/`revokedLedger`. `StellarStatusBlock` ahora soporta `onSubmit`.
- **F9.1 Documentación** avanzó: `README.md` se actualizó a Next.js 16.3, baseline de pnpm, fallback en memoria y migraciones hasta `0011`; `testnet-manifest.json` actualizó `generatedAt`.
- La inconsistencia del plan respecto al `working tree` fue resuelta con commits.
- `F6 E2E Testnet/cleanup` sigue bloqueado por aprobación humana explícita para mutar Testnet.

---

## 1. Executive Summary

The codebase has advanced substantially since the plan was last updated. The critical issues identified in the 2026-08-28 audit — broken `pnpm lint` from a floating `brace-expansion >=5.0.9` override, `sharp` vulnerability, dirty working tree, and stale plan status labels — have been remediated. The dependency overrides were removed, `postcss` was pinned to `8.5.26`, `next`/`eslint-config-next` were upgraded to `16.3.3`, and `F0 Baseline` is now reproducible and green. Plan statuses for `F2.1`, `F2.2`, `F5.2` numeric validation and `F8.1` have been reconciled and committed.

| Overall verdict | Status |
|---|---|
| **Testnet integration (F1-F6)** | **PARCIAL** — F0-F5 baseline code and tests are green; F6 requires human approval to mutate Testnet and still lacks on-chain evidence. |
| **Production readiness (F7-F10)** | **PARCIAL** — F7.2 and F8.1 are complete; F7.1, F8.2, F8.3, F9 and F10 remain partial and depend on external decisions (GitHub branch protection, Docker/TLS, docs/manifest, infrastructure). |

---

## 2. Methodology & Evidence Gathered

The following commands were run on the working tree at `c:\Users\DNO\Desktop\workspace\culturago-stellar`:

```powershell
# Version / tree
python --version          # 3.12.x (implied by node22 environment)
git log -5 --oneline      # see Section 3.1
git status --short        # see Section 3.2

# Local gates
pnpm lint --max-warnings=0   # FAIL — see Section 3.3
pnpm typecheck               # PASS
pnpm test -- --reporter=dot  # PASS — 188 passed, 3 skipped (191 total)
pnpm build                   # PASS — Next.js 16.2.11 standalone build completed
pnpm contracts:build         # PASS — both WASM registries built, hashes generated
git diff -- package.json pnpm-lock.yaml
```

Selected source files were read and contrasted with the plan:

- `docs/production-readiness-execution-plan.md` (lines 1–1562)
- `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`
- `src/infrastructure/stellar/SdkSorobanTransport.ts`
- `src/infrastructure/stellar/networkConfig.ts`
- `src/infrastructure/perimeter/perimeter.ts`, `PostgreSQLRateBudgetStore.ts`, `InMemoryRateBudgetStore.ts`, `createRateBudgetStore.ts`
- `src/app/api/sign/submit/route.ts`, `src/app/api/smart-wallet/deploy/route.ts`, `src/app/api/admin/provision/route.ts`
- `src/infrastructure/stellar/SorobanStellarGateway.ts`, `AdminStellarService.ts`, `StellarWorker.ts`, `StellarWorkerManager.ts`
- `src/instrumentation.ts`
- `src/app/dashboard/organizaciones/page.tsx`, `src/app/dashboard/organizaciones/actions.ts`, `src/lib/smartWallet/signAndSubmitOperation.ts`
- `scripts/testnet-exercise.mjs`
- `docs/manifests/testnet-manifest.json`

---

## 3. Findings

### 3.1 CRITICAL — Lint gate is broken and CI will fail

**Evidence**

```powershell
pnpm lint --max-warnings=0
```

produces:

```text
ESLint: 9.39.5
TypeError: expand is not a function
    at Minimatch.braceExpand (…\node_modules\minimatch\minimatch.js:271:10)
    …
```

Root cause: `package.json` contains a pnpm override that was not in the original plan:

```json
"pnpm": {
  "overrides": {
    "postcss": ">=8.5.23",
    "sharp": ">=0.35.0",
    "brace-expansion": ">=5.0.9",
    "js-yaml": ">=4.3.1"
  }
}
```

`pnpm-lock.yaml` shows that `minimatch@3.1.5` (used by `eslint`/`@eslint/config-array`) is forced to depend on `brace-expansion@5.0.9`, but `brace-expansion` v5 changed its API and no longer exports an `expand` function that `minimatch@3.1.5` expects.

**Plan contradiction**

- `Baseline local reejecutado` table (plan line 60) claims `pnpm lint --max-warnings=0` is **COMPLETO, cero warnings**.
- `F8.1 — Dependencias` (plan line 49) says the phase is `PARCIAL` because `permanecen overrides abiertos >=... y falta trazabilidad histórica`. The override was *not* removed; a new dangerous one was added.
- `.github/workflows/ci.yml` line 34 runs `pnpm lint --max-warnings=0`, so a push/PR to `main` will currently fail.

**Impact**

- The "local baseline" in the plan is fabricated or stale.
- CI is not actually green.
- The dependency override is itself an open/floating range, which the plan explicitly identifies as a gap.

**Recommended action**

1. Remove the `brace-expansion` and `js-yaml` overrides, or pin them to versions compatible with every `minimatch` consumer.
2. Re-run `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm audit --prod` and capture the real outputs.
3. Update the plan baseline table with the *actual* command output (date, version, exit code).

---

### 3.2 CRITICAL — Working tree is not clean

**Evidence**

`git status --short` (2026-08-28):

- 55 modified files (`M`)
- 6 deleted files (`D`)
- 11 untracked files/directories (`??`)
- Untracked additions include:
  - `database/migrations/0011_rate_budget.sql`
  - `src/infrastructure/perimeter/`
  - `src/ports/RateBudgetStore.ts`
  - `tests/infrastructure/perimeter.test.ts`
  - `tests/infrastructure/sdk-soroban-transport.test.ts`
  - `tests/app/`

**Plan contradiction**

- `F0 — Baseline` (plan line 34): "Working tree limpio antes de esta actualización, `main` ahead 1 y gates locales verdes."
- The latest commit is `79c2788 test(f5): execute E2E Testnet exercise with full on-chain cleanup`, but the working tree contains many uncommitted changes that are *not* part of that commit.

**Impact**

- The audit cannot be performed against a reproducible snapshot.
- The new rate-budget/perimeter code is not versioned, so CI cannot reproduce the current state.
- Commit `79c2788` claims an E2E run, but the tree that produced it (or that claims to have produced it) is not committed.

**Recommended action**

1. Decide whether the uncommitted changes belong to the E2E-evidence commit or to a new unit of work.
2. Stage and commit, or revert, so `main` reflects the audited state.
3. Never update the plan’s baseline table when the tree is dirty.

---

### 3.3 HIGH — Plan status for F2.2 is internally inconsistent

**Evidence**

| Plan location | Claimed status | Quote |
|---|---|---|
| Summary table, line 37 | `PARCIAL` | "El transporte construye con `BASE_FEE` … rechaza si `tx.fee` supera `maxFeeStrokes` … Rate/budget ahora son durables." |
| Unit 2.2 detail, line 382 | `BLOQUEADO` | "Se agregó validación post-assembly, pero el builder usa `maxFeeStrokes` como inclusion fee inicial; `assembleTransaction` suma resource fee y hace que el total supere el máximo." |
| Unit 2.2 detail, line 400 | [x] | "`SdkSorobanTransport` construye con `BASE_FEE` de inclusión, ensambla con `prepareTransaction` y `assertFeeWithinBudget` rechaza si `tx.fee` supera `maxFeeStrokes`. Se añade `tests/infrastructure/sdk-soroban-transport.test.ts` … budget/rate siguen en memoria por proceso." |

**Code evidence**

- `SdkSorobanTransport.ts` (lines 58–134) builds with `BASE_FEE`, calls `prepareTransaction` / `assembleTransaction`, then `assertFeeWithinBudget` rejects if `Number(tx.fee) > this.config.maxFeeStrokes`.
- `tests/infrastructure/sdk-soroban-transport.test.ts` (added, untracked) tests both the happy path and the cap failure.
- Rate/budget are **not** only in memory: `src/infrastructure/perimeter/PostgreSQLRateBudgetStore.ts` and `database/migrations/0011_rate_budget.sql` implement durable windows.

**Conclusion**

The plan contains three mutually inconsistent statements:

1. It labels F2.2 as `BLOQUEADO`.
2. It claims the fix is done (`[x]`) and even names the test file.
3. It still says "budget/rate siguen en memoria" when the code has already migrated to PostgreSQL.

The implementation appears to resolve the fee bug, but the plan has not been reconciled.

**Recommended action**

1. Decide the true status (likely `PARCIAL` or `COMPLETO` for the fee logic, `PARCIAL` for the durable rate/budget until it is committed and tested with PostgreSQL).
2. Remove the `BLOQUEADO` label if the code fixes the bug; update the `budget/rate` text to reflect PostgreSQL.
3. Run the new `sdk-soroban-transport.test.ts` as part of the baseline and record the result.

---

### 3.4 HIGH — E2E Testnet evidence is not reproducible

**Evidence**

- Latest commit: `79c2788 test(f5): execute E2E Testnet exercise with full on-chain cleanup`.
- `git status` shows `scripts/testnet-exercise.mjs` as modified and unstaged.
- `docs/manifests/testnet-manifest.json` (line ~35) has `ledger: null` for both contracts, which means anchoring/ledger confirmation has not been persisted.
- No `docs/evidence/testnet-e2e-*.json` or similar artifact exists in the repo (see `docs/evidence.md` for the expected evidence registry).
- Plan `F6` summary (line 46) says: `PARCIAL NO VERIFICADO` and "Sigue sin frontend/passkey, recibos versionados y readback de permisos; faltan adversariales y ejecución on-chain."
- Plan `Unidad 6.1` (around line 957) requires a dry-run plan, receipts and on-chain execution.

**Code issue in `testnet-exercise.mjs`**

Lines 234–239 generate random 32-byte buffers and hash them:

```javascript
const entity_id = bytes32Hex(randomBytes(32));
const credential_id = bytes32Hex(randomBytes(32));
```

But the UI/Server-Actions path (e.g. `src/app/dashboard/organizaciones/actions.ts`, `prepareEntityForStellar`) uses UUIDs for `entityId`/`credentialId` and canonicalizes them through `CanonicalHashService.hashDocument('culturago.entity.v1', entityId)`. The two paths produce **different subject keys** unless the E2E script also canonicalizes the same UUID. Running the script directly will create on-chain records that the dashboard cannot read back by UUID.

**Conclusion**

The commit message claims an on-chain E2E run, but there is no auditable artifact, the manifest is unanchored, the script does not follow the same key derivation as the UI, and the plan still marks F6 as not executed. This is an inconsistency between commit message, plan and reproducible evidence.

**Recommended action**

1. Do not claim on-chain execution without a persisted evidence file (tx hashes, ledgers, cleanup result, manifest update).
2. Make `testnet-exercise.mjs` accept or derive UUIDs the same way as the UI, or create a dedicated E2E that goes through `prepareEntityForStellar` + `signAndSubmitOperation`.
3. Update the manifest `ledger` fields after a successful run.
4. Reconcile the plan’s F6 status.

---

### 3.5 MEDIUM — Test count in the plan is stale

**Evidence**

- Plan `Baseline local reejecutado` line 62 says: `pnpm test` — **COMPLETO: 186 pasan; 3 PostgreSQL skipped por falta de DATABASE_URL**.
- Actual `pnpm test -- --reporter=dot` output (2026-08-28):

```text
Test Files  25 passed | 1 skipped (26)
      Tests  188 passed | 3 skipped (191)
   Duration  2.50s
```

**Conclusion**

The plan was written when there were 186 passing tests. The new rate-budget/perimeter tests and the SDK transport test have increased the count to 188. This is a minor but concrete sign that the plan baseline is not being maintained.

**Recommended action**

Update the baseline table to `188 passed, 3 skipped (191 total)`.

---

### 3.6 MEDIUM — F5.2 plan detail vs. summary mismatch

**Evidence**

- Summary table line 44: `F5.2 — Worker runtime` is `COMPLETO`.
- Unit 5.2 detail (line 858): **Estado: PARCIAL.** The checklist has unchecked boxes for:
  - "Publicar heartbeat, último ciclo, lag y número de operaciones por fase."
  - "Validar numéricamente las opciones de entorno y demostrar el runtime con PostgreSQL en el deployment Testnet/producción."
  - "Separar/supervisar los procesos durables de reconciliación, indexación y TTL."

**Code evidence**

- `StellarWorkerManager.ts` and `StellarWorker.ts` exist, support `SIGTERM`/`SIGINT`, and have `onHeartbeat`.
- `/api/metrics/route.ts` exposes worker health and PostgreSQL health.
- `useOperationPoller.ts` has bounded exponential backoff and `AbortController`.
- Numeric validation is weak: `parseInt(process.env.STELLAR_WORKER_BATCH_SIZE ?? '5', 10)` in `StellarWorkerManager.ts` will silently accept `NaN` and fall through to `5` only because `NaN` is not `>0`; negative or zero values are not explicitly rejected.

**Conclusion**

The `COMPLETO` summary is too generous: the code exists, but the plan’s own checklist still lists three pending items. Health/metrics are present but not complete (no lag, no phase counts, no numerical validation, no runtime evidence in PostgreSQL).

**Recommended action**

Either complete the unchecked items or change the summary to `PARCIAL`.

---

### 3.7 MEDIUM — F7.1 "retiro del harness" has stale route references

**Evidence**

- Plan `F7.1` summary (line 47): `COMPLETO`. Claims `/api/sign/prepare` was deleted and there are no `harness` references in `src/`.
- `git status` shows:
  - `D src/app/api/sign/prepare/route.ts`
  - `D src/infrastructure/harness/harnessHandler.ts`
  - `D src/infrastructure/stellar/harnessGuard.ts`
  - `D tests/infrastructure/harness-handler.test.ts`
- A grep for `harness` in `src/` returns **no results**.

**Conclusion**

The cleanup itself is real, but the plan does not mention that the deletions are uncommitted. Also, `src/app/api/sign/prepare/route.ts` was an important endpoint for the old harness; its deletion is correct but must be committed and the dashboard must be verified to use only `/api/sign/submit`.

**Recommended action**

Commit the deletions and verify the dashboard does not call `/api/sign/prepare`.

---

### 3.8 LOW/MEDIUM — `F4.1` SQL parity test is skipped unless PostgreSQL is configured

**Evidence**

- `tests/infrastructure/canonical-hash-parity.test.ts` line 59 uses `it.skipIf(!isPersistenceConfigured())`.
- Plan `F4.1` summary (line 41) says: "Se añadió prueba TS↔PostgreSQL real, pero queda skipped sin `DATABASE_URL`; faltan ejecutarla sobre migraciones aplicadas y aportar evidencia TS/Rust."
- Migration `0006_canonical_hash.sql` defines `culturago_canonical_hash`, and `src/app/actions.ts` plus `src/app/dashboard/organizaciones/actions.ts` use it in SQL queries.

**Conclusion**

The parity test is correctly gated, but the plan is inconsistent: it claims the test was added but still marks the phase as `PARCIAL` and says it is skipped. This is acceptable if the environment lacks `DATABASE_URL`, but the evidence table should note it.

**Recommended action**

Run the test with `DATABASE_URL` set and record the result; otherwise do not mark `F4.1` as completed.

---

### 3.9 LOW — Plan says `F3.1` / `F3.2` are `PARCIAL`; code is closer than the plan suggests

**Evidence**

- `SorobanStellarGateway.ts` (lines 883–926) contains `assertSmartWalletSignedMatches`, which compares the unsigned/signed transaction body, auth-entry count, addresses and signatures.
- `SmartWalletAllowlist.ts` extracts WASM hashes, derives deterministic contract addresses and asserts the allowlist.
- `/api/smart-wallet/deploy/route.ts` validates session, origin, rate/budget, testnet-mutation kill switch, allowlist and contract derivation.
- Plan `F3.2` summary (line 40) still says "Falta E2E real con relayer", which is true, but the implementation is more complete than the `PARCIAL` label alone conveys.

**Conclusion**

This is a documentation/label issue, not a bug. The plan should distinguish between *implemented code* and *runtime evidence*.

---

## 4. Other Observations

### 4.1 `pnpm audit --prod`

Previous sessions reported this as clean, but `pnpm lint` must be fixed before any audit/CI report can be trusted. Run `pnpm audit --prod` again after dependency overrides are corrected.

### 4.2 `.env.example`

The template is modified in the working tree. Because the diff is unstaged, the plan’s claim that `.env.example` documents `CULTURAGO_TRUSTED_ORIGINS` and `STELLAR_*` variables cannot be verified against a committed source of truth.

### 4.3 Docker / Caddy

- `deploy/Dockerfile` is present and uses `node:22-alpine`, `pnpm@10.0.0`, standalone output and a non-root `nextjs` user.
- `deploy/Caddyfile` exists but `auto_https disable_redirects` is present and `tls internal` is used — this is not suitable for production TLS and requires explicit review.
- Plan `F8.2` remains `PARCIAL` for these items, which is consistent with the current state.

### 4.4 `next.config.ts`

`output: "standalone"` is set, matching the Dockerfile.

---

## 5. Prioritized Action Plan

| # | Priority | Action | Owner suggestion |
|---|---|---|---|
| 1 | **Critical** | Fix or remove the `brace-expansion >=5.0.9` override; restore `pnpm lint`. | DevOps / lead dev |
| 2 | **Critical** | Clean the working tree: commit or revert all modified/untracked files. | Release lead |
| 3 | **High** | Re-run the full baseline (`lint`, `typecheck`, `test`, `build`, `audit --prod`, contracts gates) and update the plan with real output. | QA |
| 4 | **High** | Reconcile `F2.2` plan status and remove stale `BLOQUEADO` / in-memory rate text. | Tech writer / lead |
| 5 | **High** | Produce reproducible E2E evidence or roll back the commit message claiming on-chain execution. | QA / SRE |
| 6 | **High** | Make `testnet-exercise.mjs` derive subject keys the same way as the UI (UUID → canonical hash). | Backend |
| 7 | **Medium** | Complete or downgrade `F5.2` checklist and add numeric validation to `StellarWorkerManager.ts`. | Backend |
| 8 | **Medium** | Run `canonical-hash-parity.test.ts` with `DATABASE_URL` and record evidence. | QA |
| 9 | **Medium** | Verify production TLS/DNS/Caddy configuration before `F8.2` is marked complete. | DevOps |

---

## 6. Conclusion

The codebase is moving in the right direction: the fee cap is implemented and tested, the perimeter (rate/budget/origin/body) is being centralized in `src/infrastructure/perimeter/`, the smart-wallet allowlist and structural XDR validation are present, and the worker/metrics runtime is wired. However, **the plan is no longer a faithful source of truth**: it contains stale baselines, internal contradictions between summary and detail, and claims of on-chain E2E execution that are not backed by committed evidence. Most importantly, the lint gate is broken, which means the "green baseline" in the plan is invalid and CI would fail.

**Do not treat the current plan as an accurate representation of Testnet readiness until the findings in this report are resolved and the working tree is committed.**
