'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, LockOpen, Lock, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
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
import type { MetodoPago, MovimientoCaja, SesionCaja, Venta } from '@comercio/db';

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
  // Sesión seleccionada para ver detalle (ventas + movs + arqueo).
  const [sesionDetalle, setSesionDetalle] = useState<SesionCaja | null>(null);

  // Filtros y orden del historial de sesiones cerradas.
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const hace30 = format(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    'yyyy-MM-dd',
  );
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  // Default: más nueva arriba.
  const [ordenDesc, setOrdenDesc] = useState(true);

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };
  const cajaNombre = (id: string) => cajasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  const sesiones = sesionesQ.data ?? [];
  const abiertas = sesiones.filter((s) => s.estado === 'abierta');
  // Historial completo (filtro fecha cierre + orden), sin cap de 10.
  const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
  const hastaIso = new Date(`${hasta}T23:59:59`).toISOString();
  const cerradas = sesiones
    .filter((s) => {
      if (s.estado !== 'cerrada') return false;
      const ref = s.cerrada_en ?? s.abierta_en;
      return ref >= desdeIso && ref <= hastaIso;
    })
    .sort((a, b) => {
      const aRef = a.cerrada_en ?? a.abierta_en;
      const bRef = b.cerrada_en ?? b.abierta_en;
      const cmp = aRef.localeCompare(bRef);
      return ordenDesc ? -cmp : cmp;
    });

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
                  onVerDetalle={() => setSesionDetalle(s)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Historial de sesiones cerradas ({cerradas.length})
          </CardTitle>
          {/* Filtros por fecha de cierre. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Desde
              </label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Hasta
              </label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sesionesQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : cerradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay sesiones cerradas en el rango seleccionado. Ampliá las fechas si esperabas ver alguna.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="whitespace-nowrap px-3 py-2 text-left">Caja</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Cajero</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Apertura</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">
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
                      Cierre
                      {ordenDesc ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Inicial</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Esperado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Declarado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Diferencia</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {cerradas.map((s) => (
                  <FilaSesionCerrada
                    key={s.id}
                    sesion={s}
                    cajaNombre={cajaNombre(s.caja_id)}
                    empleadoNombre={empleadoNombre(s.empleado_id)}
                    onVerDetalle={() => setSesionDetalle(s)}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle de sesión: ventas + movimientos + arqueo */}
      <Dialog
        open={!!sesionDetalle}
        onOpenChange={(v) => !v && setSesionDetalle(null)}
        className="max-w-3xl"
      >
        {sesionDetalle && (
          <DetalleSesion
            sesion={sesionDetalle}
            cajaNombre={cajaNombre(sesionDetalle.caja_id)}
            empleadoNombre={empleadoNombre(sesionDetalle.empleado_id)}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setSesionDetalle(null)}>
            Cerrar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function DetalleSesion({
  sesion,
  cajaNombre,
  empleadoNombre,
}: {
  sesion: SesionCaja;
  cajaNombre: string;
  empleadoNombre: string;
}) {
  const db = getDb();
  // Ventas de la sesión + movimientos de caja en paralelo.
  const ventasQ = useQuery({
    queryKey: ['detalle-sesion-ventas', sesion.id],
    queryFn: () => db.ventas.list({ sesion_caja_id: sesion.id }),
  });
  const movsQ = useQuery({
    queryKey: ['detalle-sesion-movs', sesion.id],
    queryFn: () => db.sesionesCaja.movimientos(sesion.id),
  });

  const ventas = (ventasQ.data ?? []) as Venta[];
  const ventasCompletadas = ventas.filter((v) => v.estado === 'completada');
  const ventasAnuladas = ventas.filter((v) => v.estado === 'anulada');
  const totalVentas = ventasCompletadas.reduce((acc, v) => acc + v.total, 0);

  // Totales por método de pago (solo ventas completadas).
  const porMetodo = new Map<MetodoPago, number>();
  for (const v of ventasCompletadas) {
    for (const p of v.pagos) {
      porMetodo.set(p.metodo, (porMetodo.get(p.metodo) ?? 0) + p.monto);
    }
  }

  // Arqueo (mismo cálculo que la fila resumen).
  let efectivoMovs = 0;
  for (const m of (movsQ.data ?? []) as MovimientoCaja[]) {
    if (m.metodo !== 'efectivo') continue;
    const signo =
      m.tipo === 'egreso' || m.tipo === 'retiro' || m.tipo === 'anulacion'
        ? -1
        : 1;
    efectivoMovs += signo * m.monto;
  }
  const declarado = sesion.saldo_final_declarado ?? 0;
  const esperado = sesion.saldo_inicial + efectivoMovs;
  const dif = declarado - esperado;
  const cerrada = sesion.estado === 'cerrada';

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Caja {cajaNombre} · {empleadoNombre}
        </DialogTitle>
      </DialogHeader>

      {/* Cabecera con tiempos */}
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Apertura</div>
          <div className="font-medium">{formatDate(sesion.abierta_en)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Cierre</div>
          <div className="font-medium">
            {sesion.cerrada_en ? (
              formatDate(sesion.cerrada_en)
            ) : (
              <Badge variant="secondary">Abierta ahora</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Ventas del turno */}
      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">
          Ventas del turno ({ventasCompletadas.length} completadas
          {ventasAnuladas.length > 0 && ` · ${ventasAnuladas.length} anuladas`})
        </div>
        {ventasQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : ventas.length === 0 ? (
          <p className="rounded border border-dashed py-4 text-center text-xs text-muted-foreground">
            Sin ventas en este turno.
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">N°</th>
                  <th className="px-2 py-1.5 text-left">Fecha</th>
                  <th className="px-2 py-1.5 text-left">Método</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => {
                  const ms = Array.from(new Set(v.pagos.map((p) => p.metodo)));
                  const metodoLabel = ms.length > 1 ? 'Mixto' : ms[0] ?? '—';
                  const anulada = v.estado === 'anulada';
                  return (
                    <tr
                      key={v.id}
                      className={`border-t ${anulada ? 'bg-red-50/40' : ''}`}
                    >
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {v.numero}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {formatDate(v.fecha)}
                      </td>
                      <td className="px-2 py-1.5 text-xs">{metodoLabel}</td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          anulada ? 'text-red-700 line-through' : ''
                        }`}
                      >
                        {formatCurrency(v.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Total facturado del turno</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(totalVentas)}
          </span>
        </div>
      </div>

      {/* Desglose por método (solo si hay) */}
      {porMetodo.size > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-sm font-medium">Cobrado por método</div>
          <div className="grid grid-cols-2 gap-1 rounded-md border p-2 text-sm sm:grid-cols-3">
            {METODOS.filter((m) => porMetodo.has(m)).map((m) => (
              <div
                key={m}
                className="flex items-center justify-between rounded px-2 py-1"
              >
                <span className="text-xs capitalize text-muted-foreground">
                  {m}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(porMetodo.get(m) ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos extras de caja (ingresos/egresos manuales) */}
      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">
          Movimientos de caja ({(movsQ.data ?? []).length})
        </div>
        {movsQ.isLoading ? (
          <Skeleton className="h-16" />
        ) : (movsQ.data ?? []).length === 0 ? (
          <p className="rounded border border-dashed py-3 text-center text-xs text-muted-foreground">
            Sin movimientos manuales (solo ventas).
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                {(movsQ.data as MovimientoCaja[]).map((m) => {
                  const negativo =
                    m.tipo === 'egreso' ||
                    m.tipo === 'retiro' ||
                    m.tipo === 'anulacion';
                  return (
                    <tr key={m.id} className="border-t first:border-0">
                      <td className="px-2 py-1.5 text-xs capitalize">
                        {m.tipo}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {m.metodo}
                      </td>
                      <td className="max-w-xs px-2 py-1.5 text-xs">
                        {m.motivo ?? '—'}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          negativo ? 'text-destructive' : 'text-green-700'
                        }`}
                      >
                        {negativo ? '−' : '+'}
                        {formatCurrency(m.monto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Arqueo final */}
      <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Arqueo de efectivo
        </div>
        <div className="mt-2 grid grid-cols-2 gap-y-1">
          <span className="text-muted-foreground">Saldo inicial</span>
          <span className="text-right tabular-nums">
            {formatCurrency(sesion.saldo_inicial)}
          </span>
          <span className="text-muted-foreground">Movimientos en efectivo</span>
          <span className="text-right tabular-nums">
            {(efectivoMovs >= 0 ? '+' : '') + formatCurrency(efectivoMovs)}
          </span>
          <span className="font-medium">Esperado en caja</span>
          <span className="text-right font-medium tabular-nums">
            {formatCurrency(esperado)}
          </span>
          {cerrada && (
            <>
              <span className="text-muted-foreground">Declarado por cajero</span>
              <span className="text-right tabular-nums">
                {formatCurrency(declarado)}
              </span>
              <span
                className={`font-semibold ${
                  Math.abs(dif) < 0.01
                    ? 'text-green-700'
                    : dif < 0
                      ? 'text-destructive'
                      : 'text-orange-600'
                }`}
              >
                {Math.abs(dif) < 0.01
                  ? 'Cuadró exacto'
                  : dif < 0
                    ? 'Faltó'
                    : 'Sobró'}
              </span>
              <span
                className={`text-right font-semibold tabular-nums ${
                  Math.abs(dif) < 0.01
                    ? 'text-green-700'
                    : dif < 0
                      ? 'text-destructive'
                      : 'text-orange-600'
                }`}
              >
                {formatCurrency(dif)}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FilaSesionCerrada({
  sesion,
  cajaNombre,
  empleadoNombre,
  onVerDetalle,
}: {
  sesion: SesionCaja;
  cajaNombre: string;
  empleadoNombre: string;
  onVerDetalle: () => void;
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
    <tr
      className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${claseFila}`}
      onClick={onVerDetalle}
    >
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
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <Eye className="inline h-4 w-4 text-muted-foreground" />
      </td>
    </tr>
  );
}

function SesionCard({
  sesion,
  cajaNombre,
  empleadoNombre,
  onVerDetalle,
}: {
  sesion: SesionCaja;
  cajaNombre: string;
  empleadoNombre: string;
  onVerDetalle: () => void;
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
    onError: (e: Error) => {
      // Cierre idempotente: si otro cerró primero, mostrar como info
      // amigable y refrescar la vista. Para todo otro error, rojo.
      if (e.name === 'SesionYaCerrada') {
        toast.info(e.message);
        setCerrarOpen(false);
        qc.invalidateQueries({ queryKey: ['sesiones-caja-todas'] });
      } else {
        toast.error(e.message);
      }
    },
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

      <div className="mt-3 border-t pt-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onVerDetalle}
        >
          <Eye className="mr-2 h-4 w-4" />
          Ver detalle
        </Button>
        <RequierePermiso modulo="caja" accion="cerrar">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={abrirDialog}
          >
            <Lock className="mr-2 h-4 w-4" />
            Cerrar caja
          </Button>
        </RequierePermiso>
      </div>

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
