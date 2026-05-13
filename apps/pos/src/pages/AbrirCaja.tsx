import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BRAND } from '@comercio/business';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';

export function AbrirCaja() {
  const db = getDb();
  const navigate = useNavigate();
  const empleado = useSesion((s) => s.empleado);
  const setCaja = useSesion((s) => s.setCaja);
  const setSesionCaja = useSesion((s) => s.setSesionCaja);
  const logout = useSesion((s) => s.logout);

  const [cajaId, setCajaId] = useState<string>('');
  const [saldoInicial, setSaldoInicial] = useState<string>('0');

  const cajasQ = useQuery({
    queryKey: ['cajas-pos', empleado?.local_id],
    queryFn: () => db.cajas.list(empleado?.local_id),
    enabled: !!empleado,
  });

  useEffect(() => {
    if (cajasQ.data && cajasQ.data.length > 0 && !cajaId) {
      setCajaId(cajasQ.data[0]!.id);
    }
  }, [cajasQ.data, cajaId]);

  const abrirMut = useMutation({
    mutationFn: async () => {
      if (!empleado) throw new Error('No hay empleado');
      const caja = cajasQ.data?.find((c) => c.id === cajaId);
      if (!caja) throw new Error('Elegí una caja');
      const monto = parseFloat(saldoInicial) || 0;

      const yaAbierta = await db.sesionesCaja.sesionActivaDe(empleado.id, caja.id);
      let sesion;
      if (yaAbierta) {
        sesion = yaAbierta;
      } else {
        sesion = await db.sesionesCaja.abrir({
          caja_id: caja.id,
          empleado_id: empleado.id,
          saldo_inicial: monto,
        });
      }
      setCaja(caja);
      setSesionCaja(sesion);
      return sesion;
    },
    onSuccess: () => {
      toast.success('Caja abierta');
      navigate('/caja');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!empleado) return null;

  return (
    <main className="container mx-auto max-w-xl px-4 py-12">
      <div className="mb-6 text-center">
        <div className="text-sm font-medium tracking-tight text-muted-foreground">
          {BRAND.nombreCorto}
        </div>
        <h1 className="text-2xl font-semibold">Apertura de caja</h1>
        <p className="text-sm text-muted-foreground">
          Hola <span className="font-medium">{empleado.nombre}</span>, vas a abrir tu sesión.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de apertura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Caja</Label>
            {cajasQ.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (cajasQ.data?.length ?? 0) === 0 ? (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                No hay cajas asignadas a tu local. Pedile al admin que te asigne una.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {cajasQ.data!.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCajaId(c.id)}
                    className={`rounded border p-3 text-left text-sm transition ${
                      c.id === cajaId
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="saldo" className="mb-2 block">
              Saldo inicial (efectivo en caja)
            </Label>
            <Input
              id="saldo"
              type="number"
              min="0"
              step="100"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(parseFloat(saldoInicial) || 0)}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Cambiar usuario
            </Button>
            <Button
              className="flex-1"
              disabled={!cajaId || abrirMut.isPending}
              onClick={() => abrirMut.mutate()}
            >
              {abrirMut.isPending ? 'Abriendo…' : 'Abrir caja'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
