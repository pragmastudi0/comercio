'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, LockOpen, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { RequierePermiso } from '@/lib/permisos';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@comercio/ui/dialog';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import type { MetodoPago, MovimientoCaja, SesionCaja } from '@comercio/db';

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
              <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="whitespace-nowrap px-3 py-2 text-left">Caja</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Cajero</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Apertura</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Cierre</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Inicial</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Esperado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Declarado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cerradas.map((s) => (
                  <FilaSesionCerrada
                    key={s.id}
                    sesion={s}
                    cajaNombre={cajaNombre(s.caja_id)}
                    empleadoNombre={empleadoNombre(s.empleado_id)}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilaSesionCerrada({
  sesion,
  cajaNombre,
  empleadoNombre,
}: {
  sesion: SesionCaja;
  cajaNombre: string;
  empleadoNombre: string;
}) {
  const db = getDb();
  // Traemos movimientos de la sesión para calcular el efectivo del turno.
  // Las sesiones ya cerradas no cambian, así que cache largo.
  const movsQ = useQuery({
    queryKey: ['movs-caja-cerrada', sesion.id],
    queryFn: () => db.sesionesCaja.movimientos(sesion.id),
    staleTime: 5 * 60 * 1000,
  });

  let totalEfectivo = 0;
  for (const m of (movsQ.data ?? []) as MovimientoCaja[]) {
    if (m.metodo !== 'efectivo') continue;
    const signo =
      m.tipo === 'egreso' || m.tipo === 'retiro' || m.tipo === 'anulacion'
        ? -1
        : 1;
    totalEfectivo += signo * m.monto;
  }
  const declarado = sesion.saldo_final_declarado ?? 0;
  const esperado = sesion.saldo_inicial + totalEfectivo;
  // Diferencia real de arqueo: lo que dijo el cajero menos lo que debería
  // haber. Negativo = faltó plata, positivo = sobró.
  const dif = declarado - esperado;
  const cargando = movsQ.isLoading;

  let claseFila = '';
  let claseDif = 'text-green-700';
  let etiqueta = 'OK';
  if (!cargando && Math.abs(dif) >= 0.01) {
    if (dif < 0) {
      claseFila = 'bg-red-50/60 dark:bg-red-950/20';
      claseDif = 'text-destructive font-semibold';
      etiqueta = 'Faltó';
    } else {
      claseFila = 'bg-orange-50/60 dark:bg-orange-950/20';
      claseDif = 'text-orange-600 font-semibold';
      etiqueta = 'Sobró';
    }
  }

  return (
    <tr className={`border-b last:border-0 ${claseFila}`}>
      <td className="whitespace-nowrap px-3 py-2">{cajaNombre}</td>
      <td className="whitespace-nowrap px-3 py-2">{empleadoNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {formatDate(sesion.abierta_en)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {sesion.cerrada_en ? formatDate(sesion.cerrada_en) : '—'}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatCurrency(sesion.saldo_inicial)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {cargando ? '…' : formatCurrency(esperado)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatCurrency(declarado)}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${claseDif}`}>
        {cargando ? (
          '…'
        ) : (
          <div className="flex flex-col items-end">
            <span>{formatCurrency(dif)}</span>
            <span className="text-[10px] uppercase tracking-wider">{etiqueta}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function SesionCard({
  sesion,
  cajaNombre,
  empleadoNombre,
}: {
  sesion: SesionCaja;
  cajaNombre: string;
  empleadoNombre: string;
}) {
  const db = getDb();
  const qc = useQueryClient();
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

  // Estado del modal de cierre. El admin puede cerrar cualquier caja abierta,
  // por ejemplo cuando el cajero se olvidó de cerrarla. Pedimos confirmación
  // y un monto declarado (pre-llenado con el efectivo esperado).
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [saldoFinal, setSaldoFinal] = useState('');

  const cerrarMut = useMutation({
    mutationFn: async () => {
      const monto = parseFloat(saldoFinal);
      if (Number.isNaN(monto) || monto < 0) {
        throw new Error('Ingresá un monto válido para el efectivo declarado.');
      }
      return db.sesionesCaja.cerrar(sesion.id, monto);
    },
    onSuccess: () => {
      toast.success(`Caja "${cajaNombre}" cerrada`);
      setCerrarOpen(false);
      qc.invalidateQueries({ queryKey: ['sesiones-caja-todas'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrirDialog() {
    setSaldoFinal(efectivoEsperado.toString());
    setCerrarOpen(true);
  }

  const diferenciaPreview =
    saldoFinal && !Number.isNaN(parseFloat(saldoFinal))
      ? parseFloat(saldoFinal) - efectivoEsperado
      : 0;

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

      <RequierePermiso modulo="caja" accion="cerrar">
        <div className="mt-3 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={abrirDialog}
          >
            <Lock className="mr-2 h-4 w-4" />
            Cerrar caja
          </Button>
        </div>
      </RequierePermiso>

      <Dialog open={cerrarOpen} onOpenChange={setCerrarOpen}>
        <DialogHeader>
          <DialogTitle>¿Cerrar la caja de {cajaNombre}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Esta acción cierra la sesión abierta de <b>{empleadoNombre}</b>. El
            cajero no podrá seguir vendiendo en esta caja hasta volver a abrirla.
          </p>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/40 p-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo inicial</span>
              <span className="tabular-nums">{formatCurrency(sesion.saldo_inicial)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efectivo del turno</span>
              <span className="tabular-nums">{formatCurrency(totales.efectivo)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Efectivo esperado</span>
              <span className="tabular-nums">{formatCurrency(efectivoEsperado)}</span>
            </div>
          </div>

          <div>
            <Label htmlFor={`saldo-${sesion.id}`}>Efectivo declarado en caja</Label>
            <Input
              id={`saldo-${sesion.id}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={saldoFinal}
              onChange={(e) => setSaldoFinal(e.target.value)}
              className="mt-1"
              autoFocus
            />
            <p
              className={`mt-1 text-xs tabular-nums ${
                diferenciaPreview < 0
                  ? 'text-destructive'
                  : diferenciaPreview > 0
                  ? 'text-orange-600'
                  : 'text-muted-foreground'
              }`}
            >
              Diferencia con esperado: {formatCurrency(diferenciaPreview)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setCerrarOpen(false)}
            disabled={cerrarMut.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => cerrarMut.mutate()}
            disabled={cerrarMut.isPending}
          >
            {cerrarMut.isPending ? 'Cerrando…' : 'Sí, cerrar la caja'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
