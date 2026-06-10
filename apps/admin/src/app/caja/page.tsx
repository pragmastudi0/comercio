'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Wallet, LockOpen, Lock } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import type { MetodoPago, MovimientoCaja } from '@comercio/db';

const METODOS: MetodoPago[] = ['efectivo', 'transferencia', 'debito', 'credito', 'qr', 'cta_cte'];

export default function CajasPage() {
  const db = getDb();
  const sesionesQ = useQuery({
    queryKey: ['sesiones-caja-todas'],
    queryFn: () => db.sesionesCaja.list(),
    refetchInterval: 10_000,
  });
  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const cajasQ = useQuery({ queryKey: ['cajas'], queryFn: () => db.cajas.list() });

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const cajaNombre = (id: string) => cajasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  const sesiones = (sesionesQ.data ?? []).slice().reverse();
  const abiertas = sesiones.filter((s) => s.estado === 'abierta');
  const cerradas = sesiones.filter((s) => s.estado === 'cerrada').slice(0, 10);

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Cajas</h1>
        <p className="text-sm text-muted-foreground">
          Sesiones abiertas y cerradas. Las abiertas se actualizan cada 10s.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LockOpen className="h-4 w-4" />
            Cajas abiertas ({abiertas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sesionesQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : abiertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cajas abiertas en este momento.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {abiertas.map((s) => (
                <SesionCard
                  key={s.id}
                  sesion={s}
                  cajaNombre={cajaNombre(s.caja_id)}
                  empleadoNombre={empleadoNombre(s.empleado_id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Últimas 10 sesiones cerradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sesionesQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : cerradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sesiones cerradas todavía.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="whitespace-nowrap px-3 py-2 text-left">Caja</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Cajero</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Apertura</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Cierre</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Inicial</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Declarado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cerradas.map((s) => {
                  const dif =
                    s.saldo_final_declarado !== undefined
                      ? s.saldo_final_declarado - s.saldo_inicial
                      : 0;
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{cajaNombre(s.caja_id)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{empleadoNombre(s.empleado_id)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(s.abierta_en)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {s.cerrada_en ? formatDate(s.cerrada_en) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatCurrency(s.saldo_inicial)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatCurrency(s.saldo_final_declarado ?? 0)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                          dif < 0 ? 'text-destructive' : dif > 0 ? 'text-orange-600' : 'text-green-700'
                        }`}
                      >
                        {formatCurrency(dif)}
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
    </div>
  );
}

function SesionCard({
  sesion,
  cajaNombre,
  empleadoNombre,
}: {
  sesion: { id: string; saldo_inicial: number; abierta_en: string };
  cajaNombre: string;
  empleadoNombre: string;
}) {
  const db = getDb();
  const movsQ = useQuery({
    queryKey: ['movs-caja-admin', sesion.id],
    queryFn: () => db.sesionesCaja.movimientos(sesion.id),
    refetchInterval: 5_000,
  });

  const totales = METODOS.reduce(
    (acc, m) => ({ ...acc, [m]: 0 }),
    {} as Record<MetodoPago, number>,
  );
  for (const m of (movsQ.data ?? []) as MovimientoCaja[]) {
    const signo = m.tipo === 'egreso' || m.tipo === 'retiro' || m.tipo === 'anulacion' ? -1 : 1;
    totales[m.metodo] += signo * m.monto;
  }
  const totalIngresos = Object.values(totales).reduce((a, b) => a + b, 0);
  const efectivoEsperado = sesion.saldo_inicial + totales.efectivo;

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="font-medium">{cajaNombre}</span>
            <Badge variant="secondary">abierta</Badge>
          </div>
          <div className="mt-1 text-sm">{empleadoNombre}</div>
          <div className="text-xs text-muted-foreground">
            Abierta: {formatDate(sesion.abierta_en)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total ingresos</div>
          <div className="font-semibold tabular-nums">{formatCurrency(totalIngresos)}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
        {METODOS.map((m) => (
          <div key={m} className="flex justify-between">
            <span className="text-muted-foreground capitalize">{m.replace('_', ' ')}</span>
            <span className="tabular-nums">{formatCurrency(totales[m])}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t pt-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Saldo inicial</span>
          <span className="tabular-nums">{formatCurrency(sesion.saldo_inicial)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Efectivo esperado en caja</span>
          <span className="tabular-nums">{formatCurrency(efectivoEsperado)}</span>
        </div>
      </div>
    </div>
  );
}
