# Plan integral de implementación para Kimi 3

## Resultado esperado

Ejecutar este plan de arriba abajo para convertir el MVP de CulturaGO en una aplicación verificable, segura y operable, con:

- los gaps de `docs/soroban-contract-architecture.md` y `docs/recommended-improvements.md` resueltos;
- exactamente dos contratos de dominio CulturaGO terminados y reproducibles: `CulturalEntityRegistry` y `CulturalCredentialRegistry`;
- integración real en Stellar Testnet, sin falsos positivos de confirmación;
- pasaportes culturales que agregan credenciales inmutables por evento;
- aplicación Next.js desplegada en VPS con PostgreSQL directo y privado, sin acceso del navegador a la base de datos;
- autenticación completa incorporada recién en la Fase 8 mediante una smart wallet Stellar basada en passkeys;
- privacidad, idempotencia, indexación, recuperación y observabilidad aptas para un despliegue controlado;
- artefactos listos para promover a Mainnet, pero sin desplegar en Mainnet sin aprobación humana explícita.

Este documento es un plan de ejecución. Las decisiones de dominio y contrato se definen en:

1. `docs/soroban-contract-architecture.md` — fuente de verdad contractual y on-chain.
2. `docs/recommended-improvements.md` — fuente de verdad de gaps, prioridades y aceptación.
3. Código y esquema existentes — evidencia del estado inicial, no autoridad para conservar comportamientos inseguros.

Si hay contradicción, detenerse y pedir una sola decisión concreta antes de implementar el área afectada.

## Contrato operativo para Kimi 3

Antes de modificar archivos:

1. Leer `AGENTS.md`, `CLAUDE.md`, este plan y los dos documentos fuente completos.
2. Antes de tocar Next.js, leer las guías relevantes de la versión instalada en `node_modules/next/dist/docs/`. No asumir APIs de otra versión.
3. Usar **pnpm exclusivamente**. No ejecutar `npm install`, `npm ci` ni generar `package-lock.json`.
4. Consultar la documentación oficial vigente de Stellar, Soroban SDK, Stellar CLI y OpenZeppelin Stellar Contracts antes de fijar APIs o versiones.
5. Fijar versiones exactas y mutuamente compatibles. No seleccionar una versión publicada hace menos de siete días y no usar rangos flotantes.
6. No registrar, imprimir ni guardar secretos, credenciales SSH, seed phrases, claves privadas, challenges WebAuthn, XDR sensible, `DATABASE_URL` o PII en logs.
7. No debilitar autenticación, autorización de aplicación, controles de base de datos, validaciones, hooks, auditoría, supply chain ni verificación para hacer pasar pruebas.
8. PostgreSQL nunca debe ser accesible desde el navegador ni quedar publicado en Internet; solo el backend Next.js y workers acceden por red privada Docker o loopback mediante `DATABASE_URL` server-only.
9. No crear contratos, tokens o funcionalidades fuera del alcance definido.
10. No ejecutar acciones irreversibles, mutaciones del VPS, migraciones destructivas, Mainnet, pagos, commit, push o PR sin autorización específica.
11. Implementar una fase por vez. No comenzar una fase si sus precondiciones o verificaciones no pasan.
12. Usar pruebas primero para bugs, invariantes de dominio, adaptadores sustituibles y contratos.
13. Después de cada fase, revisar el diff, ejecutar sus verificaciones y registrar evidencia reproducible.

### Condiciones para detenerse

Detenerse y formular **una sola pregunta concreta** si aparece cualquiera de estos casos:

- no está definida la relación entre identidad legal, identidad artística, `person_id`, `account_id`, `subject_id` y la dirección contractual de smart wallet;
- no está definido quién puede emitir o revocar en representación de una organización;
- la documentación oficial vigente no permite verificar un SDK/proveedor de smart wallet compatible con la versión de Stellar, Next.js, WebAuthn y la red elegida;
- una migración requiere borrar, truncar o reinterpretar datos existentes;
- no existe backup reciente con restore verificado antes de una migración o mutación de infraestructura;
- se requieren secretos, fondos, una cuenta Stellar real, credenciales SSH o acceso de escritura a infraestructura externa;
- se pretende mutar el VPS sin aprobación explícita o exponer PostgreSQL fuera de la red privada/loopback;
- se pretende desplegar en Mainnet;
- Soroban SDK, Stellar CLI y OpenZeppelin Stellar Contracts no tienen versiones compatibles;
- una dependencia exige bajar una política de seguridad;
- Testnet, PostgreSQL privado, RPC, almacenamiento o CI externos no están disponibles y bloquean la prueba requerida;
- `Pausable` o `Upgradeable` se consideran necesarios sin una decisión explícita de riesgo y gobernanza.

No elegir silenciosamente un default de negocio o seguridad.

## Decisiones no negociables

| Tema | Decisión |
|---|---|
| Contratos de dominio | Implementar exactamente `CulturalEntityRegistry` y `CulturalCredentialRegistry`. Las instancias contractuales de smart wallet son infraestructura de identidad y no un tercer registro de dominio. |
| Compatibilidad de alcance | Si «dos contratos» significara dos instancias contractuales totales, el requisito sería incompatible con smart wallets contractuales y se debe detener la implementación para resolverlo. |
| Smart wallet | No implementar un wallet contract propio salvo decisión explícita; usar implementación/WASM auditado y allowlist de hashes por red. |
| Credenciales | Atestaciones no transferibles; no implementar interfaz NFT estándar. |
| Pasaporte | Proyección estable de identidad y trayectoria; no contrato ni credencial mutable. |
| Multi-evento | Cada evento/tipo genera otra credencial. Evento B no modifica Credencial A. |
| Contexto on-chain | Toda credencial guarda `issuer_id`, `issued_by`, `subject_id`, `event_id`, `credential_type`, hash, esquema y estado. |
| Autoridad emisora | Tener rol global no basta: `issued_by` debe estar vinculado on-chain al `issuer_id` institucional. |
| Metadata | Documento y medios off-chain; contrato guarda el hash canónico completo. Cada medio incluye digest de bytes. |
| Unicidad | El hash prueba integridad, no unicidad. Unicidad mediante `credential_id` y clave `issuer_id + subject + event + type`. |
| Revocación | Conserva historia y afecta solo una credencial. No `Burnable`. |
| Acoplamiento | Ningún contrato de dominio llama al otro. La aplicación verifica evento y credencial por separado. |
| Enumeración | No `Enumerable`, `list_by_subject` ni vectores on-chain no acotados. Indexar eventos off-chain. |
| Persistencia | PostgreSQL directo y privado, accesible solo por backend Next.js/workers con `DATABASE_URL` server-only y usuario de mínimo privilegio. |
| Autorización | Los casos de uso y la DAL hacen autorización de dominio. RLS nativo de PostgreSQL, si se aprueba, es defensa adicional independiente y nunca sustituye esa autorización. |
| Identidad y wallet | La autenticación completa se implementa en Fase 8. Reclamar o recuperar una cuenta/passkey no cambia `subject_id` ni transfiere o reescribe credenciales. |
| Custodia | CulturaGO no custodia passkeys, biometría ni seed phrases. Relayer o fee sponsorship permanecen server-only y requieren aprobación. |
| Confirmación | Un hash de transacción no significa éxito. Confirmar ledger y hacer readback antes de mostrar `registered`. |
| Extensiones | `Pausable` y `Upgradeable` solo tras decisión explícita; su ausencia debe quedar documentada y probada. |

## Criterios arquitectónicos verificables

### Alta cohesión

- El dominio no importa Next.js, drivers PostgreSQL, Stellar SDK, WebAuthn ni componentes React.
- Cada caso de uso implementa una intención: confirmar participación, emitir credencial, revocar, verificar o reclamar pasaporte.
- Cada contrato de dominio contiene únicamente reglas y almacenamiento de su agregado.
- La UI presenta estado; no decide autorización, canonicalización, idempotencia o confirmación.
- La DAL y los casos de uso reciben un actor autenticado explícito y aplican permisos de organización, issuer scope y ownership server-side.

### Bajo acoplamiento

- Dependencias externas entran por puertos con errores y estados de dominio.
- Los contratos de dominio no se invocan entre sí.
- El indexador y los workers consumen eventos/comandos; no se importan desde componentes.
- Cambiar `PostgreSQLDatabaseGateway` por memoria en pruebas, mock Stellar por Soroban o un SDK de smart wallet por otro adaptador compatible no obliga a cambiar casos de uso.
- El navegador nunca importa el driver, cliente o configuración PostgreSQL; toda persistencia cruza endpoints server-side autenticados.
- No crear una interfaz para QR mientras siga siendo una transformación visual sin política propia.

### Sustitución de Liskov

Para cada puerto, todos los adaptadores deben respetar las mismas precondiciones, postcondiciones, errores, idempotencia y estados observables.

- `MockStellarGateway` no puede prometer éxito inmediato si `SorobanStellarGateway` puede quedar pendiente, fallar o requerir restauración.
- `InMemoryDatabaseGateway` debe aplicar las mismas restricciones de unicidad y transición que `PostgreSQLDatabaseGateway`.
- El adaptador de hash del navegador, servidor y Rust debe producir los mismos bytes y digest.
- Los dobles de identidad/smart wallet deben validar challenge, expiración, origen, RP ID y replay como el adaptador real.
- Ejecutar una suite contractual compartida contra cada implementación.

## Arquitectura objetivo

El árbol es orientativo; mantener nombres del repositorio cuando ya exista una convención mejor, pero conservar estos límites:

```text
contracts/
├── Cargo.toml
├── entity-registry/
│   ├── Cargo.toml
│   └── src/
│       ├── contract.rs
│       ├── errors.rs
│       ├── events.rs
│       ├── storage.rs
│       └── test.rs
├── credential-registry/
│   ├── Cargo.toml
│   └── src/
│       ├── contract.rs
│       ├── errors.rs
│       ├── events.rs
│       ├── storage.rs
│       └── test.rs
└── test-support/                 # solo utilidades de prueba si reducen duplicación real

src/
├── domain/
│   ├── entities/
│   ├── credentials/
│   ├── participation/
│   └── operations/
├── application/
│   └── use-cases/
├── ports/
│   ├── DatabaseGateway.ts
│   ├── StellarGateway.ts
│   ├── CanonicalHashPort.ts
│   ├── SignerPort.ts
│   └── SmartWalletGateway.ts
├── adapters/
│   ├── database/
│   │   └── PostgreSQLDatabaseGateway.ts
│   ├── stellar/
│   ├── hash/
│   └── smart-wallet/
├── server/
│   ├── identity-and-session/
│   ├── actions-or-routes/
│   ├── workers/
│   └── observability/
└── app/                          # presentación y composición Next.js; sin acceso DB directo

tests/
├── contracts/
├── contract-tests/
├── integration/
├── e2e/
├── fixtures/
└── golden/

database/
├── migrations/                   # SQL versionado, directo y revisable
└── test-support/                 # base aislada y fixtures sin datos de producción

scripts/
├── stellar/
└── verify-credential/

deployments/
├── demo.example.json
├── testnet.example.json
└── schema.json
```

La topología de producción es VPS + aplicación Next.js/workers + PostgreSQL directo. PostgreSQL escucha únicamente en loopback o red privada Docker, nunca en una interfaz pública; el firewall no publica su puerto. `DATABASE_URL` es server-only, el pool es acotado y usa usuarios técnicos de mínimo privilegio, timeouts de conexión/consulta/transacción y TLS cuando la topología cruce un límite de red que lo requiera. Constraints, FK, claves únicas y transacciones protegen invariantes; la autorización de dominio permanece en casos de uso/DAL. RLS nativo de PostgreSQL solo puede añadirse como defensa adicional explícita, independiente de cualquier proveedor y nunca como sustituto de autorización de aplicación.

No crear un crate compartido de producción que obligue a actualizar ambos contratos juntos. Duplicar tipos pequeños y estables es preferible a acoplar despliegues independientes; compartir solo fixtures o helpers de prueba cuando sea útil.

## Matriz de cobertura

| Gap o requisito | Fase principal | Evidencia inicial | Terminado cuando |
|---|---:|---|---|
| Pasaporte vs. credencial | 1, 8 | `src/app/p/[slug]/page.tsx:103-185` | Pasaporte estable muestra línea de tiempo multi-evento sin validez FDVC fija. |
| Ciclo de participación | 1, 2 | `src/components/CredentialForm.tsx:79-99` | `participant_of` no basta; emisión exige confirmación auditada. |
| PostgreSQL privado en VPS | 0, 2, 9 | despliegue heredado por inventariar | Solo backend/workers conectan por loopback/red privada; backup, restore y monitoreo quedan probados. |
| Evento y tipo on-chain | 4, 5 | `src/lib/db.ts:120-137`, `src/lib/stellar.ts:62-75` | Readback contractual devuelve y valida ambos campos. |
| Emisor institucional vs. operador | 2, 4, 5, 8 | `src/lib/db.ts:120-126`, `src/components/CredentialForm.tsx:119-125` | `issuer_id` y `issued_by` quedan registrados; rol y sesión sin vínculo no permiten actuar por otro emisor. |
| Integridad de imagen/metadata | 3 | `src/lib/hashes.ts:5-30` | Metadata y medios verifican con vectores TS/Rust; no fallback. |
| Historial revocado | 2, 7, 8 | `src/app/p/[slug]/page.tsx:44-47` | Revocadas permanecen visibles y no afectan otras credenciales. |
| Identidad, sesión y autorización | 2, 8 | `src/app/login/page.tsx:12-45` | Fase 2 prepara persistencia sin login; Fase 8 prueba WebAuthn, sesión segura, roles e issuer scope server-side. |
| Smart wallet contractual | 6, 8, 10 | no existe | SDK verificado, WASM auditado allowlisted por red y flujo interactivo con consentimiento; no wallet propio. |
| Entorno demo/Testnet/Mainnet | 6, 8 | `src/components/StellarStatusBlock.tsx:202-217` | Ningún mock enlaza explorador ni afirma verificación real. |
| Liskov en gateways | 3, 6 | `src/lib/stellar.ts:1-147` | Suites contractuales pasan en todos los adaptadores. |
| Hash canónico | 3 | `src/lib/hashes.ts:5-30` | Bytes y SHA-256 idénticos en navegador, Node y Rust. |
| Estados y reintentos | 6, 7 | `src/lib/db.ts:139-147` | Confirmación/readback e idempotencia resisten timeout y doble clic. |
| Errores visibles | 8 | `src/components/StellarStatusBlock.tsx:89-99` | Todo fallo tiene estado persistido, mensaje seguro y acción válida. |
| Privacidad/consentimiento | 2, 3, 8 | `src/lib/db.ts:32-74` | Publicación, medios y firma requieren consentimiento versionado. |
| Validación de relaciones | 1, 2 | `src/components/RelationshipManager.tsx:63-90` | Matriz de relaciones, FK, estados y ciclos probados server-side. |
| Dos contratos de dominio CulturaGO | 4, 5 | `docs/soroban-contract-architecture.md` | WASM reproducible, pruebas e invariantes pasan; smart wallets se clasifican como identidad. |
| Supply chain pnpm | 0, 9 | `package-lock.json`, `pnpm-lock.yaml` | Solo pnpm, lockfile inmutable y versión fijada. |
| Passkey claim/recovery | 8 | `src/app/p/[slug]/page.tsx:119-137` | Claim y recovery resisten replay y no cambian sujeto ni credenciales. |
| Indexador y retención RPC | 7 | no existe | Proyección se reconstruye y no duplica eventos. |
| TTL/restauración | 4, 7, 10 | frontend no lo modela | Job, alertas y restauración Testnet probados. |
| Outbox/reconciliación | 7 | `StellarStatusBlock` escribe antes/después | Transacciones PostgreSQL y locking convergen sin doble efecto. |
| Observabilidad | 9 | `console.log/error` | Correlación, métricas, alertas y redacción incluyen PostgreSQL sin exponer secretos. |
| Accesibilidad/móvil | 8, 9 | no hay auditoría | Flujos clave cumplen WCAG 2.2 AA y matriz QR/móvil/passkey. |
| Exportación QR/PDF/JSON | 8 | solo QR/enlace | Paquete reproduce hash y estado sin PII no consentida. |
| Caos y rendimiento | 9 | mock siempre exitoso | Perfiles de fallo y presupuestos tienen evidencia reproducible. |
| Testnet y readiness | 10 | Stellar simulado | Smoke completo, manifiesto y artefactos listos para promoción. |

## Fase 0 — Baseline reproducible y guardas

### Precondiciones

- Repositorio accesible sin sobrescribir cambios del usuario.
- Node, pnpm, Rust, Cargo y Stellar CLI identificables; si falta una herramienta, detenerse antes de instalar.
- Acceso SSH de solo lectura al VPS aprobado y entregado out-of-band cuando corresponda; nunca incluir credenciales, IPs o secretos en repositorio, prompt, historial de shell o logs.

### Pasos

1. Registrar `git status`, rama, versiones de Node/pnpm/Rust/Cargo/Stellar CLI y scripts disponibles.
2. Leer documentación Next.js instalada para rutas, Server Actions/API, autenticación, cookies y caché que se vayan a usar.
3. Ejecutar baseline con pnpm: lint, typecheck explícito y build. Ejecutar pruebas existentes si aparecen.
4. Registrar fallos preexistentes sin ocultarlos.
5. Verificar documentación y compatibilidad de Soroban SDK/OpenZeppelin Stellar; proponer versiones exactas.
6. Crear una matriz de variables server-only y públicas por `demo`, `testnet` y `mainnet`, sin valores secretos y marcando `DATABASE_URL` como exclusivamente server-only.
7. Confirmar que los archivos sin seguimiento del usuario no se incorporan por accidente.
8. Realizar por SSH un inventario estrictamente de solo lectura del VPS:
   - SO/kernel y actualizaciones pendientes visibles sin elevar privilegios;
   - Docker, redes, contenedores, servicios y topología Next.js/workers/PostgreSQL;
   - versión y configuración no secreta de PostgreSQL;
   - `listen_addresses`, bind efectivo, reglas relevantes de `pg_hba.conf` redactadas y exposición de puertos;
   - volúmenes, capacidad, recursos CPU/RAM/disco y límites;
   - backups, retención y evidencia del último restore verificado;
   - TLS entre componentes cuando aplique;
   - firewall y superficie pública, sin copiar IPs ni secretos al repositorio.
9. Tratar `deploy/setup-vps.sh` y cualquier código/script asociado únicamente como legado obsoleto que asume Supabase y sus servicios de autenticación, API REST, almacenamiento, clientes SDK, claves públicas/privilegiadas e identidad SQL implícita: no ejecutarlo, no usarlo como fuente de verdad y planificar su retiro por separado.
10. Documentar la topología observada y las diferencias contra la arquitectura objetivo sin mutar servicios, Docker, firewall, PostgreSQL, archivos o datos.
11. Antes de cualquier migración o cambio posterior del VPS, exigir aprobación explícita, backup reciente y restore verificado en entorno seguro.

### Entregables

- Evidencia de baseline.
- Decisión de versiones y herramientas.
- Lista de fallos preexistentes.
- Esquema de configuración por entorno.
- Inventario SSH de solo lectura, redactado y sin secretos, con diagrama de topología actual.
- Lista de riesgos de PostgreSQL, backups, TLS, firewall y capacidad, sin remediarlos todavía.

### Aceptación y verificación

- No se instaló con npm.
- Ningún secreto, IP, credencial SSH o `DATABASE_URL` aparece en diff o salida persistida.
- Las versiones seleccionadas son compatibles, exactas y suficientemente maduras.
- Los fallos preexistentes están separados de regresiones nuevas.
- El inventario no realizó escrituras ni reinicios y el script obsoleto no fue ejecutado.
- Quedó demostrado que no habrá mutación o migración del VPS sin aprobación y backup/restore verificado.

## Fase 1 — Dominio y casos de uso

### Precondiciones

- Baseline registrado.
- Decisiones de pasaporte, credencial, sujeto, emisor y evento entendidas.

### Pasos

1. Escribir pruebas de dominio para:
   - pasaporte estable con credenciales A/B independientes;
   - revocar A sin alterar B;
   - `participant_of` sin confirmación no permite emitir;
   - transición válida `registered -> checked_in -> participation_confirmed -> credential_issued`;
   - clave de negocio única `issuer_id + subject + event + credential_type`;
   - operador con rol pero sin vínculo institucional rechazado;
   - tipos de relación válidos por origen/destino/contexto.
2. Extraer tipos de dominio independientes de framework.
3. Implementar casos de uso cohesivos:
   - registrar/versionar entidad;
   - registrar/check-in/confirmar participación;
   - preparar/empaquetar metadata;
   - emitir/revocar/verificar credencial;
   - obtener trayectoria del pasaporte.
4. Definir errores de dominio y transiciones explícitas.
5. Mantener fecha de intención emitida por servidor separada de `issued_ledger` y `closed_at` derivado.

### Entregables

- Dominio y casos de uso sin dependencias de infraestructura.
- Pruebas de invariantes.
- Catálogo versionado de `credential_type`.

### Aceptación y verificación

- El dominio compila sin importar React, Next.js, PostgreSQL o Stellar SDK.
- Evento B crea otra credencial.
- No existe operación para anexar eventos a una credencial.
- Toda transición inválida devuelve error tipado.

## Fase 2 — PostgreSQL, persistencia, autorización preparada y privacidad

### Precondiciones

- Modelo de dominio estable.
- Topología PostgreSQL inventariada; no se asume que el estado heredado sea correcto.
- Aprobación previa, backup reciente y restore verificado antes de ejecutar cualquier migración sobre un entorno persistente.

### Pasos

1. Crear en `database/migrations/` migraciones SQL versionadas, ordenadas, revisables y preferentemente aditivas para:
   - participación y su historial de estados;
   - confirmación, actor explícito y evidencia minimizada;
   - consentimiento versionado, visibilidad y retención;
   - metadata/media con digest y estado de disponibilidad;
   - operaciones Stellar, idempotency key, entorno, contrato, método, ledger y errores;
   - outbox/inbox, cursores de indexador y proyecciones;
   - despliegues/IDs contractuales por entorno;
   - vínculo auditable entre `issuer_entity_id` y operadores autorizados;
   - identidades, `persons`, `accounts`, sesiones, passkeys/WebAuthn public-key credentials, challenges de un uso, recuperación y direcciones contractuales de wallet necesarias para Fase 8, sin elegir proveedor de autenticación ni activar login.
2. Agregar constraints, FK, checks e índices para:
   - unicidad de código e idempotency key;
   - unicidad de negocio de credencial;
   - vínculo consistente `account_id/person_id/subject_id/wallet_contract_address`;
   - challenges con consumo único y expiración;
   - índices por `subject_id`, `event_id`, estado y cursor;
   - transiciones, relaciones y estados válidos.
3. Definir límites transaccionales para participación, outbox, emisión, revocación, challenge/consumo y rotación/revocación de sesión; usar niveles de aislamiento y locking explícitos donde una carrera pueda violar invariantes.
4. Implementar `DatabaseGateway` y `PostgreSQLDatabaseGateway` server-only con consultas parametrizadas, errores de dominio, pool acotado, timeouts de conexión/statement/lock/idle transaction y cierre limpio.
5. Crear roles técnicos PostgreSQL separados y de mínimo privilegio para migraciones, aplicación y workers; la aplicación no es owner ni superuser y no recibe privilegios DDL.
6. Configurar conexión únicamente por loopback o red privada Docker. No publicar el puerto de PostgreSQL; aplicar TLS y verificación de certificado cuando la topología cruce un límite de red que lo requiera. Mantener `DATABASE_URL` fuera del bundle cliente, repo y logs.
7. Implementar autorización de dominio en casos de uso/DAL mediante un `ActorContext` explícito, roles de aplicación e issuer scope. Si se aprueba RLS nativo de PostgreSQL, tratarlo como defensa adicional sin depender de servicios externos y sin reemplazar las comprobaciones de aplicación.
8. Antes de Fase 8 no implementar login ni cookies de producción. Para pruebas, inyectar un actor de prueba explícito o una service identity controlada, marcada por entorno y no disponible en producción; jamás simular una sesión como si fuera producción.
9. Mover lecturas/mutaciones a Server Actions o rutas server-side según las guías instaladas de Next.js; el navegador no recibe credenciales DB ni ejecuta SQL.
10. Implementar consentimiento, vista previa, retiro de publicación y retención off-chain, preservando atestaciones opacas e historial cuando se retire contenido público.
11. Proveer una base PostgreSQL aislada para pruebas, migrada desde cero y destruible, sin snapshots ni datos de producción.
12. Definir y probar estrategia de backup, retención, restore y recuperación a punto en el tiempo cuando esté disponible; registrar RPO/RTO y no considerar un backup válido hasta verificar restore.

### Entregables

- Migraciones directas versionadas en `database/migrations/`, con rollback o estrategia de avance/recuperación explícita.
- `DatabaseGateway` y `PostgreSQLDatabaseGateway` server-only.
- Esquema preparado para identidad, sesión, passkeys, challenges, recovery y smart wallet de Fase 8, sin autenticación activa.
- Roles técnicos, configuración privada, pool/timeouts y modelo transaccional documentados.
- Pruebas PostgreSQL aisladas y evidencia de backup/restore.
- Autorización de dominio preparada en casos de uso/DAL y privacidad/consentimiento persistidos.

### Aceptación y verificación

- PostgreSQL no es accesible desde navegador ni Internet y ninguna credencial DB entra al bundle cliente.
- El usuario de aplicación es de mínimo privilegio; migraciones y runtime usan roles distintos.
- Una organización solo prepara emisión/revocación dentro de su ámbito mediante `ActorContext` explícito.
- Antes de Fase 8 solo se usan actor de prueba o service identity controlada; no existe login ni sesión de producción simulada.
- `participant_of` no equivale a `participation_confirmed`.
- Constraints y transacciones resisten concurrencia, rollback parcial y duplicados.
- No se borra historial on-chain al retirar PII.
- Migraciones desde cero, pruebas DB aisladas y restore verificado pasan.

## Fase 3 — Hash, metadata, medios y puertos sustituibles

### Precondiciones

- Esquemas de dominio y DB definidos.
- Campos públicos/privados y consentimiento decididos.

### Pasos

1. Escribir fixtures y vectores dorados para entidad y credencial de participación.
2. Definir esquema canónico con normalización, UTF-8, números, `null`, orden recursivo y separación de dominio.
3. Reemplazar el fallback aleatorio por error cerrado.
4. Implementar `CanonicalHashPort` en Node/browser y verificador Rust compatible.
5. Incluir por medio `uri`, `mime_type` y SHA-256 de bytes; verificar contenido descargado con límites de tamaño/tipo.
6. Implementar herramienta CLI local de verificación y exportación.
7. Definir `DatabaseGateway`, `StellarGateway`, `SignerPort` y el límite futuro `SmartWalletGateway` con estados/errores de dominio; no conectar autenticación todavía.
8. Crear suites contractuales Liskov compartidas.
9. Hacer que mocks simulen rechazo, timeout, confirmación tardía, archivado y error de autorización de forma determinista.

### Entregables

- Esquemas y vectores versionados.
- Implementaciones de hash sustituibles.
- Puertos y suites contractuales.
- CLI/verificador sin secretos.

### Aceptación y verificación

- Mismos bytes y digest en navegador, Node y Rust.
- Cambiar orden irrelevante no cambia digest; cambiar semántica o imagen sí.
- Una URL que sirve otros bytes falla.
- Ningún mock promete más que el adaptador real.

## Fase 4 — Workspace y dos contratos de dominio CulturaGO

### Precondiciones

- Versiones Rust/Soroban/OpenZeppelin verificadas y fijadas.
- Esquemas, IDs, roles, tipos y TTL decididos.

### Pasos comunes

1. Crear workspace `contracts/` con `#![no_std]` donde corresponda.
2. Mantener los dos crates de dominio independientes y sin llamadas contract-to-contract.
3. No implementar un contrato de smart wallet propio; la implementación auditada seleccionada en Fase 8 y sus instancias pertenecen a infraestructura de identidad y quedan fuera de este workspace de dominio.
4. Integrar OpenZeppelin **Stellar Contracts** `AccessControl`, no librerías Solidity.
5. Definir `__constructor` único, admin superior y roles mínimos.
6. Implementar transferencia administrativa segura en dos pasos según la API fijada.
7. Definir errores `#[contracterror]`, eventos tipados y límites explícitos.
8. Implementar estrategia TTL para instance/persistent y pruebas de umbral.
9. No agregar `Pausable`/`Upgradeable` salvo decisión aprobada; documentar/testear la ausencia.

### `CulturalEntityRegistry`

1. Implementar registro versión 1 idempotente.
2. Versionar con control optimista `expected_version`.
3. Desactivar sin borrar versiones.
4. Consultar cabeza, versión y verificación.
5. Guardar configuración/roles en instance y versiones en persistent.

### `CulturalCredentialRegistry`

1. Guardar `credential_id`, `token_id`, `issuer_id`, `issued_by`, `subject_id`, `event_id`, `credential_type`, hash/esquema, ledger y revocación.
2. Implementar índice directo por ID, token y digest de clave de negocio institucional.
3. Implementar vínculos persistentes `IssuerOperator(issuer_id, operator)` administrados con auth, idempotencia y eventos.
4. Exigir simultáneamente rol, `operator.require_auth()` y vínculo activo para emitir/revocar; un rol global no permite suplantar otro emisor.
5. Rechazar tipos desconocidos, duplicados y conflictos idempotentes.
6. Emitir sin verificar otro contrato; la precondición de evento pertenece a la aplicación.
7. Revocar preservando registro y sin afectar otras credenciales.
8. Verificar todos los campos y estado.
9. Emitir eventos indexables por sujeto/evento dentro de límites vigentes.
10. No implementar owner, balance, approve, transfer, burn, URI NFT, Enumerable ni vectores por sujeto.

### Entregables

- Dos crates contractuales.
- WASM release reproducible.
- ABI/clientes generables con herramientas verificadas.

### Aceptación y verificación

- `cargo fmt --check` y `cargo clippy` con configuración del workspace.
- `cargo test` pasa.
- Existen exactamente dos contratos de dominio CulturaGO y no hay dependencia entre ellos; las instancias smart-wallet auditadas se contabilizan como infraestructura de identidad, no como registros de dominio.
- El diff no incluye secretos ni código NFT.

## Fase 5 — Pruebas adversariales de contratos

### Precondiciones

- Contratos compilando.

### Pasos

1. Probar constructor único, roles, auth, administración y vínculos emisor-operador.
2. Probar que rol sin vínculo, vínculo sin rol y vínculo a otro `issuer_id` no permiten emitir/revocar.
3. Probar registro/versionado/desactivación e historia inmutable.
4. Probar emisión/revocación/verificación, doble envío y conflictos.
5. Probar Evento A y Evento B para el mismo sujeto.
6. Probar clave de negocio con ID/hash alternativos.
7. Probar tipos/esquemas desconocidos, límites y overflow.
8. Probar eventos exactos y ausencia de eventos en error.
9. Probar TTL/umbrales y comportamiento esperado de restauración a nivel integración.
10. Agregar property/model tests para invariantes del documento contractual.
11. Medir presupuesto y tamaño WASM; registrar baseline.

### Entregables

- Suite unitaria, de propiedades e integración local.
- Evidencia de invariantes y presupuesto.

### Aceptación y verificación

- Ninguna secuencia altera una versión histórica.
- Ningún operador puede actuar por un `issuer_id` no vinculado, aunque tenga el rol global.
- Revocar A nunca cambia B.
- Una clave de negocio corresponde como máximo a una credencial.
- Fallos no dejan estado ni eventos parciales.

## Fase 6 — Gateway Soroban, preparación de transacción y estados reales

### Precondiciones

- Contratos y clientes disponibles.
- RPC/configuración Testnet aprobados.
- `SignerPort` definido sin asumir custodia de la clave del usuario.

### Pasos

1. Implementar configuración tipada por red: passphrase, RPC, IDs de los dos contratos de dominio, allowlist futura de WASM smart-wallet y explorador.
2. Validar que demo nunca produzca enlaces, claims ni confirmaciones reales.
3. Implementar pipeline server-side hasta el límite de firma:
   - construir intención y registrar actor/issuer scope;
   - simular;
   - detectar restauración;
   - preparar transacción y entradas de autorización;
   - devolver el payload autorizado al `SignerPort` sin firmar por el usuario desde el servidor;
   - aceptar una transacción/autorización firmada y verificar que corresponde a la intención;
   - enviar;
   - consultar estado;
   - confirmar ledger;
   - hacer readback contractual;
   - reconciliar PostgreSQL.
4. Mantener separado el `SignerPort` del transporte RPC y del gateway de smart wallet. El flujo interactivo de smart-wallet/passkey se conecta recién en Fase 8.
5. Para pruebas de integración aprobadas, permitir únicamente un signer Testnet controlado, etiquetado como fixture, con fondos no productivos y sin reutilización en producción. No presentarlo como sesión o firma de usuario.
6. Modelar estados `awaiting_signature`, `signed`, `submitted`, `confirming`, `confirmed`, `failed_retryable`, `failed_terminal`, `unknown` y `restoring`.
7. Mantener idempotency key y no reenviar a ciegas.
8. Mapear errores RPC/contrato a errores de dominio sanitizados.
9. Ejecutar suite Liskov contra mock y gateway Testnet controlado.

### Entregables

- `SorobanStellarGateway` real y `MockStellarGateway` fiel.
- `SignerPort` que separa preparación, firma y envío.
- Máquina de estados y readback.
- Configuración segura por entorno.

### Aceptación y verificación

- El backend no firma en nombre del usuario ni custodia su passkey, biometría, seed o clave.
- El signer Testnet, si se usa, solo prueba integración aprobada y no simula identidad de producción.
- Recibir tx hash no marca `registered`.
- Timeout permanece reconciliable y no duplica.
- Red, contratos de dominio, allowlist y explorador nunca se cruzan.
- Testnet confirma entidad y credencial mediante readback.

## Fase 7 — Outbox, indexador, reconciliación y TTL

### Precondiciones

- Gateway y tablas de operación disponibles.

### Pasos

1. Persistir intención + outbox en una única transacción PostgreSQL antes de enviar.
2. Hacer que cada worker reclame lotes acotados con locking transaccional PostgreSQL `FOR UPDATE SKIP LOCKED` o un equivalente cuya semántica se haya verificado para la versión desplegada; lease, intentos e idempotencia deben actualizarse en la misma transacción.
3. Inbox deduplica respuestas/eventos por red, contrato, ledger e índice mediante constraints y transacciones.
4. Reconciliador consulta operaciones pendientes/desconocidas y readback.
5. Indexar `CredentialIssued`/`CredentialRevoked` por sujeto/evento y eventos de entidad.
6. Guardar cursor y soportar reinicio/backfill más allá de retención RPC mediante proveedor aprobado.
7. Reconstruir proyecciones desde eventos y comparar con estado contractual.
8. Programar extensiones TTL, alertas y restauración; no confundir archivado con inexistencia.
9. Inyectar fallos entre cada fase y demostrar convergencia.

### Entregables

- Workers idempotentes.
- Índices de pasaporte/evento.
- Runbook y jobs TTL/restauración.

### Aceptación y verificación

- Dos workers concurrentes no reclaman el mismo comando y reiniciarlos no duplica efectos.
- Bloqueos, timeouts y transacciones abortadas liberan trabajo de forma recuperable.
- Borrar/reconstruir proyección conserva vigentes y revocadas.
- Cerrar navegador no pierde una emisión.
- Entrada archivada muestra `restoring`, se restaura y vuelve a verificarse.

## Fase 8 — UX, identidad, smart wallet passkey-based y exportaciones

### Precondiciones

- Casos de uso server-side, estados, índices y esquema de identidad preparados.
- HTTPS válido en todos los origins que usarán WebAuthn; RP ID y origins exactos definidos por entorno. No habilitar passkeys sobre HTTP salvo loopback permitido explícitamente para desarrollo local.
- Relación aprobada entre `account_id`, `person_id`, `subject_id`, organización/issuer scope y dirección contractual de smart wallet.
- Guía oficial revisada: https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets
- Backup/restore PostgreSQL verificado antes de activar migraciones o datos de identidad.

### Pasos

1. Seleccionar el SDK/proveedor de smart wallet solo después de verificar documentación oficial vigente, mantenimiento, auditorías, redes soportadas, compatibilidad con las versiones fijadas de Stellar/Soroban/Next.js/WebAuthn, modelo de relayer y recuperación. La documentación de Stellar cita Passkey Kit como tooling, pero no fijar proveedor ni versión hasta completar esta verificación y registrar la decisión.
2. No implementar un wallet contract propio salvo aprobación explícita. Seleccionar una implementación/WASM auditada, registrar hash y procedencia, y mantener una allowlist separada por Testnet/Mainnet. Verificar el hash antes de crear o conectar una instancia de cuenta contractual.
3. Implementar creación y conexión de smart wallet como cuenta contractual de identidad:
   - ceremony WebAuthn de registro/autenticación vinculada al origin HTTPS y RP ID esperados;
   - challenge criptográficamente aleatorio, server-generated, de un uso, con expiración corta, purpose y binding a cuenta/intención;
   - consumo atómico del challenge y anti-replay incluso ante requests concurrentes;
   - verificación server-side de challenge, origin, RP ID hash, flags, firma, credential ID, public key y sign counter cuando el autenticador lo soporte;
   - attestation policy explícita, minimizada y compatible con privacidad;
   - múltiples passkeys por cuenta, con nombre, alta, último uso y revocación auditables.
4. Persistir únicamente material público y metadatos mínimos necesarios. No custodiar passkeys, biometría, seed phrases ni claves privadas del usuario; no registrar respuestas WebAuthn completas o challenges en logs.
5. Implementar sesiones de aplicación recién aquí:
   - cookie opaca `HttpOnly`, `Secure`, `SameSite` apropiado, `Path` restringido y sin tokens en `localStorage`;
   - expiración idle/absolute, rotación al autenticar o elevar privilegio, revocación por dispositivo/cuenta y detección segura de reuse cuando aplique;
   - protección CSRF para mutaciones según el patrón Next.js elegido, validación `Origin`/`Host` y no confiar solo en `SameSite`;
   - cierre de sesión y revocación server-side efectivos.
6. Vincular de forma auditable `account_id`, `person_id`, `subject_id`, credenciales WebAuthn y `wallet_contract_address`. Evitar que una nueva passkey, claim o recovery cree otro sujeto o reasigne credenciales.
7. Resolver roles de aplicación, membership e issuer scope exclusivamente server-side en casos de uso/DAL para cada request. La dirección de wallet o una sesión válida no bastan para emitir/revocar; también se exige el vínculo institucional y `IssuerOperator` on-chain correspondiente.
8. Conectar el flujo interactivo de firma smart-wallet al `SignerPort` preparado en Fase 6:
   - mostrar red, contrato, método, emisor, sujeto, evento, tipo y efecto antes de firmar;
   - requerir consentimiento explícito y reciente para cada operación sensible;
   - verificar server-side que payload, autorización y firma corresponden a la intención no consumida;
   - nunca firmar por el usuario desde el servidor.
9. Incorporar relayer o fee sponsorship solo si se aprueba explícitamente su modelo de abuso, cuotas, costos y privacidad. Sus credenciales, políticas y envío permanecen server-only; no conceden issuer scope ni permiten modificar payloads ya consentidos.
10. Implementar claim y recovery auditados:
    - invitación/código de un uso almacenado como digest, con expiración, intentos limitados y anti-enumeración;
    - step-up y revisión proporcional al riesgo para agregar/reemplazar passkeys;
    - notificación y ventana de revocación cuando corresponda;
    - recovery cambia acceso a la misma cuenta, nunca `subject_id`, historial, `wallet_contract_address` sin procedimiento específico aprobado ni credenciales culturales;
    - soporte humano no puede saltar invariantes ni reasignar credenciales silenciosamente.
11. Rediseñar pasaporte como identidad estable y línea de tiempo:
    - vigentes, pendientes y revocadas;
    - agrupación/filtro por evento/tipo;
    - sin sello de validez fijo de FDVC en la identidad permanente.
12. Implementar panel del organizador para registro, check-in, confirmación, preparación y firma consentida de emisión/revocación.
13. Mostrar progreso transaccional, error seguro, referencia de soporte y reintento solo cuando corresponda, además de banner persistente demo/Testnet/Mainnet.
14. Implementar verificación pública compuesta:
    - credencial;
    - evento registrado;
    - metadata/medio;
    - red/contrato/ledger;
    - estado o indisponibilidad explícita.
15. Exportar:
    - QR/enlace estable;
    - representación visual/PDF accesible;
    - JSON verificable con documento canónico, digests, red, contratos de dominio, ledger y estado;
    - solo PII consentida y sin datos de sesión, passkey o recovery.
16. Mantener fallback de código manual únicamente para acceso/claim aprobado, con expiración, rate limit y estado explícito; nunca degradar firma smart-wallet o simular una sesión productiva.

### Entregables

- Decisión verificable de SDK/proveedor, versión, implementación auditada y allowlist de WASM por red.
- Creación/conexión de smart wallet y flujo de firma interactiva con consentimiento.
- WebAuthn server-side, múltiples passkeys y sesiones seguras con CSRF, rotación y revocación.
- Mapeo auditable de cuenta/persona/sujeto/wallet, roles e issuer scope.
- Trayectoria multi-evento y flujos de organizador/bailarina.
- Claim/recovery auditado.
- Exportaciones verificables.

### Aceptación y verificación

- HTTPS, origin y RP ID incorrectos fallan cerrados; challenge expirado, consumido, de otro purpose o replay concurrente falla.
- La verificación WebAuthn ocurre server-side y ninguna passkey, biometría, seed o clave privada queda bajo custodia de CulturaGO.
- Cookies de sesión cumplen `HttpOnly`, `Secure` y `SameSite`; rotación, revocación, CSRF y logout tienen pruebas negativas.
- Varias passkeys pueden acceder a la misma cuenta sin crear otro `subject_id`.
- Una sesión válida sin rol, issuer scope o `IssuerOperator` no puede emitir/revocar.
- Toda firma sensible muestra intención y requiere consentimiento explícito; el servidor no firma por el usuario.
- El hash WASM de smart wallet pertenece a la allowlist de la red y no se implementó un wallet contract propio sin decisión explícita.
- Replay/claim ajeno y recovery no autorizado fallan; recovery legítimo conserva sujeto, dirección contractual e historial salvo procedimiento distinto explícitamente aprobado.
- Evento B aparece sin modificar A y revocar A conserva A visible y B vigente.
- PDF/JSON/QR apuntan al mismo registro y digest sin filtrar datos de identidad o autenticación.

## Fase 9 — Calidad, observabilidad y supply chain

### Precondiciones

- Flujos principales implementados.

### Pasos

1. Reemplazar `console.log/error` operacionales por logs server-side estructurados y redactados.
2. Añadir correlation/idempotency ID, red, contrato, método, fase, ledger y código seguro, sin registrar connection strings, SQL con PII, cookies, challenges o respuestas WebAuthn.
3. Métricas/alertas de aplicación y Stellar: confirmación, fallos, lag de indexador, outbox, TTL, restauración y divergencias.
4. Métricas/alertas PostgreSQL: disponibilidad, conexiones/pool, saturación, locks/deadlocks, consultas lentas, tamaño/volumen, replicación si existe, antigüedad/éxito de backups y restore drills.
5. Verificar periódicamente exposición de red: PostgreSQL sin puerto público, reglas firewall/bind esperadas, TLS donde corresponda y HTTPS/certificados válidos para passkeys.
6. Auditoría WCAG 2.2 AA: teclado, foco, lectores, contraste, estados no basados solo en color y `lang="es"`.
7. Probar QR, WebAuthn y consentimiento de firma en matriz móvil/desktop y conectividad degradada.
8. Ejecutar perfiles de caos deterministas, incluyendo caída/reinicio PostgreSQL, pool agotado, lock timeout, rollback, backup fallido y restore controlado.
9. Medir simulación, consentimiento/firma, envío, confirmación, readback, consultas DB, costo, payload y tamaño WASM.
10. Fijar `packageManager`, usar Corepack/pnpm y CI con lockfile inmutable.
11. Eliminar `package-lock.json` como tarea explícita, después de confirmar pnpm como autoridad.
12. Eliminar `typescript.ignoreBuildErrors`; corregir todos los errores y hacer que build falle ante regresiones.
13. Revisar dependencias y artefactos sin modificar políticas para sortear fallos.

### Entregables

- Dashboards/alertas/runbooks de aplicación, Stellar y PostgreSQL.
- Evidencia de backup/restore, exposición privada, TLS/HTTPS y capacidad.
- Evidencia WCAG, móvil, caos y rendimiento.
- Supply chain pnpm-only.
- Build con TypeScript estricto efectivo.

### Aceptación y verificación

- `pnpm install --frozen-lockfile`, lint, typecheck, tests y build pasan.
- Solo existe `pnpm-lock.yaml`.
- No hay `ignoreBuildErrors`.
- Logs no contienen secretos, PII, cookies, challenges, respuestas WebAuthn, connection strings ni XDR sensible.
- PostgreSQL sigue privado, el pool/timeouts están acotados y una restauración reciente fue verificada.
- HTTPS/certificados para origins WebAuthn y TLS interno cuando corresponde están monitoreados.
- Alertas y perfiles de fallo fueron disparados de forma controlada.

## Fase 10 — Testnet, artefactos y readiness de despliegue

### Precondiciones

- Todas las fases anteriores verificadas.
- Aprobación para usar cuentas/fondos Testnet y crear una instancia smart-wallet auditada.
- HTTPS operativo para los origins WebAuthn de Testnet.
- Backup/restore PostgreSQL y topología privada del VPS verificados.
- Mainnet fuera de alcance de ejecución.

### Pasos

1. Consultar `stellar --help` y documentación instalada para confirmar comandos/flags de esta versión. No copiar flags de otra versión.
2. Ejecutar build release reproducible de ambos contratos.
3. Optimizar/inspeccionar WASM con el comando confirmado del Stellar CLI.
4. Registrar checksums y hashes WASM.
5. Desplegar exactamente los dos contratos de dominio CulturaGO en Testnet con admin/roles de prueba aprobados.
6. Crear/conectar una cuenta contractual smart-wallet usando exclusivamente el WASM auditado cuyo hash esté allowlisted para Testnet. Esa instancia es infraestructura de identidad, no un tercer registro de dominio.
7. Guardar manifiesto sin secretos:
   - red/passphrase identificable;
   - RPC público aprobado;
   - IDs de los dos contratos de dominio;
   - WASM hashes/checksums de dominio;
   - hash/versión/procedencia allowlisted de la implementación smart-wallet y dirección pública de la instancia de prueba;
   - ledger de despliegue;
   - versiones de herramientas/dependencias;
   - direcciones públicas de roles.
8. Ejecutar smoke tests:
   - registrar y autenticar una passkey sobre HTTPS, crear/conectar la misma smart wallet y rotar/revocar sesión;
   - registrar y versionar entidad;
   - registrar Evento A y Evento B;
   - vincular un operador al emisor A y demostrar que no puede actuar por emisor B;
   - confirmar participación;
   - consentir y firmar mediante smart wallet la Credencial A, confirmar y hacer readback con `issuer_id` e `issued_by`;
   - emitir Credencial B al mismo sujeto;
   - verificar ambas;
   - revocar A y comprobar B vigente;
   - agregar una segunda passkey y ejecutar recovery controlado sin cambiar sujeto ni credenciales;
   - reconstruir índice/pasaporte;
   - extender TTL y probar restauración;
   - validar QR/PDF/JSON;
   - reiniciar workers/Next.js y demostrar continuidad mediante PostgreSQL privado, outbox y sesiones esperadas.
9. Probar transferencia administrativa en dos pasos.
10. Ejecutar restore PostgreSQL controlado desde backup y verificar migraciones, constraints, proyecciones y RPO/RTO sin afectar producción.
11. Confirmar exposición privada de PostgreSQL, mínimo privilegio, pool/timeouts, monitoreo, HTTPS y TLS donde corresponda.
12. Confirmar decisión documentada de ausencia/presencia de `Pausable`/`Upgradeable`.
13. Ejecutar revisión de seguridad y privacidad independiente, incluyendo WebAuthn, sesiones, CSRF, smart-wallet/relayer y PostgreSQL.
14. Preparar gate Mainnet sin ejecutarlo.

### Entregables

- WASM reproducible de los dos contratos de dominio CulturaGO.
- Manifiesto Testnet y evidencias de smoke de dominio, identidad y smart wallet.
- IDs contractuales de dominio y allowlist smart-wallet por entorno.
- Evidencia de HTTPS, PostgreSQL privado, backup/restore y monitoreo.
- Runbooks de despliegue, roles, identidad/sesiones, PostgreSQL, TTL, incidente, restauración y revocación.
- Checklist Mainnet pendiente de aprobación.

### Aceptación y verificación

- Una máquina limpia reproduce checksums de los dos contratos de dominio.
- Readback confirma cada smoke test y el hash smart-wallet coincide con la allowlist Testnet.
- Passkey, sesión, consentimiento, recovery y autorización organizacional tienen evidencia negativa y positiva sobre HTTPS.
- Restore PostgreSQL, exposición privada y monitoreo tienen evidencia reproducible.
- No se usaron hashes ficticios.
- No se desplegó en Mainnet.
- No quedan decisiones críticas implícitas.

## Estrategia de verificación continua

Después de cada fase ejecutar solo los comandos aplicables y confirmados por el proyecto. Base esperada:

```powershell
pnpm install --frozen-lockfile
pnpm run lint
pnpm exec tsc --noEmit
pnpm run build
cargo fmt --manifest-path "contracts/Cargo.toml" --check
cargo clippy --manifest-path "contracts/Cargo.toml" --all-targets --all-features
cargo test --manifest-path "contracts/Cargo.toml"
stellar --help
```

Para comandos Stellar dependientes de versión, consultar primero `stellar --help` y la documentación instalada. No inventar flags de build, optimize, deploy, invoke o network. Para PostgreSQL, usar únicamente el runner de migraciones y los comandos de backup/restore aprobados después de verificar versión, destino y alcance; nunca apuntar una prueba destructiva a producción.

Mantener evidencia de:

- pruebas unitarias y contractuales;
- migraciones PostgreSQL desde cero, constraints, concurrencia y transacciones en DB aislada;
- usuario DB de mínimo privilegio, pool/timeouts, conexión privada, TLS cuando aplique y ausencia de credenciales en bundle cliente;
- backup/restore PostgreSQL y RPO/RTO;
- integración DB/RPC/Testnet;
- WebAuthn server-side sobre HTTPS: RP ID/origin, challenges one-time, replay, múltiples passkeys, sesiones, CSRF y recovery;
- firma smart-wallet consentida, allowlist WASM y rechazo por roles/issuer scope;
- vectores dorados;
- E2E de organizador/bailarina/verificador;
- reconstrucción de indexador;
- caos y rendimiento;
- accesibilidad y móvil;
- checksums y manifiestos.

## Unidades de commit propuestas

No hacer commit automáticamente. Si el usuario lo solicita, usar commits convencionales sin atribución AI ni `Co-Authored-By`:

1. `chore: enforce reproducible project tooling`
2. `refactor: introduce credential domain boundaries`
3. `feat: add postgresql persistence and authorization boundaries`
4. `feat: add participation lifecycle and privacy controls`
5. `feat: add canonical credential metadata hashing`
6. `feat: implement cultural entity registry contract`
7. `feat: implement cultural credential registry contract`
8. `test: enforce contract invariants and adapter substitution`
9. `feat: prepare soroban transactions and signer port`
10. `feat: add transactional outbox reconciliation and indexing`
11. `feat: add passkey smart wallet identity and sessions`
12. `feat: add passport claim and credential trajectory`
13. `feat: export verifiable credential packages`
14. `chore: monitor postgresql and deployment readiness`

Cada commit mantiene pruebas y documentación del mismo comportamiento. No separar una implementación de sus pruebas ni mezclar refactors ajenos.

## Definition of Done global

El trabajo solo está completo cuando:

- [x] Existen exactamente dos contratos de dominio CulturaGO y no implementan NFT estándar; las cuentas contractuales smart-wallet están documentadas como infraestructura de identidad.
- [x] No se implementó wallet contract propio salvo decisión explícita; cada red usa una implementación auditada con hash en allowlist.
- [x] Ambos contratos de dominio compilan a WASM reproducible y pasan unit/property/integration tests.
- [x] `issuer_id`, `issued_by`, `event_id` y `credential_type` forman parte de emisión, eventos y readback on-chain.
- [x] Rol y vínculo `IssuerOperator` son obligatorios; no se puede suplantar otra organización.
- [x] Evento A/B son credenciales independientes y revocar A no altera B.
- [x] Hash canónico y medios verifican igual en TypeScript y Rust.
- [x] El hash nunca se usa como sustituto de unicidad.
- [ ] Producción ejecuta Next.js/workers en VPS con PostgreSQL directo, privado y no accesible desde navegador o Internet.
- [x] `PostgreSQLDatabaseGateway`, migraciones versionadas, constraints, transacciones, roles mínimos, pool y timeouts pasan pruebas aisladas.
- [ ] Backup, retención, restore y monitoreo PostgreSQL tienen evidencia reproducible y RPO/RTO registrado.
- [x] La autorización de dominio vive en casos de uso/DAL; una defensa DB opcional no la sustituye.
- [x] Antes de Fase 8 no se simuló una sesión de producción; solo se usaron actor de prueba explícito o service identity controlada.
- [ ] HTTPS es obligatorio para passkeys; RP ID/origin y challenges de un uso se verifican server-side con anti-replay.
- [x] Múltiples passkeys, sesiones `HttpOnly Secure SameSite`, rotación/revocación, CSRF y logout pasan pruebas negativas.
- [x] CulturaGO no custodia passkeys, biometría, seed phrases ni claves privadas de usuario.
- [x] `account_id`, `person_id`, `subject_id` y `wallet_contract_address` conservan identidad estable durante claim/recovery.
- [x] La firma smart-wallet exige consentimiento explícito; el backend no firma por el usuario y relayer/fees permanecen server-only si fueron aprobados.
- [x] Puertos/adaptadores cumplen suites Liskov compartidas.
- [x] Mock Stellar ya no siempre tiene éxito ni confirma inmediatamente.
- [x] Outbox, locking PostgreSQL, reconciliador e indexador sobreviven concurrencia, reinicios y fallos sin duplicar.
- [x] Pasaporte muestra trayectoria vigente/revocada por sujeto y evento.
- [x] Claim/recovery auditado no cambia sujeto ni credenciales.
- [x] Demo/Testnet/Mainnet están inequívocamente separados.
- [x] QR, PDF y JSON reproducen el mismo registro verificable.
- [x] TTL, archivado y restauración tienen jobs, alertas y smoke Testnet.
- [x] Logs, métricas, alertas y runbooks son operables y no filtran datos.
- [ ] WCAG 2.2 AA, móvil, caos y rendimiento tienen evidencia.
- [x] pnpm es único, `package-lock.json` fue eliminado y no se ignoran errores TypeScript.
- [ ] Testnet smoke completo pasó y los artefactos/IDs/hashes están documentados.
- [ ] Revisión de seguridad y privacidad no tiene bloqueadores abiertos.
- [x] Mainnet sigue bloqueado hasta aprobación explícita.

## Checklist final de readiness

### Artefactos

- [x] WASM de los dos contratos de dominio CulturaGO.
- [x] Checksums y hashes WASM reproducibles.
- [ ] ABI/clientes generados con versión registrada.
- [x] Manifiesto por entorno sin secretos.
- [ ] IDs/ledgers de los dos contratos de dominio Testnet.
- [ ] Implementación smart-wallet auditada, versión/procedencia y hash allowlisted por red; instancia de prueba clasificada como identidad.
- [x] Migraciones PostgreSQL versionadas y artefactos de restore validados.
- [ ] Vectores dorados y paquete de verificación de ejemplo.

### Autoridad y seguridad

- [x] Admin y roles públicos revisados.
- [x] Transferencia admin en dos pasos probada.
- [x] Vínculos `issuer_id -> operator` revisados y suplantación entre organizaciones rechazada.
- [x] Roles de aplicación/issuer scope se verifican server-side en cada caso de uso, además de `IssuerOperator` on-chain.
- [x] Mínimo privilegio entre registrar, emitir y revocar.
- [ ] HTTPS, RP ID/origins, WebAuthn server-side, challenges, múltiples passkeys, sesiones, CSRF y recovery revisados.
- [x] Consentimiento de firma smart-wallet probado; backend sin firma/custodia de usuario y relayer/fee sponsorship server-only si se aprobó.
- [x] Decisión explícita sobre `Pausable` y `Upgradeable`.
- [x] Si hay upgrades: esquema, migración, rollback y gobernanza probados; si no, ausencia documentada.
- [x] Ninguna credencial SSH, clave privada, passkey, biometría, seed, cookie o secreto DB en repo, logs, manifiestos o CI.

### Operación

- [ ] Runbook VPS/Next.js/workers y rollback/migración, siempre con aprobación y backup/restore verificado.
- [ ] PostgreSQL escucha solo en loopback/red privada Docker, no tiene puerto público y usa rol runtime de mínimo privilegio.
- [ ] Pool, timeouts, TLS cuando aplica, capacidad y conexiones están configurados y monitoreados.
- [ ] Backups PostgreSQL con retención, restore drill, RPO/RTO y alertas probados.
- [ ] Runbook de RPC caído, timeout, divergencia e indexador atrasado.
- [ ] Runbook TTL/restauración.
- [ ] Runbook de passkey/sesión/recovery, fallo de relayer y compromiso de implementación smart-wallet.
- [x] Monitoreo de confirmación, outbox, indexador, TTL, PostgreSQL y certificados HTTPS.
- [x] Backfill más allá de retención RPC probado.

### Evidencia funcional

- [ ] Passkey registrada/autenticada sobre HTTPS y smart wallet creada/conectada con hash allowlisted.
- [x] Segunda passkey, rotación/revocación de sesión y CSRF probados.
- [x] Entidad registrada/versionada.
- [x] Evento A/B registrados.
- [x] Participación confirmada antes de emisión.
- [x] Credencial A/B firmadas con consentimiento, emitidas y verificadas.
- [x] Actor sin rol/issuer scope/`IssuerOperator` rechazado.
- [x] A revocada, B vigente.
- [x] Pasaporte reconstruido desde índice.
- [x] Metadata/imagen alterada falla.
- [x] QR/PDF/JSON verifican.
- [x] Claim/recovery passkey no cambia `subject_id`, wallet ni historia.

Cuando todos los ítems aplicables estén satisfechos, los contratos y la DApp quedan listos para una decisión humana de despliegue. Mainnet continúa siendo una acción separada y explícitamente autorizada.
