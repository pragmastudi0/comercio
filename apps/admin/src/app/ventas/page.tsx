'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
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

  let ventas = ventasQ.data ?? [];
  if (metodo) ventas = ventas.filter((v) => v.pagos.some((p) => p.metodo === metodo));

  const total = ventas
    .filter((v) => v.estado === 'completada')
    .reduce((acc, v) => acc + v.total, 0);

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const localNombre = (id: string) =>
    localesQ.data?.find((l) => l.id === id)?.nombre ?? '—';

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Ventas</h1>
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
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">
            {ventas.length} ventas · Total: {formatCurrency(total)}
          </CardTitle>
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...ventas].reverse().map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.numero}</TableCell>
                    <TableCell className="text-xs">{formatDate(v.fecha)}</TableCell>
                    <TableCell>{empleadoNombre(v.empleado_id)}</TableCell>
                    <TableCell>{localNombre(v.local_id)}</TableCell>
                    <TableCell>{v.items.reduce((a, i) => a + i.cantidad, 0)}</TableCell>
                    <TableCell className="text-xs">
                      {v.pagos.map((p) => LABEL_METODO[p.metodo]).join(' + ')}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(v.total)}
                    </TableCell>
                    <TableCell>
                      {v.estado === 'completada' ? (
                        <Badge variant="secondary">Completada</Badge>
                      ) : v.estado === 'anulada' ? (
                        <Badge variant="destructive">Anulada</Badge>
                      ) : (
                        <Badge>Presupuesto</Badge>
                      )}
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
