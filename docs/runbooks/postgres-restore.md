# Runbook: restore PostgreSQL controlado

## Objetivo

Verificar que un backup puede restaurarse en una base aislada sin afectar producción.

## Pasos

1. Identificar el backup más reciente (`pg_dump -Fc` en `backups/`).
2. Crear una base vacía de staging: `createdb culturago_restore_<fecha>`.
3. Restaurar: `pg_restore -d culturago_restore_<fecha> backup.pgdump`.
4. Ejecutar migraciones: `pnpm migrate` contra la base restaurada.
5. Verificar constraints, índices y proyecciones (`stellar_indexed_events`, `passport` views).
6. Medir RPO/RTO y registrar el resultado en `docs/evidence.md`.

## Criterio de éxito

La base restaurada pasa los mismos tests de integración que la base principal y los índices/estado coinciden.

## Precauciones

- Nunca restaurar en la base de producción.
- Usar un rol de solo lectura para verificación.
- No exponer la base restaurada a la red pública.
