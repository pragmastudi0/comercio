import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
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

  // Todas las sesiones (cualquier empleado) de la caja seleccionada.
  // Con la regla "una sesión por caja" solo debería haber máximo 1
  // abierta; la usamos para decidir el flujo (libre / tuya / ajena).
  const sesionesQ = useQuery({
    queryKey: ['sesiones-abiertas-caja', cajaId],
    queryFn: () => db.sesionesCaja.list({ caja_id: cajaId }),
    enabled: !!cajaId,
  });
  const empleadosQ = useQuery({
    queryKey: ['empleados-pos'],
    queryFn: () => db.empleados.list(),
    enabled: !!empleado,
  });

  const sesionAbiertaEnCaja =
    (sesionesQ.data ?? []).find((s) => s.estado === 'abierta') ?? null;
  const responsableActualId =
    sesionAbiertaEnCaja?.empleado_actual_id ?? sesionAbiertaEnCaja?.empleado_id;
  const esTuya =
    !!sesionAbiertaEnCaja && responsableActualId === empleado?.id;
  const esAjena =
    !!sesionAbiertaEnCaja && responsableActualId !== empleado?.id;

  const dueño = sesionAbiertaEnCaja
    ? empleadosQ.data?.find((e) => e.id === responsableActualId)
    : null;
  const dueñoNombre = dueño
    ? `${dueño.nombre} ${dueño.apellido ?? ''}`.trim()
    : 'otro cajero';

  // Pre-llenar el saldo si la sesión es del mismo empleado (para poder
  // corregirlo si quedó mal cargado al abrir originalmente).
  useEffect(() => {
    if (esTuya && sesionAbiertaEnCaja) {
      setSaldoInicial(String(sesionAbiertaEnCaja.saldo_inicial));
    }
  }, [esTuya, sesionAbiertaEnCaja]);

  const abrirMut = useMutation({
    mutationFn: async () => {
      if (!empleado) throw new Error('No hay empleado');
      const caja = cajasQ.data?.find((c) => c.id === cajaId);
      if (!caja) throw new Error('Elegí una caja');
      const monto = parseFloat(saldoInicial) || 0;

      // Refrescamos por si otro empleado abrió esta caja entre que se
      // renderizó la pantalla y el click. Regla dura: una sesión por caja.
      const abiertaAhora = (await db.sesionesCaja.list({ caja_id: caja.id })).find(
        (s) => s.estado === 'abierta',
      );
      let sesion;
      if (abiertaAhora) {
        const respId = abiertaAhora.empleado_actual_id ?? abiertaAhora.empleado_id;
        if (respId !== empleado.id) {
          throw new Error(
            `La caja ya está abierta por ${dueñoNombre}. Refrescá y tomá la posta.`,
          );
        }
        // Es tuya: si cambió el saldo, corregilo en BD.
        if (
          monto !== abiertaAhora.saldo_inicial &&
          db.sesionesCaja.actualizarSaldoInicial
        ) {
          sesion = await db.sesionesCaja.actualizarSaldoInicial(abiertaAhora.id, monto);
          toast.success('Saldo inicial actualizado');
        } else {
          sesion = abiertaAhora;
        }
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

  // "Tomar posta": la caja está abierta por otro empleado. Le cambiamos
  // el responsable actual a nosotros (mediante cambiarResponsable) y
  // entramos a /caja con la sesión existente — sin tocar saldo_inicial
  // ni cerrar/reabrir. Sirve para relevo de turno: Diego cierra a las
  // 15h dejando la caja abierta, Franco entra y toma la posta a las
  // 15:01.
  const tomarPostaMut = useMutation({
    mutationFn: async () => {
      if (!empleado) throw new Error('No hay empleado');
      if (!sesionAbiertaEnCaja) throw new Error('No hay sesión abierta');
      const caja = cajasQ.data?.find((c) => c.id === cajaId);
      if (!caja) throw new Error('Caja no encontrada');
      if (!db.sesionesCaja.cambiarResponsable) {
        throw new Error('El repo no soporta cambiar responsable');
      }
      const actualizada = await db.sesionesCaja.cambiarResponsable(
        sesionAbiertaEnCaja.id,
        empleado.id,
      );
      // Audit: quién tomó la posta y a quién relevó.
      await db.auditoria
        .log({
          empleado_id: empleado.id,
          accion: 'cambio_responsable_caja',
          entidad: 'sesion_caja',
          entidad_id: sesionAbiertaEnCaja.id,
          detalle: {
            empleado_anterior_id: responsableActualId,
            empleado_nuevo_id: empleado.id,
            empleado_nuevo_nombre: `${empleado.nombre} ${empleado.apellido ?? ''}`.trim(),
            desde: 'abrir_caja',
          },
        })
        .catch(() => {});
      setCaja(caja);
      setSesionCaja(actualizada);
      return actualizada;
    },
    onSuccess: () => {
      toast.success('Tomaste la posta de la caja');
      navigate('/caja');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!empleado) return null;

  const cargandoEstadoCaja = !!cajaId && sesionesQ.isLoading;

  return (
    <main className="container mx-auto max-w-xl px-4 py-12">
      <div className="mb-6 text-center">
        <div className="text-sm font-medium tracking-tight text-muted-foreground">
          {BRAND.nombreCorto}
        </div>
        <h1 className="text-2xl font-semibold">Apertura de caja</h1>
        <p className="text-sm text-muted-foreground">
          Hola <span className="font-medium">{empleado.nombre}</span>, elegí sobre
          qué caja vas a trabajar.
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

          {/* Estado de la caja seleccionada. La lógica ahora es dura:
              una sola sesión por caja. Si otro empleado la tiene abierta,
              este empleado NO puede abrir otra — solo tomar la posta. */}
          {cargandoEstadoCaja && <Skeleton className="h-24 w-full" />}

          {!cargandoEstadoCaja && esAjena && sesionAbiertaEnCaja && (
            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm">
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-700" />
                <div className="flex-1">
                  <div className="font-medium text-blue-900">
                    Caja abierta por {dueñoNombre}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-y-0.5 text-xs text-blue-900/90">
                    <span>Apertura:</span>
                    <span className="text-right tabular-nums">
                      {new Date(sesionAbiertaEnCaja.abierta_en).toLocaleString('es-AR')}
                    </span>
                    <span>Saldo inicial declarado:</span>
                    <span className="text-right tabular-nums">
                      {formatCurrency(sesionAbiertaEnCaja.saldo_inicial)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-blue-900/90">
                    Si vas a atender vos, tomá la posta: quedás como
                    responsable de la caja y las ventas siguen sobre la
                    misma sesión (no se toca el saldo inicial).
                  </p>
                </div>
              </div>
            </div>
          )}

          {!cargandoEstadoCaja && !esAjena && (
            <div>
              <Label htmlFor="saldo" className="mb-2 block">
                {esTuya
                  ? 'Saldo inicial (podés corregirlo si quedó mal)'
                  : 'Saldo inicial (efectivo en caja)'}
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
          )}

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
            {esAjena ? (
              <Button
                className="flex-1"
                disabled={!cajaId || tomarPostaMut.isPending}
                onClick={() => tomarPostaMut.mutate()}
              >
                {tomarPostaMut.isPending ? 'Tomando posta…' : 'Tomar posta'}
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={!cajaId || abrirMut.isPending || cargandoEstadoCaja}
                onClick={() => abrirMut.mutate()}
              >
                {abrirMut.isPending
                  ? 'Abriendo…'
                  : esTuya
                    ? 'Continuar mi caja'
                    : 'Abrir caja'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
