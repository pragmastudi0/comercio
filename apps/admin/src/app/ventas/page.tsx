'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, Printer, Eye } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@comercio/ui/dialog';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import type { MetodoPago, Venta } from '@comercio/db';

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
  // Venta seleccionada para ver el detalle en el popup.
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null);

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
  // Cargado al hacer click en una venta (lazy) para mostrar productos por nombre.
  const productosQ = useQuery({
    queryKey: ['productos-all'],
    queryFn: () => db.productos.list(),
    enabled: !!ventaDetalle,
  });

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
                {[...ventas].reverse().flatMap((v) => {
                  const anulada = v.estado === 'anulada';
                  const rows = [
                  <TableRow
                    key={v.id}
                    onClick={() => setVentaDetalle(v)}
                    className={`cursor-pointer ${
                      anulada
                        ? 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    <TableCell className="font-mono text-xs">{v.numero}</TableCell>
                    <TableCell className="text-xs">{formatDate(v.fecha)}</TableCell>
                    <TableCell>{empleadoNombre(v.empleado_id)}</TableCell>
                    <TableCell>{localNombre(v.local_id)}</TableCell>
                    <TableCell>{v.items.reduce((a, i) => a + i.cantidad, 0)}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const ms = Array.from(new Set(v.pagos.map((p) => p.metodo)));
                        // Compacto: si es un solo método, mostramos el nombre;
                        // si es mixto, solo "Mixto" sin el desglose (el detalle
                        // se ve al hacer click en la venta).
                        return ms.length > 1 ? (
                          <span className="font-medium">Mixto</span>
                        ) : (
                          LABEL_METODO[ms[0]!]
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(v.descuento_total ?? 0) > 0 ? (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-medium tabular-nums text-green-700">
                            -{formatCurrency(v.descuento_total)}
                          </span>
                          {descuentoPorVenta.get(v.id)?.motivo && (
                            <span
                              className="max-w-[140px] truncate text-[11px] text-muted-foreground"
                              title={descuentoPorVenta.get(v.id)!.motivo!}
                            >
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
                    <TableCell>
                      {anulada ? (
                        <Badge variant="destructive">Anulada</Badge>
                      ) : v.estado === 'completada' ? (
                        <Badge variant="secondary">Completada</Badge>
                      ) : (
                        <Badge>Presupuesto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVentaDetalle(v);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          title="Ver / imprimir ticket"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/ventas/${v.id}/ticket`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ];
                  // El motivo de anulación (y autor/fecha) se muestra ahora
                  // SOLO en el popup de detalle. La tabla queda compacta
                  // y prolija sin filas secundarias.
                  return rows;
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detalle de venta en popup. */}
      <Dialog
        open={!!ventaDetalle}
        onOpenChange={(v) => !v && setVentaDetalle(null)}
        className="max-w-2xl"
      >
        {ventaDetalle && (
          <DetalleVenta
            venta={ventaDetalle}
            empleadoNombre={empleadoNombre}
            localNombre={localNombre}
            motivoDescuento={descuentoPorVenta.get(ventaDetalle.id)?.motivo ?? null}
            productosCache={productosQ.data ?? []}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setVentaDetalle(null)}>
            Cerrar
          </Button>
          {ventaDetalle && (
            <Button asChild>
              <Link href={`/ventas/${ventaDetalle.id}/ticket`}>
                <Printer className="mr-1 h-4 w-4" />
                Ver ticket impreso
              </Link>
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function DetalleVenta({
  venta,
  empleadoNombre,
  localNombre,
  motivoDescuento,
  productosCache,
}: {
  venta: Venta;
  empleadoNombre: (id: string) => string;
  localNombre: (id: string) => string;
  motivoDescuento: string | null;
  productosCache: { id: string; codigo_interno: string; nombre: string }[];
}) {
  const productoInfo = (id: string) =>
    productosCache.find((p) => p.id === id);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Venta {venta.numero} ·{' '}
          <span className="text-muted-foreground">{formatDate(venta.fecha)}</span>
        </DialogTitle>
      </DialogHeader>

      {/* Cabecera de la venta */}
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Cajero</div>
          <div className="font-medium">{empleadoNombre(venta.empleado_id)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Local</div>
          <div className="font-medium">{localNombre(venta.local_id)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Estado</div>
          <div className="font-medium">
            {venta.estado === 'anulada' ? (
              <Badge variant="destructive">Anulada</Badge>
            ) : venta.estado === 'completada' ? (
              <Badge variant="secondary">Completada</Badge>
            ) : (
              <Badge>Presupuesto</Badge>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Items</div>
          <div className="font-medium">
            {venta.items.reduce((a, i) => a + i.cantidad, 0)} unidad(es)
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">Productos vendidos</div>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Código</th>
                <th className="px-2 py-1.5 text-left">Producto</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-right">Precio</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((it, i) => {
                const p = productoInfo(it.producto_id);
                return (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {p?.codigo_interno ?? '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      {p?.nombre ?? (
                        <span className="text-xs text-muted-foreground">
                          Producto eliminado
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {it.cantidad}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(it.precio_unitario)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(it.subtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cómo se cobró */}
      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">Forma de cobro</div>
        <div className="rounded-md border">
          {venta.pagos.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-t px-3 py-2 text-sm first:border-t-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {LABEL_METODO[p.metodo] ?? p.metodo}
                </span>
                {p.cuotas && (
                  <span className="text-xs text-muted-foreground">
                    en {p.cuotas} cuota(s)
                  </span>
                )}
                {p.recargo_pct ? (
                  <span className="text-xs text-orange-700">
                    +{p.recargo_pct}% recargo
                  </span>
                ) : null}
              </div>
              <span className="font-medium tabular-nums">
                {formatCurrency(p.monto)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(venta.subtotal)}</span>
        </div>
        {(venta.descuento_total ?? 0) > 0 && (
          <div className="flex justify-between text-green-700">
            <span>
              Descuento
              {motivoDescuento && (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {motivoDescuento}
                </span>
              )}
            </span>
            <span className="tabular-nums">
              -{formatCurrency(venta.descuento_total)}
            </span>
          </div>
        )}
        {(venta.recargo_total ?? 0) > 0 && (
          <div className="flex justify-between text-orange-700">
            <span>Recargo (cuotas)</span>
            <span className="tabular-nums">
              +{formatCurrency(venta.recargo_total)}
            </span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t pt-1 text-base font-semibold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatCurrency(venta.total)}</span>
        </div>
      </div>

      {/* Anulación, si aplica */}
      {venta.estado === 'anulada' && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Esta venta fue anulada</div>
          {venta.motivo_anulacion && (
            <div className="mt-1">
              <span className="text-xs">Motivo:</span> {venta.motivo_anulacion}
            </div>
          )}
          <div className="mt-1 text-xs text-red-700">
            {venta.anulada_por && `Por ${empleadoNombre(venta.anulada_por)}`}
            {venta.anulada_en && ` · ${formatDate(venta.anulada_en)}`}
          </div>
        </div>
      )}
    </>
  );
}
