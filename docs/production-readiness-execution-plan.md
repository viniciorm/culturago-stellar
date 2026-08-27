# Plan ejecutable para cerrar la integración Stellar y preparar producción

## Resultado esperado

Este plan guía a **SWE 1.7** para convertir el estado actual de CulturaGO en dos entregables verificables y separados:

1. **Entrega de integración Testnet:** el frontend real usa los contratos Soroban desplegados, firma mediante passkey, representa correctamente el ciclo de una transacción y completa un E2E con cleanup.
2. **Producción completa:** además de la integración anterior, la persistencia, infraestructura VPS, recuperación, observabilidad y operación quedan implementadas y aprobadas por Marcos Vini.

La integración Testnet puede entregarse antes que la infraestructura definitiva. Sin embargo, el sistema **no debe declararse listo para producción** hasta completar ambos entregables.

## Cómo ejecutar este plan

1. Leer las fuentes de verdad y las restricciones no negociables.
2. Ejecutar las unidades en el orden indicado por el mapa de dependencias.
3. Mantener pruebas, documentación y código de cada comportamiento en la misma unidad de trabajo.
4. Registrar evidencia real; no marcar checkboxes por inspección visual.
5. Detenerse ante cualquiera de los puntos `STOP` y pedir una decisión concreta.
6. No desplegar ni invocar Mainnet durante este plan.

## Estado auditado actual — 27 de agosto de 2026

Este estado fue contrastado nuevamente con código, commits y gates locales. La leyenda usada en todo el plan es:

- **COMPLETO:** implementación y evidencia exigida por la unidad disponibles.
- **PARCIAL:** existe implementación útil, pero falta parte del criterio de aceptación o evidencia runtime.
- **PENDIENTE:** el comportamiento principal todavía no existe o no fue ejecutado.
- **NO VERIFICADO:** puede existir, pero no hay evidencia reproducible suficiente para marcarlo.

### Resumen por fase

| Fase / unidad | Estado actual | Evidencia y brecha principal |
|---|---|---|
| F0 — Baseline | COMPLETO | Working tree limpio antes de esta actualización, `main` ahead 2 y gates locales verdes. |
| F1 — Readback | COMPLETO | `get_credential` compara credential ID, emisor, sujeto, evento, tipo, metadata, schema, actor, revocación y razón; el ledger de confirmación se asigna antes del match en `pollAndConfirm` y `credentialRecordMatches` valida `issued_ledger`/`revoked_ledger`; pruebas negativas por campo cubren todos los campos institucionales. |
| F2.1 — Perímetro HTTP | PARCIAL | Submit, deploy, status y provisioning autentican actor; `/api/sign/prepare` sigue sin sesión/token obligatorio y faltan Origin/CSRF, rate/body limits y schemas estrictos. |
| F2.2 — Separación de claves | PARCIAL | Admin Testnet, fee payer, deployer y signer de usuario están separados; faltan presupuesto/límites de fee y pruebas negativas completas. |
| F2.3 — Identidad/autorización | PARCIAL | Sesiones, roles, scope y wallet existen; `/login` sigue en demo y varias Server Actions CRUD/configuración no autentican ni autorizan dentro de la mutación. |
| F3.1 — XDR/passkey | PARCIAL | Firma real y validación estructural están conectadas; falta la matriz adversarial con fixtures XDR reales y pruebas del signer cliente. |
| F3.2 — Allowlist wallet | PARCIAL | El manifiesto contiene el hash canónico y `connectWallet` solicita verificación WASM on-chain; faltan E2E/pruebas y existen fuentes pública/server-side que todavía deben demostrar paridad. |
| F4.1 — IDs/hash canónico | PARCIAL | Derivación, golden vectors y función SQL corregida existen; faltan ejecución contra PostgreSQL real y evidencia TS/Rust. |
| F4.2 — Gateway en UI | PARCIAL | Organizer firma y envía emisión/revocación con `PasskeyKitSigner`; falta registro de entidad, pruebas UI y E2E Testnet. |
| F5.1 — Estado/polling | PARCIAL | Existe endpoint scoped y polling con cancelación; faltan tests HTTP/hook, backoff, límite temporal, rate limit y copy/acciones completas por fase. |
| F5.2 — Worker runtime | PARCIAL | `StellarWorkerManager` arranca desde instrumentation y maneja señales; faltan heartbeat, métricas/health, validación de configuración y evidencia del proceso desplegado. |
| F5-f — Provisioning admin Testnet | CERRADO para alcance funcional Testnet | Signer, servicio, endpoint, stores y migración existen. Falta E2E en F6 y el pipeline admin conserva un crash window, por lo que no es durable para producción. |
| F6 — E2E Testnet/cleanup | PENDIENTE | No existe evidencia del recorrido frontend completo ni del cleanup on-chain. |
| F7.1 — Retiro del harness | PARCIAL | `/smart-wallet` y `grant-roles` fueron eliminados; permanecen `/api/sign/prepare`, flags/referencias del harness y falta cleanup E2E. |
| F7.2 — Retiro del mock legacy | PARCIAL | Dashboard CRUD/configuración migraron a Server Actions PostgreSQL, pero `src/lib/db.ts` conserva 20 consumidores y el dashboard de evento aún ejecuta el mock. |
| F8.1 — Dependencias | PARCIAL | Audit limpio y gates verdes; permanecen overrides abiertos `>=...` y falta trazabilidad histórica por advisory. |
| F8.2 — Build/Next/Docker | PARCIAL | `proxy.ts`, typecheck y runner no-root están; faltan arranque/health Docker actual, TLS público, error boundaries y evidencia del bundle. |
| F8.3 — CI | PARCIAL | El workflow ejecuta el gate completo; falta verificar branch protection obligatoria. |
| F9 — Documentación/manifiesto | PARCIAL | El manifiesto ya tiene allowlist, pero conserva una nota que dice que está vacía y ledgers `null`; HANDOFF y otras fuentes están desactualizados. |
| F10 — Producción operativa | PARCIAL | Identity, signed recovery y worker runtime avanzaron; faltan PG/migraciones reales, indexador/TTL, HTTPS final, secrets operativos, restore ensayado, observabilidad externa y aprobación. |

### Baseline local reejecutado

| Gate | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | COMPLETO |
| `pnpm lint --max-warnings=0` | COMPLETO, cero warnings |
| `pnpm typecheck` | COMPLETO |
| `pnpm test` | COMPLETO: 114 pasan; 2 PostgreSQL skipped por falta de `DATABASE_URL` |
| `pnpm build` | COMPLETO con Next.js 16.2.11 |
| `pnpm audit --prod` | COMPLETO: sin vulnerabilidades conocidas |
| `pnpm contracts:lint` | COMPLETO: `fmt` y `clippy` pasan |
| `pnpm contracts:test` | COMPLETO: 51/51 pasan |
| `pnpm contracts:build` | COMPLETO: hashes WASM coinciden con el manifiesto |
| Git | Working tree limpio antes de editar el plan; `main` está 2 commits ahead de `origin/main` |

### Pendientes prioritarios

1. Corregir el deploy de smart wallet: `createWallet()` envía sólo `signedTx`, pero `/api/smart-wallet/deploy` exige también `contractId`; añadir pruebas del flujo cliente/deploy.
2. Completar F1 con pruebas negativas por cada campo y mover/asignar el ledger antes de `credentialRecordMatches` para verificar `issued_ledger`/`revoked_ledger` realmente.
3. Cerrar autorización y perímetro: proteger cada Server Action CRUD/configuración, asegurar `/api/sign/prepare`, evitar el oráculo 404/401 del status y añadir Origin/CSRF, schemas, límites y rate limiting.
4. Completar F5 con tests de acceso/polling, backoff y límite temporal, heartbeat/health/métricas del worker y evidencia runtime desplegada.
5. Ejecutar E2E frontend completo, provisioning y cleanup real en Testnet; cerrar también el crash window de `admin_provision` para producción.
6. Terminar el retiro de `src/lib/db.ts`, especialmente `dashboard/eventos/[eventId]` y páginas públicas, y eliminar referencias/flags temporales del harness.
7. Ejecutar migraciones y suites contra PostgreSQL real; resolver el upgrade desde esquemas previos donde `0007` llega después del índice de `0003`.
8. Cerrar documentación/manifiesto, overrides, branch protection, TLS/dominio WebAuthn, límites del relayer, backup/restore, observabilidad externa, runbooks y aprobación.

### Contratos Testnet observados

- `cultural_entity_registry`: `CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO`
- `cultural_credential_registry`: `CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6`

Estos valores son públicos. No copiar secretos, XDR firmados completos ni credenciales operativas a la evidencia.

## Fuentes de verdad

Consultar en este orden:

1. Código y tests del working tree actual.
2. `contracts/cultural-entity-registry/` y `contracts/cultural-credential-registry/`.
3. `docs/soroban-contract-architecture.md`.
4. `docs/smart-wallet-e2e-remediation-plan.md`.
5. `docs/manifests/testnet-manifest.json`.
6. `docs/review/security-privacy-checklist.md`.
7. `docs/gates/mainnet.md`.
8. `docs/evidence.md`.
9. Documentación de la versión instalada en `node_modules/next/dist/docs/`.
10. Documentación oficial de Stellar SDK, Soroban SDK y Passkey Kit correspondiente a las versiones instaladas.

`README.md`, `CODEMAP.md` y `docs/architecture.md` contienen información histórica. No asumir que describen la implementación actual hasta actualizarlos en la fase documental.

## Restricciones no negociables

- Usar **pnpm exclusivamente**. Nunca ejecutar `npm install`, `npm ci` ni generar `package-lock.json`.
- No usar Mainnet, no configurar su passphrase y no reutilizar claves Testnet en Mainnet.
- No ejecutar mutaciones Testnet sin aprobación humana específica para esa ejecución.
- No modificar VPS, firewall, PostgreSQL remoto, DNS ni certificados sin aprobación específica de Marcos Vini.
- No leer, imprimir, copiar ni versionar secretos, connection strings, cookies, challenges, passkeys, XDR firmados o PII.
- No usar variables `NEXT_PUBLIC_*` para ningún secreto.
- No editar migraciones que ya puedan haber sido aplicadas. Toda corrección de esquema se realiza mediante una migración nueva.
- No considerar HTTP 2xx, `sendTransaction` aceptado o un tx hash como confirmación.
- Solo `SUCCESS` en ledger más readback exacto permiten declarar `confirmed`.
- No reenviar a ciegas una operación `submitted`, `confirming`, `unknown` o `restoring`.
- Consultar `node_modules/next/dist/docs/` antes de modificar archivos o convenciones de Next.js.
- No desactivar controles de seguridad, auditoría de dependencias, typecheck o hooks para hacer pasar un gate.
- Preservar cambios locales existentes. No ejecutar reset, checkout destructivo, clean, rebase ni force-push.
- No inventar resultados futuros. Toda evidencia debe contener comando, fecha, versión y resultado real.
- Los contratos de dominio no se rediseñan salvo que una prueba demuestre una brecha contractual bloqueante.

## Puntos `STOP`

Detenerse y pedir una decisión concreta si ocurre cualquiera de estas condiciones:

1. El commit remoto pendiente toca archivos modificados localmente o cambia contratos, gateway, auth o migraciones.
2. No está definido cómo una entidad UUID del frontend se deriva a `BytesN<32>` on-chain.
3. No está definido quién firma en el dashboard real: backend central, smart wallet de organización u otro actor.
4. No puede probarse que una sesión controla la wallet indicada como actor.
5. El hash WASM on-chain no coincide con una allowlist aprobada.
6. La versión de Passkey Kit no tiene un riesgo aceptado para el alcance Testnet.
7. El relayer, fee payer, límites de gasto o modelo de abuso no están aprobados.
8. Una corrección requiere exponer una clave en navegador o reutilizar admin como fee payer.
9. Una migración exige reinterpretar, borrar o truncar datos existentes.
10. El E2E requiere mutar Testnet y todavía no existe aprobación específica.
11. El cleanup no puede revocar roles o vínculos temporales.
12. Un hallazgo exige desplegar nuevos contratos en lugar de usar los IDs aprobados.
13. Una dependencia corregida fue publicada hace menos de siete días y no existe aprobación explícita para asumir ese riesgo.
14. Cualquier comando apunta a Mainnet o a un VPS no inventariado.

## Mapa de dependencias

```text
Fase 0  Baseline y protección del working tree
   |
Fase 1  Regresión de readback y contrato de pruebas
   |
Fase 2  Contención del harness, autenticación y separación de claves
   |
Fase 3  Passkey, XDR y allowlist WASM
   |
Fase 4  Identificadores, hash canónico e integración del dashboard
   |
Fase 5  Estado UI, consulta de operación y reconciliación
   |
Fase 6  E2E Testnet y cleanup on-chain
   |
Fase 7  Eliminación del harness y mocks productivos
   |
Fase 8  Dependencias, Next.js, build y CI
   |
Fase 9  Documentación y evidencia
   |
Fase 10 Handoff operativo a Marcos Vini
   |
Gate final de integración Testnet
   |
Gate de producción completa, después del handoff
```

No ejecutar una fase si la anterior conserva un bloqueador crítico.

# Fase 0 — Baseline reproducible y protección del working tree

**Estado auditado: COMPLETO.** Baseline y gates reejecutados el 27 de agosto de 2026.

## Objetivo

Comenzar desde un estado conocido sin perder los cambios locales ni mezclar accidentalmente el commit remoto pendiente.

## Unidad 0.1 — Inventario y clasificación

**Archivos probables:** ninguno; solo evidencia local.

### Pasos

- [x] Leer `AGENTS.md`, `CLAUDE.md` y las fuentes de verdad.
- [x] Registrar `git status --short --branch`, `git diff --stat`, `git diff --check` y `git log -5 --oneline`.
- [x] Clasificar archivos modificados y no rastreados como: integración vigente, diagnóstico temporal, evidencia o residuo eliminable. El working tree estaba limpio al medir el baseline.
- [x] Comprobar que ningún archivo no rastreado contiene secretos antes de abrirlo o versionarlo. No había archivos no rastreados.
- [x] Inspeccionar la relación con `origin/main` sin hacer merge, rebase ni checkout. No hay commit remoto pendiente; `main` está ahead 2.
- [x] Comparar las versiones de Node, pnpm, Rust, Cargo, Stellar CLI y Docker con las documentadas.
- [x] Ejecutar el baseline completo sin mutaciones de red.

### Verificación

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:lint
pnpm contracts:test
pnpm audit --prod
```

### Evidencia requerida

- Estado Git y lista clasificada de archivos.
- Versiones de herramientas.
- Resultado exacto de cada comando.
- Confirmación de que no se ejecutaron mutaciones Testnet/VPS.

### Criterio de aceptación

- Los cambios locales están preservados.
- Se conoce el contenido del commit remoto pendiente.
- Los fallos observados coinciden o se documentan como un nuevo baseline.
- No hay secretos en archivos candidatos a commit.

### Rollback boundary

No aplica: esta unidad es de solo lectura. Si alguna herramienta genera cachés ignorados, no eliminar archivos sin aprobación.

### Commit sugerido

N/A. No crear commit por inventario.

# Fase 1 — Reparar la regresión de readback

**Estado auditado: PARCIAL.** El readback usa `get_credential` y compara los campos institucionales, actor, revocación y razón; faltan pruebas negativas por campo y la igualdad de ledger todavía se omite por el orden de asignación en `pollAndConfirm`.

## Objetivo

Restaurar el contrato común entre el transporte en memoria y el transporte Soroban real, de modo que una operación solo llegue a `confirmed` si la postcondición exacta se cumple.

## Unidad 1.1 — Test de regresión y semántica compartida

**Archivos probables:**

- `src/infrastructure/stellar/SorobanStellarGateway.ts`
- `src/infrastructure/stellar/InMemoryChainTransport.ts`
- `src/ports/SorobanTransport.ts`
- `tests/infrastructure/stellar-gateway.test.ts`
- `tests/infrastructure/stellar-worker.test.ts`

### Pasos

- [x] Mantener una prueba de regresión para `SUCCESS` seguido de readback incorrecto.
- [x] Alinear el transporte en memoria con los métodos reales `verify_entity`, `verify_credential` y `get_credential`.
- [x] Verificar y demostrar todas las postcondiciones, no sólo existencia:
  - entidad: `verify_entity` compara ID, versión, metadata hash y schema;
  - emisión: `get_credential` compara credential ID, emisor, sujeto, evento, tipo, metadata hash, schema, actor, no revocada y `issued_ledger` contra el ledger de confirmación;
  - revocación: compara credential ID, estado revocado, razón y `revoked_ledger` contra el ledger de confirmación;
  - ledger se asigna antes del match en `pollAndConfirm`; `credentialRecordMatches` se exporta y cubre con pruebas negativas por campo.
- [x] Conservar casos negativos donde el ledger confirma pero el readback no coincide.
- [x] Evitar adaptaciones especiales que hagan al mock más permisivo que la red real.

### Pruebas positivas

- Registro confirmado con readback exacto.
- Emisión confirmada con todos los campos coincidentes.
- Revocación confirmada solo cuando el estado revocado es observable.
- Idempotencia conserva la misma operación confirmada.

### Pruebas negativas

- Metadata hash distinto produce `READBACK_MISMATCH`.
- Schema distinto produce `READBACK_MISMATCH`.
- Credencial inexistente no se confirma.
- Ledger `SUCCESS` con postcondición incompleta no se confirma.

### Verificación

```powershell
pnpm test -- tests/infrastructure/stellar-gateway.test.ts
pnpm test -- tests/infrastructure/stellar-worker.test.ts
pnpm test
pnpm typecheck
```

### Evidencia requerida

- Caso que fallaba antes y pasa después.
- Resultado 85/85 o nuevo total completo sin fallos.
- Estado final esperado para cada postcondición.

### Criterio de aceptación

- Todos los tests web pasan.
- Mock y transporte real comparten las mismas postcondiciones.
- Ningún tx hash marca `confirmed` sin readback.

### Rollback boundary

Revertir únicamente la semántica de readback y sus pruebas. No tocar contratos ni persistencia.

### Commit sugerido

`fix(stellar): restore exact gateway readback verification`

# Fase 2 — Contener el harness y cerrar el perímetro

**Estado auditado: PARCIAL.** La autenticación server-side y separación de claves avanzaron, pero el perímetro HTTP y la UI WebAuthn no cumplen toda la fase.

## Objetivo

Impedir que endpoints de firma, deploy o administración Testnet puedan ser usados por un tercero y eliminar cualquier ruta de secreto hacia el navegador.

## Unidad 2.1 — Frontera E2E server-only

**Estado: PARCIAL.** Existen guardas de Testnet y autenticación en submit/deploy/provisioning; `/api/sign/prepare` no exige sesión ni token obligatorio y faltan controles HTTP adversariales.

**Archivos probables:**

- `src/app/api/sign/prepare/route.ts`
- `src/app/api/sign/submit/route.ts`
- `src/app/api/smart-wallet/deploy/route.ts`
- `src/app/api/testnet/grant-roles/route.ts`
- `src/infrastructure/auth/`
- nuevo servicio server-only específico del harness
- `.env.example`

### Pasos

- [x] Añadir un kill switch server-only para el harness E2E.
- [x] Exigir simultáneamente entorno Testnet, passphrase exacta, IDs del manifiesto, flag y sesión/token interno autorizado. `prepare`, `submit` y `deploy` usan `requireHarnessActor` con `assertTestnetHarnessAllowed`.
- [x] Validar sesión y permiso dentro de cada Route Handler; no confiar solo en layout, proxy o visibilidad de página. `prepare`, `submit`, `deploy` y `admin/provision` validan origen y sesión.
- [x] Validar `Origin`/`Referer` y aplicar protección same-origin a mutaciones mediante `assertOriginAllowed`.
- [x] Limitar tamaño de body con `parseStrictJson`, frecuencia por actor con `assertRateLimit` y presupuesto de relayer con `assertRelayerBudget`.
- [x] Usar schemas estrictos para comandos; rechazar campos desconocidos y tipos implícitos en `prepare`, `submit` y `deploy`.
- [x] Derivar server-side el actor autorizado y vincularlo a la sesión en submit, deploy y provisioning.
- [x] Construir métodos administrativos desde una allowlist interna; nunca aceptar método, contract ID o XDR administrativo arbitrario.
- [x] Mantener respuestas sin secretos, cookies ni XDR administrativos.

### Pruebas positivas

- Sesión E2E autorizada y origin válido acceden al método permitido.
- Los IDs de contratos coinciden con el manifiesto.
- El servicio construye únicamente las concesiones y revocaciones predefinidas.

### Pruebas negativas

- Sin sesión o token: `401`.
- Sesión sin permiso: `403`.
- Flag apagado: `403` o error de configuración.
- Origin inválido o CSRF ausente: rechazo.
- Mainnet, demo o passphrase distinta: rechazo.
- Body grande, campos extra, dirección inválida o método no permitido: rechazo.
- Rate limit o presupuesto agotado: rechazo sin usar claves.

### Verificación

```powershell
pnpm test -- tests/infrastructure
pnpm typecheck
pnpm exec eslint src/app/api src/infrastructure/auth
```

### Evidencia requerida

- Matriz HTTP con casos `200/400/401/403/429`.
- Confirmación de que ninguna prueba imprime secretos.
- Confirmación de que el kill switch falla cerrado.

### Criterio de aceptación

- Ninguna ruta mutante Stellar es anónima.
- El navegador no decide permisos, contratos ni métodos administrativos.
- El harness queda limitado a Testnet y detrás de un kill switch.

### Rollback boundary

Revertir Route Handlers, servicio E2E, configuración y pruebas de esta unidad. No revertir mejoras previas del gateway.

### Commit sugerido

`fix(security): contain testnet stellar harness`

## Unidad 2.2 — Separación de claves y patrocinio

**Estado: PARCIAL.** Las responsabilidades y variables están separadas; faltan límites operativos del fee payer/relayer y pruebas negativas completas.

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/networkConfig.ts`
- `src/app/api/smart-wallet/deploy/route.ts`
- `.env.example`
- documentación de configuración

### Pasos

- [x] Eliminar todo uso de `NEXT_PUBLIC_STELLAR_TESTNET_DEPLOYER_SECRET`.
- [x] Fallar el build o la validación si existe cualquier variable `NEXT_PUBLIC_*SECRET`. `assertNoPublicSecrets()` en `getPublicConfig` bloquea nombres con `SECRET/KEY/SEED/PRIVATE` y valores con semilla Stellar.
- [x] Separar admin, deployer y fee payer en configuración y responsabilidad.
- [x] Impedir fallbacks silenciosos entre admin, deployer y fee payer.
- [x] Validar que la public key derivada de cada secret coincide con su address configurada para admin Testnet y fee payer cuando ambos valores están presentes.
- [x] Limitar el fee payer a envelopes preparados y validados por el gateway.
- [x] Definir límites de fee (`STELLAR_MAX_FEE_STROKES`), operaciones admitidas (allowlist de contrato/gateway) y presupuesto por sesión (`assertRelayerBudget`/`STELLAR_RELAYER_DAILY_BUDGET`).
- [x] Usar el relayer server-only para deploy/patrocinio de smart wallet.

### Pruebas negativas

- Secret/address no coincidentes.
- Fee payer intenta firmar operación distinta o pago clásico.
- Falta una clave requerida.
- Configuración reutiliza la misma cuenta para roles incompatibles.
- Variable pública contiene patrón de secret Stellar.

### Verificación

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm exec eslint src/lib/smartWallet src/infrastructure/stellar src/app/api/smart-wallet
```

Además, inspeccionar el bundle generado y buscar únicamente nombres prohibidos, nunca valores reales.

### Evidencia requerida

- Mapa de roles de claves con direcciones públicas, sin secrets.
- Pruebas de rechazo de configuración inválida.
- Confirmación de ausencia de `NEXT_PUBLIC_*SECRET` en código y bundle.

### Criterio de aceptación

- Ningún secret llega a React o al bundle.
- Admin no patrocina operaciones de usuario.
- Fee payer no concede roles.
- No existen fallbacks de claves entre responsabilidades.

### Rollback boundary

Revertir configuración, wiring del relayer y pruebas de separación. No reintroducir secretos públicos.

### Commit sugerido

`fix(security): separate stellar signing responsibilities`

## Unidad 2.3 — Activar identidad y autorización del dashboard

**Estado: PARCIAL.** El backend de identidad y guards de páginas existen; falta `/login` WebAuthn y varias Server Actions CRUD/configuración no vuelven a autenticar ni validar rol/scope dentro de la mutación.

**Archivos probables:**

- `src/app/login/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/api/auth/`
- `src/infrastructure/auth/factory.ts`
- `src/infrastructure/auth/SessionService.ts`
- `src/infrastructure/auth/PasskeyService.ts`
- tests de Route Handlers y navegación protegida

### Pasos

- [ ] Conectar la UI de `/login` con los endpoints WebAuthn de registro y autenticación ya existentes. La página continúa en modo demo.
- [x] Mantener el acceso directo sin sesión únicamente en entorno `demo`, con identificación visual inequívoca.
- [x] Exigir sesión válida dentro de cada mutación server-side. `personas`, `organizaciones`, `proveedores` y `configuracion` usan `requireDashboardAdmin`; `credenciales` ya valida sesión y `issuer_id`.
- [x] Resolver roles y `issuer_id` dentro de cada Server Action. Admin en CRUD de entidades/relaciones; `assertIssuerScope` en credenciales.
- [x] Redirigir/rechazar desde layouts y rutas ya protegidas cuando no existe sesión válida o falta el rol requerido.
- [x] Vincular la sesión con la wallet autorizada antes de aceptar el submit firmado.
- [x] Conservar challenges de un uso, expiración, anti-replay, origin y RP ID exactos en los servicios.
- [x] Evitar enumeración de cuentas y credenciales WebAuthn en respuestas de error cubiertas por los servicios.
- [ ] Documentar y probar claramente las fronteras entre stores en memoria, Testnet y persistencia productiva.
- [x] Persistir el vínculo durable cuenta-wallet en `accounts.wallet_contract_address` sin custodiar claves.

### Pruebas positivas

- Registro WebAuthn crea una cuenta y una sesión válida.
- Login rota sesión y permite acceder al dashboard autorizado.
- La sesión resuelve roles e issuer scope desde el servidor.
- Demo mantiene acceso local sin presentarse como entorno verificable.

### Pruebas negativas

- Dashboard Testnet sin cookie válida es rechazado.
- Sesión revocada, expirada o rotada no puede mutar.
- Cuenta sin rol no registra, emite ni revoca.
- Operador de organización A no usa el issuer de B.
- Wallet no vinculada a la sesión no puede firmar su intención.
- Challenge repetido, origin distinto o RP ID incorrecto falla.

### Verificación

```powershell
pnpm test -- tests/infrastructure/identity.test.ts
pnpm test
pnpm typecheck
pnpm exec eslint src/app/login src/app/dashboard src/app/api/auth src/infrastructure/auth
pnpm build
```

### Evidencia requerida

- Matriz sesión/rol/issuer/wallet con resultados permitidos y rechazados.
- Prueba de expiración, rotación y revocación.
- Captura del flujo WebAuthn sin credential IDs completos ni PII.
- Limitación explícita del store temporal usado en Testnet.

### Criterio de aceptación

- Testnet y producción nunca muestran el dashboard administrativo sin sesión válida.
- Toda mutación deriva permisos y scope desde el servidor.
- Una sesión no puede operar una wallet ni organización ajena.
- Demo y Testnet tienen fronteras visuales y técnicas distintas.

### Rollback boundary

Revertir UI de login, guard del dashboard, wiring de identidad y pruebas de esta unidad. No convertir Testnet en acceso anónimo como fallback.

### Commit sugerido

`feat(auth): protect dashboard with passkey sessions`

# Fase 3 — Endurecer passkey, XDR y allowlist WASM

**Estado auditado: PARCIAL.** La firma Passkey real, validación estructural y allowlist canónica están integradas; faltan pruebas adversariales XDR/cliente, paridad de fuentes y E2E con wallet desplegada.

## Objetivo

Demostrar que la passkey autoriza exactamente la intención preparada, que la firma sobrevive la serialización y que la smart wallet usa una implementación allowlisted.

## Unidad 3.1 — Firma XDR real y comparación estructural

**Estado: PARCIAL.** Código de firma y validación presente; falta una suite con fixtures XDR reales que demuestre toda la matriz adversarial.

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/SorobanStellarGateway.ts`
- `src/infrastructure/stellar/SdkSorobanTransport.ts`
- tests nuevos para actor `C...`

### Pasos

- [ ] Construir fixtures XDR reales con Stellar SDK; las pruebas actuales se apoyan principalmente en el transporte mock.
- [x] Implementar verificación de que la auth entry firmada sobrevive `serialize -> parse`.
- [x] Exigir exactamente una operación `invokeHostFunction`.
- [x] Comparar el cuerpo de transacción, host function, auth entries y Soroban data contra la intención preparada.
- [x] Permitir únicamente las transformaciones de auth esperadas por Passkey Kit.
- [x] Verificar address y presencia de firma del actor; la expiración se aplica al firmar.
- [x] Rechazar modificaciones de auth entries ajenas al actor.
- [x] Confirmar que el fee payer firma únicamente después de validar la intención.
- [ ] Probar explícitamente expiration insuficiente y RPC no disponible como errores no ambiguos.

### Matriz adversarial mínima

| Alteración | Resultado esperado |
|---|---|
| Contract ID distinto | Rechazo antes del fee payer |
| Método distinto | Rechazo antes del fee payer |
| Argumento o metadata hash distinto | Rechazo antes del fee payer |
| Source o sequence distinto | Rechazo |
| Memo o precondition distinta | Rechazo |
| Footprint o Soroban data distinto | Rechazo |
| Operación adicional | Rechazo |
| Auth address de otra wallet | Rechazo |
| Auth no firmada | Rechazo |
| Auth expirada | Rechazo |
| Auth ajena modificada | Rechazo |
| Envelope correcto de la wallet correcta | Aceptación |

### Verificación

```powershell
pnpm test -- tests/infrastructure
pnpm test
pnpm typecheck
```

### Evidencia requerida

- XDR de prueba sanitizado o hash del fixture, no XDR real firmado por usuarios.
- Resultado de toda la matriz adversarial.
- Confirmación de que el fee payer no fue llamado en casos rechazados.

### Criterio de aceptación

- El branch `C...` tiene pruebas positivas y negativas equivalentes o superiores al branch `G...`.
- La firma passkey está presente después del round trip XDR.
- Ningún XDR arbitrario alcanza la clave del fee payer.

### Rollback boundary

Revertir signer, validación estructural y fixtures de esta unidad. No debilitar validaciones para recuperar compatibilidad.

### Commit sugerido

`fix(stellar): bind passkey authorization to prepared intents`

## Unidad 3.2 — Allowlist y procedencia de smart wallet

**Estado: PARCIAL.** El manifiesto contiene el hash aprobado, deploy falla cerrado y `connectWallet` solicita verificación on-chain; faltan pruebas/E2E y demostrar paridad entre manifiesto, env server-side y variables públicas del cliente.

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/networkConfig.ts`
- manifiesto Testnet
- tests de configuración y conexión

### Pasos

- [x] Definir una fuente server-side de hashes aceptados por red.
- [x] Validar formato, normalización, duplicados y pertenencia del hash de creación a la allowlist.
- [x] Solicitar verificación del hash/código on-chain al conectar mediante `verifyWasmHash: true` y validar el XDR de deploy server-side.
- [x] Rechazar creación con implementación no allowlisted y configuración de otra red.
- [x] Documentar versión, hash y procedencia de Passkey Kit en el manifiesto.
- [ ] Obtener aceptación explícita del riesgo si la implementación no está auditada para el alcance requerido.
- [ ] Probar el flujo cliente/deploy: `createWallet()` todavía omite `contractId` en el body requerido por `/api/smart-wallet/deploy`.

### Pruebas

- Hash allowlisted correcto.
- Allowlist vacía en Testnet/Mainnet: falla cerrada.
- Hash desconocido o de otra red: rechazo.
- Hash público y server-side divergentes: rechazo.
- Upgrade de wallet sin re-allowlist: rechazo.

### Verificación

```powershell
pnpm test
pnpm typecheck
pnpm build
```

### Evidencia requerida

- Hashes públicos aprobados y red correspondiente.
- Método usado para verificar código on-chain.
- Decisión de riesgo firmada por el responsable.

### Criterio de aceptación

- Crear y conectar siempre verifica red y allowlist.
- No existen dos allowlists independientes.
- El manifiesto deja de contener una allowlist vacía antes del E2E.

### Rollback boundary

Revertir validación y configuración de allowlist. No permitir fallback permisivo.

### Commit sugerido

`fix(wallet): verify smart wallet implementation by network`

# Fase 4 — Integrar el dashboard con contratos reales

**Estado auditado: PARCIAL.** IDs, prepare y firma Passkey real de emisión/revocación están integrados; faltan registro de entidad, pruebas UI/E2E y evidencia de paridad multi-runtime.

## Objetivo

Retirar falsos éxitos del frontend principal y conectar los casos de uso reales al pipeline `prepare -> sign -> submit -> status -> readback`.

## Unidad 4.1 — Identificadores on-chain y hash canónico

**Estado: PARCIAL.** Implementación canónica y golden vectors presentes; faltan ejecución contra PostgreSQL real, paridad TS/Rust y evidencia definitiva de schemas.

**Archivos probables:**

- `src/infrastructure/hashing/`
- `src/ports/CanonicalHashPort.ts`
- `fixtures/golden-vectors.json`
- consumidores de `src/lib/hashes.ts`
- tests de vectores e identificadores

### Pasos

- [x] Resolver el punto `STOP` para mapear UUID/string a `BytesN<32>` mediante hashing canónico con separación de dominio.
- [x] Definir derivación determinística y versionada para entity, credential, issuer, subject y event IDs.
- [x] Producir vectores dorados versionados y separar namespaces por diseño.
- [x] Sustituir el hashing legacy por `CanonicalHashPort` en gateway y metadata de credenciales.
- [x] Rechazar errores de canonicalización; no existen hashes aleatorios de fallback.
- [ ] Consolidar la especificación exacta y aprobada de campos/schema para `entity.v1` y `credential.v1`.
- [ ] Garantizar con evidencia ejecutada la paridad navegador, Node, PostgreSQL real y Rust.

### Pruebas

- Orden de claves no cambia el digest.
- Cambios semánticos sí cambian el digest.
- Objetos anidados conservan todos los campos aprobados.
- Valores no finitos, ciclos y tipos no canonicalizables fallan.
- Mismo UUID y namespace produce el mismo ID en todos los runtimes.
- Namespaces distintos no producen el mismo ID lógico.

### Verificación

```powershell
pnpm test -- tests/infrastructure/canonical-hash.test.ts
pnpm test
pnpm contracts:test
pnpm typecheck
```

### Evidencia requerida

- Especificación de schemas e IDs.
- Vectores dorados versionados.
- Resultado de paridad TS/Rust.

### Criterio de aceptación

- No quedan consumidores productivos de `src/lib/hashes.ts`.
- Toda entrada contractual usa IDs de 32 bytes derivados de forma reproducible.
- Errores de hashing detienen la operación antes de preparar una transacción.

### Rollback boundary

Revertir derivación, schemas, fixtures y consumidores de esta unidad. No volver al fallback aleatorio.

### Commit sugerido

`fix(integrity): standardize canonical ids and metadata hashes`

## Unidad 4.2 — Cliente frontend del gateway real

**Estado: PARCIAL.** Las Server Actions y formularios completan prepare, firma Passkey y submit para emisión/revocación; falta registro de entidad y evidencia E2E Testnet.

**Archivos probables:**

- `src/components/StellarStatusBlock.tsx`
- `src/app/dashboard/eventos/[eventId]/page.tsx`
- páginas de credenciales y organizaciones
- cliente tipado para `/api/sign/*`
- casos de uso o contenedores de UI

### Pasos

- [x] Separar Server Actions de los formularios cliente para emisión y revocación.
- [x] Eliminar imports de `src/lib/stellar.ts`; el archivo legacy ya no existe.
- [x] Conservar `MockStellarGateway` fiel solo para demo y tests.
- [x] Derivar emisión/revocación desde datos aprobados, sesión, issuer scope y wallet del actor.
- [x] Usar idempotency keys con namespace `issue:`/`revoke:` y fingerprint independiente de la clave.
- [x] Mostrar red y contract ID en el panel del organizador.
- [x] Persistir ledger de emisión/revocación sólo tras estado `confirmed` en submit.
- [x] Firmar emisión/revocación con `PasskeyKitSigner` fuera de demo y rechazar firmas fake.
- [ ] Probar que dobles clics/reintentos desde UI conservan una sola intención.
- [ ] Integrar los tres flujos completos: emisión y revocación ya usan firma Passkey real; registro de entidad y E2E Testnet siguen pendientes.

### Pruebas positivas

- Registro, emisión y revocación recorren el cliente real.
- Demo usa el gateway mock fiel y queda etiquetada como demo.
- Testnet muestra links correctos solo para hashes reales.

### Pruebas negativas

- Prepare rechazado no cambia estado local a registrado.
- Firma cancelada conserva estado recuperable.
- Submit `unknown` no muestra confirmado.
- Readback mismatch muestra fallo terminal y referencia de soporte.
- Doble clic conserva una sola intención.

### Verificación

```powershell
pnpm test
pnpm typecheck
pnpm exec eslint src/components src/app/dashboard
pnpm build
```

### Evidencia requerida

- Diagrama o traza del flujo UI a contrato.
- Capturas de estados demo, pendiente, confirmado y fallo sin PII.
- Confirmación de que no quedan imports productivos de `src/lib/stellar.ts`.

### Criterio de aceptación

- El dashboard real invoca el gateway real en Testnet.
- Ningún éxito simulado se presenta como verificación Stellar.
- Registro, emisión y revocación comparten la misma máquina de estados.

### Rollback boundary

Revertir cliente, contenedores y wiring de UI. La demo puede volver temporalmente al gateway mock fiel, nunca al mock que siempre devuelve éxito.

### Commit sugerido

`feat(stellar): connect dashboard workflows to testnet gateway`

# Fase 5 — Estado visible y reconciliación

**Estado auditado: PARCIAL.** Persistencia `signed`, status/polling y runtime del worker están implementados; faltan pruebas de las fronteras nuevas, backoff/límite de polling, health/heartbeat y evidencia desplegada.

## Objetivo

Hacer recuperables y observables las operaciones que no terminan dentro de una solicitud HTTP.

## Unidad 5.1 — Consulta de operación y UX de estados

**Estado: PARCIAL.** Existe Route Handler scoped y polling en emisión/revocación; faltan tests, backoff/límite temporal, rate limit y UX completa por fase.

**Archivos probables:**

- `src/app/api/operations/[operationId]/route.ts`
- `src/ports/StellarGateway.ts`
- `src/lib/hooks/useOperationPoller.ts`
- formularios de `src/app/organizer/`
- tests de acceso y estados

### Pasos

- [x] Crear una consulta autenticada y autorizada de estado por operation ID.
- [x] Verificar que la wallet de la sesión coincide con el actor de la operación.
- [ ] Aplicar política anti-enumeración uniforme: hoy una operación inexistente devuelve `404` y una ajena `401`, revelando existencia.
- [x] Devolver sólo `OperationState`, sin XDR, intent ni payload sensible.
- [x] Representar las fases recibidas desde la máquina de estados en emisión/revocación.
- [x] Basar el mensaje visible en `operation.phase`, no únicamente en HTTP 2xx.
- [ ] Implementar polling acotado con backoff y cancelación completa; hoy usa intervalo fijo sin máximo y sólo limpia timers.
- [ ] Permitir reintento sólo cuando la máquina de estados lo autorice y documentar la acción por fase.
- [ ] Mostrar correlation ID y orientación accionable sin trazas internas.
- [ ] Añadir tests del Route Handler, autorización entre actores y hook de polling.

### Pruebas

- Operación propia visible.
- Operación ajena: `404` o `403` según política anti-enumeración.
- `unknown` continúa pendiente y puede converger.
- `failed_terminal` nunca ofrece reenvío ciego.
- Refresco conserva el estado disponible en el store configurado.

### Verificación

```powershell
pnpm test
pnpm typecheck
pnpm build
```

### Evidencia requerida

- Tabla fase -> copy -> acción permitida.
- Casos de acceso entre organizaciones.
- Prueba de timeout y posterior convergencia.

### Criterio de aceptación

- La UI nunca confunde aceptación con confirmación.
- Una operación puede consultarse sin exponer XDR.
- Los estados y acciones coinciden con la máquina de dominio.

### Rollback boundary

Revertir endpoint, cliente de polling y copy de estados. No revertir las reglas de no reenvío.

### Commit sugerido

`feat(stellar): expose scoped operation status`

## Unidad 5.2 — Reconciliación runtime mínima para Testnet

**Estado: PARCIAL.** El manager y entrypoint runtime existen y manejan shutdown; faltan heartbeat/health, métricas de lag/fases, validación de opciones y evidencia del proceso desplegado.

**Archivos probables:**

- `src/infrastructure/stellar/StellarWorker.ts`
- `src/infrastructure/stellar/StellarWorkerManager.ts`
- `src/instrumentation.ts`
- métricas y health
- tests de shutdown, lease y recuperación

### Pasos

- [x] Definir un proceso explícito que inicia `StellarWorker` desde `src/instrumentation.ts` mediante un manager singleton.
- [x] Implementar leases/`SKIP LOCKED` para que workers concurrentes no reclamen la misma operación.
- [ ] Publicar heartbeat, último ciclo, lag y número de operaciones por fase.
- [x] Soportar shutdown mediante `AbortController`, `SIGTERM` y `SIGINT`.
- [x] Usar PostgreSQL para operaciones durables cuando `DATABASE_URL` está configurada y no sobredeclarar el store en memoria.
- [x] Recuperar fases `signed` y reconciliables con reintentos/backoff sin que el worker firme.
- [ ] Validar numéricamente las opciones de entorno y demostrar el runtime con PostgreSQL en el deployment Testnet/producción.
- [ ] Separar/supervisar los procesos durables de reconciliación, indexación y TTL.

### Pruebas

- Dos workers no reclaman la misma operación.
- Worker reiniciado libera lease por expiración.
- `unknown` converge a confirmado o terminal sin reenvío.
- Worker caído se refleja en health.

### Verificación

```powershell
pnpm test -- tests/infrastructure/stellar-worker.test.ts
pnpm test
pnpm typecheck
```

### Evidencia requerida

- Escenario runtime real o harness documentado.
- Heartbeat y métricas sin secretos.
- Limitación explícita del store en memoria.

### Criterio de aceptación

- Testnet tiene reconciliación observable mientras la aplicación está activa.
- No se confunde esta solución temporal con durabilidad de producción.

### Rollback boundary

Revertir entrypoint/scheduler, wiring y métricas. Mantener la clase y pruebas del worker si siguen siendo válidas.

### Commit sugerido

`feat(stellar): run observable testnet reconciliation`

## Unidad 5.f — Provisioning administrativo Testnet

**Estado: CERRADO para el alcance funcional Testnet.** La ejecución real contra contratos y su cleanup se valida en Fase 6. No se considera durable para producción hasta cerrar el crash window administrativo descrito abajo.

### Completado

- [x] `getTestnetAdminSignerConfig()` falla cerrado en `demo`/Mainnet, exige `CULTURAGO_ALLOW_TESTNET_ADMIN_SIGNER=true` y valida address/secret.
- [x] El secret admin permanece fuera de `StellarNetworkConfig` y del navegador.
- [x] `LocalSigner` firma Ed25519 server-side y rechaza fee-bump transactions.
- [x] `AdminStellarService` limita métodos a grant/revoke de roles y link/unlink de issuer-operator.
- [x] Las operaciones administrativas usan idempotencia durable, polling y manejo de restore.
- [x] Link/unlink verifican readback mediante `is_issuer_operator`.
- [x] Grant/revoke se apoyan en ledger `SUCCESS` más semántica idempotente porque los contratos no exponen `has_role`.
- [x] `POST /api/admin/provision` exige rol `admin`, valida UUIDs, deriva wallet/issuer desde PostgreSQL y sincroniza `issuer_operators` tras confirmación.
- [x] Identity stores soportan `unlinkIssuerOperator`.
- [x] `0010_admin_operation_kind.sql` agrega `admin_provision`.
- [x] `.env.example` documenta el kill switch y las variables admin Testnet.

### Pendiente de evidencia runtime y robustez productiva

- [ ] Añadir pruebas focalizadas del servicio y Route Handler administrativo.
- [ ] Ejecutar grants/link reales en la ventana E2E autorizada y registrar tx hashes/ledgers.
- [ ] Ejecutar revoke/unlink y verificar cleanup en Fase 6.
- [ ] Cerrar el crash window entre `transport.submit()` y la persistencia de `txHash`: hoy no se guarda XDR firmado y el worker genérico no puede reconciliar correctamente `admin_provision`.

# Fase 6 — E2E real en Stellar Testnet

**Estado auditado: PENDIENTE.** No hay evidencia del recorrido frontend real ni del cleanup administrativo on-chain.

## Objetivo

Demostrar el flujo completo desde el navegador contra los contratos existentes y limpiar toda autoridad temporal.

## Precondiciones

- Fases 1 a 5 aceptadas.
- Todos los tests locales pasan.
- Allowlist no vacía y verificada.
- Admin, deployer y fee payer separados.
- Kill switch activo solo para la ventana E2E.
- Cuenta Testnet financiada y presupuesto aprobado.
- Aprobación humana específica para mutar Testnet.
- Plan de cleanup probado en dry-run.

## Unidad 6.1 — Preflight y ejecución

**Archivos probables:**

- scripts Testnet existentes
- harness temporal
- manifiesto y evidencia

### Secuencia obligatoria

1. Validar entorno, passphrase, RPC, contract IDs y hashes WASM.
2. Crear smart wallet con passkey.
3. Confirmar deploy en ledger y verificar código allowlisted.
4. Conectar la misma wallet.
5. Conceder temporalmente registrar, issuer y revoker.
6. Vincular `issuer_id` de prueba al operador.
7. Registrar organización.
8. Registrar bailarina.
9. Emitir credencial para evento/tipo aprobado.
10. Verificar campos y estado por readback.
11. Revocar credencial.
12. Verificar que la credencial sigue existiendo y está revocada.
13. Forzar o simular una operación inicialmente `unknown` y reconciliarla.
14. Ejecutar pruebas adversariales.
15. Ejecutar cleanup on-chain.
16. Verificar que la wallet ya no puede mutar.
17. Apagar kill switch.

### Matriz adversarial E2E

- Otra wallet intenta usar el issuer.
- Wallet correcta usa otro `issuer_id`.
- XDR cambia contract ID, método o argumento.
- Firma expira antes del submit.
- Idempotency key se reutiliza con payload diferente.
- Submit devuelve timeout/unknown.
- Readback devuelve valor distinto.
- Contrato o passphrase de otra red.
- Endpoint sin sesión, origin o permiso.
- Grant/cleanup repetido comprueba idempotencia.

### Evidencia requerida

- Run ID, fecha, versiones y red.
- Direcciones públicas, contract IDs, tx hashes y ledgers.
- Fases observadas y resultado de readback.
- Resultado de cada caso adversarial.
- Tx hashes del cleanup.
- Confirmación de ausencia de secrets, PII y XDR firmado completo.

### Criterio de aceptación

- Todo el recorrido funcional pasa desde la interfaz.
- Cada `confirmed` tiene ledger y readback exacto.
- Todos los casos adversariales fallan de la forma esperada.
- Cleanup revoca roles y vínculo temporal.

### Rollback boundary

El rollback de aplicación no revierte estado on-chain. Usar únicamente operaciones compensatorias de cleanup documentadas. No redeployar contratos sin decisión explícita.

### Commit sugerido

`test(stellar): prove passkey workflows on testnet`

## Unidad 6.2 — Cleanup verificable

### Pasos

- [ ] Ejecutar `unlink_issuer_operator`.
- [ ] Revocar revoker.
- [ ] Revocar issuer.
- [ ] Revocar registrar.
- [ ] Confirmar cada transacción y readback de permisos.
- [ ] Repetir cleanup para probar idempotencia.
- [ ] Verificar que la wallet ya no registra, emite ni revoca.
- [ ] Rotar secrets temporales si fueron compartidos fuera del canal aprobado.

### Criterio de aceptación

No queda autoridad temporal asociada a la wallet E2E.

# Fase 7 — Eliminar harness y mocks productivos

**Estado auditado: PARCIAL.** `/smart-wallet`, `grant-roles` y los fallbacks mock de varias Server Actions fueron retirados; permanecen superficie/referencias del harness y 20 consumidores de `src/lib/db.ts`.

## Objetivo

Retirar superficies temporales y conservar solo componentes reutilizables del producto.

## Unidad 7.1 — Retiro del harness

**Estado: PARCIAL.** La página `/smart-wallet` y `grant-roles` fueron retirados; permanecen `/api/sign/prepare`, flags/comentarios/referencias temporales y no hubo cleanup E2E.

**Archivos probables:**

- `src/app/smart-wallet/`
- `src/app/api/testnet/grant-roles/`
- servicios E2E temporales
- flags y variables E2E
- scripts temporales y reportes diagnósticos

### Pasos

- [x] Eliminar la página pública `/smart-wallet`; ya no aparece en el build.
- [x] Eliminar el endpoint legacy `/api/testnet/grant-roles`; el provisioning queda en la ruta administrativa autenticada.
- [ ] Eliminar `/api/sign/prepare` si sólo pertenece al harness y retirar flags/tokens temporales después del E2E.
- [ ] Retirar comentarios, documentación y residuos diagnósticos que todavía describen el harness eliminado.
- [x] Conservar signer, gateway, deploy y relayer que forman parte de la arquitectura productiva.
- [ ] Completar y demostrar cleanup on-chain antes de cerrar la unidad.

### Verificación

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm exec eslint .
```

### Evidencia requerida

- Búsqueda sin referencias temporales.
- Resultado completo de tests/build.
- Confirmación de cleanup on-chain anterior a la eliminación.

### Criterio de aceptación

- No existe una interfaz pública para conceder roles administrativos.
- No existe el harness en el artefacto de producción.
- La funcionalidad productiva sigue operando desde el dashboard.

### Rollback boundary

Restaurar el harness solo en una rama de pruebas aislada; no reintroducirlo en el deployment público.

### Commit sugerido

`chore(stellar): remove testnet wallet harness`

## Unidad 7.2 — Retiro del mock legacy

**Estado: PARCIAL.** Los fallbacks de varias Server Actions fueron retirados; `src/lib/db.ts` mantiene 20 consumidores, el dashboard de evento ejecuta el mock y configuración escribe un `context_event_id` hardcodeado sin autorización propia.

**Archivos probables:**

- `src/lib/stellar.ts`
- `src/lib/hashes.ts`
- consumidores legacy
- documentación de demo

### Pasos

- [x] Confirmar que no existen imports productivos de `src/lib/stellar.ts` ni `src/lib/hashes.ts`.
- [x] Eliminar el mock Stellar que siempre devolvía éxito.
- [x] Mantener `MockStellarGateway` e `InMemoryChainTransport` como test doubles fieles.
- [ ] Retirar `src/lib/db.ts` de los 20 consumidores restantes. Dashboard CRUD/configuración ya usan PostgreSQL, pero el dashboard de evento y páginas públicas siguen ejecutando datos mock.
- [ ] Reemplazar el UUID fijo de `RelationshipManager.context_event_id` por contexto validado o `null` según el tipo de relación, y autorizar sus Server Actions.

### Criterio de aceptación

Ningún registro simulado se presenta como verificado en Stellar.

### Commit sugerido

`refactor(stellar): remove legacy success-only mocks`

# Fase 8 — Supply chain, Next.js, build y CI

**Estado auditado: PARCIAL.** El audit está limpio y el workflow CI cubre los gates, pero faltan cerrar overrides, branch protection y la unidad Docker/HTTPS/errores globales.

## Objetivo

Convertir las verificaciones manuales en gates reproducibles y eliminar vulnerabilidades altas aplicables.

## Unidad 8.1 — Dependencias vulnerables

**Estado: PARCIAL.** `pnpm audit --prod` no reporta vulnerabilidades conocidas y los gates pasan, pero los overrides abiertos y la trazabilidad por advisory todavía incumplen pasos de esta unidad.

**Archivos probables:**

- `package.json`
- `pnpm-lock.yaml`

### Pasos

- [ ] Registrar la revisión y aplicabilidad de cada advisory histórico; el resultado actual del audit es limpio.
- [x] Actualizar Next.js y `eslint-config-next` a 16.2.11 compatible.
- [ ] Sustituir los overrides abiertos de `sharp` y PostCSS por versiones acotadas o dependencias soportadas.
- [ ] Registrar evidencia de antigüedad de las versiones seleccionadas cuando se incorporaron.
- [ ] Eliminar los rangos flotantes `>=...` que permanecen en overrides.
- [x] Ejecutar lint, typecheck, pruebas, audit y build con las versiones actuales.

### Verificación

```powershell
pnpm install --frozen-lockfile
pnpm audit --prod
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Evidencia requerida

- Advisories antes/después.
- Versiones exactas seleccionadas y razón.
- Vulnerabilidades remanentes con aceptación explícita, si existieran.

### Criterio de aceptación

- No quedan vulnerabilidades altas aplicables.
- Lockfile reproducible y único.
- Tests y build pasan con las versiones nuevas.

### Rollback boundary

Revertir `package.json` y `pnpm-lock.yaml` juntos. No degradar políticas de seguridad del gestor.

### Commit sugerido

`fix(deps): update vulnerable production packages`

## Unidad 8.2 — Build estricto y convenciones Next.js

**Estado: PARCIAL.** Build y proxy están corregidos; faltan error boundaries, TLS público, health runtime e inspección de variables del artefacto Docker.

**Archivos probables:**

- `next.config.ts`
- `deploy/Dockerfile`
- `src/middleware.ts` o reemplazo `proxy.ts`
- error boundaries de App Router
- configuración de Caddy cuando corresponda

### Pasos

- [x] Eliminar `typescript.ignoreBuildErrors` del build Docker.
- [x] Mantener typecheck activo en `next build` y como gate explícito de CI.
- [x] Migrar la convención de `middleware` a `proxy` siguiendo Next.js 16.
- [ ] Añadir UI global de error y not-found accesible si aplica al App Router actual.
- [ ] Confirmar límites de request, CSP aprobada y TLS público; Caddy todavía usa `tls internal`.
- [ ] Construir y ejecutar la imagen standalone actual con health check reproducible.
- [ ] Verificar en el artefacto que variables públicas quedan fijadas en build y secrets sólo en runtime.

### Verificación

```powershell
pnpm typecheck
pnpm build
pnpm exec eslint . --max-warnings=0
docker compose -f deploy/docker-compose.app.yml config
```

El build y arranque Docker solo deben ejecutarse contra configuración local no secreta y sin tocar el VPS.

### Evidencia requerida

- Build local y Docker con typecheck activo.
- Ausencia de warning por convención deprecada.
- Respuesta de error global y health local.

### Criterio de aceptación

- Docker falla ante errores TypeScript.
- No se usan convenciones deprecadas conocidas.
- La aplicación standalone arranca como usuario no-root detrás del proxy.

### Rollback boundary

Revertir configuración Next/Docker/proxy y error UI como unidad. No reactivar `ignoreBuildErrors`.

### Commit sugerido

`fix(build): enforce production nextjs checks`

## Unidad 8.3 — CI reproducible

**Estado: PARCIAL (configuración completa).** El workflow ejecuta todos los gates locales sin deploy ni mutaciones de red; la obligatoriedad por branch protection debe confirmarse en GitHub antes de cerrar la unidad.

**Archivos probables:**

- workflow del proveedor Git aprobado
- scripts de package si faltan gates estables

### Pasos

- [x] Configurar GitHub Actions como proveedor CI del repositorio.
- [x] Usar Node 22 y pnpm 10 fijados.
- [x] Ejecutar instalación con lockfile congelado.
- [x] Ejecutar lint sin warnings, typecheck, tests, build, audit productiva y contratos.
- [x] No configurar secrets ni credenciales de red en el workflow de PR.
- [x] No ejecutar deploy ni mutaciones Testnet/Mainnet desde CI ordinario.
- [x] No publicar artefactos que incluyan `.env`, XDR o PII.

### Gate CI mínimo

```powershell
pnpm install --frozen-lockfile
pnpm exec eslint . --max-warnings=0
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
pnpm contracts:lint
pnpm contracts:test
pnpm contracts:build
```

### Criterio de aceptación

Cada PR ejecuta el gate y no puede integrarse con fallos.

### Rollback boundary

Revertir workflow y scripts asociados. No eliminar verificaciones locales.

### Commit sugerido

`ci: enforce web and contract quality gates`

# Fase 9 — Documentación, manifiesto y evidencia

**Estado auditado: PARCIAL.** Hay evidencia histórica y manifiesto, pero varias fuentes quedaron obsoletas o contradictorias.

## Objetivo

Alinear documentación con el sistema ejecutable y dejar un handoff que no dependa de memoria oral.

## Unidad 9.1 — Actualizar fuentes históricas

**Estado: PARCIAL.** Los comandos principales usan pnpm, pero README/CODEMAP/arquitectura/evidence todavía contienen estados históricos incompatibles con el repo actual.

**Archivos probables:**

- `README.md`
- `CODEMAP.md`
- `docs/architecture.md`
- `docs/stellar-integration.md`
- `docs/evidence.md`
- `docs/review/security-privacy-checklist.md`

### Pasos

- [x] Sustituir los comandos principales de instalación y gates por pnpm.
- [ ] Eliminar credenciales y afirmaciones demo obsoletas presentadas como acceso vigente.
- [ ] Documentar consistentemente gateway real, demo fiel y ausencia de los mocks Stellar legacy.
- [ ] Actualizar contratos, passkey, relayer, estados y límites de persistencia al estado actual.
- [ ] Marcar claramente qué pertenece a integración Testnet y qué queda para producción operativa.
- [x] Actualizar este checklist únicamente con evidencia real.
- [x] Mantener documentación sin secrets, XDR firmados completos ni PII.

### Criterio de aceptación

Un nuevo ejecutor puede comprender arquitectura, ejecutar tests y distinguir demo, Testnet y producción sin consultar conversaciones previas.

### Commit sugerido

`docs: align architecture with stellar integration`

## Unidad 9.2 — Completar manifiesto Testnet

**Estado: PARCIAL.** Contract IDs, versiones, hashes WASM y allowlist smart-wallet están registrados; faltan ledgers de despliegue, evidencia on-chain/E2E y corregir la nota obsoleta que afirma que la allowlist está vacía.

**Archivo principal:** `docs/manifests/testnet-manifest.json`.

### Pasos

- [x] Mantener los contract IDs Testnet verificados.
- [ ] Registrar ledgers y tx hashes de despliegue sólo cuando puedan probarse; actualmente son `null`.
- [x] Registrar en el manifiesto la allowlist smart-wallet Testnet y su fuente pública.
- [x] Registrar versiones de herramientas y dependencias críticas.
- [x] Validar hashes WASM de contratos de dominio contra los artefactos reproducibles locales.
- [ ] Validar el hash/código de la smart wallet desplegada durante E2E y corregir la nota que aún dice que la allowlist está vacía.

### Criterio de aceptación

El manifiesto es coherente, público, reproducible y no contiene valores `null` requeridos por el gate.

### Commit sugerido

`docs(stellar): record verified testnet manifest`

# Fase 10 — Handoff operativo para Marcos Vini

**Estado auditado: PARCIAL.** Parte de identidad, wallet y recovery durable está implementada; los requisitos operativos de producción siguen mayormente pendientes.

## Objetivo

Entregar decisiones y trabajo de persistencia/VPS como un paquete verificable. Esta fase no debe ser resuelta por SWE 1.7 mediante suposiciones.

## Alcance de Marcos

### 10.1 PostgreSQL y migraciones

- [ ] Aprobar topología, proveedor/host, cifrado, red privada y roles.
- [ ] Crear una migración nueva que agregue `awaiting_signature` y `signed` a `chain_phase` antes de índices que los referencian.
- [ ] No editar `0001` ni `0003` si pudieron aplicarse.
- [ ] Probar migración desde base vacía y desde esquema anterior.
- [ ] Separar roles runtime, migration, backup y restore.
- [ ] Eliminar password default `dev` en cualquier entorno no local.

### 10.2 Identidad, wallet y durabilidad de operaciones

- [x] Persistir cuenta, sujeto, roles/organización, credenciales WebAuthn y smart-wallet contract ID sin almacenar claves privadas ni biometría.
- [ ] Reemplazar `InMemoryPasskeyStorage` como metadata cliente durable y probar reconexión después de recarga, restart y nuevo proceso.
- [x] Mantener separadas la autenticación de aplicación y la autorización on-chain en sus servicios y datos.
- [x] Persistir XDR firmado validado, signer address y fingerprint antes del submit.
- [x] Conservar `signed_xdr` y `signer_address` en `save`.
- [x] Cerrar el crash window previo al submit mediante fase `signed` durable.
- [x] Recuperar `signed` y reconciliar estados enviados sin duplicar efectos en las pruebas del worker.
- [ ] Ejecutar suites comunes contra PostgreSQL real para stores de identidad, wallet y operaciones; 2 pruebas PG permanecen skipped sin `DATABASE_URL`.

### 10.3 Workers, indexador y TTL

- [ ] Completar procesos explícitos para reconciliador, indexador y TTL. El reconciliador ya arranca vía instrumentation; indexador/TTL y despliegue supervisado faltan.
- [ ] Consumir eventos Stellar con cursor, deduplicación y backfill en runtime.
- [ ] Supervisar heartbeat, leases, lag, reintentos y dead-letter policy.
- [ ] Completar pruebas de reinicio, concurrencia y shutdown graceful; existen pruebas básicas de start/stop y leases.
- [ ] Asegurar que restauración TTL no interpreta estado archivado como inexistente.

### 10.4 VPS, HTTPS y WebAuthn

- [ ] Inventariar VPS antes de mutar.
- [ ] Mantener PostgreSQL sin puerto público.
- [ ] Configurar dominio y certificado público válido; `tls internal` no sirve para producción pública.
- [ ] Alinear dominio, `NEXT_PUBLIC_APP_URL`, RP ID y origins WebAuthn.
- [ ] Configurar rollback de imagen sin revertir estado on-chain ni migraciones destructivamente.
- [ ] Definir mantenimiento, patching y firewall.

### 10.5 Secrets, relayer y gastos

- [ ] Inyectar secrets solo en runtime desde mecanismo aprobado.
- [ ] Separar y rotar admin, deployer, fee payer, DB y relayer API key.
- [ ] Definir límites de fee, presupuesto, rate limits y respuesta ante abuso.
- [ ] Documentar rotación, revocación y recuperación de cada credencial.

### 10.6 Backup, restore, RPO y RTO

- [ ] Aprobar RPO y RTO.
- [ ] Ejecutar backup real cifrado y con checksum.
- [ ] Restaurar en target aislado, nunca sobre la base activa.
- [ ] Ejecutar migraciones y pruebas sobre la restauración.
- [ ] Medir RPO/RTO y registrar evidencia.
- [ ] Automatizar retención y alertas de fallos.

### 10.7 Observabilidad y salud

- [ ] Exportar logs, métricas y trazas a un sistema externo.
- [ ] Añadir health/readiness separados para app, PostgreSQL, Stellar RPC, contratos y workers.
- [ ] Alertar por workers caídos, lag, operaciones `unknown`, fallos terminales, TTL en riesgo, backup fallido y presupuesto de relayer.
- [ ] Verificar redacción de PII, cookies, secrets y XDR.

## Entregables del handoff

- Diagrama de despliegue aprobado.
- Contrato de variables públicas y privadas.
- Migraciones y resultados de upgrade.
- Runbooks de deploy, rollback, backup, restore e incidente.
- RPO/RTO medidos.
- Dashboard y alertas operativas.
- Matriz de responsables y escalamiento.
- Evidencia de HTTPS/WebAuthn.
- Aprobación de producción.

## Criterio de aceptación

Una reinstalación, reinicio o fallo parcial no pierde identidad ni operaciones, no duplica transacciones y genera alertas accionables.

# Estrategia de commits y PRs

## Reglas

- Cada commit representa un comportamiento entregable y verificable.
- Tests y documentación pertenecen al mismo commit que el comportamiento.
- No crear commits por tipo de archivo.
- Usar Conventional Commits sin atribución de IA.
- Registrar en cada unidad: comando, resultado, escenario runtime y rollback boundary.
- No mezclar cambios preexistentes del usuario con una unidad nueva sin confirmar su pertenencia.
- No hacer push sin solicitud explícita.

## Secuencia sugerida

1. `fix(stellar): restore exact gateway readback verification`
2. `fix(security): contain testnet stellar harness`
3. `fix(security): separate stellar signing responsibilities`
4. `feat(auth): protect dashboard with passkey sessions`
5. `fix(stellar): bind passkey authorization to prepared intents`
6. `fix(wallet): verify smart wallet implementation by network`
7. `fix(integrity): standardize canonical ids and metadata hashes`
8. `feat(stellar): expose scoped operation status`
9. `feat(stellar): connect dashboard workflows to testnet gateway`
10. `feat(stellar): run observable testnet reconciliation`
11. `test(stellar): prove passkey workflows on testnet`
12. `chore(stellar): remove testnet wallet harness`
13. `refactor(stellar): remove legacy success-only mocks`
14. `fix(deps): update vulnerable production packages`
15. `fix(build): enforce production nextjs checks`
16. `ci: enforce web and contract quality gates`
17. `docs: align architecture with stellar integration`

## Límite de revisión

Si una PR supera **400 líneas modificadas**:

- dividirla por las unidades anteriores;
- mantener cada PR desplegable o verificable por sí misma;
- documentar dependencia con PR anterior/siguiente;
- no separar tests del comportamiento;
- no esconder una excepción de tamaño sin aprobación del revisor.

# Gate final de integración Testnet

**Estado auditado: NO CUMPLIDO.** Los comandos locales pasan y ya existen firma Passkey, allowlist, status/polling y worker runtime, pero faltan pruebas de esas fronteras, registro de entidad, E2E/cleanup, cierre HTTP y retiro total de mocks/temporales.

## Comandos locales

```powershell
pnpm install --frozen-lockfile
pnpm exec eslint . --max-warnings=0
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
pnpm contracts:lint
pnpm contracts:test
pnpm contracts:build
```

## Checklist funcional

- [x] Ambos contratos responden en Testnet y coinciden con el manifiesto según la evidencia registrada.
- [x] Dashboard no importa `src/lib/stellar.ts` ni `src/lib/hashes.ts`.
- [ ] Dashboard Testnet exige sesión passkey, rol y scope resueltos server-side; falta la UI WebAuthn real.
- [ ] Sesión y wallet quedan vinculadas durante el flujo E2E sin afirmar persistencia productiva.
- [ ] Registro de entidad llega a `confirmed` con readback exacto desde frontend.
- [ ] Emisión llega a `confirmed` con emisor, sujeto, evento, tipo, hash y schema correctos desde frontend.
- [ ] Revocación conserva historial y readback revocado desde frontend.
- [ ] Otra wallet y otro issuer son rechazados en E2E.
- [ ] XDR alterado es rechazado antes del fee payer mediante la matriz adversarial real.
- [ ] Timeout queda `unknown` y se reconcilia sin reenvío ciego en runtime.
- [ ] Doble clic y retry conservan una sola intención desde UI.
- [ ] UI no llama confirmado a una respuesta 2xx no terminal en todos los flujos.
- [x] No existen secrets `NEXT_PUBLIC_*` en el código auditado.
- [ ] Kill switch y controles HTTP pasan la matriz completa; faltan Origin/CSRF/rate/body/schema.
- [ ] Allowlist WASM está aprobada y verificada on-chain.
- [ ] Cleanup on-chain fue ejecutado y verificado.
- [ ] La página `/smart-wallet` y `grant-roles` fueron eliminados; falta retirar `/api/sign/prepare` si sigue siendo exclusivo del harness y limpiar flags/referencias temporales.
- [x] `pnpm audit --prod` no reporta vulnerabilidades conocidas.
- [x] Build Next/Docker no desactiva typecheck.
- [x] CI ejecuta gates sin secrets ni mutaciones de red.
- [ ] Auditar la evidencia final del E2E para confirmar ausencia de PII, secrets y XDR firmado completo.

## Definition of Done — Integración Testnet

La entrega de integración queda terminada cuando:

- todos los checks anteriores están aprobados;
- el E2E completo se ejecutó desde el frontend real;
- los contratos existentes fueron usados sin configuración cruzada;
- la autoridad temporal fue retirada;
- el harness fue eliminado;
- la documentación explica con precisión qué sigue pendiente de Marcos.

Este estado puede denominarse **“integración Stellar Testnet entregada”**. No denominarlo producción.

# Gate de producción completa

**Estado auditado: NO CUMPLIDO.** La integración Testnet aún no está cerrada y faltan controles e infraestructura operativa obligatorios.

Además del gate Testnet:

- [ ] PostgreSQL durable y migraciones verificadas.
- [ ] Identidad, sesiones y vínculo cuenta-wallet sobreviven recargas, reinicios y múltiples procesos.
- [ ] Operaciones firmadas recuperables ante crash.
- [ ] Workers, indexador y TTL ejecutándose y supervisados.
- [ ] HTTPS público y WebAuthn validados con dominio final.
- [ ] Secrets y claves separados, rotables y fuera del repositorio.
- [ ] Relayer con límites, presupuesto y alertas.
- [ ] Backup/restore ensayado con RPO/RTO aprobados.
- [ ] Health, métricas, logs y alertas externos.
- [ ] Runbooks de deploy, rollback e incidente probados.
- [ ] Revisión de seguridad y privacidad sin bloqueadores.
- [ ] Aprobación humana explícita de Marcos Vini y responsables del producto.
- [ ] Gate Mainnet separado si se decide usar Mainnet.

## Definition of Done — Producción completa

CulturaGO puede declararse listo para producción únicamente cuando:

1. la integración Testnet está cerrada;
2. el handoff de Marcos está implementado y verificado;
3. recuperación, seguridad y operación tienen evidencia reproducible;
4. no existen bloqueadores abiertos en `docs/review/security-privacy-checklist.md`;
5. una aprobación humana explícita autoriza el entorno productivo.

La promoción a Mainnet no está incluida automáticamente. Debe seguir `docs/gates/mainnet.md` como una acción separada, explícita y auditable.
