import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { useVenta } from '@/stores/venta';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';

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
  const quitar = useVenta((s) => s.quitar);
  const itemsEnCarrito = useVenta((s) => s.items);
  const seleccionadoId = useVenta((s) => s.seleccionadoId);
  const moverSeleccion = useVenta((s) => s.moverSeleccion);

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

  // Precios de la lista Consumidor Final, para mostrarlos en el dropdown
  // (antes el cajero tenía que agregar al carrito para verlos). Se trae
  // una sola vez y se cachea — ~1900 filas chicas, sin impacto.
  const preciosQ = useQuery({
    queryKey: ['pos-precios-cf'],
    queryFn: () => db.productos.preciosDeLista(PRESET_IDS.listas.consumidorFinal),
    staleTime: 5 * 60_000,
  });
  // Map producto_id → precio base (escala desde 1).
  const precioPorProducto = (() => {
    const m = new Map<string, number>();
    for (const r of preciosQ.data ?? []) {
      const esc = [...r.escalas].sort((a, b) => a.desde - b.desde)[0];
      if (esc) m.set(r.producto_id, esc.precio);
    }
    return m;
  })();

  // Item resaltado en el dropdown (para navegar con flechas).
  const [resaltadoIdx, setResaltadoIdx] = useState(0);


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
            // Sacamos prefijo "#Turisteando" y deduplicamos. Si no
            // pudimos resolver el nombre, omitimos (no agregamos
            // "otro depósito" para no ensuciar el mensaje).
            const raw = nombrePorDep.get(it.deposito_id);
            if (!raw) continue;
            const n = raw.replace(/^#?\s*turisteando\s*/i, '').trim() || raw;
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
    // Política Turisteando: permitir vender SIEMPRE, aunque el stock
    // quede negativo. Si tu depósito tiene cualquier valor (incluso 0
    // o negativo), vendés desde acá. Solo sugerimos cross-depósito
    // como warning cuando hay stock positivo en otro lado.
    if (local > 0 && local - cantEnCarrito > 0) {
      return { ok: true, crossDeposito: false, nombresOtros: [] };
    }
    if (local <= 0 && otrosPorDep.size === 0) {
      // Vendemos igual (queda negativo). Aviso pero no bloqueo.
      return { ok: true, crossDeposito: false, nombresOtros: [] };
    }
    // Si depositosQ todavía no cargó (race contra el primer click después
    // de abrir la pantalla), forzamos el fetch acá. Sin esto los nombres
    // caen al fallback y el toast queda con "otro depósito o otro depósito".
    const depositos =
      depositosQ.data ?? (await db.depositos.list().catch(() => []));
    const nombrePorDep = new Map(depositos.map((d) => [d.id, d.nombre]));
    // Resolvemos nombres reales (B12/C11/Central, sin "#Turisteando"),
    // deduplicando y descartando los que no pudimos resolver.
    const nombresOtros: string[] = [];
    for (const id of otrosPorDep.keys()) {
      const raw = nombrePorDep.get(id);
      if (!raw) continue;
      const n = raw.replace(/^#?\s*turisteando\s*/i, '').trim() || raw;
      if (!nombresOtros.includes(n)) nombresOtros.push(n);
    }
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
      const lugares = eval_.nombresOtros.length > 0
        ? `pedilo a ${eval_.nombresOtros.join(' o ')}`
        : 'pedilo al otro local';
      toast.warning(
        `+ ${p.nombre} · ${lugares}, no hay en tu caja`,
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
      const lugares = eval_.nombresOtros.length > 0
        ? `pedilo a ${eval_.nombresOtros.join(' o ')}`
        : 'pedilo al otro local';
      toast.warning(
        `+ ${p.nombre} · ${lugares}, no hay en tu caja`,
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
          setResaltadoIdx(0); // resetear al cambiar la búsqueda
        }}
        onKeyDown={(e) => {
          const lista = resultadosQ.data ?? [];
          if (e.key === 'Enter') {
            // Si hay resultados, agregar el resaltado (default: primero).
            // Si no, intentar código exacto.
            if (lista.length > 0) {
              const target = lista[Math.min(resaltadoIdx, lista.length - 1)];
              if (target) agregarProducto(target.id);
            } else {
              void agregarPorCodigoExacto();
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (lista.length > 0) {
              setResaltadoIdx((i) => Math.min(i + 1, lista.length - 1));
            } else if (q === '') {
              // Buscador vacío y sin dropdown → ↓ navega items del carrito.
              moverSeleccion(1);
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (lista.length > 0) {
              setResaltadoIdx((i) => Math.max(0, i - 1));
            } else if (q === '') {
              moverSeleccion(-1);
            }
          } else if (e.key === 'Escape') {
            setQ('');
            setMostrarLista(false);
            setResaltadoIdx(0);
          } else if ((e.key === 'Delete' || e.key === 'Backspace') && q === '') {
            // Buscador vacío + Supr/Backspace → borrar el item seleccionado
            // del carrito (o el último si no hay nada seleccionado). Si el
            // cajero está tipeando, no se dispara (q !== '').
            const objetivo =
              itemsEnCarrito.find((i) => i.producto.id === seleccionadoId) ??
              itemsEnCarrito[itemsEnCarrito.length - 1];
            if (objetivo) {
              e.preventDefault();
              quitar(objetivo.producto.id);
              toast.info(`− ${objetivo.producto.nombre}`);
            }
          }
        }}
        placeholder="Código (ej: 1003) o nombre — Enter agrega · ↑↓ navega · Supr borra"
        className="h-14 text-lg"
      />
      {mostrarLista && q.trim().length > 0 && (resultadosQ.data?.length ?? 0) > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {resultadosQ.data!.map((p, idx) => {
            const precio = precioPorProducto.get(p.id);
            const resaltado = idx === resaltadoIdx;
            return (
              <button
                key={p.id}
                onClick={() => agregarProducto(p.id)}
                onMouseEnter={() => setResaltadoIdx(idx)}
                className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 ${
                  resaltado ? 'bg-accent' : 'hover:bg-accent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">
                    {p.codigo_interno}
                  </div>
                  <div className="truncate font-medium">{p.nombre}</div>
                </div>
                <div className="ml-3 flex flex-col items-end gap-0.5 text-xs">
                  {precio !== undefined ? (
                    <span className="text-lg font-bold tabular-nums text-foreground">
                      {formatCurrency(precio)}
                    </span>
                  ) : preciosQ.isLoading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : (
                    <span className="text-orange-700">Sin precio</span>
                  )}
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
