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

## Estado inicial verificado

Este baseline corresponde al working tree analizado el 26 de agosto de 2026. Debe volver a medirse al comenzar la ejecución.

| Área | Estado verificado | Interpretación |
|---|---|---|
| Contratos Testnet | Los dos IDs del manifiesto responden por Stellar RPC | Los contratos están desplegados y accesibles |
| Contratos Rust | 51/51 tests, `fmt` y `clippy` pasan | La base contractual está sana |
| TypeScript | `pnpm typecheck` pasa | El working tree tipa correctamente fuera de Docker |
| Build | `pnpm build` pasa | El build local funciona, con advertencia por `middleware` deprecado |
| Tests web | 79/85 pasan; 6 fallan | Existe una regresión bloqueante de readback |
| Lint | 0 errores y 56 warnings | No bloquea actualmente, pero no es un gate limpio |
| Dependencias | 15 vulnerabilidades: 8 altas y 7 moderadas | Bloquea un release público |
| Git | `main` está un commit detrás de `origin/main` | No integrar cambios remotos sin preservar el working tree |
| Working tree | 11 archivos modificados, aproximadamente 627 adiciones y archivos no rastreados | Debe preservarse y clasificarse antes de continuar |
| Dashboard | Usa `src/lib/stellar.ts` mock | La interfaz principal no invoca contratos reales |
| Autenticación UI | `/login` continúa en modo demo y el layout del dashboard no valida sesión | Las APIs de identidad existentes todavía no protegen la experiencia administrativa |
| Gateway real | Conectado a `/api/sign/*` y al harness `/smart-wallet` | Existe integración parcial, no productiva |
| Smart wallet | `PasskeyKitSigner` conserva metadata de conexión en memoria | Crear/conectar puede probarse en el harness, pero no sobrevive de forma confiable a recargas o reinicios |
| Persistencia | Diferida a Marcos Vini | Sigue siendo requisito de producción completa |

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

## Objetivo

Comenzar desde un estado conocido sin perder los cambios locales ni mezclar accidentalmente el commit remoto pendiente.

## Unidad 0.1 — Inventario y clasificación

**Archivos probables:** ninguno; solo evidencia local.

### Pasos

- [ ] Leer `AGENTS.md`, `CLAUDE.md` y las fuentes de verdad.
- [ ] Registrar `git status --short --branch`, `git diff --stat`, `git diff --check` y `git log -5 --oneline`.
- [ ] Clasificar archivos modificados y no rastreados como: integración vigente, diagnóstico temporal, evidencia o residuo eliminable.
- [ ] Comprobar que ningún archivo no rastreado contiene secretos antes de abrirlo o versionarlo.
- [ ] Inspeccionar el commit de `origin/main` pendiente sin hacer merge, rebase ni checkout.
- [ ] Comparar las versiones de Node, pnpm, Rust, Cargo, Stellar CLI y Docker con las documentadas.
- [ ] Ejecutar el baseline completo sin mutaciones de red.

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

- [ ] Mantener una prueba fallida que reproduzca `SUCCESS` seguido de `READBACK_MISMATCH` incorrecto.
- [ ] Alinear el transporte en memoria con los métodos reales `verify_entity`, `verify_credential` y `get_credential`, o establecer una representación común explícita.
- [ ] Verificar postcondiciones, no solo existencia:
  - entidad: ID, versión, metadata hash, schema y estado esperado;
  - emisión: credential ID, emisor, sujeto, evento, tipo, metadata hash, schema y no revocada;
  - revocación: registro existente, revocado y razón cuando corresponda.
- [ ] Conservar casos negativos donde el ledger confirma pero el readback no coincide.
- [ ] Evitar adaptaciones especiales que hagan al mock más permisivo que la red real.

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

## Objetivo

Impedir que endpoints de firma, deploy o administración Testnet puedan ser usados por un tercero y eliminar cualquier ruta de secreto hacia el navegador.

## Unidad 2.1 — Frontera E2E server-only

**Archivos probables:**

- `src/app/api/sign/prepare/route.ts`
- `src/app/api/sign/submit/route.ts`
- `src/app/api/smart-wallet/deploy/route.ts`
- `src/app/api/testnet/grant-roles/route.ts`
- `src/infrastructure/auth/`
- nuevo servicio server-only específico del harness
- `.env.example`

### Pasos

- [ ] Añadir un kill switch server-only para el harness E2E.
- [ ] Exigir simultáneamente entorno Testnet, passphrase exacta, IDs del manifiesto, flag y sesión/token interno autorizado.
- [ ] Validar sesión y permiso dentro de cada Route Handler; no confiar solo en layout, proxy o visibilidad de página.
- [ ] Validar `Origin` y aplicar protección CSRF a mutaciones.
- [ ] Limitar tamaño de body, frecuencia por sesión/IP/wallet y presupuesto de relayer.
- [ ] Usar schemas estrictos para comandos; rechazar campos desconocidos y tipos implícitos.
- [ ] Derivar server-side el actor autorizado y vincularlo a la sesión; no confiar en `actorAddress`, `operator` o `registrar` enviados sin prueba de control.
- [ ] Construir métodos administrativos desde una allowlist interna; nunca aceptar método, contract ID o XDR administrativo arbitrario.
- [ ] Mantener respuestas sin secretos, cookies, XDR administrativos ni trazas internas.

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

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/networkConfig.ts`
- `src/app/api/smart-wallet/deploy/route.ts`
- `.env.example`
- documentación de configuración

### Pasos

- [ ] Eliminar todo uso de `NEXT_PUBLIC_STELLAR_TESTNET_DEPLOYER_SECRET`.
- [ ] Fallar el build o la validación si existe cualquier variable `NEXT_PUBLIC_*SECRET`.
- [ ] Separar admin, deployer y fee payer en configuración y responsabilidad.
- [ ] Impedir fallbacks silenciosos entre admin, deployer y fee payer.
- [ ] Validar que la public key derivada de cada secret coincide con su address configurada.
- [ ] Limitar el fee payer a envelopes previamente preparados y verificados.
- [ ] Definir límites de fee, operaciones admitidas y presupuesto por sesión.
- [ ] Usar el relayer server-only para deploy/patrocinio cuando esté aprobado.

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

**Archivos probables:**

- `src/app/login/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/api/auth/`
- `src/infrastructure/auth/factory.ts`
- `src/infrastructure/auth/SessionService.ts`
- `src/infrastructure/auth/PasskeyService.ts`
- tests de Route Handlers y navegación protegida

### Pasos

- [ ] Conectar la UI de `/login` con los endpoints WebAuthn de registro y autenticación ya existentes.
- [ ] Mantener el acceso directo sin sesión únicamente en entorno `demo`, con identificación visual inequívoca.
- [ ] Exigir sesión válida server-side para dashboard, organizer y mutaciones Testnet.
- [ ] Resolver roles y `issuer_id` server-side mediante `ActorContext`; no aceptar scopes aportados por React.
- [ ] Redirigir o rechazar acceso cuando la sesión expire, sea revocada o no tenga el rol requerido.
- [ ] Vincular la sesión con la wallet autorizada antes de aceptar `actorAddress`.
- [ ] Conservar challenges de un uso, expiración, anti-replay, origin y RP ID exactos.
- [ ] Evitar enumeración de cuentas y credenciales WebAuthn en respuestas de error.
- [ ] Documentar que el store en memoria permite pruebas controladas de Testnet, pero no constituye persistencia productiva.
- [ ] No inventar el modelo durable cuenta-wallet: dejar su decisión y almacenamiento definitivo en el handoff de Marcos.

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

## Objetivo

Demostrar que la passkey autoriza exactamente la intención preparada, que la firma sobrevive la serialización y que la smart wallet usa una implementación allowlisted.

## Unidad 3.1 — Firma XDR real y comparación estructural

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/SorobanStellarGateway.ts`
- `src/infrastructure/stellar/SdkSorobanTransport.ts`
- tests nuevos para actor `C...`

### Pasos

- [ ] Construir fixtures XDR reales con Stellar SDK; no usar envelopes JSON del transporte mock para validar este límite.
- [ ] Probar que la auth entry firmada sobrevive `serialize -> parse`.
- [ ] Exigir exactamente una operación `invokeHostFunction`.
- [ ] Comparar source, sequence, memo, preconditions, host function, contract ID, método, argumentos, Soroban data, footprint y límites de recursos.
- [ ] Permitir únicamente las transformaciones de auth esperadas por Passkey Kit.
- [ ] Verificar address, firma y expiration ledger del actor.
- [ ] Rechazar modificaciones de auth entries ajenas al actor.
- [ ] Confirmar que el fee payer firma únicamente después de validar la intención.
- [ ] Tratar expiration insuficiente o RPC no disponible como error explícito; no generar firmas ambiguas.

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

**Archivos probables:**

- `src/lib/smartWallet/PasskeyKitSigner.ts`
- `src/infrastructure/stellar/networkConfig.ts`
- manifiesto Testnet
- tests de configuración y conexión

### Pasos

- [ ] Definir una única fuente canónica server-side de hashes aceptados por red.
- [ ] Validar formato, normalización, duplicados y pertenencia del hash de creación a la allowlist.
- [ ] Verificar el hash/código on-chain antes de crear o conectar una wallet.
- [ ] Rechazar una wallet de otra red o con implementación no allowlisted.
- [ ] Documentar versión, procedencia y nivel de auditoría de Passkey Kit.
- [ ] Obtener aceptación explícita del riesgo si la implementación no está auditada para el alcance requerido.

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

## Objetivo

Retirar falsos éxitos del frontend principal y conectar los casos de uso reales al pipeline `prepare -> sign -> submit -> status -> readback`.

## Unidad 4.1 — Identificadores on-chain y hash canónico

**Archivos probables:**

- `src/infrastructure/hashing/`
- `src/ports/CanonicalHashPort.ts`
- `fixtures/golden-vectors.json`
- consumidores de `src/lib/hashes.ts`
- tests de vectores e identificadores

### Pasos

- [ ] Ejecutar el punto `STOP` si no existe decisión para mapear UUID/string a `BytesN<32>`.
- [ ] Definir derivación determinística, versionada y con separación de dominio para entity, credential, issuer, subject y event IDs.
- [ ] Producir vectores dorados compartidos y detectar colisiones de namespace por diseño.
- [ ] Sustituir `generateMetadataHash` por `CanonicalHashPort` y schemas aprobados.
- [ ] Rechazar cualquier error de canonicalización; nunca devolver hashes aleatorios.
- [ ] Definir exactamente qué campos y medios forman `entity.v1` y `credential.v1`.
- [ ] Garantizar paridad navegador, Node y Rust.

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

**Archivos probables:**

- `src/components/StellarStatusBlock.tsx`
- `src/app/dashboard/eventos/[eventId]/page.tsx`
- páginas de credenciales y organizaciones
- cliente tipado para `/api/sign/*`
- casos de uso o contenedores de UI

### Pasos

- [ ] Separar UI presentacional de orquestación de transacciones.
- [ ] Reemplazar imports de `src/lib/stellar.ts` por un cliente tipado del gateway real.
- [ ] Conservar `MockStellarGateway` fiel solo para demo y tests; no usar el mock antiguo en flujos verificables.
- [ ] Derivar la intención desde datos aprobados, sesión y actor autorizado.
- [ ] Usar idempotency key estable por intención y reutilizarla en reintentos.
- [ ] Mostrar red, contract ID y procedencia del estado sin jerga innecesaria para usuarios finales.
- [ ] No actualizar la entidad/credencial como registrada hasta `confirmed`.
- [ ] Evitar que dobles clics creen dos operaciones.
- [ ] Integrar registro de entidad, emisión y revocación.

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

## Objetivo

Hacer recuperables y observables las operaciones que no terminan dentro de una solicitud HTTP.

## Unidad 5.1 — Consulta de operación y UX de estados

**Archivos probables:**

- nueva Route Handler de lectura por operation ID
- `src/ports/StellarGateway.ts`
- frontend de dashboard
- `src/app/smart-wallet/page.tsx` mientras exista el harness
- tests de acceso y estados

### Pasos

- [ ] Crear una consulta autenticada y autorizada de estado por operation ID.
- [ ] Verificar que la sesión tiene acceso a la operación.
- [ ] No devolver XDR, secrets, payload sensible ni datos de otra organización.
- [ ] Representar `awaiting_signature`, `signed`, `submitted`, `confirming`, `unknown`, `confirmed`, `failed_retryable` y `failed_terminal`.
- [ ] Eliminar el mensaje “Confirmado” basado únicamente en HTTP 2xx.
- [ ] Implementar polling acotado con backoff y cancelación al desmontar.
- [ ] Permitir reintento solo cuando la máquina de estados lo autorice.
- [ ] Mostrar correlation ID y orientación accionable sin trazas internas.

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

**Archivos probables:**

- `src/infrastructure/stellar/StellarWorker.ts`
- inicialización server-only o proceso explícito de Testnet
- métricas y health
- tests de shutdown, lease y recuperación

### Pasos

- [ ] Definir un proceso explícito que ejecute reconciliación en Testnet; una clase solo usada en tests no cuenta como runtime.
- [ ] No ejecutar múltiples schedulers sin lease o coordinación.
- [ ] Publicar heartbeat, último ciclo, lag y número de operaciones por fase.
- [ ] Soportar shutdown graceful.
- [ ] No afirmar durabilidad cuando el store es en memoria.
- [ ] Documentar que reinicios pierden operaciones hasta completar la fase de Marcos.
- [ ] Separar la reconciliación Testnet mínima de los workers durables de producción.

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

# Fase 6 — E2E real en Stellar Testnet

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

## Objetivo

Retirar superficies temporales y conservar solo componentes reutilizables del producto.

## Unidad 7.1 — Retiro del harness

**Archivos probables:**

- `src/app/smart-wallet/`
- `src/app/api/testnet/grant-roles/`
- servicios E2E temporales
- flags y variables E2E
- scripts temporales y reportes diagnósticos

### Pasos

- [ ] Eliminar `/smart-wallet` después de guardar evidencia y completar cleanup.
- [ ] Eliminar endpoints exclusivos del harness.
- [ ] Eliminar flags, tokens y variables temporales.
- [ ] Retirar `raw-report.json` y scripts `tmp-*` si solo son diagnósticos y su eliminación fue aprobada.
- [ ] Conservar signer, gateway y relayer que formen parte de la arquitectura productiva.
- [ ] Comprobar que no quedan referencias a `grant-roles`, ruta del harness o secretos públicos.

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

**Archivos probables:**

- `src/lib/stellar.ts`
- `src/lib/hashes.ts`
- consumidores legacy
- documentación de demo

### Pasos

- [ ] Confirmar que no existen imports productivos.
- [ ] Eliminar o archivar el mock que siempre devuelve éxito.
- [ ] Mantener `MockStellarGateway` e `InMemoryChainTransport` como test doubles fieles.
- [ ] Etiquetar claramente demo/Testnet/Mainnet en UI y datos.

### Criterio de aceptación

Ningún registro simulado se presenta como verificado en Stellar.

### Commit sugerido

`refactor(stellar): remove legacy success-only mocks`

# Fase 8 — Supply chain, Next.js, build y CI

## Objetivo

Convertir las verificaciones manuales en gates reproducibles y eliminar vulnerabilidades altas aplicables.

## Unidad 8.1 — Dependencias vulnerables

**Archivos probables:**

- `package.json`
- `pnpm-lock.yaml`

### Pasos

- [ ] Revisar cada advisory y su aplicabilidad.
- [ ] Actualizar Next.js y `eslint-config-next` a una versión corregida compatible.
- [ ] Resolver `sharp`, PostCSS y nanoid mediante dependencias soportadas, sin overrides inseguros.
- [ ] Verificar antigüedad de la versión seleccionada; aplicar el punto `STOP` si fue publicada hace menos de siete días.
- [ ] No usar rangos flotantes ni `latest`.
- [ ] Ejecutar pruebas y build después de cada grupo de actualización.

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

**Archivos probables:**

- `next.config.ts`
- `deploy/Dockerfile`
- `src/middleware.ts` o reemplazo `proxy.ts`
- error boundaries de App Router
- configuración de Caddy cuando corresponda

### Pasos

- [ ] Eliminar `typescript.ignoreBuildErrors` del build Docker.
- [ ] Ejecutar typecheck explícito dentro del pipeline de imagen.
- [ ] Migrar la convención de `middleware` a `proxy` siguiendo la documentación instalada de Next.js 16.
- [ ] Añadir UI global de error y not-found accesible si aplica al App Router actual.
- [ ] Confirmar que Caddy limita requests, no expone Next.js directamente y aplica headers/CSP aprobados.
- [ ] Construir y ejecutar la imagen standalone con health check.
- [ ] Verificar que variables públicas quedan fijadas en build y secrets solo en runtime.

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

**Archivos probables:**

- workflow del proveedor Git aprobado
- scripts de package si faltan gates estables

### Pasos

- [ ] Confirmar el proveedor CI antes de crear configuración.
- [ ] Usar Node y pnpm fijados.
- [ ] Ejecutar instalación con lockfile congelado.
- [ ] Ejecutar lint sin warnings, typecheck, tests, build, audit productiva y contratos.
- [ ] Verificar que CI no recibe secrets para PRs no confiables.
- [ ] No ejecutar deploy ni mutaciones Testnet/Mainnet desde CI ordinario.
- [ ] Guardar artefactos de test/build sin `.env`, XDR o PII.

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

## Objetivo

Alinear documentación con el sistema ejecutable y dejar un handoff que no dependa de memoria oral.

## Unidad 9.1 — Actualizar fuentes históricas

**Archivos probables:**

- `README.md`
- `CODEMAP.md`
- `docs/architecture.md`
- `docs/stellar-integration.md`
- `docs/evidence.md`
- `docs/review/security-privacy-checklist.md`

### Pasos

- [ ] Sustituir comandos npm por pnpm.
- [ ] Eliminar credenciales demo presentadas como acceso administrativo productivo.
- [ ] Documentar gateway real, demo fiel y ausencia del mock legacy.
- [ ] Describir contratos, passkey, relayer, estados y límites de persistencia.
- [ ] Marcar claramente qué pertenece a integración Testnet y qué queda para Marcos.
- [ ] Actualizar checklist solo con evidencia real.
- [ ] Mantener cero secretos y PII.

### Criterio de aceptación

Un nuevo ejecutor puede comprender arquitectura, ejecutar tests y distinguir demo, Testnet y producción sin consultar conversaciones previas.

### Commit sugerido

`docs: align architecture with stellar integration`

## Unidad 9.2 — Completar manifiesto Testnet

**Archivo principal:** `docs/manifests/testnet-manifest.json`.

### Pasos

- [ ] Mantener los contract IDs verificados.
- [ ] Registrar ledgers y tx hashes de despliegue solo si pueden probarse.
- [ ] Completar allowlist smart-wallet aprobada.
- [ ] Registrar versiones exactas de herramientas y dependencias.
- [ ] Validar hashes WASM contra artefactos reproducibles y código on-chain.
- [ ] Corregir notas que todavía afirman que contract IDs se completarán en el futuro.

### Criterio de aceptación

El manifiesto es coherente, público, reproducible y no contiene valores `null` requeridos por el gate.

### Commit sugerido

`docs(stellar): record verified testnet manifest`

# Fase 10 — Handoff operativo para Marcos Vini

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

- [ ] Definir y persistir el vínculo cuenta, sujeto, organización, credential ID WebAuthn y smart-wallet contract ID sin almacenar claves privadas ni biometría.
- [ ] Reemplazar `InMemoryPasskeyStorage` como fuente productiva de metadata de conexión y probar reconexión después de recarga, restart y nuevo proceso.
- [ ] Mantener separación entre passkey de autenticación de la aplicación y passkey/autorización on-chain cuando no sean la misma credencial.
- [ ] Persistir atómicamente XDR firmado validado, signer address y fingerprint antes del submit.
- [ ] No borrar `signed_xdr` ni `signer_address` en `save`.
- [ ] Resolver crash windows antes y después de `sendTransaction`.
- [ ] Recuperar `signed`, `submitted`, `confirming` y `unknown` sin duplicar efectos.
- [ ] Ejecutar suites contractuales comunes para stores de identidad, wallet y operaciones en memoria y PostgreSQL.

### 10.3 Workers, indexador y TTL

- [ ] Añadir procesos explícitos en despliegue para reconciliador, indexador y TTL.
- [ ] Consumir eventos Stellar con cursor, deduplicación y backfill.
- [ ] Supervisar leases, lag, reintentos y dead-letter policy.
- [ ] Probar reinicio, concurrencia y shutdown graceful.
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

- [ ] Ambos contratos responden en Testnet y coinciden con el manifiesto.
- [ ] Dashboard no importa `src/lib/stellar.ts` ni `src/lib/hashes.ts`.
- [ ] Dashboard Testnet exige sesión passkey, rol y scope resueltos server-side.
- [ ] Sesión y wallet quedan vinculadas durante el flujo E2E sin afirmar persistencia productiva.
- [ ] Registro de entidad llega a `confirmed` con readback exacto.
- [ ] Emisión llega a `confirmed` con emisor, sujeto, evento, tipo, hash y schema correctos.
- [ ] Revocación conserva historial y readback revocado.
- [ ] Otra wallet y otro issuer son rechazados.
- [ ] XDR alterado es rechazado antes del fee payer.
- [ ] Timeout queda `unknown` y se reconcilia sin reenvío ciego.
- [ ] Doble clic y retry conservan una sola intención.
- [ ] UI no llama confirmado a una respuesta 2xx no terminal.
- [ ] No existen secrets `NEXT_PUBLIC_*`.
- [ ] Kill switch y controles HTTP pasan pruebas.
- [ ] Allowlist WASM está aprobada y verificada on-chain.
- [ ] Cleanup on-chain fue ejecutado y verificado.
- [ ] `/smart-wallet` y endpoints administrativos temporales fueron eliminados.
- [ ] No quedan vulnerabilidades altas aplicables.
- [ ] Build Docker conserva typecheck estricto.
- [ ] CI ejecuta gates sin secrets ni mutaciones de red.
- [ ] Evidencia no contiene PII, secrets ni XDR firmado completo.

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
