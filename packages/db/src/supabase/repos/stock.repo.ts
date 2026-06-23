import type { SupabaseClient } from '@supabase/supabase-js';
import type { StockRepo } from '../../repos/stock.repo';
import type { MovimientoStock, StockItem } from '../../types';
import { ok, okList } from '../helpers';

/**
 * Aplica un DELTA al stock de (producto, variante, depósito).
 *
 * Por qué este helper en vez de .upsert():
 * El upsert de supabase-js NO funciona acá. La tabla tiene un unique
 * parcial `stock_items_unique_sin_variante` (producto_id, deposito_id)
 * WHERE variante_id IS NULL. PostgreSQL no acepta ON CONFLICT con unique
 * parcial sin que se especifique el WHERE, y supabase-js no lo expone.
 * Resultado: cuando el upsert "sin variante" choca con una fila ya
 * existente, falla con:
 *   duplicate key value violates unique constraint
 *   "stock_items_unique_sin_variante"
 *
 * Workaround: leer con filtro EXACTO por variante (.is null cuando es
 * null, .eq cuando tiene valor) y decidir UPDATE/INSERT. Antes el SELECT
 * no filtraba por variante → si la tabla tenía residuo de otra variante
 * para el mismo (producto, depósito), maybeSingle podía fallar
 * silenciosamente con multiple-rows y caíamos al INSERT que chocaba.
 *
 * Devuelve la cantidad ANTERIOR (útil para validaciones del caller).
 * No es atómico — para venta concurrente real usamos rpc_crear_venta,
 * que sí es atómica vía SELECT…FOR UPDATE.
 *
 * Si `validar` devuelve un Error, abortamos sin escribir (caller decide
 * mensaje).
 */
export async function aplicarDeltaStock(
  sb: SupabaseClient,
  opts: {
    producto_id: string;
    variante_id: string | null;
    deposito_id: string;
    delta: number;
    /** Devolver Error para abortar el cambio antes de escribir. */
    validar?: (cantidadActual: number) => Error | null;
  },
): Promise<{ cantidadAnterior: number; cantidadNueva: number }> {
  // 1) SELECT exacto: incluye el filtro por variante_id (null o valor).
  let sel = sb
    .from('stock_items')
    .select('cantidad')
    .eq('producto_id', opts.producto_id)
    .eq('deposito_id', opts.deposito_id);
  sel = opts.variante_id === null
    ? sel.is('variante_id', null)
    : sel.eq('variante_id', opts.variante_id);
  const { data: existente, error: selErr } = await sel.maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const cantidadAnterior = Number(existente?.cantidad ?? 0);

  if (opts.validar) {
    const e = opts.validar(cantidadAnterior);
    if (e) throw e;
  }

  const cantidadNueva = cantidadAnterior + opts.delta;

  // 2) UPDATE si existe la fila exacta, INSERT si no. Mismo filtro
  //    estricto por variante_id que usamos en el SELECT, así no tocamos
  //    una fila de otra variante por accidente.
  const hacerUpdate = async () => {
    let upd = sb
      .from('stock_items')
      .update({ cantidad: cantidadNueva })
      .eq('producto_id', opts.producto_id)
      .eq('deposito_id', opts.deposito_id);
    upd = opts.variante_id === null
      ? upd.is('variante_id', null)
      : upd.eq('variante_id', opts.variante_id);
    const { error } = await upd;
    if (error) throw new Error(error.message);
  };

  if (existente) {
    await hacerUpdate();
  } else {
    // Intentar INSERT. Si choca con el unique parcial (la fila ya existe
    // pero el SELECT no la vio — race, RLS, lo que sea), caemos a UPDATE
    // automáticamente. Belt-and-suspenders contra el bug histórico de
    // "duplicate key on stock_items_unique_sin_variante".
    const { error } = await sb.from('stock_items').insert({
      producto_id: opts.producto_id,
      variante_id: opts.variante_id,
      deposito_id: opts.deposito_id,
      cantidad: cantidadNueva,
    });
    if (error) {
      const esDuplicate =
        /duplicate key|stock_items_unique|23505/i.test(error.message);
      if (!esDuplicate) throw new Error(error.message);
      // La fila existe (aunque no la vimos). Releemos la cantidad real,
      // recalculamos el nuevo y hacemos UPDATE con eso.
      let resel = sb
        .from('stock_items')
        .select('cantidad')
        .eq('producto_id', opts.producto_id)
        .eq('deposito_id', opts.deposito_id);
      resel = opts.variante_id === null
        ? resel.is('variante_id', null)
        : resel.eq('variante_id', opts.variante_id);
      const { data: ahora } = await resel.maybeSingle();
      const cantReal = Number(ahora?.cantidad ?? 0);
      const cantidadNuevaReal = cantReal + opts.delta;
      let upd = sb
        .from('stock_items')
        .update({ cantidad: cantidadNuevaReal })
        .eq('producto_id', opts.producto_id)
        .eq('deposito_id', opts.deposito_id);
      upd = opts.variante_id === null
        ? upd.is('variante_id', null)
        : upd.eq('variante_id', opts.variante_id);
      const { error: updErr } = await upd;
      if (updErr) throw new Error(updErr.message);
      return { cantidadAnterior: cantReal, cantidadNueva: cantidadNuevaReal };
    }
  }

  return { cantidadAnterior, cantidadNueva };
}

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
      try {
        await aplicarDeltaStock(sb, {
          producto_id,
          variante_id: variante_id ?? null,
          deposito_id,
          delta: cantidad,
        });
      } catch (e) {
        throw new Error(`stock.ajustar: ${(e as Error).message}`);
      }
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
      try {
        await aplicarDeltaStock(sb, {
          producto_id,
          variante_id: variante_id ?? null,
          deposito_id,
          delta: -cantidad,
        });
      } catch (e) {
        throw new Error(`stock.registrarMerma: ${(e as Error).message}`);
      }
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
      try {
        await aplicarDeltaStock(sb, {
          producto_id,
          variante_id: variante_id ?? null,
          deposito_id,
          delta: -cantidad,
          validar: (actual) => {
            if (!permitirSinStock && actual < cantidad) {
              return new Error(
                `Stock insuficiente para producto ${producto_id} en depósito ${deposito_id}`,
              );
            }
            return null;
          },
        });
      } catch (e) {
        throw new Error(`stock.descontarPorVenta: ${(e as Error).message}`);
      }
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
