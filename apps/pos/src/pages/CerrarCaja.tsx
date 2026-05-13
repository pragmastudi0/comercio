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

const METODOS: Array<{ key: MetodoPago; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'qr', label: 'QR' },
  { key: 'cta_cte', label: 'Cuenta corriente' },
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

  const cerrarMut = useMutation({
    mutationFn: async () => {
      if (!sesion) throw new Error('No hay sesión activa');
      const monto = parseFloat(saldoFinal);
      if (Number.isNaN(monto)) throw new Error('Saldo final inválido');
      return db.sesionesCaja.cerrar(sesion.id, monto);
    },
    onSuccess: () => {
      toast.success('Caja cerrada');
      setSesionCaja(null);
      setCaja(null);
      navigate('/abrir-caja');
    },
    onError: (e: Error) => toast.error(e.message),
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
            disabled={!saldoFinal || cerrarMut.isPending}
            onClick={() => cerrarMut.mutate()}
          >
            {cerrarMut.isPending ? 'Cerrando…' : 'Cerrar caja'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
