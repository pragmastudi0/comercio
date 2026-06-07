# CLAUDE.md

> Resumen de decisiones, convenciones y estado del proyecto. **Leer antes de cada sesión.**
> Mantener actualizado en el cierre de cada sesión con un changelog conciso.

---

## 1. Qué es esto

Sistema de gestión comercial (PoS + Admin web) para un cliente con locales de venta minorista en la Estación Terminal de Ómnibus de Córdoba.

- **2 locales** con caja activa, **2 depósitos físicos** + **1 depósito virtual "Web"** (preparado para e-commerce futuro).
- **6–12 cajeros** según temporada.
- **+1000 productos** con categorías organizadas.
- **Sin código de barras**: códigos internos numéricos de 4–5 dígitos.
- **Sin marca como campo separado**.
- Velocidad de caja es prioridad #1 (retail de terminal — tickets cortos, alta rotación).

El e-commerce **NO** se implementa en MVP, pero el modelo de datos ya lo contempla (`publicado_web`, `descripcion_larga`, depósito `Web`, permiso `productos.publicar_ecommerce`).

Plazo objetivo: **4 semanas** con 2 devs (Gonzalo + 1).

---

## 2. Approach: MVP local primero, Supabase después

- **Día 1–3**: MVP con datos in-memory en `packages/db/src/mock/`. Toda la app corre contra mocks. Se itera UI rápido.
- **Día 4–5**: Aplicar `Supabase_Migrations.sql` (archivo aparte, **NO** aplicar antes del día 4), generar tipos, reemplazar mocks por implementación real en `packages/db/src/supabase/`. La UI no cambia.
- **Día 6+**: Trabajo normal contra Supabase.

La capa de datos vive detrás de **interfaces de repo** (`packages/db/src/repos/`). El consumidor obtiene un `DbClient` y no sabe si está hablando con mocks o con Supabase.

---

## 3. Stack (cerrado, no negociable sin discusión)

- Monorepo: pnpm workspaces + Turborepo
- TypeScript 5.6+ estricto
- Frontend PoS: React 18 + Vite + PWA (`vite-plugin-pwa`)
- Frontend Admin: Next.js 14 (app router)
- UI: Tailwind + componentes propios en `packages/ui` (estilo shadcn). Pendiente: reemplazar primitivas básicas (Sheet, Dialog, Tabs) por Radix cuando se integren.
- Estado servidor: TanStack Query v5
- Estado UI: Zustand
- Forms: React Hook Form + Zod
- DB: Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)
- Hosting: Vercel
- Email: Resend
- Tests: Vitest + Playwright (E2E críticos)
- Linting: ESLint + Prettier
- Keyboard: react-hotkeys-hook
- Toasts: sonner
- Tablas: TanStack Table v8
- Fechas: date-fns

---

## 4. Estructura del monorepo

```
comercio/
├── apps/
│   ├── pos/                 # Vite + React + PWA (caja)
│   └── admin/               # Next.js 14 app router (gestión)
├── packages/
│   ├── db/                  # Tipos + interfaces de repos + implementaciones (mock / supabase)
│   ├── ui/                  # Primitives propios (Button, Card, Table, Input, …)
│   ├── business/            # Lógica de negocio pura (permisos, pricing, stock, caja, validators)
│   └── config/              # ESLint, Tailwind, TS configs compartidos
├── supabase/                # Migrations + functions + seed (día 4+)
├── CLAUDE.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 5. Capa de datos (packages/db)

`DbClient` agrupa 17 repos:

`productos`, `categorias`, `proveedores`, `clientes`, `ctaCte`, `empleados`, `roles`, `locales`, `depositos`, `cajas`, `sesionesCaja`, `stock`, `transferencias`, `listasPrecio`, `ventas`, `configuracion`, `auditoria`.

- Cada interfaz vive en `packages/db/src/repos/`.
- El mock vive en `packages/db/src/mock/` con seed en `seed.ts`.
- Para usarlo: `import { createMockClient } from '@comercio/db'`.
- Las apps obtienen el singleton vía `src/lib/db.ts` (un único `getDb()` por app).

**Reglas importantes** (alineadas con el schema Supabase que viene):
- Los tipos en `packages/db/src/types.ts` son la **fuente de verdad** para el día 4. Si modelamos algo distinto en mocks, ajustar el SQL antes de aplicar migrations.
- El stock vive **por depósito** (`StockItem`). Las ventas descuentan del depósito del cajero. Las transferencias generan movimientos `transferencia_salida` y `transferencia_entrada`.
- La venta es atómica conceptualmente: descontar stock + registrar movimiento de caja + cargar cta cte si corresponde. El mock lo hace en `ventas.repo.crear()`. En Supabase irá en una RPC.
- Las anulaciones devuelven stock y registran movimiento de caja tipo `anulacion`.

---

## 6. Permisos granulares (packages/business/src/permisos.ts)

- Tipo `PermisosConfig` con módulos: `ventas`, `caja`, `productos`, `categorias`, `clientes`, `cuenta_corriente`, `stock`, `proveedores`, `listas_precio`, `reportes`, `empleados`, `roles`, `configuracion`, `auditoria`.
- Roles preset: `admin`, `encargado`, `cajero`, `catalogo`. Editables, pero los nuevos roles custom son los preferidos para overrides.
- Cada empleado tiene `rol_id` + opcional `permisos_override`. El permiso efectivo se calcula con `evaluarPermisos(rol.permisos, empleado.permisos_override)`.
- En UI usar `tienePermiso(permisos, modulo, accion)` o el helper `makePuede(permisos)`.
- **Acciones críticas (cambio de permisos, asignación de rol, creación/eliminación de empleado, eliminación de roles) deben loguearse en `auditoria`.**

---

## 7. Datos confirmados por el cliente

- Códigos internos 4–5 dígitos (NO barras).
- Marca incluida en el nombre del producto si aplica (no es campo separado).
- Atributos dinámicos por categoría (configurables desde admin).
- Precios por cantidad (escalas: ej. 1–11 a $X, 12+ a $Y).
- Descuento por efectivo + recargos por cuotas (ambos editables desde config).
- Mayormente consumidor final sin identificar; clientes con ficha solo cuando piden o entran en cta cte.
- Stock entre depósitos: en MVP solo admin mueve stock; permiso granular ya soporta delegar.
- Migración inicial: pasa al importador (día 5). Default: stock a "Central" si no especifican.
- Sin export a Excel.

## 8. Defaults asumidos (preguntas no respondidas)

| Tema | Default |
| --- | --- |
| Formato export del cliente | Excel/CSV tolerante (a definir en importador) |
| Migración históricos | Solo catálogo, clientes, proveedores, stock al día |
| Nombres depósitos | `Central`, `Local Terminal 1`, `Local Terminal 2`, `Web` (cliente renombra) |
| Política "vender sin stock" | Permiso individual, default bloqueado |
| Mermas y ajustes | Funcionalidad básica con motivo registrado |
| CUIT obligatorio | Opcional en MVP |
| Listas iniciales | `Consumidor Final` (default) + `Mayorista` |
| Asignación lista al cliente | Default `Consumidor Final` |
| Impresora | Ticket HTML/PDF imprimible 80mm en MVP (no driver ESC/POS) |
| Presupuestos | Mismo template que ticket con leyenda diferente |
| Devoluciones | Anulación + nota interna en MVP |
| Anulación venta del día | Permiso individual, default ON para cajero |
| Anulación días anteriores | Permiso individual, default OFF |
| Roles iniciales | Los 4 preset; admin puede crear más |

---

## 9. Convenciones de código

- TypeScript estricto. Sin `any`, sin `@ts-ignore`.
- Componentes presentacionales en `components/`, hooks con datos en `hooks/use*.ts`.
- Estilos: Tailwind. Variantes con `cva`.
- Forms: React Hook Form + Zod (validators en `packages/business/src/validators.ts`).
- Queries: TanStack Query con keys consistentes.
- Estado UI cruzado: Zustand (carrito, sesión activa, etc.).
- Errores: toast con sonner, mensajes en español accionables.
- Loading: Skeleton para listados, spinner para acciones.
- Optimistic updates en operaciones frecuentes; confirmación servidor para críticas (cobrar, cerrar caja).
- Atajos: react-hotkeys-hook, documentar en `apps/pos/src/lib/shortcuts.ts`.
- Naming: archivos `kebab-case.tsx`, componentes `PascalCase`, hooks `useCamelCase`.
- Imports: alias absolutos (`@/`, `@comercio/db`, `@comercio/business`, `@comercio/ui`).
- Idioma: UI, mensajes y código en español. Comentarios solo cuando el "por qué" no es obvio.
- Commits: convencionales en español. Chicos y frecuentes.
- Branches: `main` directo durante el sprint; branches solo para features riesgosas.

---

## 10. Cómo trabajar (notas para Claude Code)

- Pausá ante decisiones con trade-offs no triviales.
- No agregues dependencias sin confirmar.
- Trabajo incremental: esqueleto que compila → datos → estilos. Commits chicos.
- Tests donde importan: lógica pura de `@comercio/business`, edge cases del PoS con Playwright.
- ABMs: hacer **productos** primero, extraer patrón a `<DataTable>`, `<EntityFormSheet>`, `<DeleteConfirmDialog>`, `useCrud<T>()`. Los siguientes 10 ABMs serán triviales.
- Si algo no encaja con el schema o los defaults, parar y discutir.
- Al cierre de cada sesión, actualizar el changelog acá abajo.

---

## 11. Roadmap

| Semana | Foco | Hito |
| --- | --- | --- |
| 1 | Fundación + MVP local + integración Supabase | Sistema corre contra Supabase con datos reales del cliente |
| 2 | ABMs completos | Admin permite operar toda la gestión |
| 3 | PoS pulido + caja + cta cte | Venta end-to-end con stock actualizado en tiempo real |
| 4 | Reportes, dashboard, UAT, producción | Cliente operando en prod |

---

## 12. Changelog

### 2026-05-13 — Sesión 1 (setup inicial)
- Inicializado monorepo: pnpm workspaces + Turborepo + TS estricto.
- `packages/config`: ESLint, Tailwind, TS configs compartidos.
- `packages/business`: `permisos.ts` completo (tipos, presets, evaluación, helpers), `pricing.ts` (escalas, descuentos efectivo, recargos cuotas), `stock.ts`, `caja.ts`, `validators.ts` (Zod).
- `packages/db`: tipos de dominio completos, 17 interfaces de repos, 17 mocks in-memory funcionales, seed con datos realistas (50 productos, 4 depósitos, 2 locales, 3 cajas, 4 roles preset, 4 empleados, 5 clientes, 2 listas, configuración con descuentos/cuotas).
- `packages/ui`: primitives base (Button, Input, Card, Table, Badge, Tabs, Sheet, Dialog, Skeleton, Toast vía sonner) + tokens CSS con tema claro/oscuro.
- `apps/admin` (Next.js 14): landing con grid de secciones, listado de productos con TanStack Query, listado de empleados.
- `apps/pos` (Vite + React + PWA): landing, pantalla de caja con búsqueda rápida por código/nombre, F2 hotkey stub.

### 2026-05-13 — Sesión 2 (PoS funcional + branding + admin core)
- **PoS end-to-end**: Login (email+password con mocks), apertura de caja, pantalla de venta con buscador autofocus, carrito con cantidad/precio/descuento por línea, descuento global a la venta (con motivo, queda en auditoría), modal de cobro multi-método con cuotas + recargo + descuento efectivo + pago mixto con barra de progreso + cálculo de vuelto, ticket imprimible 80mm con auto-print, cierre de caja con totales por método y arqueo.
- **Branding "#turisteando"** en todas las pantallas visibles. Carpetas/DB siguen como `comercio`.
- **Persistencia de sesión** en localStorage (zustand persist).
- **Atajos completos**: F2 nueva venta, F3 cliente, F5 efectivo, F6 tarjeta, F7 QR, F8 cta cte, Esc cancelar.
- **Stock visible** en cada línea del carrito con alerta cuando va a quedar negativo.
- **Sidebar de ventas del turno** en el PoS, refresh cada 5s.
- **Admin con shell de sidebar** (General, Catálogo, Stock, Personas, Sistema).
- **Dashboard** con KPIs (ventas hoy, cajas abiertas, sin stock, deudores), top productos del día, últimas ventas.
- **/configuracion**: editar descuento efectivo, validez presupuesto, permitir-sin-stock default, cuotas + recargos.
- **/empleados**: ABM completo con creación (email+password+rol+local+depósito) y edición con tabs Datos / Permisos.
- **/roles**: ABM con dialog de creación copiando preset + matriz de permisos editable. Validación de no eliminar roles asignados a empleados.
- **/ventas**: historial con filtros (fecha desde/hasta, cajero, local, método).
- **/caja**: sesiones abiertas con totales por método en tiempo real + 10 últimas cerradas con diferencia de arqueo.
- **/reportes**: KPIs de período (total, tickets, ticket promedio), ventas por día (barras), métodos, ranking de cajeros, ranking de locales.
- **packages/business**: nuevo `brand.ts` (BRAND.nombreCorto). Exportado en el barrel.
- **packages/db**: nuevo `empleados.autenticar(email, password)` + `empleados.setPassword(id, password)`. Mock guarda passwords en `store.passwords`. Día 4 se reemplaza por Supabase Auth.
- **packages/ui**: `Button` ahora soporta `asChild` (clona el child y aplica las clases) para wrappear `<Link>` de Next.

**Pendiente próxima sesión**:
- Conectar Supabase: aplicar `Supabase_Migrations.sql`, generar tipos, reemplazar mocks por implementación real. Cuando Gonzalo me avise.
- ABM productos completo (sheet de edición, ABM categorías/proveedores/clientes/depósitos/listas con el mismo patrón).
- Promociones programables por categoría/producto/fecha.
- Devoluciones parciales (no anulación total).
- Limpieza: quitar el panel "Usuarios demo" del login del PoS antes de pasar a producción.

### 2026-06-02 — Sesión: datos reales + backup + responsive admin
- Datos reales del cliente cargados en Supabase: empresa (CUIT 30-71523852-3, dirección, WhatsApp 3512299959, horario), 2 locales reales (#Turisteando B12 y C11), 3 depósitos (uno por local + Central Terminal Nueva), 1 caja por local, cuotas y recargos confirmados (1c 10%, 3c/6c/12c 20%).
- Usuarios admin creados en Supabase Auth + tabla empleados: Agus dueño (`agustinicikson@hotmail.com`, rol Admin), Diego Rodriguez y Gregorio Icikson (rol Encargado, emails placeholder hasta que los confirmen). Password temporal `Turisteando2026`. Admin demo (`admin@turisteando.local`) sigue activo como backup.
- **Formulario público de datos** publicado en `apps/web/public/datos.html` y servido en `https://turisteando-web.vercel.app/datos.html`. Form con autoguardado en localStorage + modal de envío con Copiar/Compartir/Descargar. Diseñado para abrir desde link de WhatsApp (no como archivo adjunto).
- **Backup descargable** en `/admin/backup` (solo rol Admin): genera ZIP con CSVs de ventas, items, pagos, sesiones y movimientos de caja, movimientos de stock, notas de crédito y snapshot de clientes. Selector de rango con presets. Usa `jszip` en cliente.
- **Responsive del admin**: `@comercio/ui` Table con padding denso en mobile y `whitespace-nowrap` para garantizar scroll horizontal; Dialog/Sheet con padding adaptativo y `max-h-[90vh] overflow-y-auto`. Replace masivo en todas las pages: `container mx-auto py-8` → `container mx-auto px-4 py-6 sm:px-6 sm:py-8`, headers `flex items-center justify-between` → `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`, títulos `text-2xl` → `text-xl sm:text-2xl`. E-commerce ya estaba responsive desde antes.
- Item "Backup" agregado al menú lateral del admin (grupo Sistema, ícono Database).

**Pendiente próxima sesión** (cliente):
- Email comercial real, descuento por efectivo, cajeros fijos con nombres/emails, emails reales de Diego y Gregorio.
- Nombre real del dominio (`#turisteando` no sirve como dominio).
- Confirmar Plan Z = 12 cuotas o cuál.
- Export de catálogo + stock en Excel/CSV.
- Logo (tienen? si no, especificaciones).

**Pendiente próxima sesión** (técnico):
- Importador de catálogo + stock desde Excel/CSV (cuando lleguen los datos).
- Edge Function para que el admin pueda resetear password de otro empleado vía service_role.
- Migración AFIP cuando corresponda: agregar `tipo_comprobante`, `pto_vta`, `cae`, `cae_vto` en ventas, `condicion_iva` en clientes, refactorizar numeración + Edge Function WSAA/WSFEv1.
