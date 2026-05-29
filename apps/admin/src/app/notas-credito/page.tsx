'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Receipt, Search } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { Badge } from '@comercio/ui/badge';
import { formatCurrency, formatDate } from '@comercio/ui/utils';

export default function NotasCreditoPage() {
  const db = getDb();
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace30 = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  const [empleadoId, setEmpleadoId] = useState('');
  const [texto, setTexto] = useState('');

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
  const visiblesOrdenadas = [...visibles].reverse();
  const totalDevuelto = visibles.reduce((acc, n) => acc + n.monto_total, 0);

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Notas de crédito</h1>
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
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblesOrdenadas.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">{n.numero}</TableCell>
                    <TableCell>
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
                    <TableCell className="max-w-xs truncate text-sm">{n.motivo}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(n.monto_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
