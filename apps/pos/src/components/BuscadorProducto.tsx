import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { useVenta } from '@/stores/venta';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { Input } from '@comercio/ui/input';

// Acepta tanto el UUID real de Supabase como el ID legacy del mock 'lp_cf'.
const LISTA_CF_IDS = [PRESET_IDS.listas.consumidorFinal, 'lp_cf'];

type StockPorDeposito = {
  local: number;
  /** Stock en depósitos distintos al del cajero (suma) */
  otros: number;
  /** Nombres de los depósitos donde hay (para mostrar al cajero) */
  otrosNombres: string[];
};

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

  // Diccionario de depósitos para mostrar nombres legibles cuando hay
  // stock en uno distinto al del cajero.
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
    staleTime: 5 * 60_000,
  });

  // Stocks de los productos visibles en los resultados (con breakdown
  // local vs otros depósitos). Antes solo traíamos el del local, lo que
  // hacía que productos disponibles en B12 desde la caja C11 figuraran
  // como "sin stock" cuando en realidad estaban en otro depósito.
  const idsVisibles = (resultadosQ.data ?? []).map((p) => p.id).join(',');
  const stocksQ = useQuery({
    queryKey: ['pos-stocks-buscar', idsVisibles, depositoId],
    queryFn: async () => {
      const map = new Map<string, StockPorDeposito>();
      const nombrePorDep = new Map<string, string>(
        (depositosQ.data ?? []).map((d) => [d.id, d.nombre]),
      );
      for (const p of resultadosQ.data ?? []) {
        const items = await db.stock.porProducto(p.id);
        let local = 0;
        let otros = 0;
        const otrosNombres: string[] = [];
        for (const it of items) {
          const cant = Number(it.cantidad);
          if (it.deposito_id === depositoId) {
            local += cant;
          } else if (cant > 0) {
            otros += cant;
            const n = nombrePorDep.get(it.deposito_id) ?? 'otro depósito';
            if (!otrosNombres.includes(n)) otrosNombres.push(n);
          }
        }
        map.set(p.id, { local, otros, otrosNombres });
      }
      return map;
    },
    enabled: (resultadosQ.data?.length ?? 0) > 0 && !!depositosQ.data,
  });

  function stockDeProducto(id: string): StockPorDeposito {
    return stocksQ.data?.get(id) ?? { local: 0, otros: 0, otrosNombres: [] };
  }
  function yaEnCarrito(id: string): number {
    return itemsEnCarrito.find((it) => it.producto.id === id)?.cantidad ?? 0;
  }

  /**
   * Decide si se puede agregar el producto al carrito y cómo.
   * Devuelve { ok, crossDeposito, nombresOtros } o lanza toast de error si no se puede.
   */
  async function evaluarStock(p: { id: string; nombre: string }): Promise<
    | { ok: true; crossDeposito: boolean; nombresOtros: string[] }
    | { ok: false }
  > {
    const items = await db.stock.porProducto(p.id);
    let local = 0;
    const otrosPorDep = new Map<string, number>();
    for (const it of items) {
      const cant = Number(it.cantidad);
      if (it.deposito_id === depositoId) local += cant;
      else if (cant > 0) otrosPorDep.set(it.deposito_id, cant);
    }
    const cantEnCarrito = yaEnCarrito(p.id);
    if (local - cantEnCarrito > 0) {
      return { ok: true, crossDeposito: false, nombresOtros: [] };
    }
    // No hay en el local. ¿Hay en otro?
    if (otrosPorDep.size === 0) {
      toast.error(`"${p.nombre}" no tiene stock en ningún depósito.`);
      return { ok: false };
    }
    const nombrePorDep = new Map(
      (depositosQ.data ?? []).map((d) => [d.id, d.nombre]),
    );
    const nombresOtros = [...otrosPorDep.keys()].map(
      (id) => nombrePorDep.get(id) ?? 'otro depósito',
    );
    return { ok: true, crossDeposito: true, nombresOtros };
  }

  async function agregarPorCodigoExacto() {
    const codigo = q.trim();
    if (!codigo) return;
    const p = await db.productos.buscarPorCodigo(codigo);
    if (!p) {
      toast.error(`Producto con código ${codigo} no encontrado`);
      return;
    }
    const eval_ = await evaluarStock(p);
    if (!eval_.ok) return;
    const precios = await db.productos.preciosDe(p.id);
    const cf = precios.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
    const precio = cf?.escalas[0]?.precio ?? 0;
    agregar(p, precio);
    setQ('');
    setMostrarLista(false);
    if (eval_.crossDeposito) {
      toast.warning(
        `+ ${p.nombre} · pedilo a ${eval_.nombresOtros.join(' o ')}, no hay en tu caja`,
        { duration: 5000 },
      );
    } else {
      toast.success(`+ ${p.nombre}`);
    }
  }

  async function agregarProducto(productoId: string) {
    const p = (resultadosQ.data ?? []).find((x) => x.id === productoId);
    if (!p) return;
    const eval_ = await evaluarStock(p);
    if (!eval_.ok) return;
    const precios = await db.productos.preciosDe(p.id);
    const cf = precios.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
    const precio = cf?.escalas[0]?.precio ?? 0;
    agregar(p, precio);
    setQ('');
    setMostrarLista(false);
    if (eval_.crossDeposito) {
      toast.warning(
        `+ ${p.nombre} · pedilo a ${eval_.nombresOtros.join(' o ')}, no hay en tu caja`,
        { duration: 5000 },
      );
    } else {
      toast.success(`+ ${p.nombre}`);
    }
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
            const stock = stockDeProducto(p.id);
            const cantEnCarrito = yaEnCarrito(p.id);
            const dispLocal = stock.local - cantEnCarrito;
            const hayLocal = dispLocal > 0;
            const hayEnOtro = stock.otros > 0;
            // Bloqueado solo si no hay en ningún depósito.
            const noHayNada = !hayLocal && !hayEnOtro && !stocksQ.isLoading;
            return (
              <button
                key={p.id}
                onClick={() => agregarProducto(p.id)}
                disabled={noHayNada}
                className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 ${
                  noHayNada
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
                  ) : noHayNada ? (
                    <span className="flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Sin stock
                    </span>
                  ) : hayLocal ? (
                    <span
                      className={
                        dispLocal <= 3
                          ? 'font-medium text-orange-600'
                          : 'font-medium text-green-700'
                      }
                    >
                      {dispLocal} u en tu caja
                    </span>
                  ) : (
                    // Solo hay en otro depósito.
                    <span className="flex items-center gap-1 font-medium text-amber-700">
                      <ArrowRightLeft className="h-3 w-3" />
                      {stock.otros} u en {stock.otrosNombres.join(' / ')}
                    </span>
                  )}
                  {/* Se sacó el costo de venta: es info sensible (margen)
                      que los cajeros no deben ver. Solo mostramos stock. */}
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
