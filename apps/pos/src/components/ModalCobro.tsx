import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, CreditCard, Smartphone, ArrowLeftRight, X, Check } from 'lucide-react';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { formatCurrency } from '@comercio/ui/utils';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import {
  calcularBaseVenta,
  calcularDescuentoGlobal,
  calcularSubtotal,
  useVenta,
} from '@/stores/venta';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { PRESET_IDS, type MetodoPago, type PagoVenta } from '@comercio/db';

// Regex UUID liberal (formato hex 8-4-4-4-12, sin restricción de versión RFC).
// Si el deposito_id de la sesión no es UUID (ej. residuo del modo mock con
// 'dep_central'), caer al fallback canónico de Supabase.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function depositoIdSeguro(id: string | undefined | null): string {
  return id && UUID_RE.test(id) ? id : PRESET_IDS.depositoCentralFallback;
}

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
  // Cta corriente quitada del PoS: el cajero solo vende a consumidor final.
  // La lógica del repo sigue soportándola por si la habilitamos en el futuro.
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesion = useSesion((s) => s.sesionCaja);
  const items = useVenta((s) => s.items);
  const clienteId = useVenta((s) => s.clienteId);
  const descuentoModo = useVenta((s) => s.descuentoModo);
  const descuentoValor = useVenta((s) => s.descuentoValor);
  const motivoDescuento = useVenta((s) => s.motivoDescuento);
  const limpiar = useVenta((s) => s.limpiar);

  const subtotal = useMemo(() => calcularSubtotal(items), [items]);
  const descuentoGlobal = useMemo(
    () => calcularDescuentoGlobal(subtotal, descuentoModo, descuentoValor),
    [subtotal, descuentoModo, descuentoValor],
  );
  const baseACubrir = useMemo(
    () => calcularBaseVenta(items, descuentoModo, descuentoValor),
    [items, descuentoModo, descuentoValor],
  );

  const [pagos, setPagos] = useState<PagoVenta[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [cuotas, setCuotas] = useState(1);
  const [montoInput, setMontoInput] = useState<string>('');
  const [montoRecibido, setMontoRecibido] = useState<string>('');

  // Depósito desde donde se descuenta el stock al confirmar la venta.
  // Es el del LOCAL de la caja activa, no el del empleado en su perfil.
  const { depositoId: depositoActivoId } = useDepositoActivo();

  const configQ = useQuery({
    queryKey: ['config-empresa'],
    queryFn: () => db.configuracion.get(PRESET_IDS.empresa),
  });

  useEffect(() => {
    if (open) {
      setPagos([]);
      setMetodo(metodoInicial ?? null);
      setCuotas(1);
      setMontoInput('');
      setMontoRecibido('');
    }
  }, [open, metodoInicial]);

  // Para saber cuánto del "base a cubrir" queda por cubrir:
  const baseCubierta = pagos.reduce((acc, p) => {
    if (p.metodo === 'efectivo') {
      const dto = configQ.data?.descuento_efectivo_pct ?? 0;
      return acc + p.monto / (1 - dto / 100);
    }
    if (p.metodo === 'credito') {
      const rec = p.recargo_pct ?? 0;
      return acc + p.monto / (1 + rec / 100);
    }
    return acc + p.monto;
  }, 0);

  const restante = Math.max(0, baseACubrir - baseCubierta);
  const cubiertoPct = baseACubrir > 0 ? Math.min(100, (baseCubierta / baseACubrir) * 100) : 0;

  function calcularPagoFinal(
    base: number,
    met: MetodoPago | null,
    cuo: number,
    dtoEfectivoPct: number,
    cuotasConf: { cuotas: number; recargo_pct: number }[],
  ): number {
    if (!met || base <= 0) return 0;
    if (met === 'efectivo') return base * (1 - dtoEfectivoPct / 100);
    if (met === 'credito') {
      const c = cuotasConf.find((x) => x.cuotas === cuo);
      return base * (1 + (c?.recargo_pct ?? 0) / 100);
    }
    return base;
  }

  // Total que cobra el cajero (suma de pagos)
  const totalCobrado = pagos.reduce((acc, p) => acc + p.monto, 0);
  // Adelanto de cuánto sería el "pago actual" si se agregara
  const montoCubrirActual = parseFloat(montoInput) || restante;
  const proximoPagoMonto = calcularPagoFinal(
    montoCubrirActual,
    metodo,
    cuotas,
    configQ.data?.descuento_efectivo_pct ?? 0,
    configQ.data?.cuotas ?? [],
  );

  // Cálculo de vuelto si la transacción es 100% efectivo y el cliente da más de lo que paga
  const esSoloEfectivo =
    pagos.length === 1 && pagos[0]?.metodo === 'efectivo' && restante < 0.01;
  const totalAPagar = totalCobrado;
  const recibido = parseFloat(montoRecibido) || 0;
  const vuelto = esSoloEfectivo ? Math.max(0, recibido - totalAPagar) : 0;

  function agregarPagoActual() {
    if (!metodo) return;
    if (metodo === 'cta_cte' && !clienteId) {
      toast.error('Cuenta corriente requiere cliente identificado');
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
    const recargoPct = metodo === 'credito' ? cuotaConf?.recargo_pct ?? 0 : 0;

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

      // Defensa final: validar que todos los IDs que viajan al RPC sean UUID.
      // Si algo está roto en la sesión, falla con mensaje claro antes de pegarle
      // a Supabase (evita el cryptic "invalid input syntax for type uuid").
      const idsAValidar: { campo: string; valor: string | null | undefined }[] = [
        { campo: 'empleado.id', valor: empleado.id },
        { campo: 'depositoActivo', valor: depositoActivoId },
        { campo: 'caja.id', valor: caja.id },
        { campo: 'caja.local_id', valor: caja.local_id },
        { campo: 'sesion.id', valor: sesion.id },
        ...items.map((it, i) => ({
          campo: `items[${i}].producto_id`,
          valor: it.producto.id,
        })),
      ];
      const malos = idsAValidar.filter(
        ({ valor }) => valor != null && !UUID_RE.test(valor),
      );
      if (malos.length > 0) {
        // Forzar relogin: la sesión tiene residuo del modo mock o quedó
        // desincronizada. Limpiamos el carrito + logout + nav a login en
        // el siguiente tick (para no romper el flujo de mutación).
        useSesion.getState().logout();
        setTimeout(() => navigate('/login'), 100);
        throw new Error(
          'Tu sesión quedó desincronizada. Te llevamos al login.',
        );
      }
      const items_payload = items.map((it) => ({
        producto_id: it.producto.id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        descuento_pct: it.descuento_pct,
        subtotal:
          it.cantidad * it.precio_unitario * (1 - (it.descuento_pct ?? 0) / 100),
      }));
      const total = pagos.reduce((acc, p) => acc + p.monto, 0);
      // El descuento total combina: descuentos por línea + descuento global + descuento efectivo por método
      const descuentoLineas = items.reduce((acc, it) => {
        if (!it.descuento_pct) return acc;
        return acc + it.cantidad * it.precio_unitario * (it.descuento_pct / 100);
      }, 0);
      const descuentoMetodo = pagos
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
      const descuento_total = descuentoLineas + descuentoGlobal + descuentoMetodo;

      // Reubicar stock desde otros depósitos al local si hace falta. Esto
      // sirve para el caso "cross-depósito": el cajero pudo agregar al
      // carrito un producto que solo había en otro local (B12 vendiendo
      // algo que solo estaba en C11). Antes de cobrar, movemos las
      // unidades necesarias con un ajuste, así la RPC de venta encuentra
      // todo el stock en el local.
      const depLocal = depositoIdSeguro(depositoActivoId);
      for (const it of items) {
        const todos = await db.stock.porProducto(it.producto.id);
        const enLocal = Number(
          todos.find((s) => s.deposito_id === depLocal)?.cantidad ?? 0,
        );
        const faltante = it.cantidad - enLocal;
        if (faltante <= 0) continue;
        let restante = faltante;
        for (const otro of todos) {
          if (otro.deposito_id === depLocal) continue;
          const disp = Number(otro.cantidad);
          if (disp <= 0) continue;
          const aMover = Math.min(disp, restante);
          await db.stock.ajustar({
            producto_id: it.producto.id,
            deposito_id: otro.deposito_id,
            cantidad: -aMover,
            motivo: `Auto-transfer a ${caja.nombre} para venta`,
            empleado_id: empleado.id,
          });
          await db.stock.ajustar({
            producto_id: it.producto.id,
            deposito_id: depLocal,
            cantidad: aMover,
            motivo: `Auto-transfer desde otro depósito (cajero ${caja.nombre})`,
            empleado_id: empleado.id,
          });
          restante -= aMover;
          if (restante <= 0) break;
        }
        if (restante > 0) {
          throw new Error(
            `Stock insuficiente para "${it.producto.nombre}". ` +
              `Faltan ${restante} unidades en todos los depósitos.`,
          );
        }
      }

      const venta = await db.ventas.crear({
        caja_id: caja.id,
        sesion_caja_id: sesion.id,
        local_id: caja.local_id,
        deposito_id: depositoIdSeguro(depositoActivoId),
        empleado_id: empleado.id,
        cliente_id: clienteId ?? undefined,
        items: items_payload,
        pagos,
        subtotal,
        descuento_total,
        recargo_total,
        total,
      });

      // Si hubo descuento global, registrar auditoría
      if (descuentoValor > 0) {
        await db.auditoria.log({
          empleado_id: empleado.id,
          accion: 'descuento_manual',
          entidad: 'venta',
          entidad_id: venta.id,
          detalle: {
            modo: descuentoModo,
            valor: descuentoValor,
            monto: descuentoGlobal,
            motivo: motivoDescuento ?? null,
          },
        });
      }
      return venta;
    },
    onSuccess: (v) => {
      toast.success(`Venta ${v.numero} confirmada`);
      // Refrescar inmediato el listado del turno, sin esperar el poll de 5s.
      qc.invalidateQueries({ queryKey: ['ventas-sesion'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      limpiar();
      onOpenChange(false);
      onCobrado(v.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;
  const cuotasOpciones = configQ.data?.cuotas ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>Cobrar · {formatCurrency(baseACubrir)}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_3fr]">
        <div className="space-y-3 rounded-md bg-muted/30 p-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Subtotal</div>
            <div className="text-lg tabular-nums">{formatCurrency(subtotal)}</div>
          </div>
          {descuentoValor > 0 && (
            <div>
              <div className="text-xs uppercase text-green-700">
                Descuento{' '}
                {descuentoModo === 'pct'
                  ? `${descuentoValor}%`
                  : formatCurrency(descuentoValor)}
                {motivoDescuento ? ` · ${motivoDescuento}` : ''}
              </div>
              <div className="text-lg tabular-nums text-green-700">
                -{formatCurrency(descuentoGlobal)}
              </div>
            </div>
          )}
          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Base a cobrar</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(baseACubrir)}
            </div>
          </div>

          {/* Barra de progreso del cobro */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Cubierto</span>
              <span>{cubiertoPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${cubiertoPct}%` }}
              />
            </div>
          </div>

          {pagos.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs uppercase text-muted-foreground">Pagos agregados</div>
              {pagos.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-background px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-600" />
                    {labelMetodo(p.metodo)}
                    {p.cuotas ? ` · ${p.cuotas} cuotas` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-medium tabular-nums">
                      {formatCurrency(p.monto)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setPagos((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Restante</div>
            <div
              className={`text-xl font-semibold tabular-nums ${
                restante < 0.01 ? 'text-green-700' : ''
              }`}
            >
              {formatCurrency(restante)}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Total cobrado</div>
            <div className="text-3xl font-bold tabular-nums text-primary">
              {formatCurrency(totalCobrado)}
            </div>
          </div>

          {/* Vuelto cuando es 100% efectivo */}
          {esSoloEfectivo && (
            <div className="border-t pt-3">
              <Label className="mb-1 block text-xs uppercase">Efectivo recibido</Label>
              <Input
                type="number"
                step="100"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                placeholder="0"
                className="text-right text-lg"
              />
              {recibido > 0 && (
                <div
                  className={`mt-2 rounded p-2 text-sm ${
                    vuelto > 0
                      ? 'bg-yellow-100 text-yellow-800'
                      : recibido < totalAPagar
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {vuelto > 0
                    ? `Vuelto: ${formatCurrency(vuelto)}`
                    : recibido < totalAPagar
                      ? `Falta: ${formatCurrency(totalAPagar - recibido)}`
                      : 'Justo'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Método de pago</Label>
          <div className="grid grid-cols-2 gap-2">
            {METODOS.map((m) => {
              const Icon = m.icon;
              const disabled = (m.requiereCliente && !clienteId) || restante <= 0.01;
              return (
                <button
                  key={m.metodo}
                  onClick={() => {
                    setMetodo(m.metodo);
                    setMontoInput(String(restante.toFixed(2)));
                  }}
                  disabled={disabled}
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
              <Label className="mb-1 block text-sm">Monto del subtotal a cubrir</Label>
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
                  `Aplica -${configQ.data?.descuento_efectivo_pct ?? 0}% descuento → ${formatCurrency(proximoPagoMonto)}`}
                {metodo === 'credito' &&
                cuotasOpciones.find((c) => c.cuotas === cuotas)?.recargo_pct ? (
                  <>
                    Aplica +{cuotasOpciones.find((c) => c.cuotas === cuotas)?.recargo_pct}%
                    recargo → {formatCurrency(proximoPagoMonto)}
                  </>
                ) : null}
                {metodo === 'cta_cte' && !clienteId && (
                  <span className="text-destructive">Identificar cliente antes (F3)</span>
                )}
              </p>

              {/* Calculadora de vuelto INLINE — visible apenas el cajero
                  elige Efectivo, antes de confirmar el pago. Así puede
                  tipear el billete que recibe y ver el vuelto al toque,
                  sin tener que primero "agregar pago" y después fijarse
                  arriba. La calculadora se basa en `proximoPagoMonto`
                  (ya tiene el descuento aplicado). */}
              {metodo === 'efectivo' && (() => {
                const aPagar = proximoPagoMonto;
                const entrega = parseFloat(montoRecibido) || 0;
                const vueltoLive = Math.max(0, entrega - aPagar);
                const falta = Math.max(0, aPagar - entrega);
                return (
                  <div className="mt-3 rounded-md border bg-muted/30 p-2">
                    <Label className="mb-1 block text-xs uppercase">
                      Calculadora de vuelto · cliente entrega
                    </Label>
                    <Input
                      type="number"
                      step="100"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      placeholder={`p.ej. ${Math.ceil(aPagar / 1000) * 1000}`}
                      className="text-right text-base"
                    />
                    {entrega > 0 && (
                      <div
                        className={`mt-2 rounded p-2 text-sm font-medium ${
                          vueltoLive > 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : falta > 0
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {vueltoLive > 0
                          ? `Vuelto a entregar: ${formatCurrency(vueltoLive)}`
                          : falta > 0
                            ? `Falta: ${formatCurrency(falta)}`
                            : 'Pago justo'}
                      </div>
                    )}
                    {/* Sugerencias rápidas: billetes redondos por encima
                        del monto, para que el cajero no tipee. */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sugerenciasVuelto(aPagar).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setMontoRecibido(String(b))}
                          className="rounded border border-input bg-card px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          {formatCurrency(b)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setMontoRecibido(String(aPagar))}
                        className="rounded border border-input bg-card px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        Justo
                      </button>
                    </div>
                  </div>
                );
              })()}

              <Button className="mt-2 w-full" onClick={agregarPagoActual}>
                Agregar pago de {formatCurrency(proximoPagoMonto)}
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Tip: para pago mixto agregá un pago, después elegí otro método y volvé a
                agregar.
              </p>
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
          {cobrarMut.isPending
            ? 'Procesando…'
            : `Confirmar venta · ${formatCurrency(totalCobrado)}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function labelMetodo(m: MetodoPago): string {
  return METODOS.find((x) => x.metodo === m)?.label ?? m;
}

/**
 * Sugerencias de billete típico que probablemente entrega un cliente para
 * un monto dado. Devuelve hasta 3 valores redondos POR ENCIMA del monto
 * para que el cajero los toque y se autocomplete la entrega.
 *
 * Heurística simple: redondea hacia arriba al siguiente billete de 1.000
 * y agrega los dos siguientes saltos típicos (2.000, 5.000, 10.000…).
 * Filtra duplicados y descarta los que igualen el monto exacto (esos
 * están cubiertos por el botón "Justo").
 */
function sugerenciasVuelto(aPagar: number): number[] {
  if (!aPagar || aPagar <= 0) return [];
  // Denominaciones comunes en AR. Si el monto excede, escalamos.
  const denoms = [1000, 2000, 5000, 10000, 20000];
  const out = new Set<number>();
  for (const d of denoms) {
    // Múltiplo de `d` inmediatamente superior al monto a pagar.
    const candidato = Math.ceil(aPagar / d) * d;
    if (candidato > aPagar) out.add(candidato);
    if (out.size >= 3) break;
  }
  return Array.from(out).slice(0, 3);
}
