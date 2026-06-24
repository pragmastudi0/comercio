import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { LogOut, History } from 'lucide-react';
import { BRAND } from '@comercio/business';
import { useSesion } from '@/stores/sesion';
import { useVenta } from '@/stores/venta';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { getDb } from '@/lib/db';
import { BuscadorProducto } from '@/components/BuscadorProducto';
import { Carrito } from '@/components/Carrito';
import { ResumenVenta } from '@/components/ResumenVenta';
import { ModalCobro } from '@/components/ModalCobro';
import { VentasDelDia } from '@/components/VentasDelDia';
import { SHORTCUTS, SHORTCUT_LABELS } from '@/lib/shortcuts';
import { Button } from '@comercio/ui/button';
import type { MetodoPago } from '@comercio/db';

export function Caja() {
  const navigate = useNavigate();
  const db = getDb();
  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesion = useSesion((s) => s.sesionCaja);
  const { depositoId } = useDepositoActivo();
  const items = useVenta((s) => s.items);
  const limpiar = useVenta((s) => s.limpiar);

  const [modalCobro, setModalCobro] = useState<{ open: boolean; metodo?: MetodoPago }>({
    open: false,
  });

  function abrirCobro(metodo?: MetodoPago) {
    if (items.length === 0) {
      toast.error('Carrito vacío');
      return;
    }
    setModalCobro({ open: true, metodo });
  }

  async function cancelarVenta() {
    if (items.length === 0) return;
    if (!confirm('¿Cancelar la venta actual? Se vaciará el carrito.')) return;
    // Si el carrito tenía items y hay sesión activa, registramos la venta
    // como "cancelada" para que el dueño pueda auditarla desde /admin/ventas.
    // No descuenta stock ni afecta caja.
    if (empleado && caja && sesion) {
      try {
        const subtotal = items.reduce(
          (acc, it) => acc + it.cantidad * it.precio_unitario,
          0,
        );
        await db.ventas.cancelar({
          caja_id: caja.id,
          sesion_caja_id: sesion.id,
          local_id: caja.local_id,
          deposito_id: depositoId,
          empleado_id: empleado.id,
          items: items.map((it) => ({
            producto_id: it.producto.id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            descuento_pct: it.descuento_pct,
            subtotal: it.cantidad * it.precio_unitario,
          })),
          subtotal,
          descuento_total: 0,
          recargo_total: 0,
          total: subtotal,
        });
      } catch (e) {
        // No bloquear el cancel si el registro falla — el cajero debe
        // poder limpiar el carrito sí o sí. Logueamos para diagnóstico.
        // eslint-disable-next-line no-console
        console.error('No se pudo registrar venta cancelada:', e);
      }
    }
    limpiar();
    toast.info('Venta cancelada');
  }

  useHotkeys(
    SHORTCUTS.nuevaVenta,
    (e) => {
      e.preventDefault();
      if (items.length > 0 && !confirm('Hay items en el carrito. ¿Vaciar e iniciar nueva venta?')) {
        return;
      }
      limpiar();
    },
    { enableOnFormTags: true },
  );
  useHotkeys(SHORTCUTS.cobrarEfectivo, (e) => { e.preventDefault(); abrirCobro('efectivo'); }, { enableOnFormTags: true });
  useHotkeys(SHORTCUTS.cobrarTarjeta, (e) => { e.preventDefault(); abrirCobro('credito'); }, { enableOnFormTags: true });
  useHotkeys(SHORTCUTS.cobrarQR, (e) => { e.preventDefault(); abrirCobro('qr'); }, { enableOnFormTags: true });
  useHotkeys(SHORTCUTS.cancelar, () => cancelarVenta(), { enableOnFormTags: true });

  if (!empleado || !caja) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-tight">{BRAND.nombreCorto}</span>
            <span className="text-xs text-muted-foreground">· {caja.nombre}</span>
            <span className="text-xs text-muted-foreground">
              · {empleado.nombre} {empleado.apellido}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/historial')}
              title="Historial 48hs · cambios"
            >
              <History className="mr-1 h-3 w-3" />
              Historial
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/cerrar-caja')}>
              Cerrar caja
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('¿Cerrar sesión sin cerrar la caja? Volverás al login.')) {
                  navigate('/login');
                }
              }}
              title="Salir sin cerrar caja"
            >
              <LogOut className="mr-1 h-3 w-3" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px]">
        <div className="flex flex-col overflow-hidden">
          <div className="border-b p-4">
            <BuscadorProducto />
          </div>
          <div className="flex-1 overflow-y-auto">
            <Carrito />
          </div>
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <kbd className="rounded bg-background px-1.5 py-0.5 font-mono shadow-sm">
                  {SHORTCUT_LABELS.nuevaVenta}
                </kbd>{' '}
                Nueva venta
              </span>
              <span>
                <kbd className="rounded bg-background px-1.5 py-0.5 font-mono shadow-sm">
                  {SHORTCUT_LABELS.cancelar}
                </kbd>{' '}
                Cancelar
              </span>
              <span className="text-muted-foreground/70">
                Cobro: F5 Efectivo · F6 Tarjeta · F7 QR
              </span>
              <span className="text-muted-foreground/70">
                Buscador: ↑↓ navegar · Enter agregar · Supr borrar último
              </span>
            </div>
          </div>
        </div>

        {/* overflow-hidden + min-h-0: sin esto, cuando se expande el panel
            de descuento el aside crece y el scroll interno del ResumenVenta
            deja de funcionar (no se llega a los botones de cobro). */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l">
          <ResumenVenta
            onCobrar={(m) => abrirCobro(m)}
            onCancelar={cancelarVenta}
          />
        </aside>

        <aside className="hidden min-h-0 flex-col overflow-hidden border-l lg:flex">
          <VentasDelDia />
        </aside>
      </div>

      <ModalCobro
        open={modalCobro.open}
        onOpenChange={(v) => setModalCobro((m) => ({ ...m, open: v }))}
        metodoInicial={modalCobro.metodo}
        onCobrado={(ventaId) => navigate(`/ticket/${ventaId}`)}
      />
    </div>
  );
}
