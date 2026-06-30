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

### 2026-06-30 — Sesión pre go-live (martes 1/7)
- **Motivo + auditoría en ventas**: cuando el cajero edita precio o aplica descuento por línea en el PoS, la fila pide motivo obligatorio. Se valida en `ModalCobro.cobrarMut` antes de procesar y se persiste a `auditoria` con `accion='precio_editado'` / `'descuento_linea'`. En admin /ventas: celda de precio se pinta naranja + bullet ● cuando hubo edición, y el detalle de venta muestra sección "Cambios manuales" con motivo + diferencia.
- **Notas de crédito ocultas del PoS** (botón del header sacado — Agus no las usa). El flujo Cambio sigue como mecanismo interno.
- **Botón "Cobrar" en toolbar del admin**: abre PoS en pestaña nueva con SSO. Admin pasa access/refresh token Supabase en URL hash (`#sso=AT|RT`); PoS detecta en `<SSOGate>` al boot, hidrata sesión con `empleados.hidratarSesion`, borra el hash, hace `useSesion.setState` atómico y `window.location.replace('/abrir-caja')`. Fallback amigable: si SSO falla, admin pasa también `?email=<adminEmail>` y el login del PoS viene pre-llenado.
- **Permisos por rol aplicados de punta a punta**: 12 pages admin envueltas en `<PaginaProtegida>`. Toolbar y menubar filtrados por permiso. `usePermisos` AHORA usa el preset hardcoded de `@comercio/business` como fuente de verdad para los 4 presets (admin/encargado/cajero/catalogo) ignorando la BD — cualquier cambio al código se aplica al instante. Roles custom siguen leyendo de BD.
- **Encargado sin números**: preset modificado para sacar `caja.ver_propia`, `caja.ver_otras_del_local`, `reportes.*`. Mantiene `caja.abrir/cerrar/ingreso/egreso` para poder cobrar. Dashboard `/` con `PaginaProtegida + redirectTo='/productos'`.
- **Cobrar visible para todos los del admin**: catálogo tiene `caja.abrir + ventas.crear + clientes.ver/crear` para usar el PoS. Cajeros siguen bloqueados del admin entero.
- **PoS teclado total**: hotkey global `enter` abre Cobrar efectivo si hay items y foco no está en input. Buscador con foco persistente: listener `keydown` global redirige cualquier tecla printable al input + `onBlur` re-enfoca si el foco va a body (no roba si va a otro input o dialog).
- **PoS warning de caja ocupada**: AbrirCaja muestra banner amarillo si hay sesión abierta por OTRO empleado en la caja elegida ("coordiná el arqueo al cerrar"). No bloquea.
- **Importación final de inventario para go-live**: 1907 productos únicos (1903 B12 + 1903 C11 con 1899 compartidos + 4 exclusivos de cada uno). Costo/precio/nombre tomaron valores de B12 (último import gana). Scripts: `scripts/excel-a-json.py` (Excel → JSON) y `scripts/importar-stock.mjs <local>` (UPSERT productos/categorías/proveedores + SET stock por depósito + precio CF). Las credenciales se pasan al script vía `apps/admin/.env.local` (NO vía export en shell — zsh con clipboard sucio rompió múltiples intentos: em-dash, key tronca, copy con basura HTML).
- **Reset transaccional ejecutado** (`scripts/reset-transacciones-go-live.sql`): borrados todos los movimientos/ventas/sesiones de caja/NC/transferencias/logs de transacciones de prueba. Contadores ventas y NC reseteados a 0 → primera venta del martes va a ser 0001-00000001. Catálogo, stock real, empleados, roles, cajas, locales y configuración intactos.

**Estado al cierre**: producción lista para go-live mañana martes 2026-07-01. Cliente entra con catálogo + stock real + sistema limpio.

### 2026-06-30 — Iteración 1 post go-live (rama `feat/post-go-live-iteracion-1`, mergeada a main)

**PoS:**
- **Enter en buscador suma cantidad** sin borrar (texto queda seleccionado para reemplazar al tipear). El segundo Enter sigue agregando porque el store hace upsert.
- **Tecla `+` (y numpad +) global = Cobrar efectivo** (antes era Enter). Enter pasa a ser exclusivo de "sumar producto" en el buscador.
- **Historial agrupado por turno** mañana (7-15) / tarde (15-23). Separador visual con fecha. Madrugada cae en "tarde" del día anterior.
- **Botón Cambiar usuario** en header de Caja: hace `setEmpleado(null)` pero MANTIENE caja+sesionCaja vivas. Login redirige a `/caja` si hay sesionCaja activa (no solo si es el mismo empleado).
- **Botón Anular** al lado de Historial (ícono Ban). Mismo destino — réplica visual del sistema anterior del cliente.
- **Fix saldo inicial**: si el cajero entra a `/abrir-caja` con sesión activa y edita el monto, se persiste. Nuevo método `sesionesCaja.actualizarSaldoInicial(id, monto)` (mock + supabase).

**Admin:**
- **Permisos ocultables costo/margen/precio**: `productos.ver_costo / ver_margen / ver_precio_venta`. Default true en todos los presets (sin romper). Excepción puntual en `usePermisos`: para esos 3 permisos, la BD pisa al preset (los demás siguen hardcoded). Editables desde `/admin/roles`. Aplica en `/admin/productos` (panel + form crear) y modal cargar-stock.
- **Código read-only al editar**: input Código del panel detalle queda `readOnly + disabled`.
- **Default abre primer producto** en `/productos`: botón "Productos" del toolbar admin ahora linkea a `/productos` (sin `?nuevo=1`). El useEffect existente auto-selecciona el primer producto.
- **Dashboard reagrupado**: cobros divididos en `efectivo+transferencia` vs `tarjeta+QR`. Cta cte excluida de la división. KPIs y donut renombrados.
- **Ganancias por local separado + total**: modal Ganancias suma selector Todos/B12/C11. Cuando "Todos", debajo del KPI principal aparecen 2 cajas (ganancia/tickets/bruto por local).
- **Filtro por turno** en `/admin/ventas` y `/admin/caja`: select Todos/Mañana/Tarde. Filtra client-side por hora del campo fecha (ventas) o `abierta_en` (cajas).
- **Promo/descuento por producto**: nuevas columnas `productos.promo_texto + promo_pct` (SQL en `scripts/migrations-iteracion-1.sql`). En PoS ItemCarritoRow aparece la pill morada con el texto y, si hay `promo_pct > 0`, un botón "Aplicar X%" que setea `descuento_pct` de la línea de un click.
- **Sección colapsable e-commerce** en panel detalle de producto: checkbox publicado_web + textarea descripción larga. Fotos/escalas siguen en `/web`.
- **Backup incluye snapshot de stock**: nueva hoja "Stock al momento" en el XLSX, una fila por (producto × local) con Cantidad + Mínimo + flags Bajo mínimo / Sin stock. Resumen suma 3 contadores.

**Lecciones de la sesión**:
- "preset hardcoded gana" tiene excepciones puntuales editables — implementado vía merge selectivo en `usePermisos`. Mantener cualquier nueva excepción explícita y minimal para no perder predictibilidad.
- Vercel preview branch deploys son el camino correcto cuando producción ya está viva: rama nueva → preview → testeo del cliente → merge a main. La rama `feat/post-go-live-iteracion-1` cubrió 14 features en un solo ciclo sin tocar producción.

**Migración SQL aplicada**: `scripts/migrations-iteracion-1.sql` (columnas promo_texto + promo_pct + check constraint 0-100).
