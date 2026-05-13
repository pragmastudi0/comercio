import { useVenta, calcularSubtotal } from '@/stores/venta';
import { Button } from '@comercio/ui/button';
import { formatCurrency } from '@comercio/ui/utils';
import { SHORTCUT_LABELS } from '@/lib/shortcuts';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';

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
  const subtotal = calcularSubtotal(items);
  const cant = items.reduce((acc, i) => acc + i.cantidad, 0);

  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesion = useSesion((s) => s.sesionCaja);

  const clienteQ = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => (clienteId ? db.clientes.get(clienteId) : Promise.resolve(null)),
    enabled: !!clienteId,
  });

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
        <Button
          variant="link"
          className="mt-1 h-auto p-0 text-xs"
          onClick={onBuscarCliente}
        >
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
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="text-xs uppercase text-muted-foreground">Total</div>
          <div className="text-4xl font-semibold tabular-nums">{formatCurrency(subtotal)}</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Descuentos y recargos se aplican al elegir método de pago.
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
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={items.length === 0} onClick={onCancelar}>
            Cancelar venta · {SHORTCUT_LABELS.cancelar}
          </Button>
        </div>
      </div>
    </div>
  );
}
