import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag, Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
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
import type { MetodoPago } from '@comercio/db';
// VentasDelDia ya no se incluye acá; se renderiza como columna separada en Caja.tsx.

type Props = {
  onCobrar: (metodo?: MetodoPago) => void;
  onBuscarCliente: () => void;
  onCancelar: () => void;
};

export function ResumenVenta({ onCobrar, onBuscarCliente, onCancelar }: Props) {
  const db = getDb();
  const items = useVenta((s) => s.items);
  const clienteId = useVenta((s) => s.clienteId);
  const descuentoModo = useVenta((s) => s.descuentoModo);
  const descuentoValor = useVenta((s) => s.descuentoValor);
  const motivoDescuento = useVenta((s) => s.motivoDescuento);
  const setDescuento = useVenta((s) => s.setDescuento);
  const limpiarDescuento = useVenta((s) => s.limpiarDescuento);

  const subtotal = calcularSubtotal(items);
  const descuentoGlobal = calcularDescuentoGlobal(subtotal, descuentoModo, descuentoValor);
  const baseVenta = calcularBaseVenta(items, descuentoModo, descuentoValor);
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
  const hayItems = items.length > 0;

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="border-b p-4">
        <div className="text-xs text-muted-foreground">Cajero</div>
        <div className="font-medium">
          {empleado?.nombre} {empleado?.apellido}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Caja</div>
        <div className="text-sm">
          {caja?.nombre} · sesión #{sesion?.id.slice(-6)}
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
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Items</span>
            <span>{cant}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {descuentoValor > 0 && (
            <div className="flex justify-between text-green-700">
              <span>
                Descuento{' '}
                {descuentoModo === 'pct'
                  ? `${descuentoValor}%`
                  : 'monto fijo'}
              </span>
              <span>-{formatCurrency(descuentoGlobal)}</span>
            </div>
          )}
        </div>

        <div className="mt-3">
          {editDto ? (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={descuentoModo === 'pct' ? 'default' : 'outline'}
                  onClick={() => setDescuento('pct', descuentoValor, motivoDescuento)}
                  className="flex-1"
                >
                  % Porcentaje
                </Button>
                <Button
                  size="sm"
                  variant={descuentoModo === 'monto' ? 'default' : 'outline'}
                  onClick={() => setDescuento('monto', descuentoValor, motivoDescuento)}
                  className="flex-1"
                >
                  $ Monto fijo
                </Button>
              </div>
              <div>
                <Label className="mb-1 block text-xs">
                  {descuentoModo === 'pct' ? '% sobre subtotal' : 'Monto a descontar'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max={descuentoModo === 'pct' ? 100 : subtotal}
                  value={descuentoValor}
                  onChange={(e) =>
                    setDescuento(descuentoModo, parseFloat(e.target.value) || 0, motivoDescuento)
                  }
                  autoFocus
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Motivo (queda en auditoría)</Label>
                <Input
                  value={motivoDescuento ?? ''}
                  onChange={(e) => setDescuento(descuentoModo, descuentoValor, e.target.value)}
                  placeholder="Ej: Promo terminal, cliente VIP"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    limpiarDescuento();
                    setEditDto(false);
                  }}
                  className="flex-1"
                >
                  Quitar
                </Button>
                <Button size="sm" onClick={() => setEditDto(false)} className="flex-1">
                  Aplicar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setEditDto(true)}
              disabled={!hayItems}
            >
              <Tag className="mr-1 h-3 w-3" />
              {descuentoValor > 0
                ? descuentoModo === 'pct'
                  ? `Descuento ${descuentoValor}%`
                  : `Descuento ${formatCurrency(descuentoValor)}`
                : 'Agregar descuento'}
            </Button>
          )}
        </div>

        <div className="mt-5 border-t pt-3">
          <div className="text-xs uppercase text-muted-foreground">Total a cobrar</div>
          <div className="text-4xl font-bold tabular-nums">{formatCurrency(baseVenta)}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Recargos/descuentos por forma de pago se aplican al elegir el método.
          </p>
        </div>
      </div>

      <div className="border-t bg-background p-3">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Button
            size="lg"
            disabled={!hayItems}
            onClick={() => onCobrar('efectivo')}
            className="h-14 flex-col gap-0 text-xs"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Banknote className="h-4 w-4" />
              Efectivo
            </span>
            <span className="text-[10px] opacity-75">F5</span>
          </Button>
          <Button
            size="lg"
            disabled={!hayItems}
            onClick={() => onCobrar('credito')}
            variant="secondary"
            className="h-14 flex-col gap-0 text-xs"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4" />
              Tarjeta
            </span>
            <span className="text-[10px] opacity-75">F6</span>
          </Button>
          <Button
            size="lg"
            disabled={!hayItems}
            onClick={() => onCobrar('qr')}
            variant="secondary"
            className="h-14 flex-col gap-0 text-xs"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4" />
              QR / Transf.
            </span>
            <span className="text-[10px] opacity-75">F7</span>
          </Button>
          <Button
            size="lg"
            disabled={!hayItems || !clienteId}
            onClick={() => onCobrar('cta_cte')}
            variant="secondary"
            className="h-14 flex-col gap-0 text-xs"
            title={!clienteId ? 'Requiere identificar cliente (F3)' : ''}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4" />
              Cta cte
            </span>
            <span className="text-[10px] opacity-75">F8</span>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive"
          disabled={!hayItems}
          onClick={onCancelar}
        >
          Cancelar venta · {SHORTCUT_LABELS.cancelar}
        </Button>
      </div>
    </div>
  );
}
