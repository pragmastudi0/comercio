# Disaster Recovery — Turisteando

Runbook para reconstruir el sistema desde cero si Supabase o Vercel
dejan de funcionar. Los backups automatizados corren todas las noches y
se guardan en Google Drive (carpeta "Turisteando Backups").

Última revisión de este documento: 2026-08-03.

---

## Cuándo usar este runbook

- Un delete masivo mal hecho borró data crítica.
- Supabase suspendió el proyecto o la cuenta.
- Migración de BD rompió algo y el rollback no alcanza.
- Necesitás levantar un entorno de staging idéntico a producción.

## Antes de arrancar

Reunir credenciales / accesos:

- Cuenta de Google con acceso a la carpeta de Drive con los backups.
- Cuenta de GitHub con acceso al repo `pragmastudi0/comercio`.
- Cuenta de Vercel con acceso al proyecto (o crear uno nuevo).
- Cuenta de Supabase (nueva si el problema es a nivel proveedor).
- Variables de entorno del proyecto (guardadas en Vercel > Settings > Environment Variables).

---

## Escenario A: Restaurar la BD en la Supabase actual

Cuando la Supabase está OK pero la data está corrupta o falta.

### 1. Bajar el backup más reciente
- Abrir la carpeta de Drive de backups.
- Descargar el archivo más reciente: `turisteando_YYYY-MM-DD_HH-MM-SS.sql.gz`.
- Descomprimir: `gunzip turisteando_*.sql.gz` (deja `.sql`).

### 2. Restaurar

**IMPORTANTE**: esto **DROPEA** todas las tablas actuales y las recrea
desde el backup. Todo lo que no esté en el backup se pierde.

```bash
psql "$SUPABASE_DB_URL" < turisteando_YYYY-MM-DD_HH-MM-SS.sql
```

Donde `SUPABASE_DB_URL` la sacás de:
Supabase Dashboard → Settings → Database → Connection String → URI.

### 3. Verificar

- Entrar al admin y revisar que ventas, productos, empleados estén.
- Probar login desde el PoS.
- Chequear el dashboard con datos del último día backupeado.

---

## Escenario B: Recrear todo el proyecto en una Supabase nueva

Cuando Supabase te suspendió el proyecto, o querés migrar de cuenta.

### 1. Crear nuevo proyecto en Supabase
- supabase.com → New Project.
- Región: `sa-east-1` (São Paulo) — misma que la actual, para baja latencia desde Argentina.
- Plan: Pro (USD 25/mes). El Free tier no soporta el volumen.
- Anotar el password del postgres que te da al crear (aparece 1 sola vez).

### 2. Obtener la nueva Connection String
- Settings → Database → Connection String → URI.

### 3. Restaurar el backup
Mismo comando que Escenario A, apuntando a la BD nueva.

```bash
gunzip turisteando_YYYY-MM-DD_HH-MM-SS.sql.gz
psql "$NUEVA_SUPABASE_DB_URL" < turisteando_YYYY-MM-DD_HH-MM-SS.sql
```

### 4. Actualizar Vercel

En Vercel → tu proyecto → Settings → Environment Variables, actualizar:

- `NEXT_PUBLIC_SUPABASE_URL` → URL del proyecto nuevo (`https://xxx.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Anon key del proyecto nuevo (Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` → Service role key del proyecto nuevo (misma pantalla)

Cambiar en **todos** los proyectos: admin, pos, web.

### 5. Redeployar

En cada proyecto de Vercel → Deployments → último deploy → **Redeploy**.

### 6. Actualizar el workflow de backup

En GitHub → Settings → Secrets and variables → Actions, actualizar
`SUPABASE_DB_URL` con la nueva connection string. Sino los próximos
backups van a la Supabase vieja (que ya no existe).

### 7. Verificar RLS policies

Es posible que algunas policies de RLS no vengan bien en el dump.
Contra-check: entrar como cajero y confirmar que:

- Puede abrir caja.
- Puede vender.
- Puede cerrar caja.

Si algo falla con permisos, revisar las policies en Supabase → Auth → Policies.

---

## Escenario C: Recrear todo en un nuevo proveedor

Solo si tanto Vercel como Supabase están fuera de juego. Reemplazos
compatibles:

- **Base de datos**: cualquier Postgres 15+ (Neon, Railway, self-hosted).
  Al restaurar cambiar en el runbook las URLs específicas de Supabase.
- **Hosting**: cualquier plataforma Node (Netlify, Cloudflare Pages,
  Railway, VPS con PM2). El monorepo Next.js + Vite corre en cualquier
  lado.
- **Auth**: si migrás fuera de Supabase, la auth actual (Supabase Auth)
  no se traduce automáticamente. Habría que migrar a otro provider
  (Clerk, Auth.js, custom) — proyecto aparte.

Este escenario es el más complejo y probablemente requiere 1-2 días de
trabajo. No documentado en detalle acá por baja probabilidad.

---

## Test de recovery (hacer cada 6 meses)

Para asegurarnos que los backups funcionan de verdad:

1. Crear un proyecto Supabase de test (gratis, del plan Free alcanza).
2. Descargar el backup más reciente del Drive.
3. Restaurar con el comando del Escenario A.
4. Ejecutar algunas queries de sanity check:
   ```sql
   SELECT count(*) FROM ventas;
   SELECT count(*) FROM productos;
   SELECT count(*) FROM movimientos_stock;
   SELECT max(fecha) FROM ventas;
   ```
5. Los números tienen que dar consistentes con producción.
6. Borrar el proyecto de test cuando termines.

Si algún paso falla, arreglar antes de que sea urgente.

---

## Contacto

Si algo de este runbook está desactualizado, avisar a
pragmasolucionesdigitales@gmail.com para corregirlo.
