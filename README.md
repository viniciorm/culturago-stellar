# CulturaGO - Pasaportes Culturales Verificables (FDVC 2026 MVP)

CulturaGO es una plataforma de pasaportes culturales digitales verificables para artistas, escuelas, profesoras, organizaciones y proveedores del sector cultural. Este repositorio contiene el MVP diseñado y construido para el **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

---

## 🚀 Características del MVP
1.  **Dashboard de Eventos:** Panel principal completo en `/dashboard/eventos/fdvc-2026` con 8 pestañas interactivas de administración (Resumen, Escuelas, Bailarinas, Profesoras, Proveedores, Credenciales, Pendientes, QR de Entrada).
2.  **CRUDs de Entidades:** Interfaces para agregar, modificar y eliminar Artistas, Organizaciones y Proveedores Técnicos de manera ágil.
3.  **Generación de Códigos QR Dinámicos:** Códigos QR interactivos autogenerados para pasaportes personales, perfiles de academias, de proveedores y credenciales individuales, enlazados a sus respectivas URLs públicas.
4.  **Emisión de Credenciales Verificables:** Emisión de certificados oficiales firmados (como "Escuela Participante" o "Fotógrafo Oficial") con estados vigentes, pendientes o revocados.
5.  **Motor de Base de Datos Dual:** Funciona localmente mediante un mock de almacenamiento local (`localStorage`) cargado con datos semilla iniciales, o conectado a **Supabase** en la nube si se proveen las llaves API correspondientes.
6.  **Capa Mock de Stellar & Soroban:** Módulo de transacciones blockchain simuladas listo en `src/lib/stellar.ts`, ideal para que Danilo conecte contratos Rust reales y wallets passkeys.

---

## 🛠️ Tecnologías Utilizadas
*   **Core:** [Next.js 16 (App Router)](https://nextjs.org/)
*   **Lenguaje:** [TypeScript](https://www.typescriptlang.org/)
*   **Estilos (CSS):** [Tailwind CSS v4](https://tailwindcss.com/)
*   **Base de datos / Auth:** [Supabase Client](https://supabase.com/)
*   **Iconos:** [Lucide React](https://lucide.dev/)
*   **Generador QR:** [QRCode (npm)](https://www.npmjs.com/package/qrcode)

---

## 📂 Estructura del Proyecto

*   `src/app/` - Rutas de Next.js (públicas y privadas).
*   `src/components/` - Layouts globales (`PublicLayout`, `DashboardLayout`) y componentes interactivos (`PassportCard`, `CredentialCard`, `RelationshipManager`).
*   `src/components/ui/` - Librería de componentes visuales adaptada (Button, Input, Select, Dialog, Tabs, Table, Badges).
*   `src/lib/` - Lógica del sistema:
    *   `db.ts` - Motor de datos dual (Supabase + LocalStorage Mock).
    *   `stellar.ts` - Funciones mock preparadas para Danilo.
    *   `hashes.ts` - Utilidad de generación de hashes SHA-256 determinísticos.
*   `docs/` - Documentación técnica detallada:
    *   `architecture.md` - Decisiones de diseño de software y base de datos.
    *   `stellar-integration.md` - Especificación de contratos Rust y SDK de Stellar.
    *   `supabase-schema.sql` - Script SQL con las tablas y datos semilla.

---

## 💻 Instalación y Desarrollo Local

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/viniciorm/culturago-stellar.git
cd culturago-stellar
npm install
```

### 2. Ejecutar el servidor de desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en el navegador.

### 3. Acceso al Dashboard de Administrador
1.  Haz clic en **Acceso Admin** en la esquina superior derecha o ve directamente a `/login`.
2.  Ingresa las siguientes credenciales de desarrollo:
    *   **Usuario:** `admin@culturago.cl`
    *   **Contraseña:** `admin123`

---

## ☁️ Conexión con Supabase en la Nube

Para conectar la aplicación a un proyecto real de Supabase:
1.  Crea un proyecto en Supabase.
2.  Ve al SQL Editor en el panel de Supabase y ejecuta el script de migración ubicado en `docs/supabase-schema.sql`. Esto creará las tablas, los triggers de actualización y cargará los datos semilla iniciales.
3.  Crea un archivo `.env.local` en la raíz de este proyecto con tus credenciales:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=tu-url-de-supabase
    NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-de-supabase
    ```
4.  Reinicia el servidor local. El motor detectará de forma automática las llaves y se conectará a la nube en lugar del Mock de almacenamiento local.

---

## 🎨 Principios de Diseño
*   **Estética Cultural:** El fondo de la plataforma es de color marfil cálido (`#FCFBF7`), con tipografías serif y geométricas, detalles en burdeo profundo (`#5C061E`) y acentos en dorado suave (`#C5A880`).
*   **Cero jerga cripto para el público:** Las interfaces públicas evitan conceptos como "gas", "NFT", "wallet address" o "smart contract". Se usan términos amigables e institucionales como **Pasaporte Cultural**, **Acreditación Oficial** y **Verificado por FDVC**.
*   **Mobile-First:** Las vistas del pasaporte, de escuelas y credenciales públicas se adaptan perfectamente a pantallas de celulares para ser escaneadas cómodamente en las puertas del teatro Aula Magna Manuel de Salas.
