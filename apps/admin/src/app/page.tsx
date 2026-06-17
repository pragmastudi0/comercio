'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { BRAND } from '@comercio/business';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Skeleton } from '@comercio/ui/skeleton';
import { Button } from '@comercio/ui/button';
import { formatCurrency } from '@comercio/ui/utils';

export default function DashboardPage() {
  const db = getDb();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const desde = hoy.toISOString();

  const ventasQ = useQuery({
    queryKey: ['dashboard-ventas-hoy'],
    queryFn: () => db.ventas.list({ desde, estado: 'completada' }),
    refetchInterval: 10_000,
  });
  const productosQ = useQuery({
    queryKey: ['dashboard-sin-stock'],
    queryFn: () => db.productos.list({ activo: true, sin_stock: true }),
  });
  const sesionesQ = useQuery({
    queryKey: ['dashboard-sesiones-abiertas'],
    queryFn: () => db.sesionesCaja.list(),
  });

  const ventasHoy = ventasQ.data ?? [];
  const totalHoy = ventasHoy.reduce((acc, v) => acc + v.total, 0);
  const sesionesAbiertas = (sesionesQ.data ?? []).filter((s) => s.estado === 'abierta').length;

  // Top productos del día
  const topMap = new Map<string, { id: string; cantidad: number; monto: number }>();
  for (const v of ventasHoy) {
    for (const it of v.items) {
      const prev = topMap.get(it.producto_id) ?? { id: it.producto_id, cantidad: 0, monto: 0 };
      prev.cantidad += it.cantidad;
      prev.monto += it.subtotal;
      topMap.set(it.producto_id, prev);
    }
  }
  const topProductos = Array.from(topMap.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  const productosLookupQ = useQuery({
    queryKey: ['productos-list'],
    queryFn: () => db.productos.list(),
  });
  const nombreProd = (id: string) => {
    if (productosLookupQ.isLoading) return '…';
    const p = productosLookupQ.data?.find((x) => x.id === id);
    if (p) return p.nombre;
    // Producto borrado (la venta sigue en historial). Mostrar etiqueta clara
    // en vez del UUID crudo, conservando los primeros 8 chars para identificar.
    return `Producto eliminado (${id.slice(0, 8)}…)`;
  };

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Hola, {BRAND.nombreCorto}</h1>
          <p className="text-sm text-muted-foreground">
            Resumen del día · actualiza cada 10s
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/ventas">
            Ver ventas <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/ventas" className="block">
          <KpiCard
            titulo="Ventas hoy"
            valor={formatCurrency(totalHoy)}
            sub={`${ventasHoy.length} tickets · ver historial`}
            icon={TrendingUp}
            loading={ventasQ.isLoading}
          />
        </Link>
        <Link href="/caja" className="block">
          <KpiCard
            titulo="Cajas abiertas"
            valor={String(sesionesAbiertas)}
            sub="Sesiones en curso · ver detalle"
            icon={Wallet}
            loading={sesionesQ.isLoading}
          />
        </Link>
        <Link href="/productos?stock=sin" className="block">
          <KpiCard
            titulo="Sin stock"
            valor={String(productosQ.data?.length ?? 0)}
            sub="Click para ver el listado"
            icon={AlertTriangle}
            loading={productosQ.isLoading}
            variant={productosQ.data && productosQ.data.length > 0 ? 'warn' : undefined}
          />
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top productos del día</CardTitle>
          </CardHeader>
          <CardContent>
            {ventasQ.isLoading ? (
              <Skeleton className="h-40" />
            ) : topProductos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
            ) : (
              <div className="space-y-2">
                {topProductos.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">#{i + 1}</span>
                      <span>{nombreProd(t.id)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {t.cantidad} u · {formatCurrency(t.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas ventas</CardTitle>
          </CardHeader>
          <CardContent>
            {ventasQ.isLoading ? (
              <Skeleton className="h-40" />
            ) : ventasHoy.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
            ) : (
              <div className="space-y-1">
                {[...ventasHoy].reverse().slice(0, 8).map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{v.numero}</span>
                    <span className="tabular-nums">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  sub,
  icon: Icon,
  loading,
  variant,
}: {
  titulo: string;
  valor: string;
  sub: string;
  icon: typeof TrendingUp;
  loading?: boolean;
  variant?: 'warn';
}) {
  return (
    <Card className="h-full transition hover:border-foreground/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
          <Icon
            className={`h-4 w-4 ${variant === 'warn' ? 'text-orange-500' : 'text-muted-foreground'}`}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-bold tabular-nums">{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
