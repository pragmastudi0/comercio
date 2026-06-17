import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BRAND } from '@comercio/business';
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
import { Printer, ArrowLeft, Receipt, Ban } from 'lucide-react';
import { ModalNotaCredito } from '@/components/ModalNotaCredito';

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
  const [ncOpen, setNcOpen] = useState(false);
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
      toast.success('Venta anulada. El stock vuelve al depósito.');
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

  // Auto-print al cargar la primera vez (después de cobrar)
  useEffect(() => {
    if (ventaQ.data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
    return;
  }, [ventaQ.data]);

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

  // El cajero puede anular su propia venta del día. Validación servidor
  // adicional vive en el repo (chequea permisos del rol).
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const esPropiaDelDia =
    !!empleado &&
    venta.estado === 'completada' &&
    venta.empleado_id === empleado.id &&
    new Date(venta.fecha) >= inicioDelDia;

  return (
    <>
      <header className="no-print border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/caja')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Nueva venta
          </Button>
          <div className="flex gap-2">
            {venta.estado === 'completada' && (
              <Button variant="outline" size="sm" onClick={() => setNcOpen(true)}>
                <Receipt className="mr-1 h-4 w-4" />
                Nota de crédito
              </Button>
            )}
            {esPropiaDelDia && (
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

      <ModalNotaCredito
        venta={venta}
        open={ncOpen}
        onOpenChange={setNcOpen}
      />

      <Dialog open={anularOpen} onOpenChange={setAnularOpen}>
        <DialogHeader>
          <DialogTitle>¿Anular venta {venta.numero}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Se devuelve el stock al depósito y se registra un contramovimiento
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

      <main className="container mx-auto max-w-md p-6 print:p-2">
        <div className="ticket rounded border border-dashed bg-white p-6 font-mono text-sm text-black print:border-0 print:p-0">
          <div className="mb-3 text-center">
            {configQ.data?.comercio?.logo_url && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                src={configQ.data.comercio.logo_url}
                alt=""
                className="mx-auto mb-1 h-12 w-12 object-contain"
              />
            )}
            <div className="font-bold uppercase">
              {configQ.data?.comercio?.razon_social || BRAND.nombreCompleto}
            </div>
            {configQ.data?.comercio?.direccion && (
              <div className="text-xs">{configQ.data.comercio.direccion}</div>
            )}
            {configQ.data?.comercio?.cuit && (
              <div className="text-xs">CUIT {configQ.data.comercio.cuit}</div>
            )}
            {configQ.data?.comercio?.telefono && (
              <div className="text-xs">Tel: {configQ.data.comercio.telefono}</div>
            )}
            <div className="mt-2 text-xs">
              {venta.estado === 'presupuesto' ? 'PRESUPUESTO' : 'COMPROBANTE NO FISCAL'}
            </div>
            {venta.estado === 'anulada' && (
              <div className="mt-1 inline-block rounded border-2 border-red-600 px-3 py-1 text-base font-bold uppercase tracking-wider text-red-600">
                ANULADA
              </div>
            )}
            <div className="text-xs">N° {venta.numero}</div>
            <div className="text-xs">{formatDate(venta.fecha)}</div>
            {(() => {
              const emp = empleadosQ.data?.find((e) => e.id === venta.empleado_id);
              return emp ? (
                <div className="text-xs">
                  Cajero: {emp.nombre} {emp.apellido}
                </div>
              ) : null;
            })()}
          </div>

          <div className="my-3 border-t border-dashed pt-2">
            {venta.items.map((it, idx) => (
              <div key={idx} className="mb-2">
                <div className="flex justify-between text-xs">
                  <span>{codigo(it.producto_id)}</span>
                  <span>{nombre(it.producto_id)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>
                    {it.cantidad} x {formatCurrency(it.precio_unitario)}
                  </span>
                  <span>{formatCurrency(it.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed pt-2 text-xs">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(venta.subtotal)}</span>
            </div>
            {venta.descuento_total > 0 && (
              <div className="flex justify-between">
                <span>Descuento</span>
                <span>-{formatCurrency(venta.descuento_total)}</span>
              </div>
            )}
            {venta.recargo_total > 0 && (
              <div className="flex justify-between">
                <span>Recargo</span>
                <span>+{formatCurrency(venta.recargo_total)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between text-base font-bold">
              <span>TOTAL</span>
              <span>{formatCurrency(venta.total)}</span>
            </div>
          </div>

          <div className="mt-3 border-t border-dashed pt-2 text-xs">
            {venta.pagos.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {LABEL_METODO[p.metodo] ?? p.metodo}
                  {p.cuotas ? ` (${p.cuotas} cuotas)` : ''}
                </span>
                <span>{formatCurrency(p.monto)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 text-center text-xs">¡Gracias por su compra!</div>
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
