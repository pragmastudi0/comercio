'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, RefreshCw } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';

/**
 * Modal con estadísticas básicas de un producto:
 *  - Última venta (fecha + cajero)
 *  - Cantidad vendida total en los últimos 90 días
 *  - Facturado en los últimos 90 días
 *  - Rotación (cantidad / día promedio)
 *  - Días desde la última venta
 *
 * Trae las ventas de los últimos 90 días y filtra en memoria por
 * producto_id. Si el dueño necesita un reporte más completo (top
 * fechas, rotación por mes, etc.) lo haremos en /reportes después.
 */
export function ModalEstadisticasProducto({
  open,
  onOpenChange,
  productoId,
  productoNombre,
  productoCodigo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
}) {
  const db = getDb();

  const desde = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const ventasQ = useQuery({
    queryKey: ['estad-producto-ventas', productoId, desde],
    queryFn: () => db.ventas.list({ desde }),
    enabled: open,
  });
  const empleadosQ = useQuery({
    queryKey: ['empleados'],
    queryFn: () => db.empleados.list(),
    enabled: open,
  });

  const datos = useMemo(() => {
    const ventas = (ventasQ.data ?? []).filter(
      (v) => v.estado === 'completada' && v.items.some((it) => it.producto_id === productoId),
    );
    let cantidadTotal = 0;
    let facturadoTotal = 0;
    let ventas7d = 0;
    let cantidad7d = 0;
    let ventas30d = 0;
    let cantidad30d = 0;
    let ultima: { fecha: string; empleado_id: string; cantidad: number } | null = null;
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);

    for (const v of ventas) {
      const items = v.items.filter((it) => it.producto_id === productoId);
      const cantEnVenta = items.reduce((a, it) => a + it.cantidad, 0);
      const factEnVenta = items.reduce(
        (a, it) => a + (it.subtotal ?? it.precio_unitario * it.cantidad),
        0,
      );
      cantidadTotal += cantEnVenta;
      facturadoTotal += factEnVenta;
      const fechaV = new Date(v.fecha);
      if (fechaV >= hace7) {
        ventas7d += 1;
        cantidad7d += cantEnVenta;
      }
      if (fechaV >= hace30) {
        ventas30d += 1;
        cantidad30d += cantEnVenta;
      }
      if (!ultima || fechaV > new Date(ultima.fecha)) {
        ultima = { fecha: v.fecha, empleado_id: v.empleado_id, cantidad: cantEnVenta };
      }
    }

    // Rotación: cantidad promedio por día en los últimos 30 días.
    const rotacion30d = cantidad30d / 30;

    const diasDesdeUltima = ultima
      ? Math.floor(
          (Date.now() - new Date(ultima.fecha).getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      ventas: ventas.length,
      cantidadTotal,
      facturadoTotal,
      ventas7d,
      cantidad7d,
      ventas30d,
      cantidad30d,
      rotacion30d,
      ultima,
      diasDesdeUltima,
    };
  }, [ventasQ.data, productoId]);

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-700" />
            Estadísticas del producto
            {ventasQ.isFetching && !ventasQ.isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="mb-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
        <div className="font-medium text-slate-800">{productoNombre}</div>
        <div className="font-mono text-xs text-slate-500">#{productoCodigo}</div>
      </div>

      {ventasQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : datos.ventas === 0 ? (
        <div className="rounded-md border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
          Este producto no se vendió en los últimos 90 días.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Última venta */}
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">
              Última venta
            </div>
            {datos.ultima ? (
              <>
                <div className="mt-1 text-base font-semibold text-emerald-900">
                  {new Date(datos.ultima.fecha).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-emerald-700">
                  Cajero: {empleadoNombre(datos.ultima.empleado_id)} ·{' '}
                  {datos.ultima.cantidad} u · hace{' '}
                  {datos.diasDesdeUltima === 0 ? 'menos de 1 día' : `${datos.diasDesdeUltima} día(s)`}
                </div>
              </>
            ) : (
              <div className="text-xs text-emerald-700">Sin ventas previas.</div>
            )}
          </div>

          {/* Rotación + totales */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Vendidos últimos 7 días" valor={datos.cantidad7d} sub={`${datos.ventas7d} venta(s)`} />
            <Stat label="Vendidos últimos 30 días" valor={datos.cantidad30d} sub={`${datos.ventas30d} venta(s)`} />
          </div>

          <div className="rounded-md border border-slate-300 bg-white p-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Rotación promedio (últimos 30 días)
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {datos.rotacion30d.toFixed(2)}{' '}
              <span className="text-xs font-normal text-muted-foreground">u/día</span>
            </div>
          </div>

          {/* Totales 90 días */}
          <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-300 bg-slate-50 p-2">
            <div className="text-center">
              <div className="text-[10px] uppercase text-muted-foreground">
                Cantidad vendida (90 días)
              </div>
              <div className="text-lg font-semibold tabular-nums text-slate-900">
                {datos.cantidadTotal}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase text-muted-foreground">
                Facturado (90 días)
              </div>
              <div className="text-lg font-semibold tabular-nums text-emerald-700">
                {formatCurrency(datos.facturadoTotal)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end border-t pt-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md border bg-background px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Cerrar
        </button>
      </div>
    </Dialog>
  );
}

function Stat({ label, valor, sub }: { label: string; valor: number; sub: string }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
