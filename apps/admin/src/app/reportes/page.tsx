'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import type { MetodoPago } from '@comercio/db';

const METODOS: MetodoPago[] = ['efectivo', 'transferencia', 'debito', 'credito', 'qr', 'cta_cte'];
const LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transf.',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cta_cte: 'Cta cte',
};

export default function ReportesPage() {
  const db = getDb();
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace7 = format(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);

  const ventasQ = useQuery({
    queryKey: ['reportes-ventas', desde, hasta],
    queryFn: () =>
      db.ventas.list({
        desde: new Date(`${desde}T00:00:00`).toISOString(),
        hasta: new Date(`${hasta}T23:59:59`).toISOString(),
        estado: 'completada',
      }),
  });
  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const localesQ = useQuery({ queryKey: ['locales'], queryFn: () => db.locales.list() });

  const ventas = ventasQ.data ?? [];
  const totalRango = ventas.reduce((acc, v) => acc + v.total, 0);
  const cantidadRango = ventas.length;

  // Totales por método (suma del monto de cada pago)
  const totalesMetodo = METODOS.reduce(
    (acc, m) => ({ ...acc, [m]: 0 }),
    {} as Record<MetodoPago, number>,
  );
  for (const v of ventas) {
    for (const p of v.pagos) totalesMetodo[p.metodo] += p.monto;
  }

  // Por cajero
  const porCajero = new Map<string, { ventas: number; total: number }>();
  for (const v of ventas) {
    const prev = porCajero.get(v.empleado_id) ?? { ventas: 0, total: 0 };
    prev.ventas += 1;
    prev.total += v.total;
    porCajero.set(v.empleado_id, prev);
  }
  const rankingCajeros = [...porCajero.entries()].sort((a, b) => b[1].total - a[1].total);

  // Por local
  const porLocal = new Map<string, { ventas: number; total: number }>();
  for (const v of ventas) {
    const prev = porLocal.get(v.local_id) ?? { ventas: 0, total: 0 };
    prev.ventas += 1;
    prev.total += v.total;
    porLocal.set(v.local_id, prev);
  }
  const rankingLocales = [...porLocal.entries()].sort((a, b) => b[1].total - a[1].total);

  // Ventas por día (línea simple)
  const porDia = new Map<string, number>();
  for (const v of ventas) {
    const dia = v.fecha.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + v.total);
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const maxDia = Math.max(0.01, ...dias.map(([, v]) => v));

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const localNombre = (id: string) =>
    localesQ.data?.find((l) => l.id === id)?.nombre ?? '—';

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">Datos del período seleccionado.</p>
      </div>

      <Card className="mb-4">
        <CardContent className="flex items-end gap-3 pt-4">
          <div>
            <Label className="mb-1 block text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {ventasQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              titulo="Total facturado"
              valor={formatCurrency(totalRango)}
              icon={TrendingUp}
            />
            <KpiCard titulo="Tickets" valor={String(cantidadRango)} icon={BarChart3} />
            <KpiCard
              titulo="Ticket promedio"
              valor={formatCurrency(cantidadRango > 0 ? totalRango / cantidadRango : 0)}
              icon={Users}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas por día</CardTitle>
              </CardHeader>
              <CardContent>
                {dias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin ventas en el rango.</p>
                ) : (
                  <div className="space-y-2">
                    {dias.map(([d, v]) => (
                      <div key={d} className="flex items-center gap-2 text-sm">
                        <span className="w-24 font-mono text-xs text-muted-foreground">{d}</span>
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${(v / maxDia) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 text-right tabular-nums">{formatCurrency(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por método de pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {METODOS.map((m) => (
                    <div key={m} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{LABEL[m]}</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(totalesMetodo[m])}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking por cajero</CardTitle>
              </CardHeader>
              <CardContent>
                {rankingCajeros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <div className="space-y-2">
                    {rankingCajeros.map(([id, st], i) => (
                      <div key={id} className="flex items-center justify-between text-sm">
                        <span>
                          <span className="font-mono text-xs text-muted-foreground">
                            #{i + 1}
                          </span>{' '}
                          {empleadoNombre(id)}
                        </span>
                        <span className="text-muted-foreground">
                          {st.ventas} ventas ·{' '}
                          <span className="font-medium tabular-nums">
                            {formatCurrency(st.total)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por local</CardTitle>
              </CardHeader>
              <CardContent>
                {rankingLocales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <div className="space-y-2">
                    {rankingLocales.map(([id, st]) => (
                      <div key={id} className="flex items-center justify-between text-sm">
                        <span>{localNombre(id)}</span>
                        <span className="text-muted-foreground">
                          {st.ventas} ventas ·{' '}
                          <span className="font-medium tabular-nums">
                            {formatCurrency(st.total)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  icon: Icon,
}: {
  titulo: string;
  valor: string;
  icon: typeof TrendingUp;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{valor}</div>
      </CardContent>
    </Card>
  );
}
