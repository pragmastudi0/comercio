'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Banknote,
  CreditCard,
  PiggyBank,
} from 'lucide-react';
import { BRAND } from '@comercio/business';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Skeleton } from '@comercio/ui/skeleton';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';

type Rango = 'hoy' | 'semana' | 'mes' | 'anio' | 'custom';

const LABEL_RANGO: Record<Rango, string> = {
  hoy: 'Hoy',
  semana: 'Últimos 7 días',
  mes: 'Este mes',
  anio: 'Este año',
  custom: 'Rango personalizado',
};

function calcularRango(rango: Rango, custom?: { desde: string; hasta: string }) {
  const ahora = new Date();
  let desde = new Date(ahora);
  desde.setHours(0, 0, 0, 0);
  let hasta = new Date(ahora);
  if (rango === 'semana') {
    desde.setDate(desde.getDate() - 6);
  } else if (rango === 'mes') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  } else if (rango === 'anio') {
    desde = new Date(ahora.getFullYear(), 0, 1);
  } else if (rango === 'custom' && custom?.desde && custom?.hasta) {
    desde = new Date(`${custom.desde}T00:00:00`);
    hasta = new Date(`${custom.hasta}T23:59:59`);
  }
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

function formatHoyAR(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const db = getDb();
  const [rango, setRango] = useState<Rango>('hoy');
  const [customDesde, setCustomDesde] = useState(formatHoyAR());
  const [customHasta, setCustomHasta] = useState(formatHoyAR());

  const { desde, hasta } = useMemo(
    () => calcularRango(rango, { desde: customDesde, hasta: customHasta }),
    [rango, customDesde, customHasta],
  );

  // Solo refrescar automáticamente cuando estamos viendo "hoy" — para el resto
  // es info estable.
  const refetchInterval = rango === 'hoy' ? 10_000 : false;

  const ventasQ = useQuery({
    queryKey: ['dashboard-ventas', desde, hasta],
    queryFn: () => db.ventas.list({ desde, hasta, estado: 'completada' }),
    refetchInterval,
  });
  const productosQ = useQuery({
    queryKey: ['dashboard-sin-stock'],
    queryFn: () => db.productos.list({ activo: true, sin_stock: true }),
  });
  const sesionesQ = useQuery({
    queryKey: ['dashboard-sesiones-abiertas'],
    queryFn: () => db.sesionesCaja.list(),
  });
  // Necesitamos el catálogo para calcular ganancia (precio - costo).
  const productosLookupQ = useQuery({
    queryKey: ['productos-list'],
    queryFn: () => db.productos.list(),
  });

  const ventasRango = ventasQ.data ?? [];
  const totalRango = ventasRango.reduce((acc, v) => acc + v.total, 0);
  const sesionesAbiertas = (sesionesQ.data ?? []).filter((s) => s.estado === 'abierta').length;

  // Indicadores financieros del día.
  const indicadores = useMemo(() => {
    const costoPorProducto = new Map<string, number>();
    for (const p of productosLookupQ.data ?? []) {
      costoPorProducto.set(p.id, p.costo);
    }
    let bruto = 0; // suma de subtotales (precio lista × cantidad)
    let ganancia = 0; // suma de (precio_unitario − costo) × cantidad
    let efectivo = 0;
    let otros = 0;
    for (const v of ventasRango) {
      bruto += v.subtotal;
      for (const it of v.items) {
        const costo = costoPorProducto.get(it.producto_id) ?? 0;
        ganancia += (it.precio_unitario - costo) * it.cantidad;
      }
      for (const p of v.pagos) {
        if (p.metodo === 'efectivo') efectivo += p.monto;
        else otros += p.monto;
      }
    }
    return { bruto, ganancia, efectivo, otros };
  }, [ventasRango, productosLookupQ.data]);

  // Top productos del día
  const topMap = new Map<string, { id: string; cantidad: number; monto: number }>();
  for (const v of ventasRango) {
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

  const nombreProd = (id: string) => {
    if (productosLookupQ.isLoading) return '…';
    const p = productosLookupQ.data?.find((x) => x.id === id);
    if (p) return p.nombre;
    // Producto borrado (la venta sigue en historial). Mostrar etiqueta clara
    // en vez del UUID crudo, conservando los primeros 8 chars para identificar.
    return `Producto eliminado (${id.slice(0, 8)}…)`;
  };

  const subRango = rango === 'hoy' ? 'Actualiza cada 10s' : LABEL_RANGO[rango];

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Hola, {BRAND.nombreCorto}</h1>
          <p className="text-sm text-muted-foreground">
            Resumen · {subRango.toLowerCase()}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/ventas">
            Ver ventas <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      {/* Selector de rango — define qué período toman las tarjetas financieras. */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {(['hoy', 'semana', 'mes', 'anio', 'custom'] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={rango === r ? 'default' : 'outline'}
            onClick={() => setRango(r)}
          >
            {LABEL_RANGO[r]}
          </Button>
        ))}
        {rango === 'custom' && (
          <div className="flex items-end gap-2 rounded-md border bg-card px-3 py-2">
            <div>
              <label className="block text-[10px] uppercase text-muted-foreground">
                Desde
              </label>
              <Input
                type="date"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                className="h-8 w-[150px] text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-muted-foreground">
                Hasta
              </label>
              <Input
                type="date"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                className="h-8 w-[150px] text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sección financiera del rango — los 4 números que más importan. */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/ventas" className="block">
          <KpiCard
            titulo={`Facturado ${LABEL_RANGO[rango].toLowerCase()}`}
            valor={formatCurrency(totalRango)}
            sub={`${ventasRango.length} tickets · ver historial`}
            icon={TrendingUp}
            loading={ventasQ.isLoading}
            destacado
          />
        </Link>
        <KpiCard
          titulo="Ganancia bruta"
          valor={formatCurrency(indicadores.ganancia)}
          sub={`Bruto (s/desc.): ${formatCurrency(indicadores.bruto)}`}
          icon={PiggyBank}
          loading={ventasQ.isLoading || productosLookupQ.isLoading}
        />
        <KpiCard
          titulo="Cobrado en efectivo"
          valor={formatCurrency(indicadores.efectivo)}
          sub={`${pctTexto(indicadores.efectivo, totalRango)} del total`}
          icon={Banknote}
          loading={ventasQ.isLoading}
        />
        <KpiCard
          titulo="Otros cobros"
          valor={formatCurrency(indicadores.otros)}
          sub="Tarjeta · QR · Transf."
          icon={CreditCard}
          loading={ventasQ.isLoading}
        />
      </div>

      {/* Sección operativa — alertas y estado de cajas. */}
      <div className="grid gap-4 sm:grid-cols-2">
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
            <CardTitle className="text-base">
              Top productos · {LABEL_RANGO[rango].toLowerCase()}
            </CardTitle>
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
            ) : ventasRango.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
            ) : (
              <div className="space-y-1">
                {[...ventasRango].reverse().slice(0, 8).map((v) => (
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

/** Devuelve un porcentaje legible (`45%`) o un guión si el total es 0. */
function pctTexto(parte: number, total: number): string {
  if (!total || total <= 0) return '—';
  return `${Math.round((parte / total) * 100)}%`;
}

function KpiCard({
  titulo,
  valor,
  sub,
  icon: Icon,
  loading,
  variant,
  destacado,
}: {
  titulo: string;
  valor: string;
  sub: string;
  icon: typeof TrendingUp;
  loading?: boolean;
  variant?: 'warn';
  /** Marca esta tarjeta como la más importante visualmente. */
  destacado?: boolean;
}) {
  return (
    <Card
      className={`h-full transition hover:border-foreground/30 ${
        destacado ? 'border-primary/30 bg-primary/5' : ''
      }`}
    >
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
          <div className={`font-bold tabular-nums ${destacado ? 'text-3xl' : 'text-2xl'}`}>
            {valor}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
