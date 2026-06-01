import type { SupabaseClient } from '@supabase/supabase-js';
import type { StockRepo } from '../../repos/stock.repo';
import type { MovimientoStock, StockItem } from '../../types';
import { ok, okList } from '../helpers';

export function makeStockRepo(sb: SupabaseClient): StockRepo {
  return {
    async porProducto(productoId) {
      return okList<StockItem>(
        await sb.from('stock_items').select('*').eq('producto_id', productoId),
        'stock.porProducto',
      );
    },
    async porDeposito(depositoId) {
      return okList<StockItem>(
        await sb.from('stock_items').select('*').eq('deposito_id', depositoId),
        'stock.porDeposito',
      );
    },
    async cantidad(productoId, depositoId, varianteId) {
      let q = sb
        .from('stock_items')
        .select('cantidad')
        .eq('producto_id', productoId)
        .eq('deposito_id', depositoId);
      if (varianteId) q = q.eq('variante_id', varianteId);
      else q = q.is('variante_id', null);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`stock.cantidad: ${error.message}`);
      return Number(data?.cantidad ?? 0);
    },
    async consolidado(filtro = {}) {
      let q = sb.from('stock_items').select('*');
      if (filtro.producto_id) q = q.eq('producto_id', filtro.producto_id);
      if (filtro.deposito_id) q = q.eq('deposito_id', filtro.deposito_id);
      const rows = okList<StockItem>(await q, 'stock.consolidado');
      return filtro.sin_stock ? rows.filter((r) => r.cantidad <= 0) : rows;
    },
    async ajustar(input) {
      const { producto_id, variante_id, deposito_id, cantidad, motivo, empleado_id } = input;
      // Upsert + update con delta. Mejor: leer, sumar, escribir (no atómico pero
      // ajuste es manual).
      const { data: existente } = await sb
        .from('stock_items')
        .select('cantidad')
        .eq('producto_id', producto_id)
        .eq('deposito_id', deposito_id)
        .maybeSingle();
      const nuevo = (existente?.cantidad ?? 0) + cantidad;
      const { error } = await sb.from('stock_items').upsert({
        producto_id,
        variante_id: variante_id ?? null,
        deposito_id,
        cantidad: nuevo,
      });
      if (error) throw new Error(`stock.ajustar: ${error.message}`);
      return ok<MovimientoStock>(
        await sb
          .from('movimientos_stock')
          .insert({
            producto_id, variante_id, deposito_id,
            tipo: 'ajuste',
            cantidad: Math.abs(cantidad),
            motivo, empleado_id,
          })
          .select('*')
          .single(),
        'stock.ajustar (mov)',
      );
    },
    async registrarMerma(input) {
      const { producto_id, variante_id, deposito_id, cantidad, motivo, empleado_id } = input;
      const { data: existente } = await sb
        .from('stock_items')
        .select('cantidad')
        .eq('producto_id', producto_id)
        .eq('deposito_id', deposito_id)
        .maybeSingle();
      const nuevo = (existente?.cantidad ?? 0) - cantidad;
      const { error } = await sb.from('stock_items').upsert({
        producto_id,
        variante_id: variante_id ?? null,
        deposito_id,
        cantidad: nuevo,
      });
      if (error) throw new Error(`stock.registrarMerma: ${error.message}`);
      return ok<MovimientoStock>(
        await sb
          .from('movimientos_stock')
          .insert({
            producto_id, variante_id, deposito_id,
            tipo: 'merma', cantidad, motivo, empleado_id,
          })
          .select('*')
          .single(),
        'stock.registrarMerma (mov)',
      );
    },
    async descontarPorVenta(input) {
      // Esta operación se hace dentro de rpc_crear_venta. Si alguien la llama
      // directo (no debería), hacemos el descuento manual no atómico.
      const { producto_id, variante_id, deposito_id, cantidad, venta_id, empleado_id, permitirSinStock } = input;
      const { data: existente } = await sb
        .from('stock_items')
        .select('cantidad')
        .eq('producto_id', producto_id)
        .eq('deposito_id', deposito_id)
        .maybeSingle();
      const actual = existente?.cantidad ?? 0;
      if (!permitirSinStock && actual < cantidad) {
        throw new Error(`Stock insuficiente para producto ${producto_id} en depósito ${deposito_id}`);
      }
      const { error } = await sb.from('stock_items').upsert({
        producto_id,
        variante_id: variante_id ?? null,
        deposito_id,
        cantidad: actual - cantidad,
      });
      if (error) throw new Error(`stock.descontarPorVenta: ${error.message}`);
      return ok<MovimientoStock>(
        await sb
          .from('movimientos_stock')
          .insert({
            producto_id, variante_id, deposito_id,
            tipo: 'venta', cantidad, referencia_id: venta_id, empleado_id,
          })
          .select('*')
          .single(),
        'stock.descontarPorVenta (mov)',
      );
    },
    async movimientos(filtro = {}) {
      let q = sb.from('movimientos_stock').select('*').order('fecha', { ascending: false });
      if (filtro.producto_id) q = q.eq('producto_id', filtro.producto_id);
      if (filtro.deposito_id) q = q.eq('deposito_id', filtro.deposito_id);
      if (filtro.desde) q = q.gte('fecha', filtro.desde);
      if (filtro.hasta) q = q.lte('fecha', filtro.hasta);
      return okList<MovimientoStock>(await q, 'stock.movimientos');
    },
  };
}
