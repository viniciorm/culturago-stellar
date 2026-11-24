# Compatibilidad de credenciales V2 y Soroban

Contexto: correcciones autorizadas por Marcos el 9 de noviembre de 2026 tras la revisión técnica de la postulación. Entrada MYCELIUM: se contrastaron `identidad.md`, `principios.md`, el índice y el código; se conserva la taxonomía de tres familias, Testnet y los UUID existentes. No se cambia la fase de emisión del piloto ni PR #6.

## Clave de unicidad y compatibilidad
La unicidad V1 permanece sin cambios. V2 usa una entrada explícita `issue_credential_v2` y catálogo independiente: 101 participant, 102 guest, 103 staff. La clave V2 separada por dominio incorpora sujeto, evento, familia y scope, alineada con los índices V2 de PostgreSQL que no incluyen emisor. Para participant/guest el scope deriva de la participación; staff exige scope cero, pues su unicidad es por sujeto/evento. Un rol global no sustituye el vínculo institucional emisor/operador. `ById`, el contador y la consulta V1 permanecen disponibles; esto no convierte el contrato previo desplegado en actualizable.

## Historial y hash
Una reemisión V2 usa un nuevo ID y solo reemplaza el índice activo si el anterior está revocado; el registro histórico anterior no se elimina. El digest existente no se redefine: SHA-256 de `CULTURAGO\0culturago.credential.v2\0` seguido de JSON canónico UTF-8. El ID de anclaje se deriva en un dominio distinto del digest del contenido.

## Frontera de evidencia
destino: `contracts/cultural-credential-registry/src/test.rs` (casos `v2_*`) y `scripts/testnet-v2-canary.mjs`. Los tests Rust prueban el modelo; el ejercicio sintético Testnet comprueba confirmación, argumentos decodificados y lectura posterior. Ninguno acredita integración completa de aplicación, usuarios reales ni adopción. La evidencia Testnet se encuentra en `docs/evidence/v2-canary.json` únicamente después de una ejecución exitosa.

Confianza: compatibilidad aislada confirmada por las pruebas Rust y el ejercicio Testnet registrado en docs/evidence/v2-canary.json, con segunda comprobación en v2-canary-verification.json. La integración de producto sigue pendiente. Junction de salida MYCELIUM: índice → este módulo → tests/script; los tests/script citan este módulo. No se promueve a una regla genérica del área ni se modifican identidad/principios.
