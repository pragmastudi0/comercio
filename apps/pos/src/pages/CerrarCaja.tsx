import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import type { MetodoPago } from '@comercio/db';

// Métodos visibles en el cierre de caja. Cuenta corriente queda fuera
// por decisión del cliente: las ventas en cta cte no afectan el arqueo
// de caja (no entra plata) — verlas acá confundía.
const METODOS: Array<{ key: MetodoPago; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'qr', label: 'QR' },
];

export function CerrarCaja() {
  const db = getDb();
  const navigate = useNavigate();
  const sesion = useSesion((s) => s.sesionCaja);
  const setSesionCaja = useSesion((s) => s.setSesionCaja);
  const setCaja = useSesion((s) => s.setCaja);
  const [saldoFinal, setSaldoFinal] = useState('');

  const movimientosQ = useQuery({
    queryKey: ['movimientos-sesion', sesion?.id],
    queryFn: () => (sesion ? db.sesionesCaja.movimientos(sesion.id) : Promise.resolve([])),
    enabled: !!sesion,
  });

  const totales: Record<MetodoPago, number> = {
    efectivo: 0,
    transferencia: 0,
    debito: 0,
    credito: 0,
    qr: 0,
    cta_cte: 0,
  };
  for (const m of movimientosQ.data ?? []) {
    const signo = m.tipo === 'egreso' || m.tipo === 'retiro' || m.tipo === 'anulacion' ? -1 : 1;
    totales[m.metodo] += signo * m.monto;
  }
  const totalEfectivoEsperado = (sesion?.saldo_inicial ?? 0) + totales.efectivo;
  const diferencia = parseFloat(saldoFinal || '0') - totalEfectivoEsperado;

  // Ventas y anulaciones del turno (para detalle)
  const ventasQ = useQuery({
    queryKey: ['ventas-cierre', sesion?.id],
    queryFn: () =>
      sesion
        ? db.ventas.list({
            empleado_id: sesion.empleado_id,
            desde: sesion.abierta_en,
          })
        : Promise.resolve([]),
    enabled: !!sesion,
  });
  const ventasCompletadas = (ventasQ.data ?? []).filter((v) => v.estado === 'completada');
  const ventasAnuladas = (ventasQ.data ?? []).filter((v) => v.estado === 'anulada');
  const descuentosAplicados = ventasCompletadas.reduce(
    (acc, v) => acc + (v.descuento_total ?? 0),
    0,
  );
  const recargosAplicados = ventasCompletadas.reduce(
    (acc, v) => acc + (v.recargo_total ?? 0),
    0,
  );
  const montoAnulado = ventasAnuladas.reduce((acc, v) => acc + v.total, 0);

  const cerrarMut = useMutation({
    mutationFn: async () => {
      if (!sesion) throw new Error('No hay sesión activa');
      const monto = parseFloat(saldoFinal);
      if (Number.isNaN(monto)) throw new Error('Saldo final inválido');
      // Bloqueamos negativo: el saldo declarado es el efectivo físico en
      // caja. No tiene sentido decir "tengo menos $20 en caja".
      if (monto < 0) {
        throw new Error('El saldo declarado no puede ser negativo.');
      }
      return db.sesionesCaja.cerrar(sesion.id, monto);
    },
    onSuccess: () => {
      toast.success('Caja cerrada');
      setSesionCaja(null);
      setCaja(null);
      navigate('/abrir-caja');
    },
    onError: (e: Error) => {
      // Cierre idempotente: si el admin u otro cajero ya cerró la sesión,
      // limpiamos el estado local y mandamos a abrir caja sin asustar al
      // cajero con un toast rojo.
      if (e.name === 'SesionYaCerrada') {
        toast.info(e.message);
        setSesionCaja(null);
        setCaja(null);
        navigate('/abrir-caja');
      } else {
        toast.error(e.message);
      }
    },
  });

  if (!sesion) {
    navigate('/abrir-caja');
    return null;
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/caja')}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Volver
      </Button>
      <h1 className="mb-1 text-2xl font-semibold">Cierre de caja</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Saldo inicial: {formatCurrency(sesion.saldo_inicial)}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Totales del turno por método</CardTitle>
        </CardHeader>
        <CardContent>
          {movimientosQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-1">
              {METODOS.map((m) => (
                <div key={m.key} className="flex justify-between border-b py-2 text-sm last:border-0">
                  <span>{m.label}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totales[m.key])}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Efectivo esperado (saldo inicial + ventas - retiros)</span>
                <span className="tabular-nums">{formatCurrency(totalEfectivoEsperado)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Descuentos, recargos y anulaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {ventasQ.isLoading ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-green-50 p-3">
                <div className="text-xs font-semibold uppercase text-green-800">
                  Descuentos aplicados
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-green-800">
                  {formatCurrency(descuentosAplicados)}
                </div>
                <div className="text-[10px] text-green-700">
                  Total descontado en las ventas del turno
                </div>
              </div>
              <div className="rounded-md border bg-orange-50 p-3">
                <div className="text-xs font-semibold uppercase text-orange-800">
                  Recargos cobrados
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-orange-800">
                  {formatCurrency(recargosAplicados)}
                </div>
                <div className="text-[10px] text-orange-700">
                  Recargos por cuotas u otros
                </div>
              </div>
              <div className="rounded-md border bg-red-50 p-3">
                <div className="text-xs font-semibold uppercase text-red-800">
                  Anulaciones
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-red-800">
                  {ventasAnuladas.length}
                </div>
                <div className="text-[10px] text-red-700">
                  Monto: {formatCurrency(montoAnulado)}
                </div>
              </div>
            </div>
          )}

          {ventasAnuladas.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Detalle de anulaciones
              </div>
              <div className="space-y-1">
                {ventasAnuladas.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded border px-2 py-1 text-xs"
                  >
                    <span className="font-mono">{v.numero}</span>
                    <span className="text-muted-foreground">
                      {v.motivo_anulacion ?? '—'}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(v.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Arqueo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="saldofin" className="mb-2 block">
              Efectivo contado en caja
            </Label>
            <Input
              id="saldofin"
              type="number"
              min="0"
              step="100"
              value={saldoFinal}
              onChange={(e) => setSaldoFinal(e.target.value)}
              placeholder="Cuánto efectivo hay en caja al cerrar"
            />
          </div>
          {saldoFinal && (
            <div
              className={`rounded p-3 text-sm ${
                Math.abs(diferencia) < 0.01
                  ? 'bg-green-50 text-green-700'
                  : diferencia < 0
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-orange-50 text-orange-700'
              }`}
            >
              Diferencia: {formatCurrency(diferencia)}{' '}
              {Math.abs(diferencia) < 0.01
                ? '· OK'
                : diferencia < 0
                  ? '· Falta efectivo'
                  : '· Sobra efectivo'}
            </div>
          )}
          <Button
            className="w-full"
            disabled={
              !saldoFinal ||
              cerrarMut.isPending ||
              movimientosQ.isLoading ||
              ventasQ.isLoading
            }
            onClick={() => cerrarMut.mutate()}
            title={
              movimientosQ.isLoading || ventasQ.isLoading
                ? 'Esperá a que termine de cargar el resumen para evitar cerrar con datos viejos'
                : undefined
            }
          >
            {cerrarMut.isPending
              ? 'Cerrando…'
              : movimientosQ.isLoading || ventasQ.isLoading
                ? 'Cargando resumen…'
                : 'Cerrar caja'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
