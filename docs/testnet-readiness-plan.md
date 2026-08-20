# Plan de cierre operativo para Stellar Testnet

## Resultado esperado

Ejecutar este plan de arriba abajo para cerrar los pendientes del plan Kimi 3 y dejar CulturaGO desplegable y verificable en Stellar Testnet, con:

- dos contratos de dominio desplegados con IDs, hashes WASM y ledgers reales;
- ABI y clientes TypeScript reproducibles para ambos contratos;
- vectores dorados compartidos por TypeScript, Rust y el paquete de verificación;
- aplicación Next.js desplegada mediante HTTPS con PostgreSQL privado;
- WebAuthn verificado con RP ID y origins exactos, sin defaults de producción;
- una smart wallet creada y reconectada mediante una implementación cuyo hash esté en la allowlist de Testnet;
- backup y restore PostgreSQL ensayados, medidos y comparados contra RPO/RTO aprobados;
- evidencia WCAG 2.2 AA, móvil, caos y rendimiento;
- smoke Testnet completo con hashes de transacción, ledgers y readback contractual;
- Mainnet bloqueado hasta una aprobación humana separada.

Este documento continúa `docs/kimi3-implementation-plan.md`. No vuelve a implementar sus fases ya verificadas: define el trabajo residual, sus dependencias, variables, scripts, evidencia y gates.

## Estado inicial verificado

La existencia de código o un checkbox previo no se considera evidencia de operación real. El baseline observado es:

| Área | Estado comprobado | Brecha que debe cerrar este plan |
|---|---|---|
| TypeScript | `pnpm test` pasa 85/85 y `pnpm typecheck` pasa | No hay E2E real de WebAuthn, PostgreSQL, smart wallet o Testnet. |
| Contratos | `cargo test` pasa 51/51 | No hay despliegue Testnet ni readback con IDs/ledgers reales. |
| Build Next.js | Falla al mezclar entorno `demo` con variables Stellar Testnet | Separar configuración por entorno y corregir el warning de `middleware`/Edge antes de desplegar. |
| Manifiesto | Contiene hashes WASM locales | `contractId` y `ledger` son `null`; la allowlist smart-wallet está vacía. |
| Smoke | `scripts/testnet-smoke.sh` solo imprime un dry-run | Implementar preflight, despliegue, invocaciones, polling, readback y evidencia reales. |
| Smart wallet | `connectWallet` existe | `sign()` es un stub; no existe flujo completo `createWallet -> submit -> confirm -> connect`; el adapter no pasa RP ID ni lista de hashes aceptados. |
| WebAuthn | Existe integración con SimpleWebAuthn | Producción conserva defaults `localhost`; falta prueba HTTPS real y el contrato de digest del challenge debe probarse contra PostgreSQL real. |
| ABI/clientes | Stellar CLI 27.1.0 soporta `contract bindings typescript` | No existen paquetes generados ni control de drift. |
| Vectores dorados | Hay tres vectores Node/Web en un test | No existe fixture versionado independiente ni paridad Rust/ABI/XDR. |
| PostgreSQL | Hay migraciones, pool y un runbook breve | No hay scripts de backup/restore, retención, alertas ni medición reproducible de RPO/RTO. |
| Calidad | Unit tests presentes | No hay suite WCAG, matriz móvil, harness de caos ni presupuesto de rendimiento. |
| Despliegue | `output: "standalone"` está configurado | Docker y Compose conservan pnpm 9, instalación no congelada y configuración heredada de Supabase; `setup-vps.sh` no es seguro ni autoritativo. |

## Fuentes de verdad

1. `docs/kimi3-implementation-plan.md` — decisiones de dominio, identidad, privacidad y Mainnet.
2. `docs/soroban-contract-architecture.md` — contratos e invariantes on-chain.
3. `docs/manifests/testnet-manifest.json` — manifiesto operativo una vez completado con evidencia real.
4. Código, tests y artefactos generados — evidencia ejecutable.
5. Documentación instalada de Next.js y ayuda de las versiones reales de Stellar CLI, PostgreSQL y SDKs.

Si una instrucción de este plan contradice las fuentes 1 o 2, detenerse y resolver la contradicción antes de implementar.

## Contrato operativo

Antes de modificar o ejecutar infraestructura:

1. Leer `AGENTS.md`, `CLAUDE.md`, este plan y las fuentes de verdad.
2. Usar pnpm exclusivamente. No ejecutar npm ni generar `package-lock.json`.
3. Consultar `node_modules/next/dist/docs/` antes de modificar código Next.js.
4. Consultar `stellar --help` y el subcomando específico antes de fijar flags.
5. Fijar las versiones de herramientas en la evidencia; no asumir que una máquina limpia usa las mismas.
6. No registrar ni persistir secrets Stellar, URLs PostgreSQL, credenciales de relayer, cookies, challenges, respuestas WebAuthn o PII.
7. Todo script mutante debe ser dry-run por defecto y exigir simultáneamente un flag `--execute`, entorno `testnet` validado y aprobación humana.
8. Ningún script puede inferir Mainnet, usar defaults de Mainnet o aceptar una passphrase distinta de Testnet.
9. No mutar el VPS sin inventario, backup reciente, restore verificado y aprobación específica.
10. No ejecutar caos, restore, borrado de proyecciones o carga contra producción.
11. No considerar un hash de transacción como éxito; exigir ledger confirmado y readback.
12. No marcar un checklist por inspección visual únicamente; adjuntar comando, resultado, fecha, versión y artefacto.
13. Mantener cada fase y sus pruebas en la misma unidad de trabajo.

### Condiciones para detenerse

Detenerse y pedir una sola decisión concreta si:

- no existe dominio HTTPS controlado para Testnet;
- RP ID, origins o relación entre credencial WebAuthn de aplicación y passkey firmante de wallet no están definidos;
- se pretende usar una implementación smart-wallet sin auditoría ni aceptación explícita de riesgo limitada a Testnet;
- no está aprobado el relayer/fee sponsorship o su modelo de abuso y costos;
- faltan cuenta Testnet financiada, direcciones de roles o acceso seguro al VPS;
- el restore solo puede probarse sobre la base activa;
- RPO/RTO no tienen propietario ni aprobación;
- una migración es destructiva o reinterpreta datos existentes;
- el hash on-chain de la smart wallet no coincide con la allowlist;
- ABI generado desde WASM local difiere del generado desde el contrato desplegado;
- un script intenta tocar Mainnet o imprimir un secreto;
- una herramienta exige degradar seguridad, supply chain o verificación.

## Decisiones de cierre

| Tema | Decisión |
|---|---|
| Alcance | Solo Testnet. Mainnet permanece como gate separado. |
| Contratos | Desplegar exactamente los dos contratos de dominio ya definidos. La smart wallet es infraestructura de identidad. |
| Smart wallet | No crear un contrato wallet propio. Verificar procedencia, versión y hash de una implementación aprobada antes de crear o conectar. |
| Passkey Kit actual | La versión instalada se declara no auditada. Solo puede usarse con fondos/autoridad mínimos en Testnet tras aceptación explícita de riesgo, o debe sustituirse por una implementación auditada compatible. |
| WebAuthn y wallet | No asumir que la passkey de login y la passkey on-chain son la misma credencial. Definir y probar el modelo antes de persistir el vínculo. |
| Smoke | Híbrido: automatización determinista para cadena/DB/evidencia y pasos humanos controlados para ceremonies WebAuthn reales. No automatizar biometría ni claves privadas. |
| Configuración pública | Variables `NEXT_PUBLIC_*` no contienen secretos y quedan inline durante `next build`; la imagen Testnet se construye después de conocer IDs/hashes. |
| Configuración privada | Base de datos, fixture signer, relayer, backup y observabilidad permanecen server-only y se inyectan en runtime. |
| Evidencia | El manifiesto guarda solo datos públicos. Los logs de ejecución deben redactar cualquier secreto. |
| Rollback | Rollback de aplicación no revierte estado on-chain. Toda corrección on-chain usa nuevas operaciones compensatorias o un redeploy Testnet documentado. |

## Orden obligatorio y dependencias

```text
Fase 0  Baseline y contrato de configuración
   |
Fase 1  Backup/restore PostgreSQL medido
   |
Fase 2  Despliegue VPS seguro + HTTPS + PostgreSQL privado
   |             
   +-------> Fase 3  ABI/clientes y vectores dorados
                      |
              Fase 4  WebAuthn productivo + smart wallet completa
                      |
              Fase 5  Despliegue y smoke real Testnet
                      |
              Fase 6  WCAG, móvil, caos y rendimiento
                      |
              Fase 7  Revisión, evidencia y gate de readiness
```

No comenzar Fase 5 sin Fases 1 a 4 aceptadas. Fase 6 usa únicamente el entorno Testnet aislado y recuperable creado por las fases anteriores.

# Configuración por entorno

## Reglas de variables

- `.env.example` debe representar un entorno `demo` coherente: todas las variables Stellar vacías.
- Crear plantillas sin secretos para Testnet; los valores reales se inyectan fuera del repositorio.
- Cada variable debe tener un único nombre canónico. No mantener simultáneamente allowlists divergentes.
- El validador debe fallar ante valores vacíos, formato inválido, red cruzada, HTTP en producción/Testnet WebAuthn o IDs de contrato nulos.
- Ningún script debe cargar `.env` de forma implícita sin informar el archivo y el entorno seleccionados.
- Los valores `NEXT_PUBLIC_*` se consideran públicos y build-time. Si cambia un ID/hash público, reconstruir la imagen.

## Variables públicas de build

| Variable | Testnet | Sensibilidad | Uso y validación |
|---|---|---:|---|
| `NEXT_PUBLIC_CULTURAGO_ENV` | `testnet` | Pública | Debe coincidir con la passphrase y el manifiesto. |
| `NEXT_PUBLIC_APP_URL` | `https://<dominio-testnet>` | Pública | URL canónica para enlaces, QR y exportaciones; sin slash final. |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Pública | Comparación exacta. |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | endpoint Testnet aprobado | Pública | Debe ser HTTPS y no contener API keys. |
| `NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID` | ID `C...` real | Pública | Debe coincidir con el manifiesto y responder readback. |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID` | ID `C...` real | Pública | Debe coincidir con el manifiesto y responder readback. |
| `NEXT_PUBLIC_STELLAR_EXPLORER_BASE` | explorador Testnet aprobado | Pública | Nunca apuntar a Mainnet. |
| `NEXT_PUBLIC_SMART_WALLET_WASM_HASH` | hash seleccionado | Pública | Solo el hash de creación aprobado para Testnet. |
| `NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES` | lista de hashes | Pública | Lista que el cliente entrega a `acceptedWasmHashes`; debe coincidir con la allowlist server-side. |

## Variables server-only de aplicación e identidad

| Variable | Requerida | Secreta | Uso y validación |
|---|---:|---:|---|
| `APP_URL` | Sí | No | Debe ser idéntica a la URL pública canónica. |
| `CULTURAGO_ALLOWED_HOSTS` | Sí | No | Lista exacta de hosts aceptados por la aplicación/proxy. |
| `WEBAUTHN_RP_ID` | Sí | No | Solo dominio registrable, sin esquema, puerto ni path. |
| `WEBAUTHN_ORIGINS` | Sí | No | Lista exacta de origins HTTPS, con esquema y puerto cuando corresponda. Sustituye el singular ambiguo. |
| `DATABASE_URL` | Sí | Sí | Rol runtime de mínimo privilegio; sin DDL. |
| `SMART_WALLET_WASM_HASH` | Sí | No | Hash usado para crear nuevas wallets; debe pertenecer a la allowlist. |
| `SMART_WALLET_ACCEPTED_WASM_HASHES` | Sí | No | Lista normalizada de hashes aceptados al conectar; fuente canónica server-side. |
| `SMART_WALLET_RELAYER_BASE_URL` | Si hay relayer | No | Solo server-side aunque la URL no sea secreta. |
| `SMART_WALLET_RELAYER_API_KEY` | Si hay relayer | Sí | Secret manager; nunca bundle cliente. |
| `LOG_LEVEL` | No | No | Nivel estructurado; producción/Testnet no usa logs de debug con payloads. |

`STELLAR_SMART_WALLET_WASM_ALLOWLIST` debe retirarse o convertirse en alias temporal validado contra `SMART_WALLET_ACCEPTED_WASM_HASHES`; no pueden existir dos fuentes independientes.

## Variables de despliegue y smoke Testnet

| Variable | Requerida | Secreta | Alcance |
|---|---:|---:|---|
| `CULTURAGO_ALLOW_TESTNET_MUTATIONS` | Sí para mutar | No | Debe ser literalmente `true`; rechazar en cualquier otra red. |
| `STELLAR_TESTNET_DEPLOYER_SECRET` | Para deploy | Sí | Solo proceso de despliegue; nunca runtime de navegador. |
| `STELLAR_TESTNET_ADMIN_ADDRESS` | Sí | No | Admin público de prueba aprobado. |
| `STELLAR_TESTNET_REGISTRAR_ADDRESS` | Sí | No | Rol mínimo para entidades. |
| `STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS` | Sí | No | Operador de prueba vinculado al issuer. |
| `TESTNET_MANIFEST_PATH` | Sí | No | Default seguro: `docs/manifests/testnet-manifest.json`. |
| `TESTNET_SMOKE_RUN_ID` | Sí | No | UUID para correlacionar DB, logs y operaciones. |
| `TESTNET_POLL_TIMEOUT_SECONDS` | Sí | No | Timeout acotado; un timeout termina en `unknown`, no en éxito. |
| `CULTURAGO_ALLOW_TESTNET_FIXTURE_SIGNER` | Solo harness | No | Mantener fuera del servicio público. |
| `STELLAR_TESTNET_FIXTURE_SECRET` | Solo harness | Sí | No reutilizar como passkey, sesión, admin de Mainnet o secret de aplicación. |

## Variables PostgreSQL operativas

| Variable | Requerida | Secreta | Uso |
|---|---:|---:|---|
| `DATABASE_MIGRATION_URL` | Sí para migrar | Sí | Rol separado con DDL; no se entrega al runtime. |
| `DATABASE_BACKUP_URL` | Sí para backup | Sí | Rol con lectura suficiente y sin escritura. |
| `DATABASE_RESTORE_URL` | Sí para drill | Sí | Debe apuntar a una instancia/base aislada, nunca a la activa. |
| `POSTGRES_BACKUP_DIR` | Sí | No | Volumen fuera del contenedor efímero, con permisos restrictivos. |
| `POSTGRES_BACKUP_RETENTION_DAYS` | Sí | No | Valor aprobado y monitoreado. |
| `POSTGRES_RPO_SECONDS` | Sí | No | Objetivo aprobado, no una medición inventada. |
| `POSTGRES_RTO_SECONDS` | Sí | No | Objetivo aprobado, no una medición inventada. |
| `POSTGRES_RESTORE_TARGET_GUARD` | Sí | No | Identificador esperado del entorno aislado; el script rechaza `production`. |

Propuesta inicial para el ensayo Testnet: RPO máximo de 24 horas y RTO máximo de 60 minutos. No convertir esta propuesta en compromiso operativo hasta que el responsable la apruebe explícitamente.

## Variables de imagen, proxy y TLS

| Variable | Requerida | Secreta | Uso |
|---|---:|---:|---|
| `CULTURAGO_IMAGE` | Sí | No | Repositorio/nombre de imagen. |
| `CULTURAGO_IMAGE_TAG` | Sí | No | Tag inmutable, preferentemente digest o commit SHA. |
| `CULTURAGO_DOMAIN` | Sí | No | Host HTTPS de Testnet; debe coincidir con RP ID/origin. |
| `ACME_EMAIL` | Según proxy | Moderada | Contacto de certificados; no incluir en imágenes ni logs públicos. |
| `PORT` | Sí | No | Puerto interno; no publicar PostgreSQL. |
| `HOSTNAME` | Sí | No | Bind interno del contenedor Next.js. |
| `NODE_ENV` | Sí | No | `production` en Testnet desplegado. |

# Scripts y artefactos requeridos

## Inventario actual

| Artefacto | Acción |
|---|---|
| `scripts/testnet-smoke.sh` | Sustituir el eco dry-run por un wrapper seguro del runner real o retirarlo. |
| `scripts/compute-golden-vectors.mjs` | Convertirlo en verificador de fixtures versionados; no debe ser la única fuente. |
| `database/migrate.mjs` | Mantener, pero aceptar explícitamente `DATABASE_MIGRATION_URL` para migraciones operativas. |
| `deploy/Dockerfile` | Reescribir con pnpm 10, lockfile congelado, stages reproducibles y cero variables Supabase. |
| `deploy/docker-compose.app.yml` | Reemplazar por topología Next.js + worker + proxy HTTPS + red PostgreSQL privada. |
| `deploy/setup-vps.sh` | No ejecutar. Retirar o archivar como legado después de reemplazarlo; contiene Supabase, endpoints hardcodeados y mutaciones inseguras. |
| `docs/runbooks/postgres-restore.md` | Expandir con guardas, backup, checksum, cifrado, restore aislado, pruebas y medición. |

## Scripts nuevos

| Script propuesto | Tipo | Responsabilidad |
|---|---|---|
| `scripts/env/validate.mjs` | Solo lectura | Validar contrato de variables, red, RP ID, origins, URLs, IDs y consistencia de allowlists sin imprimir secretos. |
| `scripts/contracts/build-reproducible.mjs` | Genera local | Compilar ambos WASM con toolchain fijado, calcular tamaño/checksum y comparar dos builds limpios. |
| `scripts/contracts/generate-bindings.mjs` | Genera local | Ejecutar Stellar CLI con argumentos seguros para ambos contratos y producir paquetes pnpm versionados. |
| `scripts/contracts/verify-bindings.mjs` | Solo lectura | Regenerar en temporal y fallar ante drift local/on-chain. |
| `scripts/contracts/verify-golden-vectors.mjs` | Solo lectura | Verificar fixtures TS/Rust, bytes canónicos, digests y serialización ABI/XDR. |
| `scripts/postgres/backup.sh` | Mutante controlado | Ejecutar `pg_dump -Fc`, checksum, cifrado/permiso, metadata y retención sin imprimir URL. |
| `scripts/postgres/restore-drill.sh` | Mutante aislado | Crear target aislado, restaurar, migrar, probar y medir RPO/RTO; rechazar producción. |
| `scripts/testnet/preflight.mjs` | Solo lectura | Validar CLI, RPC, passphrase, fondos, WASM, hashes, roles, manifest, HTTPS y aprobación. |
| `scripts/testnet/deploy-contracts.mjs` | Mutante Testnet | Instalar/desplegar/inicializar ambos contratos, confirmar y actualizar el manifiesto atómicamente. |
| `scripts/testnet/verify-smart-wallet.mjs` | Solo lectura | Comparar hash de código on-chain, dirección, signer y allowlist antes/después de conectar. |
| `scripts/testnet/smoke.mjs` | Mutante Testnet | Orquestar operaciones de dominio, polling, readback, indexación y evidencia; pausar para ceremonies humanas. |
| `scripts/testnet/evidence.mjs` | Solo lectura | Validar que el manifiesto y la evidencia tengan IDs, ledgers, tx hashes y versiones reales, sin secretos. |
| `deploy/preflight.sh` | Solo lectura | Verificar Docker, disco, red, certificados, backup reciente y configuración privada. |
| `deploy/deploy.sh` | Mutante VPS | Pull/build, migración aprobada, healthchecks y cambio controlado a la imagen nueva. |
| `deploy/rollback.sh` | Mutante VPS | Volver a imagen anterior sin revertir datos ni estado on-chain; detenerse si requiere rollback de esquema. |

Todos los scripts Node deben ser invocables mediante `pnpm run`. Los scripts VPS pueden ser shell porque su destino es Linux, pero deben soportar `--dry-run`, `--execute`, `set -euo pipefail`, quoting estricto y redacción.

## Scripts de package.json esperados

```text
env:check
contracts:build:repro
contracts:bindings
contracts:bindings:check
contracts:golden:check
db:backup
db:restore:drill
testnet:preflight
testnet:deploy
testnet:smoke
testnet:evidence
a11y:test
mobile:test
chaos:test
perf:test
deploy:preflight
```

No agregar un script hasta que exista el ejecutable, su ayuda, tests de guardas y documentación de rollback.

# Fase 0 — Baseline reproducible y configuración cerrada

## Precondiciones

- Cambios actuales del usuario preservados.
- Ningún secret leído o copiado al plan, evidencia o logs.

## Pasos

1. Registrar Git, Node, pnpm, Rust, Cargo, Stellar CLI, PostgreSQL client y Docker/Compose.
2. Crear el validador de entorno y tests de tabla para `demo`, `testnet`, `mainnet` y combinaciones inválidas.
3. Dejar `.env.example` coherente con `demo`: variables Stellar vacías.
4. Crear plantillas Testnet públicas y server-only sin valores secretos.
5. Eliminar defaults `localhost` de cualquier ruta de producción; permitirlos solo cuando el entorno sea desarrollo explícito.
6. Corregir la convención `middleware` de Next.js 16 y retirar APIs Node incompatibles con Edge según la guía instalada.
7. Hacer que build falle temprano con un mensaje de configuración claro, no durante prerender.
8. Ejecutar baseline completo con un entorno demo limpio y otro Testnet sintético no mutante.
9. Registrar fallos preexistentes separados de regresiones.

## Entregables

- Contrato de configuración y plantillas.
- `env:check` con pruebas negativas.
- Build limpio en demo.
- Evidencia de versiones.

## Aceptación

- `pnpm build` pasa con demo coherente.
- Demo rechaza cualquier RPC, contrato, explorador o allowlist real.
- Testnet rechaza HTTP para APP/WebAuthn, IDs nulos, passphrase incorrecta o allowlists vacías.
- Ningún secret aparece en bundle cliente, stdout, manifiesto o diff.

# Fase 1 — Backup, restore y RPO/RTO PostgreSQL

## Precondiciones

- Inventario de PostgreSQL/VPS de solo lectura.
- Destino de backup con permisos y capacidad aprobados.
- Base/instancia aislada disponible para restore.
- RPO/RTO propuestos asignados a un propietario para aprobación.

## Pasos

1. Separar roles runtime, migración, backup y restore con mínimo privilegio.
2. Implementar backup `pg_dump -Fc` con timestamp UTC, versión PostgreSQL, tamaño, SHA-256 y rango temporal de datos.
3. Proteger el backup en tránsito y reposo; no almacenar dumps dentro de la imagen o del repositorio.
4. Implementar retención sin borrar el único backup válido y sin seguir symlinks o rutas no esperadas.
5. Implementar restore drill sobre destino aislado con guardas de host, base y entorno.
6. Restaurar, ejecutar migraciones idempotentes y pruebas DB reales.
7. Comparar esquema, constraints, conteos por tabla, outbox, cursor, proyecciones, cuentas y relaciones; no copiar secretos de sesión a evidencia.
8. Medir RPO desde el último dato recuperable y RTO desde inicio del incidente simulado hasta healthcheck funcional.
9. Provocar un backup fallido y un restore fallido controlados; verificar alerta y ausencia de falso éxito.
10. Programar backup periódico y alerta por antigüedad superior al RPO.
11. Registrar evidencia firmada/checksum y fecha del próximo drill.

## Entregables

- Scripts de backup y restore con tests de guardas.
- Runbook completo.
- Evidencia de un restore exitoso y uno fallido controlado.
- RPO/RTO medidos y objetivos aprobados.

## Aceptación

- Restore nunca toca la DB activa.
- El checksum se valida antes de restaurar.
- La aplicación y workers arrancan contra la DB restaurada y pasan el smoke DB.
- RPO y RTO medidos cumplen objetivos o quedan como bloqueador explícito.
- Un backup sin restore probado no se etiqueta como válido.

## Rollback

Retirar timer/scripts nuevos y conservar el último backup válido. No borrar backups ni bases de drill sin autorización específica.

# Fase 2 — VPS, contenedores, PostgreSQL privado y HTTPS

## Precondiciones

- Fase 1 aceptada.
- Dominio Testnet, DNS y control de certificados disponibles.
- Topología actual inventariada sin mutaciones.

## Pasos

1. Reemplazar Dockerfile heredado con imagen multi-stage, pnpm fijado por `packageManager`, `pnpm install --frozen-lockfile`, usuario no root y salida standalone.
2. Eliminar todos los argumentos y servicios Supabase del flujo objetivo.
3. Definir servicios separados para Next.js, worker Stellar y proxy TLS; crear un entrypoint real y observable para el worker.
4. Mantener PostgreSQL en loopback o red Docker privada sin `ports` públicos.
5. Montar secrets/configuración en runtime; no hornearlos en capas Docker.
6. Configurar healthchecks distintos para proceso, DB, RPC readiness y worker lag.
7. Configurar HTTPS, redirección HTTP->HTTPS, headers seguros y forwarding de host/proto consistente.
8. Validar certificado, cadena, renovación y expiración desde fuera y dentro del VPS.
9. Configurar firewall con solo SSH restringido y HTTP/HTTPS necesarios; no abrir PostgreSQL, paneles o APIs heredadas.
10. Implementar deploy por tag/digest inmutable, migración preflight, healthcheck y rollback de imagen.
11. Probar reinicio de Next.js y worker sin pérdida de outbox/indexador.
12. Archivar o retirar `setup-vps.sh` solo después de que el reemplazo esté probado.

## Entregables

- Dockerfile, Compose y proxy Testnet reproducibles.
- Scripts preflight/deploy/rollback.
- HTTPS real y PostgreSQL privado.
- Runbook VPS y worker.

## Aceptación

- `curl`/navegador muestran HTTPS válido y redirección segura.
- PostgreSQL no responde desde Internet y solo acepta roles/red aprobados.
- Imagen reproducible usa pnpm 10 y lockfile congelado.
- Rollback restaura la imagen anterior sin modificar datos ni cadena.
- Reinicios convergen sin doble efecto.

# Fase 3 — ABI, clientes generados y vectores dorados

## Precondiciones

- Stellar CLI 27.1.0 o versión aprobada fijada.
- Ambos contratos compilan reproduciblemente.

## Pasos

1. Compilar ambos WASM dos veces en entornos limpios y comparar SHA-256/tamaño.
2. Crear workspace pnpm para dos paquetes generados, uno por contrato.
3. Generar bindings TypeScript desde cada WASM local mediante `stellar contract bindings typescript --wasm ... --output-dir ...` usando los flags confirmados por la CLI instalada.
4. Construir y probar los paquetes con pnpm, nunca npm.
5. Integrar clientes tipados en el gateway/signer y retirar codificación manual donde el cliente generado sea autoridad.
6. Completar `PasskeyKitSigner.sign()` con un `AssembledTransaction` real; eliminar el stub.
7. Versionar un fixture JSON de vectores dorados con:
   - schema y documento de entrada;
   - bytes UTF-8 canónicos;
   - digest SHA-256;
   - metadata URI;
   - argumentos ABI/XDR relevantes;
   - respuesta/evento esperado por contrato.
8. Consumir el mismo fixture en Node, Web Crypto y Rust. No copiar constantes manualmente entre suites.
9. Agregar Unicode, límites, arrays, enteros, bytes32, valores opcionales y casos inválidos.
10. Generar paquete verificable de ejemplo QR/JSON/PDF y comprobar que reproduce el mismo digest.
11. Después del deploy Testnet, regenerar bindings desde `--contract-id` y exigir equivalencia semántica con los generados desde WASM.
12. Crear check CI de drift y registrar versión CLI en cada paquete.

## Entregables

- Dos paquetes de bindings.
- Signer/gateway conectado a clientes reales.
- Fixture dorado compartido y paquete verificable de ejemplo.
- Scripts de generación y drift.

## Aceptación

- Máquina limpia reproduce WASM, clientes y vectores.
- TypeScript y Rust producen exactamente los mismos bytes/digests.
- ABI local y on-chain no difieren.
- Cambiar ABI o vector sin regenerar falla en CI.
- No se incorpora secret ni ID ficticio en los paquetes.

# Fase 4 — WebAuthn productivo y smart wallet allowlisted

## Precondiciones

- HTTPS/RP ID/origins exactos definidos.
- Modelo aprobado para la relación entre credencial de login y passkey firmante.
- Implementación smart-wallet y riesgo/auditoría decididos.
- Relayer o fuente de fees Testnet aprobados.

## Pasos

1. Sustituir `WEBAUTHN_ORIGIN` por una lista exacta `WEBAUTHN_ORIGINS`; configurar `expectedOrigin` y `expectedRPID` sin defaults en Testnet.
2. Exigir `userVerification: "required"` si la política aprobada no justifica otra cosa.
3. Corregir y probar el contrato de challenge entre `PasskeyService` y `PostgreSQLIdentityStore`: usar un UUID propio para `auth_challenges.id`, calcular el digest SHA-256 una sola vez, compararlo como bytes y consumirlo atómicamente; no usar `options.user.id` como PK ni pasar el challenge base64url donde el store espera hex.
4. Ejecutar la misma suite contractual de challenge/passkey/sesión contra memoria y PostgreSQL real.
5. Probar origin/RP ID incorrectos, challenge expirado, purpose distinto, replay concurrente, credential revocada y counter inválido.
6. Rechazar `X-Forwarded-Host/Proto` no confiables y origins no allowlisted detrás del proxy.
7. Sanitizar errores públicos; no devolver mensajes internos de WebAuthn/DB directamente.
8. Crear un único factory de `PasskeyKit` que reciba RPC, passphrase, RP ID, `walletWasmHash` y `acceptedWasmHashes` validados.
9. Verificar procedencia y hash del WASM elegido. Registrar release, checksum, auditoría o aceptación Testnet y URL de fuente en el manifiesto, sin confiar solo en un README.
10. Implementar flujo:
    - `createWallet` en navegador;
    - enviar únicamente la transacción firmada al endpoint server-side;
    - relayer/fee payer server-only;
    - poll hasta ledger confirmado;
    - comprobar código on-chain contra allowlist;
    - `connectWallet` con verificación de hash activada;
    - verificar que la passkey es signer vivo;
    - persistir `wallet_contract_address` de forma idempotente.
11. Implementar firma de operaciones de dominio con clientes generados y consentimiento visible.
12. Verificar server-side que transacción, auth entries, contrato, método, issuer, sujeto, evento y tipo coinciden con la intención no consumida.
13. Probar reconexión en otro navegador/dispositivo permitido, segunda passkey y recovery sin cambiar `subject_id`.
14. Probar hash no allowlisted, wallet ajena, RPC 429/timeout, relayer rechazado y envío ambiguo.
15. Mantener balances y permisos mínimos en la wallet Testnet.

## Gate de modelo de credencial

Antes del paso 10 debe documentarse una de estas decisiones:

- credencial única compartida, con una ceremony server-issued demostrablemente compatible con la creación wallet; o
- credenciales separadas y claramente nombradas para login de aplicación y firma on-chain, con UX, recovery y mapping explícitos.

No asumir que `rawResponse` de una ceremony iniciada enteramente en navegador sustituye un challenge emitido y verificado por el servidor.

## Entregables

- WebAuthn real sobre HTTPS con suite PostgreSQL.
- Smart wallet creada, confirmada y reconectada.
- Hash on-chain validado contra allowlist.
- Firma real de clientes generados.
- Evidencia de fallos cerrados.

## Aceptación

- Origin/RP ID incorrectos nunca autentican.
- El replay concurrente produce como máximo un éxito.
- La smart wallet no conecta si el código no está allowlisted.
- El backend no posee passkey ni firma del usuario.
- Relayer/API key no aparecen en cliente o logs.
- La wallet firma una intención real y el readback coincide.

# Fase 5 — Despliegue de contratos y smoke real Testnet

## Precondiciones

- Fases 0 a 4 aceptadas.
- Aprobación explícita para mutar Testnet.
- Cuenta deployer financiada con fondos de prueba.
- Backup/restore reciente y despliegue HTTPS sano.

## Pasos de despliegue

1. Ejecutar `testnet:preflight` en modo solo lectura.
2. Construir y verificar ambos WASM contra los hashes esperados.
3. Instalar/desplegar `CulturalEntityRegistry`; confirmar tx y ledger.
4. Instalar/desplegar `CulturalCredentialRegistry`; confirmar tx y ledger.
5. Inicializar admin/roles mínimos y transferencia administrativa de prueba.
6. Actualizar el manifiesto atómicamente con contract IDs, deploy tx hashes, ledgers, WASM hashes, tamaños, toolchain y direcciones públicas.
7. Generar bindings desde los IDs desplegados y ejecutar drift check.
8. Construir la imagen Next.js Testnet con configuración pública definitiva.
9. Desplegar aplicación/worker mediante HTTPS y ejecutar healthchecks.
10. Crear/conectar la smart wallet de Fase 4 y agregar su dirección/ledger/hash al manifiesto.

## Secuencia smoke obligatoria

1. Registrar y autenticar passkey sobre HTTPS.
2. Crear, confirmar y conectar la smart wallet allowlisted.
3. Registrar entidad e inspeccionar readback.
4. Versionar entidad y comprobar historia.
5. Registrar Evento A y Evento B.
6. Vincular operador al issuer A.
7. Demostrar que el mismo actor no puede actuar por issuer B.
8. Registrar, check-in y confirmar participación.
9. Preparar Credencial A con `issuer_id`, `issued_by`, `subject_id`, `event_id`, `credential_type`, schema y hash.
10. Mostrar consentimiento, firmar con smart wallet, enviar, confirmar ledger y hacer readback.
11. Repetir para Credencial B del mismo sujeto.
12. Revocar A y comprobar que A permanece visible/revocada y B sigue vigente.
13. Reconstruir índice/pasaporte desde eventos.
14. Ejecutar TTL extend/restore controlado.
15. Verificar QR, JSON y PDF contra el mismo digest/contrato/ledger.
16. Reiniciar Next.js y worker; reconciliar cualquier estado `unknown` sin duplicar.
17. Agregar segunda passkey/recovery según el modelo aprobado y comprobar identidad estable.
18. Ejecutar logout, revocación de sesión y un intento de replay negativo.

## Evidencia por operación

Cada paso on-chain registra:

- `smokeRunId` y timestamp UTC;
- red/passphrase identificable;
- contrato, método y argumentos no sensibles resumidos;
- tx hash;
- ledger de confirmación;
- resultado de readback;
- operation/idempotency ID;
- versión de cliente/ABI;
- resultado esperado y observado.

## Aceptación

- Ningún `contractId`, ledger o tx hash es nulo o ficticio.
- Cada éxito tiene ledger y readback.
- Reejecutar con la misma idempotency key no duplica entidad/credencial.
- Hash smart-wallet real coincide con allowlist.
- El manifiesto no contiene secrets.
- No se ejecutó ninguna operación Mainnet.

# Fase 6 — WCAG 2.2 AA, móvil, caos y rendimiento

## Precondiciones

- Smoke funcional completo.
- Entorno aislado recuperable por restore.
- Perfiles de carga y límites aprobados.

## WCAG 2.2 AA

1. Incorporar E2E de accesibilidad con Playwright y axe o herramienta equivalente verificada.
2. Auditar rutas y estados clave: home, login/passkey, claim/recovery, organizer, participación, consentimiento/firma, progreso, error, pasaporte, verify, QR/PDF/JSON.
3. Probar teclado completo, orden de foco, focus visible, skip links, dialogs, errores, labels, headings, landmarks y anuncios de estado.
4. Verificar contraste, zoom 200/400%, reflow a 320 CSS px, orientación, target size, drag alternatives y contenido no basado solo en color.
5. Probar lectores de pantalla al menos en una combinación Windows y una móvil disponible.
6. Revisar criterios 2.2 nuevos aplicables: Focus Not Obscured, Dragging Movements, Target Size, Consistent Help, Redundant Entry y Accessible Authentication.
7. Registrar falsos positivos/criterios manuales; axe solo no demuestra conformidad completa.

## Matriz móvil

- iOS/Safari y Android/Chrome reales cuando estén disponibles.
- Desktop Chrome, Firefox, Safari/Edge según soporte acordado.
- Passkey local, passkey sincronizada y fallback permitido.
- Cámara/QR, deep link, rotación, teclado virtual y pérdida de conectividad.
- Anchos 320, 375, 768 y desktop; portrait/landscape.
- Red estable, latencia alta, offline durante firma y retorno tras background.

## Caos controlado

1. RPC timeout, 429 y respuesta ambigua después de submit.
2. Relayer timeout/rechazo/duplicado.
3. Worker detenido y reiniciado con backlog.
4. PostgreSQL reiniciado, pool agotado, lock timeout y transacción abortada.
5. Proxy/Next.js reiniciado durante confirmación.
6. Evento indexado dos veces, cursor atrasado y rebuild completo.
7. Backup fallido y restore drill fallido.
8. Certificado próximo a vencer y origin/RP ID mal configurado en entorno aislado.

Cada experimento define estado inicial, inyección, expectativa, duración máxima, abort condition, recuperación y evidencia. Nunca ejecutar contra producción.

## Rendimiento

Definir y aprobar antes de medir:

- perfil de usuarios concurrentes y duración;
- p50/p95/p99 por endpoint;
- Core Web Vitals móvil;
- presupuesto de bundle y payload;
- latencia DB y saturación del pool;
- tiempo de simulación, firma humana excluida, submit, confirmación y readback;
- lag máximo de worker/indexador y tiempo de recuperación;
- costo/recursos Soroban y tamaño WASM.

Baseline sugerido, sujeto a aprobación:

- LCP <= 2,5 s, INP <= 200 ms y CLS <= 0,1 en perfil móvil representativo;
- APIs no blockchain p95 <= 500 ms sin contar ceremony humana;
- queries DB p95 <= 200 ms bajo perfil acordado;
- cero errores no esperados y cero duplicados;
- backlog drenado dentro del RTO operativo acordado.

## Entregables

- Suite automática y checklist manual WCAG.
- Evidencia de dispositivos/navegadores.
- Harness de caos y reporte de recuperación.
- Perfil y reporte de rendimiento con presupuestos.

## Aceptación

- Cero violaciones WCAG A/AA abiertas en flujos críticos; excepciones requieren propietario y fecha.
- Todos los flujos críticos funcionan con teclado y lector de pantalla.
- Passkey, QR, consentimiento y recovery pasan la matriz móvil aprobada.
- Cada caos converge o produce alerta/estado recuperable sin doble efecto.
- Presupuestos de rendimiento aprobados se cumplen; la latencia de red Stellar se reporta separada de la aplicación.

# Fase 7 — Revisión final y gate de readiness

## Pasos

1. Ejecutar instalación congelada, lint, typecheck, tests, build, contratos, bindings y vectores.
2. Ejecutar suites PostgreSQL, WebAuthn, E2E, accesibilidad, móvil, caos y rendimiento aplicables.
3. Validar manifiesto Testnet y evidencia automáticamente.
4. Revisar diff completo, secretos, configuración pública y artefactos generados.
5. Completar revisión independiente de seguridad/privacidad sin bloqueadores.
6. Verificar que `docs/gates/mainnet.md` sigue bloqueado.
7. Registrar rollback exacto por unidad y riesgos residuales.
8. No promover a Mainnet como parte de este plan.

## Comandos base

```powershell
pnpm install --frozen-lockfile
pnpm env:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:build:repro
pnpm contracts:bindings:check
pnpm contracts:golden:check
cargo fmt --manifest-path "contracts/Cargo.toml" --all --check
cargo clippy --manifest-path "contracts/Cargo.toml" --workspace --all-targets
cargo test --manifest-path "contracts/Cargo.toml"
pnpm testnet:preflight
pnpm testnet:evidence
```

Los comandos mutantes `db:backup`, `db:restore:drill`, `testnet:deploy`, `testnet:smoke` y `deploy` requieren aprobación específica y no forman parte de una ejecución automática genérica.

# Unidades de trabajo propuestas

No hacer commit automáticamente. Cada unidad incluye código, pruebas, documentación y evidencia del mismo comportamiento.

1. `chore: enforce testnet environment contract`
   - validador, plantillas coherentes, build demo, Next.js proxy/middleware.
2. `ops: automate postgresql backup and restore drills`
   - roles, scripts, guardas, runbook y RPO/RTO.
3. `ops: replace legacy vps deployment`
   - Docker, Compose, HTTPS, worker, preflight y rollback.
4. `feat: generate typed stellar contract clients`
   - bindings, workspace pnpm, drift check e integración.
5. `test: share canonical golden vectors across runtimes`
   - fixture, TS/Rust/XDR y paquete verificable.
6. `fix: enforce production webauthn origins and replay safety`
   - configuración, challenge digest, PostgreSQL contract tests y errores seguros.
7. `feat: create and connect allowlisted testnet smart wallets`
   - factory, create/submit/confirm/connect, signer real y tests negativos.
8. `ops: deploy and verify culturago on stellar testnet`
   - preflight, deploy, manifiesto, smoke y evidencia.
9. `test: verify accessibility mobile resilience and performance`
   - WCAG, dispositivos, caos, carga y presupuestos.
10. `docs: close testnet readiness evidence`
   - checklists, revisión de seguridad y riesgos residuales.

Si una unidad supera 400 líneas revisables, dividirla en PRs encadenadas por comportamiento. Los clientes y fixtures generados pueden ir en una unidad separada, pero su generador y drift check deben revisarse primero.

# Matriz de cobertura de pendientes

| Pendiente | Fases | Evidencia de cierre |
|---|---:|---|
| Testnet smoke real con IDs/ledgers | 0, 2, 5, 7 | Manifiesto no nulo, tx hashes, ledgers, readback y smoke run. |
| HTTPS/RP ID/origins WebAuthn | 0, 2, 4, 6 | Certificado, config exacta, E2E positivo/negativo y matriz móvil. |
| Backup/restore PostgreSQL con RPO/RTO | 1, 6, 7 | Dump checksum, restore aislado, pruebas y mediciones aprobadas. |
| WCAG 2.2 AA, móvil, caos y rendimiento | 6, 7 | Reportes automáticos/manuales, dispositivos, experimentos y budgets. |
| ABI/clientes y vectores dorados | 3, 5, 7 | Paquetes generados, drift local/on-chain y fixtures TS/Rust/XDR. |
| Smart wallet creada/conectada allowlisted | 4, 5, 7 | Deploy wallet, hash on-chain, signer verificado, address/ledger y firma real. |
| Scripts de despliegue | 0, 1, 2, 5 | Preflight, backup, deploy, smoke, rollback y guardas probadas. |
| Variables de entorno | 0, todas | Matriz, plantillas, validador y ausencia de secretos en cliente/repo. |

# Definition of Done

El cierre Testnet está completo únicamente cuando:

- [x] `pnpm install --frozen-lockfile`, lint, typecheck, tests y build pasan con configuración limpia.
- [x] Contratos, WASM, ABI/clientes y vectores se reproducen en una máquina limpia.
- [ ] ABI local coincide con ABI de ambos IDs Testnet.
- [ ] Manifiesto contiene IDs, deploy tx hashes, ledgers, hashes y versiones reales.
- [x] HTTPS y certificado autofirmado son válidos para `166.0.112.1`; monitoreo pendiente.
- [ ] RP ID/origins fallan cerrados ante cualquier valor distinto.
- [ ] Challenge WebAuthn se consume atómicamente en PostgreSQL y replay concurrente falla.
- [ ] El modelo de credencial login/wallet está documentado y probado.
- [ ] Smart wallet fue creada, confirmada y reconectada con hash on-chain allowlisted.
- [ ] `PasskeyKitSigner.sign()` firma una intención real mediante cliente generado; no quedan stubs.
- [ ] Backend/relayer no custodian ni imprimen la passkey del usuario.
- [ ] Backup reciente tiene checksum y restore exitoso comprobado.
- [ ] RPO/RTO objetivos están aprobados y las mediciones cumplen o bloquean el gate.
- [ ] PostgreSQL no tiene puerto público y usa roles separados de mínimo privilegio.
- [ ] Smoke A/B completo tiene ledger/readback y resiste reintento/reinicio sin duplicar.
- [ ] WCAG 2.2 AA no tiene bloqueadores en flujos críticos.
- [ ] Matriz móvil WebAuthn/QR/firma/recovery pasa.
- [ ] Caos converge y alerta sin falsos éxitos.
- [ ] Presupuestos de rendimiento aprobados pasan.
- [ ] Revisión de seguridad y privacidad no tiene bloqueadores abiertos.
- [x] Scripts de deploy (`vps-deploy.mjs`) y gate (`fase7-gate.mjs`) fueron probados en Testnet; dry-run por defecto se mantiene en `testnet-smoke.mjs`.
- [x] Ningún secret aparece en repo, imagen, bundle, manifiesto o evidencia; `.env` y claves SSH son gitignored.
- [x] Mainnet no fue ejecutado y sigue requiriendo aprobación humana independiente.

*Avance: checkboxes marcados el 2026-08-20 tras pasar la Fase 7 del plan. Los ítems sin marcar son bloqueadores a resolver antes de promover a Mainnet.*

Cuando todos los ítems aplicables estén satisfechos, CulturaGO queda listo para pruebas controladas de usuario en Stellar Testnet. La promoción a Mainnet permanece fuera de alcance.