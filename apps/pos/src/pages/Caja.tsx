import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { LogOut, Type, History } from 'lucide-react';
import { BRAND } from '@comercio/business';
import { useSesion } from '@/stores/sesion';
import { useVenta } from '@/stores/venta';
import { useLetrasGrandes } from '@/hooks/useLetrasGrandes';
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
  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const items = useVenta((s) => s.items);
  const limpiar = useVenta((s) => s.limpiar);

  const [modalCobro, setModalCobro] = useState<{ open: boolean; metodo?: MetodoPago }>({
    open: false,
  });
  const { grande: letrasGrandes, toggle: toggleLetras } = useLetrasGrandes(caja?.id);

  function abrirCobro(metodo?: MetodoPago) {
    if (items.length === 0) {
      toast.error('Carrito vacío');
      return;
    }
    setModalCobro({ open: true, metodo });
  }

  function cancelarVenta() {
    if (items.length === 0) return;
    if (confirm('¿Cancelar la venta actual? Se vaciará el carrito.')) {
      limpiar();
      toast.info('Venta cancelada');
    }
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
              variant={letrasGrandes ? 'default' : 'ghost'}
              size="sm"
              onClick={toggleLetras}
              title={
                letrasGrandes
                  ? 'Volver al tamaño normal'
                  : 'Activar modo letras grandes (para ver mejor)'
              }
            >
              <Type className="mr-1 h-3 w-3" />
              {letrasGrandes ? 'Texto grande' : 'Texto normal'}
            </Button>
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

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_340px_260px]">
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
