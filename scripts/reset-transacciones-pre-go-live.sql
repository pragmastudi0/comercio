-- =============================================================
-- RESET TRANSACCIONAL — pre go-live (24/06/2026)
-- =============================================================
-- Borra TODAS las ventas, notas de crédito, sesiones de caja,
-- movimientos y stock del C11, dejando intacto:
--   - Catálogo (productos, categorías, proveedores, listas, precios)
--   - Stock del B12 (recién importado)
--   - Empleados, roles, cajas, locales, depósitos
--   - Configuración del comercio
--   - Logs de auditoría de creación de empleados (los conservamos)
--
-- Resetea los contadores de venta/NC a 0 → la primera venta real
-- mañana queda numerada 0001-00000001.
--
-- ATENCIÓN: corre TODO en una sola transacción. Si algo falla,
-- revierte sin tocar nada. PERO conviene hacer backup antes
-- (admin/backup → ZIP).
--
-- Orden de borrado (respeta FKs):
--   1. movimientos_caja
--   2. movimientos_ctacte
--   3. notas_credito
--   4. movimientos_stock (TODOS — eran de las ventas y cargas de prueba)
--   5. ventas
--   6. sesiones_caja
--   7. transferencias
--   8. stock_items del C11 (B12 queda intacto, recién cargado)
--   9. logs_auditoria de prueba (ventas/cambios/anulaciones, NO altas de empleados)
--  10. Resetear contadores
-- =============================================================

begin;

-- ── Inspección previa (DEBUG, descomentar si querés ver cuánto borra) ──
-- select 'movimientos_caja' as tabla, count(*) as filas from movimientos_caja
-- union all select 'movimientos_ctacte', count(*) from movimientos_ctacte
-- union all select 'notas_credito', count(*) from notas_credito
-- union all select 'movimientos_stock', count(*) from movimientos_stock
-- union all select 'ventas', count(*) from ventas
-- union all select 'sesiones_caja', count(*) from sesiones_caja
-- union all select 'transferencias', count(*) from transferencias
-- union all select 'stock_items (C11)', count(*) from stock_items si
--   join depositos d on d.id = si.deposito_id where d.nombre ilike '%C11%';

-- ── 1. Movimientos de caja ──
delete from movimientos_caja;

-- ── 2. Movimientos de cta cte ──
delete from movimientos_ctacte;

-- ── 3. Notas de crédito ──
delete from notas_credito;

-- ── 4. Movimientos de stock ──
-- Borramos todo el historial porque la carga inicial nueva del B12 no
-- generó movs (fue UPSERT directo). El historial real arranca mañana.
delete from movimientos_stock;

-- ── 5. Ventas ──
delete from ventas;

-- ── 6. Sesiones de caja (abiertas y cerradas) ──
delete from sesiones_caja;

-- ── 7. Transferencias entre depósitos ──
delete from transferencias;

-- ── 8. Stock items del C11 ──
-- B12 queda intacto (recién cargado). Borramos solo los del C11 y los
-- del depósito Central (también de prueba) — mañana se cargan los reales.
do $$
declare
  dep_c11 uuid;
  dep_central uuid;
  borrados int;
begin
  select id into dep_c11 from depositos where nombre ilike '%C11%' limit 1;
  select id into dep_central from depositos where nombre ilike '%central%' limit 1;

  if dep_c11 is not null then
    delete from stock_items where deposito_id = dep_c11;
    get diagnostics borrados = row_count;
    raise notice 'Stock C11 borrado: % filas', borrados;
  end if;

  if dep_central is not null then
    delete from stock_items where deposito_id = dep_central;
    get diagnostics borrados = row_count;
    raise notice 'Stock Central borrado: % filas', borrados;
  end if;
end $$;

-- ── 9. Logs de auditoría de transacciones (preservar altas/cambios de empleados) ──
delete from logs_auditoria
 where accion in (
   'anulacion_venta',
   'cancelacion_venta',
   'descuento_manual',
   'cambio_venta',
   'cambio_password_ajeno'
 );

-- ── 10. Resetear contadores ──
update contadores set valor = 0 where clave in ('ventas', 'notas_credito');

commit;

-- ── Verificación post-reset ──
select 'movimientos_caja' as tabla, count(*) as filas from movimientos_caja
union all select 'movimientos_ctacte', count(*) from movimientos_ctacte
union all select 'notas_credito', count(*) from notas_credito
union all select 'movimientos_stock', count(*) from movimientos_stock
union all select 'ventas', count(*) from ventas
union all select 'sesiones_caja', count(*) from sesiones_caja
union all select 'transferencias', count(*) from transferencias
union all select 'stock_items total', count(*) from stock_items
union all select 'productos (no se tocan)', count(*) from productos;
