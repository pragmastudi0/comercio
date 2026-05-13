import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import {
  calcularBaseVenta,
  calcularDescuentoGlobal,
  calcularSubtotal,
  useVenta,
} from '@/stores/venta';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { formatCurrency } from '@comercio/ui/utils';
import { SHORTCUT_LABELS } from '@/lib/shortcuts';
import { VentasDelDia } from './VentasDelDia';

export function ResumenVenta({
  onCobrar,
  onBuscarCliente,
  onCancelar,
}: {
  onCobrar: () => void;
  onBuscarCliente: () => void;
  onCancelar: () => void;
}) {
  const db = getDb();
  const items = useVenta((s) => s.items);
  const clienteId = useVenta((s) => s.clienteId);
  const descuentoGlobalPct = useVenta((s) => s.descuentoGlobalPct);
  const motivoDescuento = useVenta((s) => s.motivoDescuento);
  const setDescuentoGlobal = useVenta((s) => s.setDescuentoGlobal);

  const subtotal = calcularSubtotal(items);
  const descuentoGlobal = calcularDescuentoGlobal(subtotal, descuentoGlobalPct);
  const baseVenta = calcularBaseVenta(items, descuentoGlobalPct);
  const cant = items.reduce((acc, i) => acc + i.cantidad, 0);

  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesion = useSesion((s) => s.sesionCaja);

  const clienteQ = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => (clienteId ? db.clientes.get(clienteId) : Promise.resolve(null)),
    enabled: !!clienteId,
  });

  const [editDto, setEditDto] = useState(false);

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="border-b p-4">
        <div className="text-xs text-muted-foreground">Cajero</div>
        <div className="font-medium">
          {empleado?.nombre} {empleado?.apellido}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Caja · Sesión</div>
        <div className="text-sm">
          {caja?.nombre} · #{sesion?.id.slice(-6)}
        </div>
      </div>

      <div className="border-b p-4">
        <div className="mb-1 text-xs text-muted-foreground">Cliente</div>
        {clienteQ.data ? (
          <div>
            <div className="font-medium">
              {clienteQ.data.nombre} {clienteQ.data.apellido}
            </div>
            {clienteQ.data.dni && (
              <div className="text-xs text-muted-foreground">DNI {clienteQ.data.dni}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Consumidor final</div>
        )}
        <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={onBuscarCliente}>
          {clienteQ.data ? 'Cambiar' : 'Identificar cliente'} ·{' '}
          {SHORTCUT_LABELS.buscarCliente}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Items</span>
            <span>{cant}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {descuentoGlobalPct > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Descuento {descuentoGlobalPct}%</span>
              <span>-{formatCurrency(descuentoGlobal)}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          {editDto ? (
            <div className="rounded-md border p-3">
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <Label className="mb-1 block text-xs">Motivo</Label>
                  <Input
                    placeholder="ej: Promo terminal"
                    value={motivoDescuento ?? ''}
                    onChange={(e) => setDescuentoGlobal(descuentoGlobalPct, e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">%</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={descuentoGlobalPct}
                    onChange={(e) =>
                      setDescuentoGlobal(parseFloat(e.target.value) || 0, motivoDescuento)
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDescuentoGlobal(0);
                    setEditDto(false);
                  }}
                >
                  Quitar
                </Button>
                <Button size="sm" onClick={() => setEditDto(false)}>
                  OK
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setEditDto(true)}
              disabled={items.length === 0}
            >
              <Tag className="mr-1 h-3 w-3" />
              {descuentoGlobalPct > 0
                ? `Descuento ${descuentoGlobalPct}% aplicado`
                : 'Agregar descuento'}
            </Button>
          )}
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="text-xs uppercase text-muted-foreground">Total a cobrar</div>
          <div className="text-4xl font-semibold tabular-nums">{formatCurrency(baseVenta)}</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Recargo/descuento por forma de pago se aplica en el cobro.
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t bg-background p-4">
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={items.length === 0}
          onClick={onCobrar}
        >
          Cobrar · {SHORTCUT_LABELS.cobrarEfectivo}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={items.length === 0}
          onClick={onCancelar}
        >
          Cancelar venta · {SHORTCUT_LABELS.cancelar}
        </Button>
      </div>

      <VentasDelDia />
    </div>
  );
}
