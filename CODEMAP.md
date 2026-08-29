# Code Map - CulturaGO Stellar MVP

Este documento mapea la arquitectura, rutas, componentes, modelos de datos y utilidades de **CulturaGO** para navegación rápida.

---

## 🗺️ Mapa de Rutas Públicas y Privadas (`src/app/`)

| Ruta | Archivo | Descripción / Responsabilidad |
| :--- | :--- | :--- |
| `/` | [src/app/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/page.tsx) | **Landing Page Pública**: Búsqueda rápida de pasaportes y validador de códigos de credenciales. |
| `/login` | [src/app/login/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/login/page.tsx) | **Acceso Administrador**: Autenticación para el panel (`admin@culturago.cl` / `admin123`). |
| `/credencial/[credentialCode]` | [src/app/credencial/[credentialCode]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/credencial/%5BcredentialCode%5D/page.tsx) | **Credencial Verificable Pública**: Muestra el estado oficial, anclaje Stellar y emisor. |
| `/evento/[slug]` | [src/app/evento/[slug]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/evento/%5Bslug%5D/page.tsx) | **Perfil Público de Evento**: Muestra la lista de escuelas participantes, bailarinas y proveedores. |
| `/o/[slug]` | [src/app/o/[slug]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/o/%5Bslug%5D/page.tsx) | **Pasaporte Cultural de Organización/Escuela**: Perfil público con QR y acreditaciones. |
| `/p/[slug]` | [src/app/p/[slug]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/p/%5Bslug%5D/page.tsx) | **Pasaporte Cultural de Artista/Profesora**: Perfil público con QR y acreditaciones. |
| `/proveedor/[slug]` | [src/app/proveedor/[slug]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/proveedor/%5Bslug%5D/page.tsx) | **Pasaporte Cultural de Proveedor**: Perfil público de servicios técnicos o prensa. |
| `/dashboard` | [src/app/dashboard/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/page.tsx) | **Home Admin**: Métricas generales y acceso rápido a eventos. |
| `/dashboard/eventos/[eventId]` | [src/app/dashboard/eventos/[eventId]/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/eventos/%5BeventId%5D/page.tsx) | **Panel Principal de Eventos (8 Pestañas)**: Resumen, Escuelas, Bailarinas, Profesoras, Proveedores, Credenciales, Pendientes y QR Entrada. |
| `/dashboard/credenciales` | [src/app/dashboard/credenciales/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/credenciales/page.tsx) | **Gestor de Credenciales**: Emisión y revocación de certificados. |
| `/dashboard/organizaciones` | [src/app/dashboard/organizaciones/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/organizaciones/page.tsx) | **CRUD de Organizaciones**: Alta y edición de escuelas y academias. |
| `/dashboard/personas` | [src/app/dashboard/personas/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/personas/page.tsx) | **CRUD de Personas**: Alta y edición de bailarinas, profesoras y directores. |
| `/dashboard/proveedores` | [src/app/dashboard/proveedores/page.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/app/dashboard/proveedores/page.tsx) | **CRUD de Proveedores**: Alta y edición de proveedores técnicos. |
| `/dashboard/configuracion` | `src/app/dashboard/configuracion/page.tsx` | **Configuración**: Estado de la base de datos y métricas. |

---

## 🎨 Componentes de Dominio (`src/components/`)

*   [PublicLayout.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/PublicLayout.tsx): Header cultural, footer y contenedor con la paleta de colores institucional.
*   [DashboardLayout.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/DashboardLayout.tsx): Sidebar de administración, usuario activo e indicador de estado DB.
*   [PassportCard.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/PassportCard.tsx): Tarjeta de identidad artística visual con QR dinámico.
*   [CredentialCard.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/CredentialCard.tsx): Tarjeta de acreditación oficial con estado Stellar y sello de verificación.
*   [PersonForm.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/PersonForm.tsx): Formulario modal para crear/editar Personas.
*   [OrganizationForm.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/OrganizationForm.tsx): Formulario modal para crear/editar Escuelas/Organizaciones.
*   [ProviderForm.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ProviderForm.tsx): Formulario modal para crear/editar Proveedores.
*   [CredentialForm.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/CredentialForm.tsx): Formulario modal para emitir credenciales.
*   [RelationshipManager.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/RelationshipManager.tsx): Gestor de vínculos y roles entre entidades.
*   [StellarStatusBlock.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/StellarStatusBlock.tsx): Bloque detallado de estado blockchain (hash de metadata, tx hash).
*   [EventSummaryCards.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/EventSummaryCards.tsx): Métricas del evento (total escuelas, bailarinas, credenciales).

---

## 🧩 Librería de UI Básica (`src/components/ui/`)

*   [Button.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Button.tsx): Botones estilizados (primary burdeos, secondary marfil, accent dorado).
*   [Input.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Input.tsx): Campos de entrada adaptados.
*   [Select.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Select.tsx): Desplegables de selección.
*   [Dialog.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Dialog.tsx): Ventanas modales emergentes.
*   [Tabs.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Tabs.tsx): Pestañas de navegación de datos.
*   [Table.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Table.tsx): Tablas de datos reutilizables.
*   [Badge.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/Badge.tsx): Insignias de estado (General, Stellar, Wallet).
*   [QRCodeBlock.tsx](file:///c:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/components/ui/QRCodeBlock.tsx): Renderizador de código QR dinámico.

---

## ⚙️ Núcleo de Lógica y Datos (`src/lib/`)

*   `src/lib/credentialMetadata.ts`: metadatos canónicos de credenciales.
*   `src/lib/hooks/useOperationPoller.ts`: polling de operaciones Stellar con backoff exponencial acotado.

---

## 🚀 Infraestructura de Despliegue (`deploy/`)

*   `deploy/Dockerfile`: Imagen Docker basada en Node 22 + `pnpm@10`.
*   `deploy/docker-compose.app.yml`: Servicio de producción con app, Caddy y PostgreSQL privada.
*   `deploy/Caddyfile`: HTTPS con `tls internal` (Testnet) — requiere reemplazo por certificado público en producción.
