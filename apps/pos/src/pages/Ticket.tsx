import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency, formatDate } from '@comercio/ui/utils';
import { Printer, ArrowLeft } from 'lucide-react';

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

  const ventaQ = useQuery({
    queryKey: ['venta', id],
    queryFn: () => (id ? db.ventas.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
  const productosQ = useQuery({ queryKey: ['productos-all'], queryFn: () => db.productos.list() });

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

  return (
    <>
      <header className="no-print border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/caja')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Nueva venta
          </Button>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="mr-1 h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-md p-6 print:p-2">
        <div className="ticket rounded border border-dashed bg-white p-6 font-mono text-sm text-black print:border-0 print:p-0">
          <div className="mb-3 text-center">
            <div className="font-bold uppercase">Comercio Terminal Córdoba</div>
            <div className="text-xs">Estación Terminal de Ómnibus</div>
            <div className="mt-2 text-xs">
              {venta.estado === 'presupuesto' ? 'PRESUPUESTO' : 'COMPROBANTE NO FISCAL'}
            </div>
            <div className="text-xs">N° {venta.numero}</div>
            <div className="text-xs">{formatDate(venta.fecha)}</div>
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
