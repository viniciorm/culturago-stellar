#!/bin/bash
set -e

# CulturaGO VPS Setup & Deployment Script
# Autor: Antigravity AI
# IP del VPS: 166.0.112.1

echo "============================================="
echo "  CulturaGO: Configurando VPS y Base de Datos"
echo "============================================="

# 1. Verificar si Docker está instalado
if ! [ -x "$(command -v docker)" ]; then
  echo "[1/5] Instalando Docker y dependencias..."
  sudo apt-get update
  sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
  
  # Agregar clave GPG oficial de Docker
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  
  # Configurar repositorio estable
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  
  # Habilitar docker sin sudo para el usuario actual (opcional, requiere reiniciar sesión)
  sudo usermod -aG docker $USER
  echo "✓ Docker instalado correctamente."
else
  echo "[1/5] Docker ya está instalado. Omitiendo."
fi

# 2. Configurar Supabase Self-Hosted
echo "[2/5] Descargando y configurando Supabase..."
if [ ! -d "supabase-docker" ]; then
  git clone --depth 1 https://github.com/supabase/supabase.git supabase-docker
else
  echo "Carpeta 'supabase-docker' ya existe. Omitiendo clonación."
fi

cd supabase-docker/docker
cp -n .env.example .env || true

# Generar contraseñas seguras y llaves JWT utilizando un contenedor temporal de Node
echo "Generando secretos seguros..."
SECRETS=$(docker run --rm node:20-alpine node -e "
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');
const dbPass = crypto.randomBytes(16).toString('hex');

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const str = base64url(Buffer.from(JSON.stringify(header))) + '.' + base64url(Buffer.from(JSON.stringify(payload)));
  const signature = crypto.createHmac('sha256', secret).update(str).digest();
  return str + '.' + base64url(signature);
}

const anonPayload = { role: 'anon', iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*365*10 };
const servicePayload = { role: 'service_role', iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*365*10 };

console.log('JWT_SECRET=' + secret);
console.log('ANON_KEY=' + sign(anonPayload, secret));
console.log('SERVICE_ROLE_KEY=' + sign(servicePayload, secret));
console.log('POSTGRES_PASSWORD=' + dbPass);
")

# Parsear e inyectar las llaves generadas al archivo .env de Supabase
JWT_SECRET=$(echo "$SECRETS" | grep JWT_SECRET | cut -d'=' -f2)
ANON_KEY=$(echo "$SECRETS" | grep ANON_KEY | cut -d'=' -f2)
SERVICE_ROLE_KEY=$(echo "$SECRETS" | grep SERVICE_ROLE_KEY | cut -d'=' -f2)
POSTGRES_PASSWORD=$(echo "$SECRETS" | grep POSTGRES_PASSWORD | cut -d'=' -f2)

# Modificar el archivo .env de Supabase
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env
sed -i "s|ANON_KEY=.*|ANON_KEY=$ANON_KEY|g" .env
sed -i "s|SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|g" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|g" .env

# Evitar conflicto de puertos: Mapear Dashboard Studio al puerto 8002 si fuera necesario
# Por defecto lo dejaremos en el 8000 para la API (Kong) y Studio en el 8001
sed -i "s|STUDIO_PORT=3000|STUDIO_PORT=8001|g" .env

# Levantar Supabase Docker
echo "Iniciando contenedores de Supabase..."
docker compose pull
docker compose up -d

cd ../.. # Regresar a la raíz de culturago-stellar

# 3. Construir y Desplegar la Aplicación Next.js
echo "[3/5] Compilando y levantando la aplicación Next.js..."

# Configurar variables de entorno locales de compilación
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY

# Crear archivo de configuración para docker-compose.app.yml
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" > deploy/.env

docker compose -f deploy/docker-compose.app.yml down || true
docker compose -f deploy/docker-compose.app.yml build --no-cache
docker compose -f deploy/docker-compose.app.yml up -d


echo "============================================="
echo "  ✓ ¡Despliegue de CulturaGO completado!"
echo "============================================="
echo "Web App: http://166.0.112.1 (Puerto 80)"
echo "Supabase API: http://166.0.112.1:8000"
echo "Supabase Studio (Dashboard): http://166.0.112.1:8001"
echo "---------------------------------------------"
echo "Siguiente paso: Entra a http://166.0.112.1:8001"
echo "Ve al SQL Editor y ejecuta el script supabase-schema.sql para crear las tablas."
echo "============================================="
