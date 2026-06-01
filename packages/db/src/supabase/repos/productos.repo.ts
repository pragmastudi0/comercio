import type { SupabaseClient } from '@supabase/supabase-js';
import type { FiltroProductos, ProductosRepo } from '../../repos/productos.repo';
import type { Producto, ProductoImagen, ProductoListaPrecio, Variante } from '../../types';
import { ok, okList, okMaybe } from '../helpers';

type PrecioRow = {
  producto_id: string;
  lista_precio_id: string;
  escalas: { desde: number; precio: number }[];
};

export function makeProductosRepo(sb: SupabaseClient): ProductosRepo {
  function aplicarFiltro<T>(q: T, f: FiltroProductos): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qq: any = q;
    if (f.activo !== undefined) qq = qq.eq('activo', f.activo);
    if (f.categoria_id) qq = qq.eq('categoria_id', f.categoria_id);
    if (f.proveedor_id) qq = qq.eq('proveedor_id', f.proveedor_id);
    if (f.publicado_web !== undefined) qq = qq.eq('publicado_web', f.publicado_web);
    if (f.texto) {
      const p = `%${f.texto}%`;
      qq = qq.or(`nombre.ilike.${p},codigo_interno.ilike.${p}`);
    }
    return qq;
  }

  return {
    async list(filtro = {}) {
      let q = sb.from('productos').select('*').order('nombre');
      q = aplicarFiltro(q, filtro);
      let rows = okList<Producto>(await q, 'productos.list');
      if (filtro.sin_stock) {
        // Filtrar productos cuya suma de stock sea 0 en todos los depósitos.
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return rows;
        const { data: stocks, error } = await sb
          .from('stock_items')
          .select('producto_id, cantidad')
          .in('producto_id', ids);
        if (error) throw new Error(`productos.list (stock): ${error.message}`);
        const total = new Map<string, number>();
        for (const s of stocks ?? []) {
          total.set(s.producto_id, (total.get(s.producto_id) ?? 0) + Number(s.cantidad));
        }
        rows = rows.filter((p) => (total.get(p.id) ?? 0) <= 0);
      }
      return rows;
    },
    async buscarRapido(query, limit = 10) {
      if (!query.trim()) return [];
      const q = query.trim();
      const p = `%${q}%`;
      return okList<Producto>(
        await sb
          .from('productos')
          .select('*')
          .eq('activo', true)
          .or(`codigo_interno.like.${q}%,nombre.ilike.${p}`)
          .limit(limit),
        'productos.buscarRapido',
      );
    },
    async buscarPorCodigo(codigo) {
      return okMaybe<Producto>(
        await sb
          .from('productos')
          .select('*')
          .eq('codigo_interno', codigo)
          .maybeSingle(),
        'productos.buscarPorCodigo',
      );
    },
    async get(id) {
      return okMaybe<Producto>(
        await sb.from('productos').select('*').eq('id', id).maybeSingle(),
        'productos.get',
      );
    },
    async create(input) {
      return ok<Producto>(
        await sb.from('productos').insert(input).select('*').single(),
        'productos.create',
      );
    },
    async update(id, patch) {
      return ok<Producto>(
        await sb.from('productos').update(patch).eq('id', id).select('*').single(),
        'productos.update',
      );
    },
    async delete(id) {
      const { error } = await sb.from('productos').delete().eq('id', id);
      if (error) throw new Error(`productos.delete: ${error.message}`);
    },
    async aumentoMasivo(filtro, porcentaje, listaPrecioId) {
      // Traer productos que matchean el filtro
      let q = sb.from('productos').select('id');
      q = aplicarFiltro(q, filtro);
      const prods = okList<{ id: string }>(await q, 'productos.aumentoMasivo (list)');
      if (prods.length === 0) return 0;
      const ids = prods.map((p) => p.id);

      // Traer precios actuales para esa lista
      const precios = okList<PrecioRow>(
        await sb
          .from('producto_lista_precio')
          .select('*')
          .in('producto_id', ids)
          .eq('lista_precio_id', listaPrecioId),
        'productos.aumentoMasivo (precios)',
      );

      const factor = 1 + porcentaje / 100;
      let actualizados = 0;
      for (const p of precios) {
        const nuevasEscalas = p.escalas.map((e) => ({
          ...e,
          precio: Math.round(e.precio * factor),
        }));
        const { error } = await sb
          .from('producto_lista_precio')
          .update({ escalas: nuevasEscalas })
          .eq('producto_id', p.producto_id)
          .eq('lista_precio_id', listaPrecioId);
        if (error) throw new Error(`productos.aumentoMasivo (update): ${error.message}`);
        actualizados += 1;
      }
      return actualizados;
    },
    async variantes(productoId) {
      return okList<Variante>(
        await sb.from('variantes').select('*').eq('producto_id', productoId),
        'productos.variantes',
      );
    },
    async crearVariante(productoId, atributos) {
      return ok<Variante>(
        await sb
          .from('variantes')
          .insert({ producto_id: productoId, atributos })
          .select('*')
          .single(),
        'productos.crearVariante',
      );
    },
    async eliminarVariante(varianteId) {
      const { error } = await sb.from('variantes').delete().eq('id', varianteId);
      if (error) throw new Error(`productos.eliminarVariante: ${error.message}`);
    },
    async imagenes(productoId) {
      return okList<ProductoImagen>(
        await sb
          .from('producto_imagenes')
          .select('*')
          .eq('producto_id', productoId)
          .order('orden'),
        'productos.imagenes',
      );
    },
    async agregarImagen(productoId, url) {
      const { data: count } = await sb
        .from('producto_imagenes')
        .select('orden', { count: 'exact', head: true })
        .eq('producto_id', productoId);
      const orden = (count as unknown as number) ?? 0;
      return ok<ProductoImagen>(
        await sb
          .from('producto_imagenes')
          .insert({ producto_id: productoId, url, orden })
          .select('*')
          .single(),
        'productos.agregarImagen',
      );
    },
    async eliminarImagen(imagenId) {
      const { error } = await sb.from('producto_imagenes').delete().eq('id', imagenId);
      if (error) throw new Error(`productos.eliminarImagen: ${error.message}`);
    },
    async reordenarImagenes(productoId, idsEnOrden) {
      for (let i = 0; i < idsEnOrden.length; i++) {
        const id = idsEnOrden[i]!;
        const { error } = await sb
          .from('producto_imagenes')
          .update({ orden: i })
          .eq('id', id)
          .eq('producto_id', productoId);
        if (error) throw new Error(`productos.reordenarImagenes: ${error.message}`);
      }
    },
    async preciosDe(productoId) {
      const rows = okList<PrecioRow>(
        await sb
          .from('producto_lista_precio')
          .select('*')
          .eq('producto_id', productoId),
        'productos.preciosDe',
      );
      // El tipo ProductoListaPrecio coincide 1:1
      return rows as ProductoListaPrecio[];
    },
    async setPrecio(productoId, listaPrecioId, escalas) {
      const ordenadas = [...escalas].sort((a, b) => a.desde - b.desde);
      const { error } = await sb
        .from('producto_lista_precio')
        .upsert({
          producto_id: productoId,
          lista_precio_id: listaPrecioId,
          escalas: ordenadas,
        });
      if (error) throw new Error(`productos.setPrecio: ${error.message}`);
    },
  };
}
