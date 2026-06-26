'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';

/**
 * Modal "Ganancias hoy" — vista rápida del día actual: facturado bruto,
 * ganancia (precio - costo), costos, margen %, y desglose por método de
 * pago (efectivo / otros). Refresca cada 30s mientras está abierto.
 *
 * Solo cuenta ventas en estado 'completada'. Las anuladas y presupuestos
 * no se contabilizan.
 */
export function ModalGananciasHoy({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const db = getDb();

  // Ventas desde 00:00 hoy.
  const desde = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const ventasQ = useQuery({
    queryKey: ['admin-ganancias-ventas-hoy', desde],
    queryFn: () => db.ventas.list({ desde }),
    refetchInterval: open ? 30_000 : false,
    enabled: open,
  });

  const productosQ = useQuery({
    queryKey: ['admin-ganancias-productos'],
    queryFn: () => db.productos.list(),
    enabled: open,
  });

  const datos = useMemo(() => {
    const ventas = (ventasQ.data ?? []).filter((v) => v.estado === 'completada');
    const costoPorProd = new Map<string, number>();
    for (const p of productosQ.data ?? []) costoPorProd.set(p.id, p.costo);

    let bruto = 0;
    let cobrado = 0;
    let ganancia = 0;
    let costoTotal = 0;
    let efectivo = 0;
    let otros = 0;
    for (const v of ventas) {
      bruto += v.subtotal;
      cobrado += v.total;
      for (const it of v.items) {
        const costo = costoPorProd.get(it.producto_id) ?? 0;
        ganancia += (it.precio_unitario - costo) * it.cantidad;
        costoTotal += costo * it.cantidad;
      }
      for (const p of v.pagos) {
        if (p.metodo === 'efectivo') efectivo += p.monto;
        else otros += p.monto;
      }
    }
    const margen = bruto > 0 ? (ganancia / bruto) * 100 : 0;
    return {
      tickets: ventas.length,
      bruto,
      cobrado,
      ganancia,
      costoTotal,
      margen,
      efectivo,
      otros,
    };
  }, [ventasQ.data, productosQ.data]);

  const cargando = ventasQ.isLoading || productosQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-700" />
            Ganancias del día
            {ventasQ.isFetching && !ventasQ.isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </span>
        </DialogTitle>
      </DialogHeader>

      {cargando ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-3">
          {/* KPI principal: ganancia */}
          <div className="rounded-md border bg-blue-50 p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-blue-700">
              Ganancia bruta de hoy
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-blue-900">
              {formatCurrency(Math.round(datos.ganancia))}
            </div>
            <div className="mt-1 text-xs text-blue-700">
              Margen {datos.margen.toFixed(1)}% sobre {formatCurrency(Math.round(datos.bruto))} facturado
              · {datos.tickets} {datos.tickets === 1 ? 'venta' : 'ventas'}
            </div>
          </div>

          {/* Desglose: bruto / costos / ganancia */}
          <div className="grid grid-cols-3 gap-2">
            <KpiBox label="Facturado bruto" valor={datos.bruto} colorAccento="text-foreground" />
            <KpiBox label="Costo mercadería" valor={datos.costoTotal} colorAccento="text-orange-700" />
            <KpiBox label="Cobrado total" valor={datos.cobrado} colorAccento="text-emerald-700" />
          </div>

          {/* Cobrado por tipo de pago */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Cobrado por tipo de pago
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border bg-background p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Efectivo</div>
                <div className="text-lg font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(datos.efectivo)}
                </div>
              </div>
              <div className="rounded border bg-background p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">
                  Otros (débito, crédito, QR, etc.)
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatCurrency(datos.otros)}
                </div>
              </div>
            </div>
          </div>

          {datos.tickets === 0 && (
            <div className="rounded-md border bg-muted/30 py-4 text-center text-sm text-muted-foreground">
              Todavía no hay ventas hoy.
            </div>
          )}
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

function KpiBox({
  label,
  valor,
  colorAccento,
}: {
  label: string;
  valor: number;
  colorAccento: string;
}) {
  return (
    <div className="rounded-md border bg-card p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${colorAccento}`}>
        {formatCurrency(Math.round(valor))}
      </div>
    </div>
  );
}
