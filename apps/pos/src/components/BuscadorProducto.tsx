import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { useVenta } from '@/stores/venta';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';

// Acepta tanto el UUID real de Supabase como el ID legacy del mock 'lp_cf'.
const LISTA_CF_IDS = [PRESET_IDS.listas.consumidorFinal, 'lp_cf'];

export type BuscadorProductoHandle = {
  focus: () => void;
};

export function BuscadorProducto() {
  const db = getDb();
  const { depositoId } = useDepositoActivo();

  const [q, setQ] = useState('');
  const [mostrarLista, setMostrarLista] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const agregar = useVenta((s) => s.agregar);
  const itemsEnCarrito = useVenta((s) => s.items);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const resultadosQ = useQuery({
    queryKey: ['pos-buscar', q],
    queryFn: () => db.productos.buscarRapido(q, 8),
    enabled: q.trim().length > 0,
  });

  // Stocks de los productos visibles en los resultados (para mostrar y filtrar).
  const idsVisibles = (resultadosQ.data ?? []).map((p) => p.id).join(',');
  const stocksQ = useQuery({
    queryKey: ['pos-stocks-buscar', idsVisibles, depositoId],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of resultadosQ.data ?? []) {
        const cant = await db.stock.cantidad(p.id, depositoId);
        map.set(p.id, cant);
      }
      return map;
    },
    enabled: (resultadosQ.data?.length ?? 0) > 0,
  });

  function stockDeProducto(id: string): number {
    return stocksQ.data?.get(id) ?? 0;
  }
  function yaEnCarrito(id: string): number {
    return itemsEnCarrito.find((it) => it.producto.id === id)?.cantidad ?? 0;
  }

  async function agregarPorCodigoExacto() {
    const codigo = q.trim();
    if (!codigo) return;
    const p = await db.productos.buscarPorCodigo(codigo);
    if (!p) {
      toast.error(`Producto con código ${codigo} no encontrado`);
      return;
    }
    // Validar stock en el depósito del cajero antes de agregar
    const stockLocal = await db.stock.cantidad(p.id, depositoId);
    const cantEnCarrito = yaEnCarrito(p.id);
    if (stockLocal - cantEnCarrito <= 0) {
      // Reportar también dónde sí hay stock
      const todos = await db.stock.porProducto(p.id);
      const otros = todos.filter(
        (s) => s.deposito_id !== depositoId && Number(s.cantidad) > 0,
      );
      const detalle =
        otros.length > 0
          ? ` Hay stock en otros depósitos: ${otros.reduce((acc, s) => acc + Number(s.cantidad), 0)} u.`
          : '';
      toast.error(`Sin stock de "${p.nombre}" en tu depósito.${detalle}`);
      return;
    }
    const precios = await db.productos.preciosDe(p.id);
    const cf = precios.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
    const precio = cf?.escalas[0]?.precio ?? 0;
    agregar(p, precio);
    setQ('');
    setMostrarLista(false);
    toast.success(`+ ${p.nombre}`);
  }

  async function agregarProducto(productoId: string) {
    const p = (resultadosQ.data ?? []).find((x) => x.id === productoId);
    if (!p) return;
    // Validar stock antes de agregar
    const stockLocal = stockDeProducto(p.id);
    const cantEnCarrito = yaEnCarrito(p.id);
    if (stockLocal - cantEnCarrito <= 0) {
      const todos = await db.stock.porProducto(p.id);
      const otros = todos.filter(
        (s) => s.deposito_id !== depositoId && Number(s.cantidad) > 0,
      );
      const detalle =
        otros.length > 0
          ? ` Hay ${otros.reduce((acc, s) => acc + Number(s.cantidad), 0)} u en otros depósitos.`
          : '';
      toast.error(`Sin stock de "${p.nombre}" en tu depósito.${detalle}`);
      return;
    }
    const precios = await db.productos.preciosDe(p.id);
    const cf = precios.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
    const precio = cf?.escalas[0]?.precio ?? 0;
    agregar(p, precio);
    setQ('');
    setMostrarLista(false);
    toast.success(`+ ${p.nombre}`);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          setMostrarLista(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Si hay un resultado único, agregalo. Si no, intenta por código exacto.
            const lista = resultadosQ.data ?? [];
            if (lista.length === 1) {
              agregarProducto(lista[0]!.id);
            } else {
              void agregarPorCodigoExacto();
            }
          } else if (e.key === 'Escape') {
            setQ('');
            setMostrarLista(false);
          }
        }}
        placeholder="Código (ej: 1003) o nombre — Enter para agregar"
        className="h-14 text-lg"
      />
      {mostrarLista && q.trim().length > 0 && (resultadosQ.data?.length ?? 0) > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {resultadosQ.data!.map((p) => {
            const stockLocal = stockDeProducto(p.id);
            const cantEnCarrito = yaEnCarrito(p.id);
            const disponible = stockLocal - cantEnCarrito;
            const sinStock = disponible <= 0;
            return (
              <button
                key={p.id}
                onClick={() => agregarProducto(p.id)}
                disabled={sinStock}
                className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 ${
                  sinStock
                    ? 'cursor-not-allowed bg-destructive/5 opacity-70'
                    : 'hover:bg-accent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">{p.codigo_interno}</div>
                  <div className="truncate font-medium">{p.nombre}</div>
                </div>
                <div className="ml-3 flex flex-col items-end gap-1 text-xs">
                  {stocksQ.isLoading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : sinStock ? (
                    <span className="flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Sin stock
                    </span>
                  ) : (
                    <span
                      className={
                        disponible <= 3
                          ? 'font-medium text-orange-600'
                          : 'font-medium text-green-700'
                      }
                    >
                      {disponible} u en stock
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Costo {formatCurrency(p.costo)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {mostrarLista && q.trim().length > 0 && resultadosQ.data?.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-lg">
          Sin resultados
        </div>
      )}
    </div>
  );
}
