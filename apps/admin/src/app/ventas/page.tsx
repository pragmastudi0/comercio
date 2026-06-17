'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, Printer } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import type { MetodoPago } from '@comercio/db';

const LABEL_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cta_cte: 'Cta corriente',
};

export default function VentasPage() {
  const db = getDb();
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace7 = format(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);
  const [empleadoId, setEmpleadoId] = useState<string>('');
  const [localId, setLocalId] = useState<string>('');
  const [metodo, setMetodo] = useState<string>('');

  const ventasQ = useQuery({
    queryKey: ['ventas-admin', desde, hasta, empleadoId, localId],
    queryFn: () =>
      db.ventas.list({
        desde: new Date(`${desde}T00:00:00`).toISOString(),
        hasta: new Date(`${hasta}T23:59:59`).toISOString(),
        empleado_id: empleadoId || undefined,
        local_id: localId || undefined,
      }),
  });
  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const localesQ = useQuery({ queryKey: ['locales'], queryFn: () => db.locales.list() });

  // Logs de descuento manual del rango. El motivo del descuento global se
  // guarda en auditoría (no como columna de la venta), así que cruzamos
  // venta_id → motivo desde acá. Es 1 query extra por rango.
  const descuentosQ = useQuery({
    queryKey: ['ventas-admin-descuentos', desde, hasta],
    queryFn: () =>
      db.auditoria.list({
        entidad: 'venta',
        desde: new Date(`${desde}T00:00:00`).toISOString(),
        hasta: new Date(`${hasta}T23:59:59`).toISOString(),
      }),
  });
  // Map ventaId → { motivo, monto } (solo entries de descuento_manual).
  const descuentoPorVenta = (() => {
    const map = new Map<string, { motivo: string | null; monto: number }>();
    for (const log of descuentosQ.data ?? []) {
      if (log.accion !== 'descuento_manual' || !log.entidad_id) continue;
      const d = log.detalle ?? {};
      map.set(log.entidad_id, {
        motivo: (d.motivo as string | null) ?? null,
        monto: typeof d.monto === 'number' ? d.monto : 0,
      });
    }
    return map;
  })();

  let ventas = ventasQ.data ?? [];
  if (metodo) ventas = ventas.filter((v) => v.pagos.some((p) => p.metodo === metodo));

  const total = ventas
    .filter((v) => v.estado === 'completada')
    .reduce((acc, v) => acc + v.total, 0);
  // KPI rápido de descuentos en el rango filtrado.
  const ventasConDescuento = ventas.filter(
    (v) => v.estado === 'completada' && (v.descuento_total ?? 0) > 0,
  );
  const totalDescuentos = ventasConDescuento.reduce(
    (acc, v) => acc + (v.descuento_total ?? 0),
    0,
  );
  // KPI rápido de anulaciones en el rango filtrado.
  const ventasAnuladas = ventas.filter((v) => v.estado === 'anulada');
  const totalAnulado = ventasAnuladas.reduce((acc, v) => acc + v.total, 0);

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const localNombre = (id: string) =>
    localesQ.data?.find((l) => l.id === id)?.nombre ?? '—';

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Ventas</h1>
        <p className="text-sm text-muted-foreground">Historial de ventas con filtros.</p>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <Label className="mb-1 block text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Cajero</Label>
              <select
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {(empleadosQ.data ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre} {emp.apellido}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Local</Label>
              <select
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {(localesQ.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Método de pago</Label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {Object.entries(LABEL_METODO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-2 pb-3 sm:flex-row sm:items-center">
          <CardTitle className="text-sm">
            {ventas.length} ventas · Total: {formatCurrency(total)}
          </CardTitle>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
            {ventasConDescuento.length > 0 && (
              <span>
                {ventasConDescuento.length} con descuento ·{' '}
                <span className="text-green-700">
                  -{formatCurrency(totalDescuentos)}
                </span>
              </span>
            )}
            {ventasAnuladas.length > 0 && (
              <span>
                {ventasAnuladas.length} anulada(s) ·{' '}
                <span className="text-red-700">
                  -{formatCurrency(totalAnulado)}
                </span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ventasQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : ventas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No hay ventas en el rango seleccionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Métodos</TableHead>
                  <TableHead className="text-right">Descuento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...ventas].reverse().map((v) => {
                  const anulada = v.estado === 'anulada';
                  return (
                  <TableRow
                    key={v.id}
                    className={
                      anulada
                        ? 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20'
                        : ''
                    }
                  >
                    <TableCell className="font-mono text-xs">{v.numero}</TableCell>
                    <TableCell className="text-xs">{formatDate(v.fecha)}</TableCell>
                    <TableCell>{empleadoNombre(v.empleado_id)}</TableCell>
                    <TableCell>{localNombre(v.local_id)}</TableCell>
                    <TableCell>{v.items.reduce((a, i) => a + i.cantidad, 0)}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const ms = Array.from(new Set(v.pagos.map((p) => p.metodo)));
                        const labels = ms.map((m) => LABEL_METODO[m]).join(' + ');
                        return ms.length > 1 ? (
                          <span>
                            <span className="font-medium">Mixto</span>
                            <span className="text-muted-foreground"> · {labels}</span>
                          </span>
                        ) : (
                          labels
                        );
                      })()}
                    </TableCell>
                    <TableCell className="min-w-[160px] whitespace-normal text-right">
                      {(v.descuento_total ?? 0) > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-medium tabular-nums text-green-700">
                            -{formatCurrency(v.descuento_total)}
                          </span>
                          {descuentoPorVenta.get(v.id)?.motivo && (
                            <span className="break-words text-right text-[11px] leading-snug text-muted-foreground">
                              {descuentoPorVenta.get(v.id)!.motivo}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        anulada ? 'text-red-700 line-through' : ''
                      }`}
                    >
                      {formatCurrency(v.total)}
                    </TableCell>
                    <TableCell className="min-w-[220px] whitespace-normal">
                      {anulada ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="destructive">Anulada</Badge>
                          {v.motivo_anulacion && (
                            <span className="break-words text-[11px] leading-snug text-red-700">
                              {v.motivo_anulacion}
                            </span>
                          )}
                          {(v.anulada_por || v.anulada_en) && (
                            <span className="text-[10px] leading-snug text-muted-foreground">
                              {v.anulada_por
                                ? `Por ${empleadoNombre(v.anulada_por)}`
                                : ''}
                              {v.anulada_en
                                ? `${v.anulada_por ? ' · ' : ''}${formatDate(v.anulada_en)}`
                                : ''}
                            </span>
                          )}
                        </div>
                      ) : v.estado === 'completada' ? (
                        <Badge variant="secondary">Completada</Badge>
                      ) : (
                        <Badge>Presupuesto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title="Ver / imprimir ticket"
                      >
                        <Link href={`/ventas/${v.id}/ticket`}>
                          <Printer className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
