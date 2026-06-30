'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackagePlus, Search } from 'lucide-react';
import { getDb } from '@/lib/db';
import { usePermiso } from '@/lib/permisos';
import { useSesion } from '@/stores/sesion';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Input } from '@comercio/ui/input';
import { Button } from '@comercio/ui/button';
import { Label } from '@comercio/ui/label';
import { formatCurrency } from '@comercio/ui/utils';
import type { Producto } from '@comercio/db';

/**
 * Modal "Cargar stock" — flujo rápido pensado para Agus cargando varias
 * cosas seguidas. Tipea código → Enter busca → ve producto + stock por
 * local → ingresa cantidad y local → confirma. El foco vuelve al input
 * de código para cargar el siguiente.
 *
 * Hace un ajuste delta positivo en stock_items + registra movimiento_stock
 * tipo 'ajuste' con motivo (default "Carga manual").
 */
export function ModalCargarStock({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);
  const verCosto = usePermiso('productos', 'ver_costo');

  const [codigo, setCodigo] = useState('');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [depositoId, setDepositoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [buscando, setBuscando] = useState(false);

  const codigoRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);

  // Locales (depósitos en la BD, "locales" en la UI) — para el select.
  const depositosQ = useQuery({
    queryKey: ['admin-cargar-stock-depositos'],
    queryFn: () => db.depositos.list(),
    enabled: open,
  });

  // Stock actual del producto por local (para mostrar contexto).
  const stocksQ = useQuery({
    queryKey: ['admin-cargar-stock-stock', producto?.id],
    queryFn: () => (producto ? db.stock.porProducto(producto.id) : Promise.resolve([])),
    enabled: open && !!producto,
  });

  // Reset al abrir/cerrar.
  useEffect(() => {
    if (open) {
      setCodigo('');
      setProducto(null);
      setCantidad('');
      setMotivo('');
      // Auto-foco al input de código.
      setTimeout(() => codigoRef.current?.focus(), 50);
    }
  }, [open]);

  // Cuando llega la lista de locales, pre-seleccionar el primero.
  useEffect(() => {
    if (!depositoId && depositosQ.data && depositosQ.data.length > 0) {
      setDepositoId(depositosQ.data[0]!.id);
    }
  }, [depositosQ.data, depositoId]);

  async function buscarProducto() {
    const q = codigo.trim();
    if (!q) return;
    setBuscando(true);
    try {
      const p = await db.productos.buscarPorCodigo(q);
      if (!p) {
        toast.error(`No se encontró el código "${q}"`);
        setProducto(null);
        return;
      }
      setProducto(p);
      // Foco al input cantidad para cargar rápido.
      setTimeout(() => cantidadRef.current?.focus(), 50);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  const cargarMut = useMutation({
    mutationFn: async () => {
      if (!producto) throw new Error('Buscá un producto primero');
      if (!empleado) throw new Error('Sin sesión');
      if (!depositoId) throw new Error('Elegí un local');
      const n = parseFloat(cantidad);
      if (!Number.isFinite(n) || n === 0) throw new Error('Cantidad inválida');
      await db.stock.ajustar({
        producto_id: producto.id,
        deposito_id: depositoId,
        cantidad: n, // delta — positivo carga, negativo descuenta
        motivo: motivo.trim() || 'Carga manual desde admin',
        empleado_id: empleado.id,
      });
    },
    onSuccess: () => {
      const signo = parseFloat(cantidad) > 0 ? '+' : '';
      toast.success(`${signo}${cantidad} cargado a "${producto?.nombre}"`);
      qc.invalidateQueries({ queryKey: ['stock-consolidado'] });
      qc.invalidateQueries({ queryKey: ['admin-cargar-stock-stock'] });
      // Reset para cargar el siguiente. Mantenemos el depositoId
      // seleccionado (típico cargar varias cosas al mismo local).
      setCodigo('');
      setProducto(null);
      setCantidad('');
      setMotivo('');
      setTimeout(() => codigoRef.current?.focus(), 50);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stockEnLocal = (locId: string): number => {
    const found = (stocksQ.data ?? []).find((s) => s.deposito_id === locId);
    return found ? Number(found.cantidad) : 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-amber-700" />
            Cargar stock
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {/* Paso 1: buscar producto por código */}
        <div>
          <Label className="mb-1 block text-xs uppercase">Código del producto</Label>
          <div className="flex gap-2">
            <Input
              ref={codigoRef}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void buscarProducto();
                }
              }}
              placeholder="Ej: 1003"
              className="text-right tabular-nums"
              disabled={cargarMut.isPending}
            />
            <Button
              type="button"
              onClick={() => void buscarProducto()}
              disabled={!codigo.trim() || buscando || cargarMut.isPending}
            >
              <Search className="mr-1 h-4 w-4" />
              Buscar
            </Button>
          </div>
        </div>

        {/* Paso 2: si encontró producto, mostrar contexto + form de carga */}
        {producto && (
          <>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs uppercase text-muted-foreground">Producto</div>
              <div className="font-semibold">{producto.nombre}</div>
              {verCosto && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Costo {formatCurrency(producto.costo)}
                </div>
              )}
              {/* Stock actual por local */}
              {stocksQ.data && depositosQ.data && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                  {depositosQ.data.map((d) => (
                    <div
                      key={d.id}
                      className="rounded border bg-background px-2 py-1"
                    >
                      <span className="text-muted-foreground">{d.nombre}: </span>
                      <span className="font-semibold tabular-nums">
                        {stockEnLocal(d.id)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label className="mb-1 block text-xs uppercase">Cantidad a cargar</Label>
                <Input
                  ref={cantidadRef}
                  type="number"
                  step="1"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && cantidad.trim() && depositoId) {
                      e.preventDefault();
                      cargarMut.mutate();
                    }
                  }}
                  placeholder="Ej: 10"
                  className="text-right tabular-nums"
                  disabled={cargarMut.isPending}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs uppercase">Local</Label>
                <select
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={cargarMut.isPending}
                >
                  {(depositosQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs uppercase">
                Motivo (opcional)
              </Label>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Recepción de mercadería, ajuste por conteo"
                disabled={cargarMut.isPending}
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Tip: cantidad positiva carga; negativa descuenta. Queda registrado
              como movimiento con tu nombre y motivo.
            </p>
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={cargarMut.isPending}
          className="rounded-md border bg-background px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Cerrar
        </button>
        <Button
          onClick={() => cargarMut.mutate()}
          disabled={
            !producto || !cantidad.trim() || !depositoId || cargarMut.isPending
          }
        >
          {cargarMut.isPending ? 'Cargando…' : 'Cargar stock'}
        </Button>
      </div>
    </Dialog>
  );
}
