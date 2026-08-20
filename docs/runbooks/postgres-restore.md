# Runbook: backup y restore PostgreSQL medido

## Objetivo

Realizar backup lógico periódico y restore aislado con medición de RPO/RTO, sin afectar producción.

## Variables

- `DATABASE_BACKUP_URL` — URL de lectura segura para `pg_dump`.
- `DATABASE_RESTORE_URL` — URL de base aislada para `pg_restore`.
- `POSTGRES_BACKUP_DIR` — directorio de backups con permisos restrictivos.
- `POSTGRES_BACKUP_RETENTION_DAYS` — días de retención.
- `POSTGRES_RPO_SECONDS` — objetivo RPO.
- `POSTGRES_RTO_SECONDS` — objetivo RTO.
- `POSTGRES_RESTORE_TARGET_GUARD` — identificador del entorno aislado; el script rechaza `production`.
- `CULTURAGO_ALLOW_TESTNET_MUTATIONS=true` — requerido para ejecutar, no solo dry-run.

## Backup

```bash
CULTURAGO_ALLOW_TESTNET_MUTATIONS=true \
DATABASE_BACKUP_URL=... \
POSTGRES_BACKUP_DIR=./backups \
POSTGRES_BACKUP_RETENTION_DAYS=7 \
POSTGRES_RPO_SECONDS=86400 \
  node scripts/postgres-backup.mjs --execute
```

Salida: ruta, tamaño, `sha256`, tiempo transcurrido. El script no imprime la URL.

## Restore aislado

```bash
CULTURAGO_ALLOW_TESTNET_MUTATIONS=true \
DATABASE_RESTORE_URL=... \
POSTGRES_RESTORE_TARGET_GUARD=testnet-restore-01 \
POSTGRES_BACKUP_DIR=./backups \
POSTGRES_RTO_SECONDS=3600 \
  node scripts/postgres-restore.mjs --execute
```

Después:

1. `node database/migrate.mjs` contra `DATABASE_RESTORE_URL` para asegurar migraciones.
2. `pnpm test` contra la base restaurada para verificar integridad.
3. Comparar `schema_migrations` con la base origen.

## Criterio de éxito

- RPO medido ≤ `POSTGRES_RPO_SECONDS`.
- RTO medido ≤ `POSTGRES_RTO_SECONDS`.
- Base restaurada pasa los mismos tests de integridad.
- Ninguna URL ni credencial queda en logs.

## Precauciones

- Nunca fijar `POSTGRES_RESTORE_TARGET_GUARD=production` o similar.
- Nunca restaurar en la base activa.
- Usar rol de solo lectura para backup y rol aparte con DDL para migración.
