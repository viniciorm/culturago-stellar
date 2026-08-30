# Plan de remediación para el E2E de smart wallet

> **Histórico / 2026-08-29:** el harness temporal `/smart-wallet` y sus endpoints
> exclusivos de prueba fueron eliminados del código. El flujo de smart wallet se
> ejecuta ahora desde el dashboard autenticado (`/dashboard`) usando
> `PasskeyKitSigner`, `/api/smart-wallet/deploy` y `StellarStatusBlock`. Este
> documento conserva las decisiones de diseño; las rutas y servicios temporales que
> describe ya no existen.

## Resultado esperado

Completar una prueba E2E real en Stellar Testnet que demuestre este recorrido:

1. crear y conectar una smart wallet con passkey;
2. concederle temporalmente los roles necesarios desde el servidor;
3. firmar invocaciones Soroban en el navegador;
4. enviar, confirmar y verificar las operaciones contra los contratos desplegados;
5. revocar los permisos temporales;
6. eliminar `/smart-wallet` y sus endpoints exclusivos de prueba.

`/smart-wallet` es un **harness temporal de Testnet**, no una funcionalidad de producción. La concesión de roles a wallets cliente se acepta únicamente para este E2E y no define el modelo de autorización definitivo.

## Decisiones obligatorias

| Tema | Decisión |
|---|---|
| Red | El harness solo funciona con la passphrase exacta de Stellar Testnet. Mainnet y redes desconocidas fallan cerradas. |
| Ruta | `/smart-wallet` existe solo mientras se ejecuta y estabiliza el E2E. |
| Admin | La secret key del admin vive exclusivamente en runtime del servidor. Nunca usa prefijo `NEXT_PUBLIC_`, nunca se serializa y nunca llega a React. |
| Ejecución administrativa | Las concesiones y revocaciones se realizan en un módulo `server-only` invocado por una Route Handler o Server Action protegida. Un React Server Component no debe firmar transacciones ni transportar secretos. |
| Separación de claves | Admin, fee payer y deployer usan cuentas distintas. El fee payer no administra roles y el admin no patrocina transacciones de usuario. |
| Roles E2E | La wallet recibe `registrar`, `issuer` y `revoker`, además del vínculo `IssuerOperator`, solo para un `issuer_id` de prueba. |
| Autoridad global de registrar | Se acepta temporalmente en Testnet porque el objetivo es probar llamadas directas. Antes de producción se debe restringir `REGISTRAR` a un backend confiable o diseñar scope por entidad. |
| Éxito | Un HTTP 2xx o un hash de transacción no significan éxito. Solo `SUCCESS` en ledger más readback exacto permiten mostrar `confirmed`. |
| Eliminación | El E2E no se considera cerrado hasta retirar la página, los endpoints temporales, el flag y los permisos concedidos. |

## Límites de seguridad del harness

El harness debe exigir simultáneamente:

- `NEXT_PUBLIC_CULTURAGO_ENV=testnet`;
- `CULTURAGO_E2E_SMART_WALLET_ENABLED=true` en el servidor;
- passphrase exacta `Test SDF Network ; September 2015`;
- IDs de contratos iguales al manifiesto Testnet aprobado;
- autenticación de una sesión con permiso interno de E2E o un token de ejecución temporal server-side;
- origin permitido y protección CSRF para operaciones mutantes;
- rate limit por sesión, IP y wallet;
- `issuer_id` generado dentro de un namespace de prueba;
- allowlist del hash WASM de la smart wallet;
- logs sin XDR firmado completo, cookies, passkeys, secretos ni API keys.

Si falla una condición, la respuesta debe ser `403` o un error de configuración; nunca debe usar defaults permisivos.

## Arquitectura temporal

```text
Browser /smart-wallet
    |
    |  wallet C..., issuer_id público, intención E2E
    v
Route Handler protegida
    |
    v
E2ESmartWalletAdminService (server-only)
    |-- valida Testnet, flag, sesión, origin, límites y manifiesto
    |-- carga STELLAR_TESTNET_ADMIN_SECRET en runtime
    |-- concede/revoca roles y vínculo
    |-- espera ledger y verifica estado
    v
Stellar RPC Testnet
```

### Servicio administrativo server-only

Crear una frontera explícita, por ejemplo:

```text
src/infrastructure/stellar/e2e/E2ESmartWalletAdminService.ts
```

Requisitos:

- primera línea efectiva: `import 'server-only'`;
- recibir la clave mediante una dependencia privada o cargarla desde configuración server-only;
- validar que la public key derivada de la secret coincide con `STELLAR_TESTNET_ADMIN_ADDRESS`;
- rechazar cualquier red distinta de Testnet;
- aceptar solo métodos administrativos predefinidos;
- no aceptar contract ID, método Soroban ni XDR arbitrarios desde el navegador;
- construir las llamadas administrativas desde tipos internos;
- registrar únicamente operation ID, método permitido, direcciones públicas, tx hash y ledger;
- confirmar cada transacción antes de iniciar la siguiente;
- soportar cleanup idempotente.

Variables privadas propuestas:

```text
STELLAR_TESTNET_ADMIN_ADDRESS
STELLAR_TESTNET_ADMIN_SECRET
STELLAR_FEEPAYER_ADDRESS
STELLAR_FEEPAYER_SECRET
CULTURAGO_E2E_SMART_WALLET_ENABLED
CULTURAGO_E2E_AUTH_TOKEN_HASH
```

Eliminar cualquier uso de:

```text
NEXT_PUBLIC_STELLAR_TESTNET_DEPLOYER_SECRET
```

La clave admin no debe reutilizarse como deployer ni fee payer. Esta separación reduce el impacto de una falla del relayer o del pipeline de firma.

## Remediaciones bloqueantes antes del E2E

### 1. Corregir la serialización de la firma passkey

Problema actual: `PasskeyKitSigner.sign` modifica `tx.operations[0].auth`, pero el envelope serializado conserva las auth entries originales.

Solución:

1. reconstruir un `AssembledTransaction` desde el XDR preparado;
2. usar la API soportada por Passkey Kit 0.16.5 (`kit.sign`/`signAuthEntries`);
3. firmar únicamente las auth entries cuyo address sea la smart wallet conectada;
4. verificar que al menos una entrada fue firmada;
5. volver a parsear el XDR resultante y comprobar que contiene la credencial address-bound y su firma;
6. rechazar operaciones adicionales o auth entries inesperadas.

Criterio de aceptación:

- una prueba con XDR real demuestra que la firma está presente después de serializar y volver a parsear;
- una invocación Testnet firmada por la passkey alcanza el contrato;
- una wallet distinta no puede firmar la autorización preparada.

### 2. Vincular estrictamente XDR firmado e intent almacenado

Problema actual: para actores `C...`, `submitSigned` confía en `signerAddress` enviado por el navegador y firma el envelope recibido con el fee payer sin comprobar su contenido.

Solución mínima segura:

- parsear el XDR preparado y el XDR firmado;
- exigir exactamente una operación `invokeHostFunction`;
- comparar source account, sequence, memo, preconditions, host function, contract ID, método, argumentos, Soroban data, footprint y límites de recursos;
- exigir el mismo número y orden de auth entries;
- permitir únicamente las transformaciones esperadas dentro de la credencial del actor: upgrade address-bound admitido por el kit, expiration ledger y firma;
- verificar que el address de la credencial coincide con `op.intent.actorAddress`;
- rechazar cualquier operación clásica, contrato, método, argumento, source o footprint diferente;
- aplicar un límite de tamaño al body y al XDR antes de parsear;
- firmar con el fee payer solo después de completar la validación.

No alcanza con comparar `signerAddress`: ese valor también lo controla el cliente. Para cuentas clásicas puede conservarse la comparación de hash si el SDK garantiza que solo cambian las firmas del envelope; para smart wallets se necesita una comparación estructural normalizada porque cambian las auth entries.

Criterio de aceptación:

- pruebas negativas modifican individualmente destino, método, argumentos, source, fee, sequence, footprint y auth address; todas fallan antes de usar la clave del fee payer;
- el branch `C...` tiene la misma cobertura adversarial que el branch `G...`;
- ninguna ruta server-side firma un XDR arbitrario entregado por el cliente.

### 3. Proteger los endpoints temporales

Aplicar autenticación, autorización E2E, CSRF/origin check, flag, Testnet estricto y rate limit a:

```text
/api/sign/prepare
/api/sign/submit
/api/smart-wallet/deploy
/api/testnet/grant-roles
```

`grant-roles` no debe aceptar un método ni una dirección admin desde el body. El servidor deriva el admin desde su secret y solo acepta:

```json
{
  "walletAddress": "C...",
  "issuerId": "<64 hex>"
}
```

El servidor valida ambos valores y construye internamente estas operaciones:

1. `grant_registrar(walletAddress)`;
2. `grant_issuer(walletAddress)`;
3. `grant_revoker(walletAddress)`;
4. `link_issuer_operator(issuerId, walletAddress)`.

La respuesta devuelve tx hashes, ledgers y readback; nunca secretos ni XDR administrativos firmados.

### 4. Separar admin y fee sponsorship

El fee payer solo paga la transacción preparada y validada. No concede roles ni firma como admin.

Preferencia:

- usar fee bump o el flujo soportado por el relayer para sponsorship;
- mantener el intent original firmado/autorizado por la smart wallet;
- limitar fee máximo, operaciones admitidas y presupuesto por sesión.

Si se conserva el fee payer como source de la invocación Soroban, la validación estructural del punto anterior es bloqueante.

### 5. Corregir persistencia y máquina de estados

Agregar mediante una nueva migración, sin editar una migración ya aplicada:

```text
awaiting_signature
signed
```

La migración debe ejecutarse antes de crear índices que usen esos valores.

Corregir además el crash window de `signed`:

- persistir de forma atómica el XDR validado, signer address y fingerprint antes de submit;
- después de obtener tx hash, persistir `submitted` y el hash en la misma transición lógica;
- permitir que el worker recupere `signed` sin reenviar a ciegas;
- si no existe tx hash, reconstruir la decisión desde el XDR persistido y una idempotency key estable;
- no borrar `signed_xdr` ni `signer_address` durante `save` antes del estado terminal.

Criterio de aceptación:

- migraciones desde una base vacía y desde el esquema anterior pasan;
- un crash simulado antes y después de `submit` converge sin duplicar la operación;
- PostgreSQL y `InMemoryOperationStore` cumplen la misma suite contractual.

### 6. Corregir confirmación y readback

Cada intent necesita una postcondición exacta:

| Intent | Readback requerido |
|---|---|
| `register_entity` | La entidad existe y su versión, `metadata_hash` y `hash_schema` coinciden. |
| `issue_credential` | La credencial existe y coinciden issuer, subject, event, type, hash, schema y estado no revocado. |
| `revoke_credential` | La credencial existe, está revocada y coincide la razón esperada cuando corresponda. |

No aceptar `raw !== null` como verificación suficiente. El transporte real y el mock deben devolver el mismo tipo de resultado comprobable.

### 7. Añadir reconciliación observable

Crear un endpoint autenticado de lectura, por ejemplo:

```text
GET /api/sign/operations/:operationId
```

Debe devolver solo operaciones accesibles por la sesión y nunca XDR ni secretos.

La UI muestra el estado real:

- `awaiting_signature`: esperando passkey;
- `submitted`/`confirming`: enviada, aún no confirmada;
- `unknown`: resultado pendiente de reconciliación;
- `confirmed`: ledger y readback correctos;
- `failed_terminal`: fallo final.

Eliminar el texto `Confirmado` para cualquier HTTP 2xx. Iniciar el worker/reconciliador en un proceso server-side explícito o documentar un job separado; una clase que solo existe en tests no proporciona reconciliación en runtime.

### 8. Corregir consistencia del flujo de prueba

`grantRoles` debe devolver el `issuerId` realmente vinculado y propagar errores. `fullBailarinaFlow` reutiliza ese mismo valor en registro y emisión; no debe depender de que React haya aplicado `setOrganizerId`.

Flujo requerido:

```text
const issuerId = await grantRoles();
const organizationId = await registerOrganizer(issuerId);
const dancerId = await registerDancer();
await issueCredential({ issuerId, organizationId, dancerId });
```

Si falla una concesión, el flujo se detiene. No se continúa con registro o emisión.

## Remediaciones contractuales

### TTL y archivado

Agregar renovación coherente en:

- `verify_entity`: `Head` y `Version` cuando existen;
- `verify_credential`: `ById` cuando existe;
- `revoke_credential`: evaluar renovar `ByToken` y `ByBusinessKey` para conservar los índices coordinados;
- rutas de lectura relevantes: renovar también instance storage según la política aprobada.

La integración debe detectar `restorePreamble`, restaurar antes de invocar y no interpretar una entrada archivada como inexistente.

### Overflow de versión

Reemplazar `latest_version + 1` por `checked_add` y devolver un error contractual estable, aunque alcanzar `u32::MAX` no sea práctico.

### Eventos administrativos

Las funciones wrapper de roles deben obtener el admin autenticado desde `enforce_admin_auth` y usar esa dirección como `caller` del evento. No aceptar un `caller` independiente que pueda producir atribución inconsistente.

### Scope de `REGISTRAR`

Para este E2E se acepta el rol global de la wallet porque opera únicamente sobre datos efímeros de Testnet.

Antes de producción se debe elegir y documentar una sola política:

1. **Registrar central**: únicamente un servicio backend confiable conserva `REGISTRAR_ROLE` y las wallets cliente envían intents al backend.
2. **Registrars delegados**: el contrato incorpora ownership/scope por entidad y solo el registrar propietario o un admin puede versionar/desactivar.

No desplegar registrars delegados en Mainnet manteniendo la autoridad global actual.

## Supply chain y configuración

Antes del E2E final:

- actualizar Next.js desde `16.2.10` a una versión corregida compatible;
- resolver las vulnerabilidades transitivas de `sharp`, PostCSS y `nanoid` mediante pnpm;
- ejecutar `pnpm audit --prod` hasta no conservar vulnerabilidades altas aplicables;
- mantener versiones fijadas o lockfile reproducible;
- no usar el reporte vacío de Scout como evidencia: Scout 0.3.16 no completó el análisis con `soroban-sdk 26.1.1`;
- retirar `raw-report.json` generado por la ejecución fallida.

## Plan de pruebas

### Unitarias e integración

- firma passkey presente después del round trip XDR;
- auth entry vinculada a la wallet correcta;
- XDR alterado rechazado para actores `C...` y `G...`;
- fee payer nunca firma pagos ni operaciones fuera de allowlist;
- endpoints sin sesión, flag u origin válido responden rechazo;
- migraciones PostgreSQL completas;
- recuperación desde `signed`, `submitted`, `confirming` y `unknown`;
- readback exacto para registro, emisión y revocación;
- TTL de verificaciones renovado;
- `grantRoles` propaga fallos y conserva un único `issuerId`.

### E2E Testnet

1. activar el flag temporal;
2. crear wallet y confirmar despliegue;
3. reconectar con la misma passkey;
4. conceder roles desde el servicio server-only;
5. registrar organización y bailarina;
6. emitir credencial;
7. verificar credencial por ID y readback;
8. revocar credencial y confirmar que deja de verificar;
9. probar rechazo con otra wallet, otro issuer y XDR alterado;
10. reconciliar una operación que inicialmente quede `unknown`;
11. ejecutar cleanup de roles y vínculo;
12. guardar evidencia pública: IDs, tx hashes, ledgers, red y resultados, sin secretos.

## Cleanup obligatorio

Crear una operación administrativa idempotente que:

1. ejecute `unlink_issuer_operator(issuerId, walletAddress)`;
2. revoque `issuer`;
3. revoque `revoker`;
4. revoque `registrar`;
5. confirme cada transacción y compruebe que la wallet ya no puede mutar.

Después de aprobar el E2E:

- eliminar `src/app/smart-wallet/`;
- eliminar `src/app/api/testnet/grant-roles/`;
- eliminar cualquier endpoint de deploy exclusivo del harness que no forme parte del producto;
- eliminar `E2ESmartWalletAdminService` si no tiene uso productivo;
- eliminar `CULTURAGO_E2E_SMART_WALLET_ENABLED` y el token E2E;
- retirar secretos Testnet temporales del entorno y rotarlos si fueron compartidos;
- mantener únicamente el signer, relayer y rutas que correspondan a la arquitectura aprobada de producción;
- comprobar por búsqueda que no quedan referencias a `/smart-wallet`, `grant-roles` ni `NEXT_PUBLIC_*SECRET`.

## Work units sugeridas

| Unidad | Resultado verificable | Commit sugerido |
|---|---|---|
| 1 | Secretos separados, flags y endpoints E2E protegidos | `fix(security): contain testnet smart-wallet harness` |
| 2 | Firma passkey serializada e intent binding para actores C | `fix(stellar): bind passkey authorization to prepared intent` |
| 3 | Migración de fases y recuperación del estado `signed` | `fix(stellar): make signed operations recoverable` |
| 4 | Readback exacto, status endpoint y reconciliación runtime | `fix(stellar): verify and reconcile submitted intents` |
| 5 | TTL, overflow y eventos administrativos corregidos | `fix(contracts): harden registry lifecycle invariants` |
| 6 | E2E Testnet completo, cleanup y evidencia | `test(stellar): cover smart-wallet contract flow on testnet` |
| 7 | Eliminación del harness temporal | `chore(stellar): remove smart-wallet e2e harness` |
| 8 | Dependencias vulnerables actualizadas | `fix(deps): update vulnerable production packages` |

Cada unidad incluye sus pruebas, comando ejecutado, resultado, escenario runtime y rollback específico.

## Definition of Done

- [ ] No existe ninguna secret key en variables `NEXT_PUBLIC_*` ni bundles del navegador.
- [ ] Admin, fee payer y deployer son cuentas separadas.
- [ ] El branch `C...` rechaza todo XDR que no corresponda estructuralmente al intent preparado.
- [ ] La firma passkey sobrevive al round trip XDR y autoriza una invocación Testnet real.
- [ ] Los endpoints temporales están autenticados, limitados a Testnet y detrás del kill switch.
- [ ] PostgreSQL acepta todas las fases y recupera crashes sin duplicar envíos.
- [ ] Solo ledger confirmado más readback exacto produce `confirmed`.
- [ ] TTL y restore tienen pruebas ejecutables.
- [ ] El E2E crea, conecta, concede permisos, registra, emite, verifica, revoca y limpia.
- [ ] Los roles y vínculos temporales fueron revocados on-chain.
- [ ] `/smart-wallet` y los endpoints exclusivos del harness fueron eliminados.
- [ ] No quedan vulnerabilidades altas aplicables en `pnpm audit --prod`.
- [ ] La evidencia final no contiene secretos, PII ni XDR firmados completos.
