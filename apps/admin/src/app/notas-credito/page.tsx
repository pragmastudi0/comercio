'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Eye, Receipt, Search } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { Badge } from '@comercio/ui/badge';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@comercio/ui/dialog';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import type { NotaCredito } from '@comercio/db';

export default function NotasCreditoPage() {
  const db = getDb();
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace30 = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  const [empleadoId, setEmpleadoId] = useState('');
  const [texto, setTexto] = useState('');
  // NC seleccionada para ver el detalle en el popup.
  const [ncDetalle, setNcDetalle] = useState<NotaCredito | null>(null);
  // Orden por fecha. Default: más nueva arriba (mismo patrón que /ventas).
  const [ordenDesc, setOrdenDesc] = useState(true);

  const notasQ = useQuery({
    queryKey: ['notas-credito-admin', desde, hasta],
    queryFn: () =>
      db.notasCredito.list({
        desde: new Date(`${desde}T00:00:00`).toISOString(),
        hasta: new Date(`${hasta}T23:59:59`).toISOString(),
      }),
  });
  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const ventasQ = useQuery({
    queryKey: ['ventas-todas-nc'],
    queryFn: () => db.ventas.list(),
  });
  // Catálogo para resolver nombre de cada producto en el detalle.
  const productosQ = useQuery({
    queryKey: ['productos-list'],
    queryFn: () => db.productos.list(),
    enabled: !!ncDetalle,
  });

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const ventaNumero = (id: string) =>
    ventasQ.data?.find((v) => v.id === id)?.numero ?? id.slice(-6);

  let visibles = notasQ.data ?? [];
  if (empleadoId) visibles = visibles.filter((n) => n.empleado_id === empleadoId);
  if (texto) {
    const q = texto.toLowerCase();
    visibles = visibles.filter(
      (n) =>
        n.numero.toLowerCase().includes(q) ||
        n.motivo.toLowerCase().includes(q) ||
        ventaNumero(n.venta_id).toLowerCase().includes(q),
    );
  }
  // Ordenamos por fecha según el toggle. localeCompare sobre ISO strings
  // es seguro (lexicográfico = cronológico).
  const visiblesOrdenadas = [...visibles].sort((a, b) => {
    const cmp = a.fecha.localeCompare(b.fecha);
    return ordenDesc ? -cmp : cmp;
  });
  const totalDevuelto = visibles.reduce((acc, n) => acc + n.monto_total, 0);

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Notas de crédito</h1>
        <p className="text-sm text-muted-foreground">
          Devoluciones emitidas desde el PoS. Cada nota reintegra el stock al depósito de
          origen y deja registro del motivo.
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-4 md:grid-cols-4">
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
            <Label className="mb-1 block text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="N° NC, venta o motivo"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {visibles.length} nota(s) · Total devuelto: {formatCurrency(totalDevuelto)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notasQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : visibles.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Receipt className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No hay notas de crédito en el rango seleccionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° NC</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => setOrdenDesc((v) => !v)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      title={
                        ordenDesc
                          ? 'Más nueva arriba (click para invertir)'
                          : 'Más vieja arriba (click para invertir)'
                      }
                    >
                      Fecha
                      {ordenDesc ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblesOrdenadas.map((n) => (
                  <TableRow
                    key={n.id}
                    onClick={() => setNcDetalle(n)}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell className="font-mono text-xs">{n.numero}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/ventas?q=${ventaNumero(n.venta_id)}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {ventaNumero(n.venta_id)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(n.fecha)}</TableCell>
                    <TableCell>{empleadoNombre(n.empleado_id)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {n.items.reduce((acc, i) => acc + i.cantidad, 0)} u
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(n.monto_total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver detalle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNcDetalle(n);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detalle de NC en popup */}
      <Dialog
        open={!!ncDetalle}
        onOpenChange={(v) => !v && setNcDetalle(null)}
        className="max-w-2xl"
      >
        {ncDetalle && (
          <DetalleNotaCredito
            nc={ncDetalle}
            ventaNumero={ventaNumero(ncDetalle.venta_id)}
            empleadoNombre={empleadoNombre(ncDetalle.empleado_id)}
            productosCache={productosQ.data ?? []}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setNcDetalle(null)}>
            Cerrar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function DetalleNotaCredito({
  nc,
  ventaNumero,
  empleadoNombre,
  productosCache,
}: {
  nc: NotaCredito;
  ventaNumero: string;
  empleadoNombre: string;
  productosCache: { id: string; codigo_interno: string; nombre: string }[];
}) {
  const productoInfo = (id: string) =>
    productosCache.find((p) => p.id === id);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Nota de crédito {nc.numero} ·{' '}
          <span className="text-muted-foreground">{formatDate(nc.fecha)}</span>
        </DialogTitle>
      </DialogHeader>

      {/* Cabecera */}
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Venta original</div>
          <div className="font-medium">
            <Link
              href={`/ventas?q=${ventaNumero}`}
              className="font-mono hover:underline"
            >
              {ventaNumero}
            </Link>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Emitida por</div>
          <div className="font-medium">{empleadoNombre}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground">Motivo</div>
          <div className="font-medium">{nc.motivo || '—'}</div>
        </div>
      </div>

      {/* Items devueltos */}
      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">Productos devueltos</div>
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
              {nc.items.map((it, i) => {
                const p = productoInfo(it.producto_id);
                const subtotal = it.cantidad * it.precio_unitario;
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
                      {formatCurrency(subtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total */}
      <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between text-base font-semibold">
          <span>Total devuelto</span>
          <span className="tabular-nums text-green-700">
            {formatCurrency(nc.monto_total)}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          El stock de estos productos volvió al depósito de la venta original.
        </p>
      </div>
    </>
  );
}
