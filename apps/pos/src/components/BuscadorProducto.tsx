import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { useVenta } from '@/stores/venta';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';

// Acepta tanto el UUID real de Supabase como el ID legacy del mock 'lp_cf'.
const LISTA_CF_IDS = [PRESET_IDS.listas.consumidorFinal, 'lp_cf'];

export type BuscadorProductoHandle = {
  focus: () => void;
};

export function BuscadorProducto() {
  const db = getDb();
  const [q, setQ] = useState('');
  const [mostrarLista, setMostrarLista] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const agregar = useVenta((s) => s.agregar);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const resultadosQ = useQuery({
    queryKey: ['pos-buscar', q],
    queryFn: () => db.productos.buscarRapido(q, 8),
    enabled: q.trim().length > 0,
  });

  async function agregarPorCodigoExacto() {
    const codigo = q.trim();
    if (!codigo) return;
    const p = await db.productos.buscarPorCodigo(codigo);
    if (!p) {
      toast.error(`Producto con código ${codigo} no encontrado`);
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
          {resultadosQ.data!.map((p) => (
            <button
              key={p.id}
              onClick={() => agregarProducto(p.id)}
              className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 hover:bg-accent"
            >
              <div>
                <div className="font-mono text-xs text-muted-foreground">{p.codigo_interno}</div>
                <div className="font-medium">{p.nombre}</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Costo {formatCurrency(p.costo)}
              </div>
            </button>
          ))}
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
