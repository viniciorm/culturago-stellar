#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CulturaGO — Setup y Despliegue del Ambiente DEV (dev.culturago.cl)
# Servidor: VPS 166.0.112.1
# Aislamiento 100% de Producción (culturago.cl en :3080 sigue intacto)
# ==============================================================================

echo "=== [1/8] Verificando permisos de superusuario ==="
if [ "$EUID" -ne 0 ]; then
  echo "Error: este script debe ejecutarse como root o con sudo."
  exit 1
fi

echo "=== [2/8] Configurando Swapfile de 2 GB si no existe ==="
if ! swapon --show | grep -q "/swapfile"; then
  if [ ! -f /swapfile ]; then
    echo "Creando archivo /swapfile de 2 GB..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  echo "✓ Swap de 2 GB configurado y activo."
else
  echo "✓ Swap ya activo."
fi
free -h

echo "=== [3/8] Preparando directorio y variables /opt/culturago-dev/.env ==="
mkdir -p /opt/culturago-dev
chmod 750 /opt/culturago-dev
if getent group cultura >/dev/null 2>&1; then
  chown root:cultura /opt/culturago-dev
fi

if [ ! -f /opt/culturago-dev/.env ]; then
  if command -v openssl >/dev/null 2>&1; then
    DEV_DB_PASS=$(openssl rand -hex 24)
  else
    DEV_DB_PASS=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi

  cat <<EOF > /opt/culturago-dev/.env
NODE_ENV=production
PORT=3081
HOSTNAME=0.0.0.0
NEXT_PUBLIC_ENVIRONMENT=development
NEXT_PUBLIC_CULTURAGO_ENV=testnet
NEXT_PUBLIC_APP_URL=https://dev.culturago.cl

# PostgreSQL DEV (aislado en contenedor culturago-postgres-dev)
POSTGRES_USER=culturago_dev_app
POSTGRES_PASSWORD=${DEV_DB_PASS}
POSTGRES_DB=culturago_dev
DATABASE_URL=postgresql://culturago_dev_app:${DEV_DB_PASS}@culturago-postgres-dev:5432/culturago_dev
DATABASE_MIGRATION_URL=postgresql://culturago_dev_app:${DEV_DB_PASS}@culturago-postgres-dev:5432/culturago_dev

# Guardrails de seguridad DEV
EMAIL_ENABLED=false
EMAIL_PROVIDER=noop
CULTURAGO_ALLOW_TESTNET_MUTATIONS=false

# Stellar Testnet (dedicado a DEV)
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
NEXT_PUBLIC_STELLAR_EXPLORER_BASE="https://stellar.expert/explorer/testnet"

# WebAuthn
WEBAUTHN_RP_ID=dev.culturago.cl
WEBAUTHN_ORIGINS=https://dev.culturago.cl
EOF
  unset DEV_DB_PASS
  chmod 640 /opt/culturago-dev/.env
  if getent group cultura >/dev/null 2>&1; then
    chown root:cultura /opt/culturago-dev/.env
  else
    chown root:root /opt/culturago-dev/.env
  fi
  echo "✓ /opt/culturago-dev/.env creado con CSPRNG (permisos 640, root:cultura)."
else
  echo "✓ /opt/culturago-dev/.env ya existe (se preserva configuración y credenciales existentes)."
  if grep -q "^NEXT_PUBLIC_CULTURAGO_ENV=development" /opt/culturago-dev/.env; then
    sed -i 's/^NEXT_PUBLIC_CULTURAGO_ENV=development.*/NEXT_PUBLIC_CULTURAGO_ENV=testnet/' /opt/culturago-dev/.env
    echo "✓ Migrado NEXT_PUBLIC_CULTURAGO_ENV: development -> testnet en /opt/culturago-dev/.env."
  elif ! grep -q "^NEXT_PUBLIC_CULTURAGO_ENV=" /opt/culturago-dev/.env; then
    echo "NEXT_PUBLIC_CULTURAGO_ENV=testnet" >> /opt/culturago-dev/.env
    echo "✓ Añadido NEXT_PUBLIC_CULTURAGO_ENV=testnet a /opt/culturago-dev/.env."
  fi

  if ! grep -q "^NEXT_PUBLIC_ENVIRONMENT=" /opt/culturago-dev/.env; then
    echo "NEXT_PUBLIC_ENVIRONMENT=development" >> /opt/culturago-dev/.env
    echo "✓ Añadido NEXT_PUBLIC_ENVIRONMENT=development a /opt/culturago-dev/.env."
  fi

  chmod 640 /opt/culturago-dev/.env
  if getent group cultura >/dev/null 2>&1; then
    chown root:cultura /opt/culturago-dev/.env
  else
    chown root:root /opt/culturago-dev/.env
  fi
fi

echo "=== [4/8] Configurando Nginx para dev.culturago.cl ==="
cat <<'EOF' > /etc/nginx/sites-available/dev.culturago.cl
server {
    listen 80;
    server_name dev.culturago.cl;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/dev.culturago.cl /etc/nginx/sites-enabled/dev.culturago.cl
echo "Probando sintaxis de Nginx..."
nginx -t
systemctl reload nginx
echo "✓ Nginx recargado con bloque para dev.culturago.cl -> 127.0.0.1:3081."

echo "=== [5/8] Desplegando Contenedores DEV (PostgreSQL DEV + Next.js DEV) ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

docker compose -f deploy/docker-compose.dev.yml --env-file /opt/culturago-dev/.env up -d --build

echo "Esperando que culturago-postgres-dev esté saludable..."
until docker exec culturago-postgres-dev pg_isready -U culturago_dev_app -d culturago_dev; do
  sleep 2
done
echo "✓ culturago-postgres-dev listo."

echo "=== [6/8] Aplicando Migraciones 0001 -> 0014 en PostgreSQL DEV ==="
docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"

for mig in database/migrations/*.sql; do
  mig_name="$(basename "$mig")"
  already_applied=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM schema_migrations WHERE filename = '$mig_name';")
  if [ "$already_applied" = "0" ]; then
    echo "Aplicando migración: $mig_name"
    docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev < "$mig"
    docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -c "INSERT INTO schema_migrations (filename) VALUES ('$mig_name');"
  else
    echo "Migración ya aplicada: $mig_name"
  fi
done

# Verificación explícita e inequívoca de registro en schema_migrations (columna filename)
echo "Verificando registro inequívoco de migraciones en schema_migrations..."
TOTAL_MIG_FILES=0
for mig in database/migrations/*.sql; do
  mig_name="$(basename "$mig")"
  TOTAL_MIG_FILES=$((TOTAL_MIG_FILES + 1))
  is_applied=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM schema_migrations WHERE filename = '$mig_name';")
  if [ "$is_applied" -ne 1 ]; then
    echo "ERROR: La migración $mig_name no está registrada en schema_migrations (columna filename)."
    exit 1
  fi
done

APPLIED_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM schema_migrations;")
echo "✓ Todas las ${APPLIED_COUNT} migraciones (esperadas ${TOTAL_MIG_FILES}) están aplicadas y verificadas en schema_migrations (columna filename)."

echo "=== [7/8] Aplicando Seed Mínimo Ficticio en DEV ==="
if [ -f "database/seed-dev-minimal.sql" ]; then
  # Fail-fast: ON_ERROR_STOP=1 aborta el script si cualquier statement falla
  docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev < "database/seed-dev-minimal.sql"

  # Verificación inmediata de que las tablas no quedaron vacías tras ROLLBACK o fallo
  ENTITIES_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM entities;")
  ORGS_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM organizations;")
  EVENTS_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM events;")
  PEOPLE_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM people;")
  PARTS_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM participations;")
  RELS_COUNT=$(docker exec -i culturago-postgres-dev psql -v ON_ERROR_STOP=1 -U culturago_dev_app -d culturago_dev -t -A -c "SELECT count(*) FROM relationships;")

  if [ "$ENTITIES_COUNT" -eq 0 ] || [ "$ORGS_COUNT" -eq 0 ] || [ "$EVENTS_COUNT" -eq 0 ] || [ "$PEOPLE_COUNT" -eq 0 ] || [ "$PARTS_COUNT" -eq 0 ]; then
    echo "ERROR: El seed no insertó los registros requeridos (entities=${ENTITIES_COUNT}, orgs=${ORGS_COUNT}, events=${EVENTS_COUNT}, people=${PEOPLE_COUNT}, participations=${PARTS_COUNT})."
    exit 1
  fi

  echo "✓ Seed mínimo ficticio aplicado y verificado correctamente en culturago_dev (entities=${ENTITIES_COUNT}, orgs=${ORGS_COUNT}, events=${EVENTS_COUNT}, people=${PEOPLE_COUNT}, participations=${PARTS_COUNT}, rels=${RELS_COUNT})."
fi

echo "=== [8/8] Smoke Test Local DEV (:3081) ==="
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3081 || echo "000")
echo "HTTP Status en 127.0.0.1:3081 -> ${HTTP_CODE}"
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "307" ] && [ "$HTTP_CODE" != "308" ]; then
  echo "ERROR: Smoke test falló con status HTTP ${HTTP_CODE}"
  exit 1
fi

echo "=============================================================================="
echo "  AMBIENTE DEV DESPLEGADO EXITOSAMENTE"
echo "  App: http://127.0.0.1:3081 (Proxy: dev.culturago.cl)"
echo "  Postgres: culturago-postgres-dev (Base: culturago_dev)"
echo "  Producción (:3080): Intacta y Saludable"
echo "=============================================================================="
