# Correcciones previas a la postulación — 9 de noviembre de 2026

Base inspeccionada: `develop` en `1e0c509557b0d7219050b2ab663b2ba106f76552`. Correcciones en la rama `fix/v2-review-readiness`, inicialmente locales y sin publicar. `v2-source-provenance.json` registra hashes de fuentes y WASM. No se atribuye este trabajo previo al futuro sprint financiado.

## Cambios y evidencia

- Contrato: entrada separada `issue_credential_v2`, familias 101/102/103 para participant/guest/staff, esquema 2, scope por participación y unicidad alineada con PostgreSQL. La firma V1 y su catálogo conservan su comportamiento. La reemisión V2 permite reemplazar el índice activo tras revocación y conserva el registro histórico. Se despliega una instancia Testnet nueva; no se actualiza el contrato anterior.
- Servicio: contexto de operador obligatorio para emisión y revocación; rol permitido y vínculo explícito con emisor, incluso para administradores. Las nuevas acciones de servidor obtienen el actor desde la sesión validada y no aceptan un actor proporcionado por el cliente. Esto es una entrada off-chain; aún no integra el flujo de firma/cola de la aplicación con Soroban V2.
- Evidencias: participación del sujeto/evento en estado confirmado; relaciones activas, de tipos permitidos, del sujeto y contexto de evento correctos. Pruebas negativas cubren sujeto/evento/estado, tipo/contexto de relación y operador sin alcance.
- Página y PDF V2: estado local o borrador explícito; se retiran afirmaciones de autenticidad o confirmación Stellar no demostradas.
- Reproducibilidad: Rust 1.92.0 fijado; CI configura PostgreSQL y migraciones. Las suites V2 fallan cuando falta PostgreSQL. La ejecución local con puerto inaccesible produjo dos suites fallidas, como se esperaba (`review-missing-db.log`). No se afirma que CI remoto haya ejecutado estos cambios aún.

## Testnet real, datos sintéticos

Contrato nuevo: `CBJKJVMLTOMSSSEK6YIF6K4PO2LNABDZH3ZQZGD5D4TC62YRWEXX6YSZ`.

WASM SHA-256: `263e95eec2f6eaacff362267bd2cdd4c1c55bc4584dac044c9049e33b1cb9f21`.

| Prueba | Transacción | Ledger |
|---|---|---|
| Despliegue | `0d755e2405ccd1ab040342d545eec857bd784cfe24eb18f08e9cedd269eb8781` | 5645784 |
| Participación sintética 1 | `dfecd5dd248d5eaaf63ad1e2afa0a5a59802d99841dc69180c59b7be727cfbdc` | 5645791 |
| Participación sintética 2 | `239394d94d7eb8599deb4148cf03cadf9d33f32a8e631b93f45c7be0b21f7c79` | 5645800 |

`v2-canary.json` incluye payloads, JSON canónico, digests, envelopes XDR, identificadores, scopes, ledgers y lecturas. `v2-canary-verification.json` registra una segunda comprobación independiente: consulta transacciones confirmadas, decodifica argumentos y vuelve a leer contrato/scope mediante simulaciones RPC de solo lectura, recalcula JSON y SHA-256 sin importar el dominio de la aplicación, y comprueba el rechazo de un digest alterado. Son dos participaciones del mismo sujeto/evento. No son registros del Festival, no son evidencia de adopción y no cuentan como las tres credenciales futuras de D4.

## Reproducción

1. Instalar pnpm 10, Node 22 o superior, Rust 1.92.0 y Stellar CLI 30.0.1 (versión usada localmente).
2. Preparar PostgreSQL 17 aislado, configurar `DATABASE_URL`/`TEST_DATABASE_URL` y ejecutar `pnpm migrate`.
3. Ejecutar `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test`, `pnpm contracts:test`, `pnpm contracts:lint`, `pnpm contracts:build` y `pnpm build`.
4. `node scripts/verify-v2-canary.mjs` solo verifica la prueba existente. Para un ejercicio nuevo, `CULTURAGO_ALLOW_TESTNET_MUTATIONS=true node scripts/testnet-v2-canary.mjs` crea cuentas efímeras, despliega y emite únicamente datos sintéticos Testnet. No guarda claves privadas; su pérdida impide administrar posteriormente esa instancia de prueba.

## Límites y trabajo futuro

Se ha probado compatibilidad aislada, no el producto completo. Siguen pendientes la conexión de la cola/gateway de aplicación a V2, firma del operador en el recorrido real, integración en pasaporte, estados públicos basados en lectura Stellar y tres credenciales nuevas del sprint. Elegibilidad, titularidad y licencia requieren declaraciones del solicitante; no se deducen de estas pruebas.

## Fuentes Raven utilizadas

Raven se consultó efectivamente mediante `stellarDocs.search_soroban_contract_docs` y la sección de pruebas de `skills.stellar-dev.smart-contracts`, el 9 de noviembre de 2026. Se usaron las guías oficiales de [autorización](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization#when-to-require_auth) y [TTL](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/storage#managing-contract-data-ttls-with-extend_ttl). Las pruebas de `develop` y Testnet se ejecutaron directamente; no se atribuyen al índice de repositorios de Raven.
