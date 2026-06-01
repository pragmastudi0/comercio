import type { SupabaseClient } from '@supabase/supabase-js';
import type { VentasRepo } from '../../repos/ventas.repo';
import type { Venta } from '../../types';
import { ok, okList, okMaybe } from '../helpers';

export function makeVentasRepo(sb: SupabaseClient): VentasRepo {
  return {
    async list(filtro = {}) {
      let q = sb.from('ventas').select('*').order('fecha', { ascending: false });
      if (filtro.local_id) q = q.eq('local_id', filtro.local_id);
      if (filtro.caja_id) q = q.eq('caja_id', filtro.caja_id);
      if (filtro.empleado_id) q = q.eq('empleado_id', filtro.empleado_id);
      if (filtro.cliente_id) q = q.eq('cliente_id', filtro.cliente_id);
      if (filtro.estado) q = q.eq('estado', filtro.estado);
      if (filtro.desde) q = q.gte('fecha', filtro.desde);
      if (filtro.hasta) q = q.lte('fecha', filtro.hasta);
      return okList<Venta>(await q, 'ventas.list');
    },
    async get(id) {
      return okMaybe<Venta>(
        await sb.from('ventas').select('*').eq('id', id).maybeSingle(),
        'ventas.get',
      );
    },
    async crear(input) {
      // Llama la RPC atómica que: numera, valida y descuenta stock, inserta
      // venta, registra movimientos de caja y carga cta cte si corresponde.
      const { data, error } = await sb.rpc('rpc_crear_venta', {
        p_caja_id: input.caja_id,
        p_sesion_caja_id: input.sesion_caja_id,
        p_local_id: input.local_id,
        p_deposito_id: input.deposito_id,
        p_empleado_id: input.empleado_id,
        p_cliente_id: input.cliente_id ?? null,
        p_items: input.items,
        p_pagos: input.pagos,
        p_subtotal: input.subtotal,
        p_descuento_total: input.descuento_total,
        p_recargo_total: input.recargo_total,
        p_total: input.total,
      });
      if (error) throw new Error(`ventas.crear: ${error.message}`);
      return data as Venta;
    },
    async anular(id, empleadoId, motivo) {
      // 1) Marcar la venta como anulada
      const venta = ok<Venta>(
        await sb
          .from('ventas')
          .update({
            estado: 'anulada',
            anulada_por: empleadoId,
            anulada_en: new Date().toISOString(),
            motivo_anulacion: motivo,
          })
          .eq('id', id)
          .eq('estado', 'completada')
          .select('*')
          .single(),
        'ventas.anular',
      );

      // 2) Devolver stock + registrar movimientos de stock + revertir movimientos de caja
      for (const it of venta.items) {
        const { data: existente } = await sb
          .from('stock_items')
          .select('cantidad')
          .eq('producto_id', it.producto_id)
          .eq('deposito_id', venta.deposito_id)
          .maybeSingle();
        const actual = Number(existente?.cantidad ?? 0);
        await sb.from('stock_items').upsert({
          producto_id: it.producto_id,
          deposito_id: venta.deposito_id,
          cantidad: actual + it.cantidad,
        });
        await sb.from('movimientos_stock').insert({
          producto_id: it.producto_id,
          deposito_id: venta.deposito_id,
          tipo: 'devolucion',
          cantidad: it.cantidad,
          referencia_id: venta.id,
          empleado_id: empleadoId,
          motivo,
        });
      }
      for (const pago of venta.pagos) {
        await sb.from('movimientos_caja').insert({
          sesion_caja_id: venta.sesion_caja_id,
          tipo: 'anulacion',
          metodo: pago.metodo,
          monto: pago.monto,
          venta_id: venta.id,
          empleado_id: empleadoId,
        });
      }

      return venta;
    },
    async presupuesto(input) {
      // Para presupuestos: insertar sin RPC (no descuenta stock).
      return ok<Venta>(
        await sb
          .from('ventas')
          .insert({
            ...input,
            numero: `PRES-${Date.now()}`,
            estado: 'presupuesto',
            cliente_id: input.cliente_id ?? null,
          })
          .select('*')
          .single(),
        'ventas.presupuesto',
      );
    },
  };
}
