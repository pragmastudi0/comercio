import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeftRight, Search } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { useDepositoActivo } from '@/lib/deposito-activo';
import type { Producto } from '@comercio/db';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

/**
 * Modal "Stock" del PoS — asienta una transferencia entre depósitos/locales.
 * El movimiento es INMEDIATO (decrementa origen + incrementa destino + crea
 * los 2 movimientos en historial). Sin flujo de aprobación: refleja lo que
 * el cajero/encargado ya hizo físicamente.
 *
 * Patrón de uso:
 *   1. Tipear código o nombre → seleccionar producto
 *   2. Elegir origen (default: depósito activo del cajero)
 *   3. Elegir destino (otro depósito)
 *   4. Cantidad → Confirmar
 */
export function ModalTransferenciaStock({ open, onOpenChange }: Props) {
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);
  const { depositoId: depositoActivo } = useDepositoActivo();

  // Búsqueda y selección de producto
  const [q, setQ] = useState('');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [resaltadoIdx, setResaltadoIdx] = useState(0);
  const codigoRef = useRef<HTMLInputElement>(null);

  // Origen, destino, cantidad
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [cantidadTxt, setCantidadTxt] = useState('');

  const depositosQ = useQuery({
    queryKey: ['depositos-transferencia'],
    queryFn: () => db.depositos.list(),
    enabled: open,
  });

  const resultadosQ = useQuery({
    queryKey: ['pos-buscar-transferencia', q],
    queryFn: () => db.productos.buscarRapido(q, 8),
    enabled: open && q.trim().length > 0 && !producto,
  });

  // Stock actual del producto seleccionado por depósito (referencia visual)
  const stocksQ = useQuery({
    queryKey: ['stock-prod-transferencia', producto?.id],
    queryFn: () => (producto ? db.stock.porProducto(producto.id) : Promise.resolve([])),
    enabled: open && !!producto,
  });

  const stockPorDeposito = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stocksQ.data ?? []) {
      map.set(s.deposito_id, (map.get(s.deposito_id) ?? 0) + Number(s.cantidad));
    }
    return map;
  }, [stocksQ.data]);

  // Reset cuando se abre/cierra
  useEffect(() => {
    if (open) {
      setQ('');
      setProducto(null);
      setResaltadoIdx(0);
      setCantidadTxt('1');
      setOrigenId(depositoActivo ?? '');
      setDestinoId('');
      setTimeout(() => codigoRef.current?.focus(), 50);
    }
  }, [open, depositoActivo]);

  const cantidad = parseInt(cantidadTxt, 10);
  const cantidadValida = !!cantidad && cantidad > 0;
  const origenOk = !!origenId;
  const destinoOk = !!destinoId && destinoId !== origenId;
  const productoOk = !!producto;
  const puedeConfirmar = productoOk && origenOk && destinoOk && cantidadValida;

  const transferirMut = useMutation({
    mutationFn: async () => {
      if (!empleado) throw new Error('Sin sesión');
      if (!producto) throw new Error('Elegí un producto');
      if (!db.stock.transferenciaInmediata) {
        throw new Error('La transferencia inmediata no está disponible en este modo');
      }
      const motivo = `Transferencia PoS · ${producto.nombre}`;
      return db.stock.transferenciaInmediata({
        producto_id: producto.id,
        deposito_origen_id: origenId,
        deposito_destino_id: destinoId,
        cantidad,
        motivo,
        empleado_id: empleado.id,
      });
    },
    onSuccess: () => {
      const origenNom = depositosQ.data?.find((d) => d.id === origenId)?.nombre ?? 'origen';
      const destinoNom = depositosQ.data?.find((d) => d.id === destinoId)?.nombre ?? 'destino';
      toast.success(
        `${cantidad} × ${producto?.nombre} · ${origenNom} → ${destinoNom}`,
      );
      qc.invalidateQueries({ queryKey: ['stock-prod'] });
      qc.invalidateQueries({ queryKey: ['stock-prod-transferencia'] });
      qc.invalidateQueries({ queryKey: ['pos-stocks-buscar'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function elegirProducto(p: Producto) {
    setProducto(p);
    setQ(p.nombre);
    setResaltadoIdx(0);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
            Asentar movimiento de stock
          </span>
        </DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Registrá una transferencia que ya hiciste físicamente entre depósitos
          o locales. El stock se actualiza al instante.
        </p>
      </DialogHeader>

      <div className="space-y-3">
        {/* Paso 1: buscar / elegir producto */}
        <div>
          <Label className="mb-1 block text-xs">Producto</Label>
          <div className="relative">
            <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" />
            </div>
            <Input
              ref={codigoRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (producto) setProducto(null);
                setResaltadoIdx(0);
              }}
              onKeyDown={(e) => {
                const lista = resultadosQ.data ?? [];
                if (e.key === 'Enter' && lista.length > 0) {
                  e.preventDefault();
                  const target = lista[Math.min(resaltadoIdx, lista.length - 1)];
                  if (target) elegirProducto(target);
                } else if (e.key === 'ArrowDown' && lista.length > 0) {
                  e.preventDefault();
                  setResaltadoIdx((i) => Math.min(i + 1, lista.length - 1));
                } else if (e.key === 'ArrowUp' && lista.length > 0) {
                  e.preventDefault();
                  setResaltadoIdx((i) => Math.max(0, i - 1));
                }
              }}
              placeholder="Código o nombre"
              className="pl-8"
            />
          </div>

          {/* Dropdown de resultados (solo si no hay producto ya elegido) */}
          {!producto && q.trim() && (resultadosQ.data?.length ?? 0) > 0 && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow">
              {resultadosQ.data!.map((p, idx) => {
                const resaltado = idx === resaltadoIdx;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => elegirProducto(p)}
                    onMouseEnter={() => setResaltadoIdx(idx)}
                    className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors last:border-0 ${
                      resaltado
                        ? 'border-l-4 border-l-blue-600 bg-blue-100 pl-2 font-medium text-blue-900'
                        : 'hover:bg-blue-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {p.codigo_interno}
                      </div>
                      <div className="truncate">{p.nombre}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!producto && q.trim() && resultadosQ.data?.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Sin resultados.</p>
          )}
        </div>

        {/* Paso 2: si hay producto, mostrar contexto + origen/destino/cantidad */}
        {producto && (
          <>
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-xs uppercase text-muted-foreground">
                Stock por local
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1.5 text-xs">
                {(depositosQ.data ?? []).map((d) => {
                  const c = stockPorDeposito.get(d.id) ?? 0;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded border bg-background px-2 py-1"
                    >
                      <span className="truncate text-muted-foreground">{d.nombre}</span>
                      <span
                        className={`tabular-nums font-medium ${
                          c <= 0 ? 'text-destructive' : ''
                        }`}
                      >
                        {c}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <Label className="mb-1 block text-xs">Desde</Label>
                <select
                  value={origenId}
                  onChange={(e) => setOrigenId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Elegir —</option>
                  {(depositosQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pb-2">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Hacia</Label>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Elegir —</option>
                  {(depositosQ.data ?? [])
                    .filter((d) => d.id !== origenId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Cantidad</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={cantidadTxt}
                onChange={(e) => setCantidadTxt(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && puedeConfirmar && !transferirMut.isPending) {
                    e.preventDefault();
                    transferirMut.mutate();
                  }
                }}
                className="text-lg tabular-nums"
              />
            </div>

            {/* Advertencia si origen no tiene stock suficiente — no bloquea
                porque la política Turisteando permite negativos. */}
            {origenOk && cantidadValida && (stockPorDeposito.get(origenId) ?? 0) < cantidad && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                El origen quedaría en stock negativo. Asentás igual si ya hiciste el movimiento.
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          onClick={() => transferirMut.mutate()}
          disabled={!puedeConfirmar || transferirMut.isPending}
        >
          {transferirMut.isPending ? 'Asentando…' : 'Asentar transferencia'}
        </Button>
      </div>
    </Dialog>
  );
}
