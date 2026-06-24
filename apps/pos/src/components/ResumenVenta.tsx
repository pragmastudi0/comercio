import { useState } from 'react';
import { Tag, Banknote, CreditCard, Smartphone } from 'lucide-react';
import {
  calcularBaseVenta,
  calcularDescuentoGlobal,
  calcularSubtotal,
  useVenta,
} from '@/stores/venta';
import { useSesion } from '@/stores/sesion';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';
import { SHORTCUT_LABELS } from '@/lib/shortcuts';
import type { MetodoPago } from '@comercio/db';
// VentasDelDia ya no se incluye acá; se renderiza como columna separada en Caja.tsx.

type Props = {
  onCobrar: (metodo?: MetodoPago) => void;
  onCancelar: () => void;
};

export function ResumenVenta({ onCobrar, onCancelar }: Props) {
  const items = useVenta((s) => s.items);
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

  const [editDto, setEditDto] = useState(false);
  const hayItems = items.length > 0;

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Header súper compacto: la info ya está en el header global de Caja.tsx;
          acá solo dejamos un recordatorio mínimo en 1 línea. */}
      <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        {empleado?.nombre} {empleado?.apellido} · {caja?.nombre} · #{sesion?.id.slice(-6)} · Consumidor final
      </div>

      {/* Bloque de números compacto */}
      <div className="border-b px-3 py-2 text-sm">
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
              Descuento {descuentoModo === 'pct' ? `${descuentoValor}%` : 'monto fijo'}
            </span>
            <span>-{formatCurrency(descuentoGlobal)}</span>
          </div>
        )}
      </div>

      {/* Descuento (botón colapsado o form abierto) */}
      <div className="border-b p-3">
        {editDto ? (
          <div className="space-y-2 rounded-md border bg-background p-2">
            <div className="flex items-stretch gap-1">
              <Button
                size="sm"
                variant={descuentoModo === 'pct' ? 'default' : 'outline'}
                onClick={() => setDescuento('pct', descuentoValor, motivoDescuento)}
                className="h-9 w-10 shrink-0 px-0 text-base font-semibold"
                title="Porcentaje"
              >
                %
              </Button>
              <Button
                size="sm"
                variant={descuentoModo === 'monto' ? 'default' : 'outline'}
                onClick={() => setDescuento('monto', descuentoValor, motivoDescuento)}
                className="h-9 w-10 shrink-0 px-0 text-base font-semibold"
                title="Monto fijo"
              >
                $
              </Button>
              <Input
                type="number"
                min="0"
                max={descuentoModo === 'pct' ? 100 : subtotal}
                value={descuentoValor || ''}
                placeholder={descuentoModo === 'pct' ? '%' : 'monto'}
                onChange={(e) =>
                  setDescuento(descuentoModo, parseFloat(e.target.value) || 0, motivoDescuento)
                }
                onFocus={(e) => e.currentTarget.select()}
                autoFocus
                className="h-9 flex-1 text-right text-base"
              />
            </div>
            <Input
              value={motivoDescuento ?? ''}
              onChange={(e) => setDescuento(descuentoModo, descuentoValor, e.target.value)}
              placeholder="Motivo (queda en auditoría)"
              className="h-8 text-xs"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  limpiarDescuento();
                  setEditDto(false);
                }}
                className="h-8 flex-1 text-xs"
              >
                Quitar
              </Button>
              <Button size="sm" onClick={() => setEditDto(false)} className="h-8 flex-1 text-xs">
                Aplicar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full"
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

      {/* TOTAL gigante: ocupa TODO el espacio sobrante, centrado vertical.
          Así se aprovecha el aside completo y el cliente lee el monto
          desde el otro lado del mostrador. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Total a cobrar
        </div>
        <div
          className="mt-1 w-full text-center font-bold leading-none tabular-nums"
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          }}
        >
          {formatCurrency(baseVenta)}
        </div>
        <div className="mt-2 text-center text-[10px] leading-tight text-muted-foreground">
          Recargos por forma de pago se aplican al elegir el método.
        </div>
      </div>

      <div className="border-t bg-background p-3">
        <div className="mb-2 grid grid-cols-3 gap-2">
          <Button
            size="lg"
            disabled={!hayItems}
            onClick={() => onCobrar('efectivo')}
            className="flex h-auto flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-xs"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
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
            className="flex h-auto flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-xs"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
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
            className="flex h-auto flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-xs"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Smartphone className="h-4 w-4" />
              QR / Transf.
            </span>
            <span className="text-[10px] opacity-75">F7</span>
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
