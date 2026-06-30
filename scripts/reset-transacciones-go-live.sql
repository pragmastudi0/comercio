-- =============================================================
-- RESET TRANSACCIONAL — pre go-live (martes 2026-07-01)
-- =============================================================
-- Corré esto en Supabase → SQL Editor DESPUÉS de haber importado
-- el stock real de C11 y B12 (scripts/importar-stock.mjs).
--
-- Borra TODAS las transacciones que hicimos durante las pruebas:
--   - Ventas + items + pagos (vía cascade)
--   - Notas de crédito
--   - Movimientos de caja
--   - Movimientos de cta cte
--   - Movimientos de stock (historial)
--   - Sesiones de caja (abiertas y cerradas)
--   - Transferencias entre depósitos
--   - Logs de auditoría de transacciones (anulaciones, descuentos, cambios)
--
-- NO TOCA:
--   - Catálogo (productos, categorías, proveedores, listas, precios)
--   - Stock real por depósito (recién cargado con los Excels)
--   - Empleados, roles, cajas, locales, depósitos
--   - Configuración del comercio
--   - Logs de auditoría de altas/cambios de empleados (los conservamos)
--
-- Resetea los contadores de venta/NC a 0 → la primera venta real
-- queda numerada 0001-00000001.
--
-- ATENCIÓN: todo en una sola transacción. Si algo falla, revierte
-- sin tocar nada. Igual conviene hacer backup antes desde el admin
-- (/backup → ZIP).
-- =============================================================

begin;

-- ── Inspección previa (DEBUG, descomentar para ver cuánto va a borrar) ──
-- select 'movimientos_caja' as tabla, count(*) as filas from movimientos_caja
-- union all select 'movimientos_ctacte', count(*) from movimientos_ctacte
-- union all select 'notas_credito', count(*) from notas_credito
-- union all select 'movimientos_stock', count(*) from movimientos_stock
-- union all select 'ventas', count(*) from ventas
-- union all select 'sesiones_caja', count(*) from sesiones_caja
-- union all select 'transferencias', count(*) from transferencias;

-- ── 1. Movimientos de caja ──
delete from movimientos_caja;

-- ── 2. Movimientos de cta cte ──
delete from movimientos_ctacte;

-- ── 3. Notas de crédito ──
delete from notas_credito;

-- ── 4. Movimientos de stock (historial) ──
-- El stock REAL vive en stock_items.cantidad, no acá. Esta tabla es
-- solo el historial de movimientos. Borrar acá NO toca el stock actual.
delete from movimientos_stock;

-- ── 5. Ventas ──
-- Cascade borra venta_items y venta_pagos.
delete from ventas;

-- ── 6. Sesiones de caja (abiertas y cerradas) ──
delete from sesiones_caja;

-- ── 7. Transferencias entre depósitos ──
delete from transferencias;

-- ── 8. Logs de auditoría de transacciones ──
-- Preservamos las altas/cambios de empleados y permisos (historial real).
delete from logs_auditoria
 where accion in (
   'anulacion_venta',
   'cancelacion_venta',
   'descuento_manual',
   'cambio_venta',
   'cambio_password_ajeno',
   'precio_editado',
   'descuento_linea',
   'ajuste_caja'
 );

-- ── 9. Resetear contadores de numeración ──
update contadores set valor = 0 where clave in ('ventas', 'notas_credito');

commit;

-- ── Verificación post-reset (debería dar 0 en todas las primeras 7) ──
select 'movimientos_caja' as tabla, count(*) as filas from movimientos_caja
union all select 'movimientos_ctacte', count(*) from movimientos_ctacte
union all select 'notas_credito', count(*) from notas_credito
union all select 'movimientos_stock', count(*) from movimientos_stock
union all select 'ventas', count(*) from ventas
union all select 'sesiones_caja', count(*) from sesiones_caja
union all select 'transferencias', count(*) from transferencias
union all select '--- (a partir de acá deben quedar valores) ---', 0
union all select 'productos (no se tocan)', count(*) from productos
union all select 'stock_items (no se tocan)', count(*) from stock_items
union all select 'empleados (no se tocan)', count(*) from empleados;
