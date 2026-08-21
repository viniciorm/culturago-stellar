# CulturaGO - Pasaportes Culturales Verificables (FDVC 2026 MVP)

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones y proveedores del sector cultural. Este repositorio contiene el MVP diseñado y construido para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

---

## 🏛️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph Cliente / Navegador
        Public[Vistas Públicas Mobile-First /p/ /o/ /credencial/]
        AdminUI[Dashboard Admin /dashboard/eventos/fdvc-2026]
    end

    subgraph VPS Ubuntu 24.04 LTS (IP: 166.0.112.1)
        subgraph Docker App (Puerto 80)
            NextApp[Next.js 16 Standalone Container / Node 22 + pnpm v9]
        end

        subgraph Docker Supabase Self-Hosted Stack
            Kong[Kong API Gateway - Puerto 8000]
            Studio[Supabase Studio UI - Puerto 8001]
            Auth[GoTrue Auth Service]
            REST[PostgREST Engine]
            PostgreSQL[(PostgreSQL 17 DB - Puerto 5432)]
        end
      
        subgraph Capa Blockchain (Simulador / Soroban)
            Hashes[SHA-256 Metadata Generator lib/hashes.ts]
            StellarModule[Stellar / Soroban Abstraction lib/stellar.ts]
        end
    end

    Public --> NextApp
    AdminUI --> NextApp
    NextApp -->|@supabase/supabase-js| Kong
    Kong --> REST
    Kong --> Auth
    REST --> PostgreSQL
    Studio --> PostgreSQL
    AdminUI --> Hashes
    AdminUI --> StellarModule
```

### Componentes de la Arquitectura:
1. **Core Web Engine**: Next.js 16.2 (App Router) empaquetado en modo `output: "standalone"` para ejecuciones ultraligeras en producción de bajo consumo RAM.
2. **Base de Datos Dual (`src/lib/db.ts`)**:
   - **Producción**: PostgreSQL 17 + Supabase Self-Hosted (Kong, PostgREST, Auth, Storage y Studio).
   - **Desarrollo / Offline**: Motor en memoria con respaldo en `localStorage` cargado con datos semilla iniciales.
3. **Capa Blockchain & Simulación Stellar**:
   - `src/lib/hashes.ts`: Generación determinística de hashes SHA-256.
   - `src/lib/stellar.ts`: Módulo mock para Soroban Rust y Passkeys WebAuthn.
4. **Infraestructura VPS**: Servidor Ubuntu 24.04 LTS orquestado con Docker & Docker Compose y empaquetado optimizado con `pnpm v9`.

---

## 🚀 Características del MVP
1. **Dashboard de Eventos:** Panel principal completo en `/dashboard/eventos/fdvc-2026` con 8 pestañas interactivas de administración (Resumen, Escuelas, Bailarinas, Profesoras, Proveedores, Credenciales, Pendientes, QR de Entrada).
2. **CRUDs de Entidades:** Interfaces para agregar, modificar y eliminar Artistas, Organizaciones y Proveedores Técnicos.
3. **Códigos QR Dinámicos:** QR interactivos autogenerados para pasaportes personales, academias y credenciales.
4. **Credenciales Verificables:** Certificados oficiales firmados con estados de validez (vigente, pendiente, revocado).
5. **Motor de Datos Híbrido:** LocalStorage Mock u opción de conexión instantánea a Supabase en VPS/Nube.

---

## 🛠️ Tecnologías Utilizadas
* **Core:** Next.js 16.2 (App Router)
* **Lenguaje:** TypeScript
* **Estilos (CSS):** Tailwind CSS v4
* **Base de datos / Auth:** Supabase Client + PostgreSQL 17
* **Gestor de Paquetes:** `pnpm v9` (via Corepack)
* **Iconos:** Lucide React
* **Generador QR:** QRCode (npm)

---

## 🗄️ Acceso a la Base de Datos (PostgreSQL / Supabase)

### Usuarios de la Base de Datos:
* **`postgres`**: Usuario estándar de administración de la base de datos PostgreSQL.
* **`supabase_admin`**: Superadministrador interno de PostgreSQL dentro del contenedor Docker.

### ¿Cómo ingresar a la Base de Datos?

#### 1. Vía Consola Interactiva (en la terminal del VPS):
```bash
# Conectarse como usuario postgres:
docker exec -it supabase-db psql -U postgres -d postgres

# Conectarse como superadministrador:
docker exec -it supabase-db psql -U supabase_admin -d postgres
```

#### 2. Vía Panel Gráfico Web (Supabase Studio):
1. Abre **`http://166.0.112.1:8001`** en tu navegador.
2. Ve al **Table Editor** o **SQL Editor** para consultar y administrar las tablas de forma visual.

#### 3. Vía Cliente SQL (DBeaver, TablePlus, VS Code):
* **Host**: `166.0.112.1`
* **Puerto**: `5432`
* **Base de datos**: `postgres`
* **Usuario**: `postgres`
* **Contraseña**: La encuentras ejecutando `cat ~/culturago-stellar/deploy/.env` en tu VPS.

---

## 📂 Estructura y Mapa del Código
Consulta el documento [CODEMAP.md](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/CODEMAP.md) para ver la ubicación exacta de cada vista, componente UI y módulo del proyecto.

---

## 💻 Despliegue en VPS (Ubuntu)

Para desplegar o actualizar en tu servidor VPS de Truebox:
```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
chmod +x deploy/setup-vps.sh
./deploy/setup-vps.sh
```

---

## 🎨 Principios de Diseño
* **Estética Cultural:** Fondo marfil cálido (`#FCFBF7`), tipografías serif y geométricas, detalles en burdeo profundo (`#5C061E`) y acentos en dorado suave (`#C5A880`).
* **Cero jerga cripto para el público:** Términos institucionales y amigables como **Pasaporte Cultural**, **Acreditación Oficial** y **Verificado por FDVC**.
