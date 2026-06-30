'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeftRight, RefreshCw, Search } from 'lucide-react';
import { getDb } from '@/lib/db';
import { PaginaProtegida } from '@/lib/permisos';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';

const LABEL_TIPO: Record<string, string> = {
  venta: 'Venta',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  merma: 'Merma',
  transferencia_salida: 'Transferencia salida',
  transferencia_entrada: 'Transferencia entrada',
};

function formatHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MovimientosStockInner() {
  const db = getDb();
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace7 = format(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState<string>('');
  const [empleadoId, setEmpleadoId] = useState<string>('');
  const [depositoId, setDepositoId] = useState<string>('');
  const [texto, setTexto] = useState<string>('');

  const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
  const hastaIso = new Date(`${hasta}T23:59:59`).toISOString();

  const movsQ = useQuery({
    queryKey: ['admin-movs-stock', desdeIso, hastaIso, depositoId],
    queryFn: () =>
      db.stock.movimientos({
        desde: desdeIso,
        hasta: hastaIso,
        deposito_id: depositoId || undefined,
      }),
    refetchInterval: 30_000,
  });
  const productosQ = useQuery({
    queryKey: ['productos-admin-list'],
    queryFn: () => db.productos.list(),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
  });
  const empleadosQ = useQuery({
    queryKey: ['empleados'],
    queryFn: () => db.empleados.list(),
  });

  const prodPorId = useMemo(() => {
    const m = new Map(productosQ.data?.map((p) => [p.id, p]) ?? []);
    return m;
  }, [productosQ.data]);
  const depPorId = useMemo(() => {
    const m = new Map(depositosQ.data?.map((d) => [d.id, d]) ?? []);
    return m;
  }, [depositosQ.data]);
  const empPorId = useMemo(() => {
    const m = new Map(empleadosQ.data?.map((e) => [e.id, e]) ?? []);
    return m;
  }, [empleadosQ.data]);

  // Filtrado client-side: tipo, empleado, texto (código o nombre)
  const movsFiltrados = useMemo(() => {
    let movs = movsQ.data ?? [];
    if (tipo === 'transferencia') {
      movs = movs.filter(
        (m) => m.tipo === 'transferencia_salida' || m.tipo === 'transferencia_entrada',
      );
    } else if (tipo) {
      movs = movs.filter((m) => m.tipo === tipo);
    }
    if (empleadoId) movs = movs.filter((m) => m.empleado_id === empleadoId);
    if (texto.trim()) {
      const q = texto.trim().toLowerCase();
      const esNumerico = /^\d+$/.test(q);
      movs = movs.filter((m) => {
        const p = prodPorId.get(m.producto_id);
        if (!p) return false;
        if (esNumerico) return p.codigo_interno === q;
        return p.nombre.toLowerCase().includes(q);
      });
    }
    // Más nuevos arriba
    return [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [movsQ.data, tipo, empleadoId, texto, prodPorId]);

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
            Movimientos de stock
          </h1>
          <p className="text-sm text-muted-foreground">
            Quién movió qué, cuánto, de dónde a dónde y cuándo. Refresca cada 30s.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => movsQ.refetch()}
          disabled={movsQ.isFetching}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${movsQ.isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label className="mb-1 block text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Tipo</Label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="transferencia">Solo transferencias</option>
                <option value="ajuste">Ajustes</option>
                <option value="merma">Mermas</option>
                <option value="venta">Ventas (descuento)</option>
                <option value="devolucion">Devoluciones</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Local / depósito</Label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {(depositosQ.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Empleado</Label>
              <select
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {(empleadosQ.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} {e.apellido ?? ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Producto</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Código o nombre"
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {movsQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {movsFiltrados.length} movimientos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {movsFiltrados.length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                No hay movimientos con esos filtros.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-left">Local</th>
                      <th className="px-3 py-2 text-left">Empleado</th>
                      <th className="px-3 py-2 text-left">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movsFiltrados.map((m) => {
                      const prod = prodPorId.get(m.producto_id);
                      const dep = depPorId.get(m.deposito_id);
                      const emp = empPorId.get(m.empleado_id);
                      const empNombre = emp
                        ? `${emp.nombre} ${emp.apellido ?? ''}`.trim()
                        : '—';
                      const esAnulacion =
                        m.motivo?.startsWith('Anulación de transferencia ') ?? false;
                      return (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-accent/40">
                          <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                            {formatHora(m.fecha)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={
                                m.tipo === 'transferencia_salida'
                                  ? 'border-orange-300 text-orange-700'
                                  : m.tipo === 'transferencia_entrada'
                                    ? 'border-green-300 text-green-700'
                                    : m.tipo === 'venta'
                                      ? 'border-blue-300 text-blue-700'
                                      : m.tipo === 'merma'
                                        ? 'border-red-300 text-red-700'
                                        : ''
                              }
                            >
                              {LABEL_TIPO[m.tipo] ?? m.tipo}
                            </Badge>
                            {esAnulacion && (
                              <Badge variant="outline" className="ml-1 border-amber-300 text-amber-700">
                                Anulación
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {prod?.codigo_interno ?? '—'}
                          </td>
                          <td className="px-3 py-2">{prod?.nombre ?? 'Producto borrado'}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {m.cantidad}
                          </td>
                          <td className="px-3 py-2 text-xs">{dep?.nombre ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{empNombre}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {m.motivo ?? ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MovimientosStockPage() {
  return (
    <PaginaProtegida modulo="stock" accion="ver_propio_deposito">
      <MovimientosStockInner />
    </PaginaProtegida>
  );
}
