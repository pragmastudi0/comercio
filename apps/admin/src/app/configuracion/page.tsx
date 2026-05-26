'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';

const EMPRESA_ID = 'emp_demo';

export default function ConfiguracionPage() {
  const db = getDb();
  const qc = useQueryClient();
  const configQ = useQuery({ queryKey: ['config'], queryFn: () => db.configuracion.get(EMPRESA_ID) });

  const [descuentoEfPct, setDescuentoEfPct] = useState(0);
  const [validezPresup, setValidezPresup] = useState(7);
  const [permitirSinStock, setPermitirSinStock] = useState(false);
  const [cuotas, setCuotas] = useState<{ cuotas: number; recargo_pct: number }[]>([]);
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailComercio, setEmailComercio] = useState('');
  const [horario, setHorario] = useState('');
  const [pedidoMinimo, setPedidoMinimo] = useState(0);
  const [waTemplate, setWaTemplate] = useState('');

  useEffect(() => {
    if (configQ.data) {
      setDescuentoEfPct(configQ.data.descuento_efectivo_pct);
      setValidezPresup(configQ.data.validez_presupuesto_dias);
      setPermitirSinStock(configQ.data.permitir_venta_sin_stock_default);
      setCuotas(configQ.data.cuotas);
      setRazonSocial(configQ.data.comercio?.razon_social ?? '');
      setCuit(configQ.data.comercio?.cuit ?? '');
      setDireccion(configQ.data.comercio?.direccion ?? '');
      setTelefono(configQ.data.comercio?.telefono ?? '');
      setEmailComercio(configQ.data.comercio?.email ?? '');
      setHorario(configQ.data.comercio?.horario ?? '');
      setPedidoMinimo(configQ.data.pedido_minimo_web ?? 0);
      setWaTemplate(configQ.data.mensaje_wa_template ?? '');
    }
  }, [configQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      db.configuracion.update(EMPRESA_ID, {
        descuento_efectivo_pct: descuentoEfPct,
        validez_presupuesto_dias: validezPresup,
        permitir_venta_sin_stock_default: permitirSinStock,
        cuotas: [...cuotas].sort((a, b) => a.cuotas - b.cuotas),
        comercio: {
          razon_social: razonSocial,
          cuit,
          direccion,
          telefono,
          email: emailComercio,
          horario,
        },
        pedido_minimo_web: pedidoMinimo,
        mensaje_wa_template: waTemplate,
      }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function agregarCuota() {
    const ultima = cuotas[cuotas.length - 1];
    const nuevasCuotas = ultima ? ultima.cuotas + 3 : 1;
    setCuotas([...cuotas, { cuotas: nuevasCuotas, recargo_pct: 0 }]);
  }

  function editarCuota(idx: number, patch: Partial<{ cuotas: number; recargo_pct: number }>) {
    setCuotas(cuotas.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function quitarCuota(idx: number) {
    setCuotas(cuotas.filter((_, i) => i !== idx));
  }

  if (configQ.isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Recargos, descuentos y parámetros que afectan a toda la operación.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Descuentos por método</CardTitle>
            <CardDescription>
              Descuento aplicado automáticamente cuando el cliente paga en efectivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="dto-ef" className="mb-1 block">
              Descuento por efectivo (%)
            </Label>
            <Input
              id="dto-ef"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={descuentoEfPct}
              onChange={(e) => setDescuentoEfPct(parseFloat(e.target.value) || 0)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="val" className="mb-1 block">
                Validez del presupuesto (días)
              </Label>
              <Input
                id="val"
                type="number"
                min="1"
                value={validezPresup}
                onChange={(e) => setValidezPresup(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="sin-stock"
                type="checkbox"
                checked={permitirSinStock}
                onChange={(e) => setPermitirSinStock(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="sin-stock">
                Permitir venta sin stock por defecto (también requiere permiso del rol)
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cuotas y recargos</CardTitle>
            <CardDescription>
              Define cuántas cuotas se ofrecen al cobrar con tarjeta de crédito y el recargo
              correspondiente. El recargo se le aplica al cliente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-3 text-xs uppercase text-muted-foreground">
              <span>Cuotas</span>
              <span>Recargo %</span>
              <span />
            </div>
            <div className="space-y-2">
              {cuotas.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3">
                  <Input
                    type="number"
                    min="1"
                    value={c.cuotas}
                    onChange={(e) =>
                      editarCuota(i, { cuotas: parseInt(e.target.value) || 1 })
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    max="200"
                    step="0.5"
                    value={c.recargo_pct}
                    onChange={(e) =>
                      editarCuota(i, { recargo_pct: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <Button variant="ghost" size="icon" onClick={() => quitarCuota(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={agregarCuota}
            >
              <Plus className="mr-1 h-3 w-3" />
              Agregar opción de cuota
            </Button>
          </CardContent>
        </Card>

        {/* Datos del comercio (aparecen en ticket y página de contacto) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos del comercio</CardTitle>
            <CardDescription>
              Se muestran en el ticket impreso y en la página de contacto del sitio web.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block">Razón social / Nombre</Label>
              <Input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">CUIT</Label>
              <Input value={cuit} onChange={(e) => setCuit(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block">Dirección</Label>
              <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">Email</Label>
              <Input
                type="email"
                value={emailComercio}
                onChange={(e) => setEmailComercio(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block">Horario</Label>
              <Input
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                placeholder="Lun a Sáb 8:00 a 22:00"
              />
            </div>
          </CardContent>
        </Card>

        {/* E-commerce: mínimo de pedido + template WhatsApp */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>E-commerce mayorista</CardTitle>
            <CardDescription>
              Reglas que aplica el sitio web cuando el cliente arma su pedido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1 block">Pedido mínimo (en $)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={pedidoMinimo}
                onChange={(e) => setPedidoMinimo(parseFloat(e.target.value) || 0)}
                className="max-w-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                0 = sin mínimo. Por debajo de este monto la web no deja enviar el pedido.
              </p>
            </div>
            <div>
              <Label className="mb-1 block">
                Plantilla del mensaje de WhatsApp (opcional)
              </Label>
              <textarea
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder="Dejar vacío para usar el formato por defecto. Variables disponibles: {fecha}, {cliente.razonSocial}, {cliente.contacto}, {cliente.telefono}, {items}, {total}, {metodoPago}, {entrega}, {notas}"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Si querés controlar exactamente el mensaje que se manda, escribilo acá usando
                las variables entre llaves. Si lo dejás vacío, se usa un formato razonable
                por defecto.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
