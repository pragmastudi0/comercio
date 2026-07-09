import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PRESET_IDS } from '@comercio/db';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@comercio/ui/dialog';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import { Printer, ArrowLeft, Ban, RefreshCw } from 'lucide-react';
import { ModalCambio } from '@/components/ModalCambio';

const LABEL_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cta_cte: 'Cuenta corriente',
};

export function Ticket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);
  const [cambioOpen, setCambioOpen] = useState(false);
  const [anularOpen, setAnularOpen] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState('');

  const ventaQ = useQuery({
    queryKey: ['venta', id],
    queryFn: () => (id ? db.ventas.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  const anularMut = useMutation({
    mutationFn: async () => {
      if (!id || !empleado) throw new Error('Sesión inválida');
      const m = motivoAnular.trim();
      if (m.length < 3) throw new Error('Indicá un motivo (mínimo 3 caracteres).');
      return db.ventas.anular(id, empleado.id, m);
    },
    onSuccess: () => {
      toast.success('Venta anulada. El stock vuelve al local.');
      setAnularOpen(false);
      setMotivoAnular('');
      qc.invalidateQueries({ queryKey: ['venta', id] });
      qc.invalidateQueries({ queryKey: ['ventas-sesion'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const productosQ = useQuery({ queryKey: ['productos-all'], queryFn: () => db.productos.list() });
  const configQ = useQuery({
    queryKey: ['config-ticket'],
    queryFn: () => db.configuracion.get(PRESET_IDS.empresa),
  });
  const empleadosQ = useQuery({ queryKey: ['empleados-ticket'], queryFn: () => db.empleados.list() });

  // El auto-print al cobrar fue removido a pedido del cliente: el cajero
  // imprime SOLO si lo necesita, apretando el botón "Imprimir" en el
  // header. Evita el popup molesto en cada venta.

  if (ventaQ.isLoading) {
    return (
      <main className="container mx-auto max-w-xl p-6">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }
  const venta = ventaQ.data;
  if (!venta) {
    return (
      <main className="container mx-auto max-w-xl p-6">
        <p>Venta no encontrada.</p>
        <Link to="/caja" className="underline">
          Volver
        </Link>
      </main>
    );
  }

  const nombre = (productoId: string) =>
    productosQ.data?.find((p) => p.id === productoId)?.nombre ?? '—';
  const codigo = (productoId: string) =>
    productosQ.data?.find((p) => p.id === productoId)?.codigo_interno ?? '—';

  // El cajero puede anular CUALQUIER venta del día del sistema. Antes se
  // requería que la venta fuera "propia" (venta.empleado_id === empleado.id),
  // pero en la práctica todos operan sobre la sesión que quedó logueada
  // en el PoS, así que las ventas quedan atribuidas al usuario logueado
  // aunque físicamente las haya cobrado otro cajero. Con la regla vieja,
  // si Andrés llega y quiere anular una venta que en el sistema figura
  // hecha por Susana (aunque él la haya cobrado), no podía. Ahora sí.
  // La anulación queda registrada en auditoría con el empleado que la
  // anuló, así que hay trazabilidad completa.
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const esAnulableHoy =
    !!empleado &&
    venta.estado === 'completada' &&
    new Date(venta.fecha) >= inicioDelDia;

  // El cambio está habilitado si la venta es de los últimos 2 días y está
  // completada. Política Turisteando: 2 días de garantía para cambios por
  // rotura/falla. NO requiere que sea del mismo cajero — cualquier cajero
  // del local puede atender el cambio.
  const haceDosDias = new Date();
  haceDosDias.setHours(0, 0, 0, 0);
  haceDosDias.setDate(haceDosDias.getDate() - 1);
  const esCambiable =
    venta.estado === 'completada' && new Date(venta.fecha) >= haceDosDias;

  return (
    <>
      <header className="no-print border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/caja')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Nueva venta
          </Button>
          <div className="flex gap-2">
            {esCambiable && (
              <Button
                variant="outline"
                size="sm"
                className="border-primary/40"
                onClick={() => setCambioOpen(true)}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Cambio
              </Button>
            )}
            {esAnulableHoy && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setAnularOpen(true)}
              >
                <Ban className="mr-1 h-4 w-4" />
                Anular
              </Button>
            )}
            <Button onClick={() => window.print()} size="sm">
              <Printer className="mr-1 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </header>

      <ModalCambio
        venta={venta}
        open={cambioOpen}
        onOpenChange={setCambioOpen}
      />

      <Dialog open={anularOpen} onOpenChange={setAnularOpen}>
        <DialogHeader>
          <DialogTitle>¿Anular venta {venta.numero}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Se devuelve el stock al local y se registra un contramovimiento
            por <b>{formatCurrency(venta.total)}</b> en la caja. Queda en el
            historial con tu nombre y el motivo. <b>No se puede deshacer.</b>
          </p>
        </DialogHeader>
        <div>
          <Label htmlFor="motivo-anular">Motivo</Label>
          <Input
            id="motivo-anular"
            value={motivoAnular}
            onChange={(e) => setMotivoAnular(e.target.value)}
            placeholder="Ej: cliente se arrepintió, ítem mal cobrado"
            className="mt-1"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAnularOpen(false)}
            disabled={anularMut.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => anularMut.mutate()}
            disabled={anularMut.isPending || motivoAnular.trim().length < 3}
          >
            {anularMut.isPending ? 'Anulando…' : 'Sí, anular venta'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Detalle de venta — pasamos del estilo "ticket de papel" a una
          vista limpia con tabla, según pedido del cliente. El cajero rara
          vez imprime: lo que necesita es ver los productos vendidos para
          atender un cambio o decidir anular. El botón "Imprimir" sigue
          arriba por si lo necesitan en algún caso. */}
      <main className="container mx-auto max-w-3xl px-4 py-6 print:max-w-none print:p-2">
        <div className="rounded-lg border bg-card p-4 sm:p-6">
          {/* Header: venta # + fecha + cajero + estado */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Venta</div>
              <div className="text-lg font-semibold tabular-nums">{venta.numero}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDate(venta.fecha)}
                {(() => {
                  const emp = empleadosQ.data?.find((e) => e.id === venta.empleado_id);
                  return emp ? ` · Cajero: ${emp.nombre} ${emp.apellido}` : '';
                })()}
              </div>
            </div>
            {venta.estado === 'anulada' && (
              <div className="rounded border-2 border-destructive px-3 py-1 text-sm font-bold uppercase tracking-wider text-destructive">
                Anulada
              </div>
            )}
            {venta.estado === 'presupuesto' && (
              <div className="rounded border-2 border-amber-500 px-3 py-1 text-sm font-bold uppercase tracking-wider text-amber-700">
                Presupuesto
              </div>
            )}
          </div>

          {/* Tabla de productos vendidos */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {venta.items.map((it, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {codigo(it.producto_id)}
                    </td>
                    <td className="px-3 py-2">{nombre(it.producto_id)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.cantidad}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(it.precio_unitario)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resumen + pagos en columnas paralelas en pantallas medianas+ */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 text-sm">
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Resumen
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(venta.subtotal)}</span>
              </div>
              {venta.descuento_total > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Descuento</span>
                  <span className="tabular-nums">
                    -{formatCurrency(venta.descuento_total)}
                  </span>
                </div>
              )}
              {venta.recargo_total > 0 && (
                <div className="flex justify-between text-orange-700">
                  <span>Recargo</span>
                  <span className="tabular-nums">
                    +{formatCurrency(venta.recargo_total)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(venta.total)}</span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Pagos
              </div>
              {venta.pagos.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {LABEL_METODO[p.metodo] ?? p.metodo}
                    {p.cuotas ? ` (${p.cuotas} cuotas)` : ''}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(p.monto)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
