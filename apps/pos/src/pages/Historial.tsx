import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, Receipt, RefreshCw } from 'lucide-react';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Skeleton } from '@comercio/ui/skeleton';
import { Badge } from '@comercio/ui/badge';
import { formatCurrency } from '@comercio/ui/utils';

const LABEL_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cta_cte: 'Cta corriente',
};

/**
 * Historial de ventas de las últimas 48 horas del LOCAL del cajero.
 * Sirve para hacer cambios (Turisteando maneja 2 días de garantía).
 * No filtra por cajero — todos los cajeros del mismo local ven todas
 * las ventas para poder atender un cambio aunque otro cajero la haya
 * registrado.
 */
export function Historial() {
  const navigate = useNavigate();
  const db = getDb();
  const caja = useSesion((s) => s.caja);
  const [filtro, setFiltro] = useState('');

  const desde = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1); // ayer 00:00
    return d.toISOString();
  }, []);

  const ventasQ = useQuery({
    queryKey: ['pos-historial-48h', caja?.local_id, desde],
    queryFn: () =>
      caja
        ? db.ventas.list({ local_id: caja.local_id, desde })
        : Promise.resolve([]),
    enabled: !!caja,
    refetchInterval: 30_000,
  });

  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  // Catálogo de productos (para buscar por código y mostrar nombre en cada
  // venta). Tener todo en memoria es OK porque ya está cacheado.
  const productosQ = useQuery({
    queryKey: ['productos-all'],
    queryFn: () => db.productos.list(),
  });
  const productoPorId = (id: string) =>
    productosQ.data?.find((p) => p.id === id);

  // Orden y filtro en memoria. La búsqueda mira número de ticket, cajero
  // y código/nombre de cualquier producto incluido en la venta — así el
  // cajero puede encontrar la venta de "tal producto" sin recordar el
  // número.
  const ventas = useMemo(() => {
    const lista = [...(ventasQ.data ?? [])].reverse();
    const q = filtro.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((v) => {
      if (v.numero.toLowerCase().includes(q)) return true;
      if (empleadoNombre(v.empleado_id).toLowerCase().includes(q)) return true;
      // Buscar por código o nombre de cualquier producto vendido.
      for (const it of v.items) {
        const p = productoPorId(it.producto_id);
        if (!p) continue;
        if (p.codigo_interno.toLowerCase().includes(q)) return true;
        if (p.nombre.toLowerCase().includes(q)) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasQ.data, filtro, empleadosQ.data, productosQ.data]);

  if (!caja) {
    navigate('/abrir-caja');
    return null;
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/caja')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver
        </Button>
        <h1 className="text-lg font-semibold sm:text-xl">Historial de 48 horas</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => ventasQ.refetch()}
          title="Refrescar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Número de ticket, cajero, código o nombre de producto"
            className="h-11 pl-10 text-base"
            autoFocus
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ventas del local <b>{caja.nombre}</b> de los últimos 2 días. Sirve
          para atender devoluciones y cambios.
        </p>
      </div>

      {ventasQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : ventas.length === 0 ? (
        <div className="rounded-md border bg-muted/30 py-16 text-center text-muted-foreground">
          <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>Sin ventas en el rango.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ventas.map((v) => {
            const fecha = new Date(v.fecha);
            const horaTxt = fecha.toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            const metodos = Array.from(new Set(v.pagos.map((p) => p.metodo)))
              .map((m) => LABEL_METODO[m] ?? m)
              .join(' + ');
            const anulada = v.estado === 'anulada';
            return (
              <button
                key={v.id}
                onClick={() => navigate(`/ticket/${v.id}`)}
                className={`flex w-full items-center justify-between rounded-md border bg-card p-3 text-left transition hover:border-foreground/30 ${
                  anulada ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{v.numero}</span>
                    {anulada && <Badge variant="destructive">Anulada</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {horaTxt} · {empleadoNombre(v.empleado_id)} · {metodos}
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div
                    className={`text-base font-semibold tabular-nums ${
                      anulada ? 'line-through' : ''
                    }`}
                  >
                    {formatCurrency(v.total)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {v.items.reduce((a, i) => a + i.cantidad, 0)} ítem(s)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
