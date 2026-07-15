# Arquitectura del Sistema - CulturaGO MVP

Este documento describe la arquitectura y las decisiones de diseño técnico adoptadas para el MVP de **CulturaGO** en el marco del **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

---

## 1. Diseño de Arquitectura

El MVP está estructurado sobre la plataforma **Next.js 16 (App Router)** y **TypeScript**, utilizando **Tailwind CSS v4** para estilos y un motor de base de datos dual flexible.

```mermaid
graph TD
    subgraph Cliente (Next.js / React)
        RutasPublicas[Rutas Públicas Mobile-First]
        DashboardAdmin[Dashboard de Administración]
        UIComponents[Custom UI Components]
    end

    subgraph Capa de Datos (Capa Abstraída)
        DBEngine[Motor de Base de Datos Dual db.ts]
        MemDB[Mock Database local / memoria]
        SupaDB[Supabase DB / Auth]
    end

    subgraph Integraciones & Blockchain
        StellarMock[Módulo Stellar lib/stellar.ts]
        Hashes[Módulo Hashes lib/hashes.ts]
        QRGenerator[Generador QR qrcode]
    end

    Client --> DBEngine
    DBEngine -->|Si no hay llaves| MemDB
    DBEngine -->|Si hay llaves en .env.local| SupaDB
    DashboardAdmin --> StellarMock
    DashboardAdmin --> Hashes
    RutasPublicas --> QRGenerator
```

---

## 2. Decisiones Técnicas Clave

### A. Motor de Base de Datos Dual (Local Mock & Supabase)
*   **Problema:** Un MVP suele requerir una base de datos activa inmediatamente para pruebas. Obligar a los desarrolladores o diseñadores a registrarse en Supabase e importar esquemas antes de poder correr `npm run dev` agrega fricción al desarrollo y despliegue rápido.
*   **Solución:** Creamos una capa de abstracción en `src/lib/db.ts`. 
    *   Si detecta las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, inicializa el cliente oficial de Supabase.
    *   Si no las detecta, inicializa un motor en memoria que se sincroniza con `localStorage`. Viene precargado con todos los datos semilla (FDVC, Escuela Demo, Bailarina Demo, Profesora Demo, Proveedor Demo). Esto permite un desarrollo offline rápido, interactivo y listo para desplegar en Vercel con un solo clic.

### B. Diseño Estético y de UX
*   **Alineación de Marca:** CulturaGO no debe parecer un producto cripto/web3. No se muestran palabras como "gas", "NFT", "wallet", "smart contract" o "seed phrase" en las interfaces de usuario de los artistas o del público general.
*   **Conceptos UX Utilizados:** "Pasaporte Cultural", "Credencial verificable", "Verificado por FDVC", "Registro Stellar verificado".
*   **Paleta de Colores:** Fondo de marfil (#FCFBF7), texto grafito (#1C1A17), detalles burdeos (#5C061E) y dorado suave (#C5A880). Una estética institucional, sofisticada e inspirada en la danza y la cultura.

### C. Abstracción para Stellar y Soroban
*   Los campos requeridos para Stellar (`metadata_hash`, `stellar_status`, `stellar_tx`, `wallet_address`, `wallet_status`) están incluidos en el esquema de base de datos e interfaz del administrador.
*   El archivo `src/lib/stellar.ts` exporta funciones con interfaces tipadas idénticas a las que se usarán en producción, pero simulando llamadas con promesas y devolviendo respuestas realistas (hashes de transacción ficticios, estados, etc.).
*   Esto delimita claramente el trabajo del equipo de Frontend y el de Danilo (quien integrará la blockchain real), evitando acoplamientos innecesarios.

### D. Seguridad de Datos
*   Para cumplir con la privacidad, los datos personales sensibles (como teléfonos, correos y nombres legales) se almacenan en tablas secundarias específicas (`people`, `organizations`, `providers`) y **no se exponen** a las vistas públicas de los pasaportes a menos que estén explícitamente autorizados o marcados como públicos.
*   En la blockchain solo se registrará el `metadata_hash` generado por `generateMetadataHash(data)`, resguardando el principio de privacidad de datos y minimizando costos de almacenamiento en red.
