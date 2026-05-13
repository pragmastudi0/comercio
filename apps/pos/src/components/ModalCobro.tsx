import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, CreditCard, Smartphone, ArrowLeftRight, Wallet, X } from 'lucide-react';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { formatCurrency } from '@comercio/ui/utils';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { calcularSubtotal, useVenta } from '@/stores/venta';
import type { MetodoPago, PagoVenta } from '@comercio/db';

type MetodoConfig = {
  metodo: MetodoPago;
  label: string;
  icon: typeof Banknote;
  requiereCliente?: boolean;
};

const METODOS: MetodoConfig[] = [
  { metodo: 'efectivo', label: 'Efectivo', icon: Banknote },
  { metodo: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { metodo: 'debito', label: 'Débito', icon: CreditCard },
  { metodo: 'credito', label: 'Crédito (cuotas)', icon: CreditCard },
  { metodo: 'qr', label: 'QR', icon: Smartphone },
  { metodo: 'cta_cte', label: 'Cuenta corriente', icon: Wallet, requiereCliente: true },
];

export function ModalCobro({
  open,
  onOpenChange,
  metodoInicial,
  onCobrado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metodoInicial?: MetodoPago;
  onCobrado: (ventaId: string) => void;
}) {
  const db = getDb();
  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesion = useSesion((s) => s.sesionCaja);
  const items = useVenta((s) => s.items);
  const clienteId = useVenta((s) => s.clienteId);
  const limpiar = useVenta((s) => s.limpiar);

  const subtotal = useMemo(() => calcularSubtotal(items), [items]);
  const [pagos, setPagos] = useState<PagoVenta[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [cuotas, setCuotas] = useState(1);
  const [montoInput, setMontoInput] = useState<string>('');

  const configQ = useQuery({
    queryKey: ['config-empresa'],
    queryFn: () => db.configuracion.get('emp_demo'),
  });

  useEffect(() => {
    if (open) {
      setPagos([]);
      setMetodo(metodoInicial ?? null);
      setCuotas(1);
      setMontoInput('');
    }
  }, [open, metodoInicial]);

  // Cálculo: a partir del subtotal y los pagos aplicados, restante a cubrir
  const totalCubierto = pagos.reduce((acc, p) => {
    // Si efectivo: ya viene con descuento aplicado en el monto del pago
    // Si crédito: ya viene con recargo aplicado
    // El monto representa lo que el cliente paga / debe (no el "subtotal cubierto")
    return acc + p.monto;
  }, 0);

  // Para saber cuánto del subtotal queda por cubrir (sin descuentos/recargos):
  const subtotalCubierto = pagos.reduce((acc, p) => {
    if (p.metodo === 'efectivo') {
      const dto = configQ.data?.descuento_efectivo_pct ?? 0;
      // monto = cubierto * (1 - dto/100)  ->  cubierto = monto / (1 - dto/100)
      return acc + p.monto / (1 - dto / 100);
    }
    if (p.metodo === 'credito') {
      const rec = p.recargo_pct ?? 0;
      // monto = cubierto * (1 + rec/100) -> cubierto = monto / (1 + rec/100)
      return acc + p.monto / (1 + rec / 100);
    }
    return acc + p.monto;
  }, 0);

  const restante = Math.max(0, subtotal - subtotalCubierto);
  const totalPagar = totalCubierto + calcularPagoFinal(restante, metodo, cuotas, configQ.data?.descuento_efectivo_pct ?? 0, configQ.data?.cuotas ?? []);

  function calcularPagoFinal(
    base: number,
    met: MetodoPago | null,
    cuo: number,
    dtoEfectivoPct: number,
    cuotas: { cuotas: number; recargo_pct: number }[],
  ): number {
    if (!met || base <= 0) return 0;
    if (met === 'efectivo') return base * (1 - dtoEfectivoPct / 100);
    if (met === 'credito') {
      const cuotaConf = cuotas.find((c) => c.cuotas === cuo);
      return base * (1 + (cuotaConf?.recargo_pct ?? 0) / 100);
    }
    return base;
  }

  function agregarPagoActual() {
    if (!metodo) return;
    if (metodo === 'cta_cte' && !clienteId) {
      toast.error('Cta corriente requiere cliente identificado');
      return;
    }
    const montoCubrir = parseFloat(montoInput) || restante;
    if (montoCubrir <= 0) {
      toast.error('Monto inválido');
      return;
    }
    if (montoCubrir > restante + 0.01) {
      toast.error(`No supera el restante (${formatCurrency(restante)})`);
      return;
    }

    const dtoEfectivo = configQ.data?.descuento_efectivo_pct ?? 0;
    const cuotaConf = configQ.data?.cuotas.find((c) => c.cuotas === cuotas);
    const recargoPct = metodo === 'credito' ? (cuotaConf?.recargo_pct ?? 0) : 0;

    const pago: PagoVenta = {
      metodo,
      monto: calcularPagoFinal(montoCubrir, metodo, cuotas, dtoEfectivo, configQ.data?.cuotas ?? []),
      ...(metodo === 'credito' ? { cuotas, recargo_pct: recargoPct } : {}),
    };

    setPagos((p) => [...p, pago]);
    setMontoInput('');
    setMetodo(null);
  }

  const cobrarMut = useMutation({
    mutationFn: async () => {
      if (!empleado || !caja || !sesion) throw new Error('Sesión inválida');
      if (pagos.length === 0) throw new Error('No hay pagos');
      const items_payload = items.map((it) => ({
        producto_id: it.producto.id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        descuento_pct: it.descuento_pct,
        subtotal: it.cantidad * it.precio_unitario,
      }));
      const total = pagos.reduce((acc, p) => acc + p.monto, 0);
      const descuento_total = pagos
        .filter((p) => p.metodo === 'efectivo')
        .reduce((acc, p) => {
          const dto = configQ.data?.descuento_efectivo_pct ?? 0;
          const base = p.monto / (1 - dto / 100);
          return acc + (base - p.monto);
        }, 0);
      const recargo_total = pagos
        .filter((p) => p.metodo === 'credito')
        .reduce((acc, p) => {
          const rec = p.recargo_pct ?? 0;
          const base = p.monto / (1 + rec / 100);
          return acc + (p.monto - base);
        }, 0);

      const venta = await db.ventas.crear({
        caja_id: caja.id,
        sesion_caja_id: sesion.id,
        local_id: caja.local_id,
        deposito_id: empleado.deposito_id ?? 'dep_central',
        empleado_id: empleado.id,
        cliente_id: clienteId ?? undefined,
        items: items_payload,
        pagos,
        subtotal,
        descuento_total,
        recargo_total,
        total,
      });
      return venta;
    },
    onSuccess: (v) => {
      toast.success(`Venta ${v.numero} confirmada`);
      limpiar();
      onOpenChange(false);
      onCobrado(v.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;
  const cuotasOpciones = configQ.data?.cuotas ?? [];
  const totalConPagoActual = totalCubierto + calcularPagoFinal(
    parseFloat(montoInput) || restante,
    metodo,
    cuotas,
    configQ.data?.descuento_efectivo_pct ?? 0,
    configQ.data?.cuotas ?? [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Cobrar</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_3fr]">
        <div className="space-y-2 rounded-md bg-muted/30 p-4">
          <div className="text-xs uppercase text-muted-foreground">Subtotal</div>
          <div className="text-2xl font-semibold tabular-nums">{formatCurrency(subtotal)}</div>

          {pagos.length > 0 && (
            <div className="mt-4 space-y-1 border-t pt-3">
              {pagos.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {labelMetodo(p.metodo)}
                    {p.cuotas ? ` · ${p.cuotas} cuotas` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{formatCurrency(p.monto)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setPagos((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Restante</div>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(restante)}</div>
          </div>
          <div className="mt-3">
            <div className="text-xs uppercase text-muted-foreground">Total a cobrar</div>
            <div className="text-3xl font-bold tabular-nums text-primary">
              {formatCurrency(totalConPagoActual || totalCubierto)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Método de pago</Label>
          <div className="grid grid-cols-2 gap-2">
            {METODOS.map((m) => {
              const Icon = m.icon;
              const disabled = m.requiereCliente && !clienteId;
              return (
                <button
                  key={m.metodo}
                  onClick={() => {
                    setMetodo(m.metodo);
                    setMontoInput(String(restante.toFixed(2)));
                  }}
                  disabled={disabled || restante <= 0}
                  className={`flex items-center gap-3 rounded-md border p-3 text-left text-sm transition disabled:opacity-50 ${
                    metodo === m.metodo
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>

          {metodo === 'credito' && (
            <div>
              <Label className="mb-1 block text-sm">Cuotas</Label>
              <div className="flex flex-wrap gap-2">
                {cuotasOpciones.map((c) => (
                  <button
                    key={c.cuotas}
                    onClick={() => setCuotas(c.cuotas)}
                    className={`rounded border px-3 py-2 text-sm transition ${
                      cuotas === c.cuotas
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    {c.cuotas}x{' '}
                    <span className="text-xs text-muted-foreground">
                      ({c.recargo_pct > 0 ? `+${c.recargo_pct}%` : 'sin recargo'})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {metodo && (
            <div>
              <Label className="mb-1 block text-sm">
                Monto a cubrir del subtotal restante
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarPagoActual()}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {metodo === 'efectivo' &&
                  `Aplica -${configQ.data?.descuento_efectivo_pct ?? 0}% descuento`}
                {metodo === 'credito' &&
                  cuotasOpciones.find((c) => c.cuotas === cuotas)?.recargo_pct ? (
                  <>Aplica +{cuotasOpciones.find((c) => c.cuotas === cuotas)?.recargo_pct}% recargo</>
                ) : null}
                {metodo === 'cta_cte' && !clienteId && (
                  <span className="text-destructive">
                    Identificar cliente antes (F3)
                  </span>
                )}
              </p>
              <Button className="mt-2 w-full" onClick={agregarPagoActual}>
                Agregar pago
              </Button>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cobrarMut.isPending}>
          Cancelar
        </Button>
        <Button
          disabled={restante > 0.01 || pagos.length === 0 || cobrarMut.isPending}
          onClick={() => cobrarMut.mutate()}
        >
          {cobrarMut.isPending ? 'Procesando…' : `Confirmar venta · ${formatCurrency(totalCubierto)}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function labelMetodo(m: MetodoPago): string {
  return METODOS.find((x) => x.metodo === m)?.label ?? m;
}
