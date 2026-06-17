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
      // Paginar internamente para sortear el límite de 1000 filas del REST.
      const CHUNK = 1000;
      const acumulado: StockItem[] = [];
      let from = 0;
      while (true) {
        let q = sb.from('stock_items').select('*').range(from, from + CHUNK - 1);
        if (filtro.producto_id) q = q.eq('producto_id', filtro.producto_id);
        if (filtro.deposito_id) q = q.eq('deposito_id', filtro.deposito_id);
        const chunk = okList<StockItem>(await q, 'stock.consolidado');
        acumulado.push(...chunk);
        if (chunk.length < CHUNK) break;
        from += CHUNK;
      }
      return filtro.sin_stock ? acumulado.filter((r) => r.cantidad <= 0) : acumulado;
    },
    async totalesDeMuchos(productoIds, depositoId) {
      const map = new Map<string, number>();
      if (productoIds.length === 0) return map;
      // PostgREST tiene un límite práctico en el largo del IN; chunkeo de 200.
      const CHUNK = 200;
      for (let i = 0; i < productoIds.length; i += CHUNK) {
        const slice = productoIds.slice(i, i + CHUNK);
        let q = sb
          .from('stock_items')
          .select('producto_id, cantidad')
          .in('producto_id', slice);
        if (depositoId) q = q.eq('deposito_id', depositoId);
        const { data, error } = await q;
        if (error) throw new Error(`stock.totalesDeMuchos: ${error.message}`);
        for (const r of data ?? []) {
          map.set(r.producto_id, (map.get(r.producto_id) ?? 0) + Number(r.cantidad));
        }
      }
      // Productos sin filas en stock_items quedan en 0.
      for (const id of productoIds) if (!map.has(id)) map.set(id, 0);
      return map;
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
