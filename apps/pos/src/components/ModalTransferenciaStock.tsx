import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeftRight, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';
import { Skeleton } from '@comercio/ui/skeleton';
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

  // Pestañas: asentar nuevo movimiento vs ver/anular recientes.
  const [tab, setTab] = useState<'asentar' | 'movimientos'>('asentar');

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
      setTab('asentar');
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
            Movimientos de stock
          </span>
        </DialogTitle>
      </DialogHeader>

      {/* Pestañas: nueva transferencia | historial (con anular) */}
      <div className="mb-3 flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('asentar')}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'asentar'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Asentar nuevo
        </button>
        <button
          type="button"
          onClick={() => setTab('movimientos')}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'movimientos'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Movimientos recientes
        </button>
      </div>

      {tab === 'movimientos' ? (
        <MovimientosRecientes onClose={() => onOpenChange(false)} />
      ) : (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Registrá una transferencia que ya hiciste físicamente entre depósitos
          o locales. El stock se actualiza al instante.
        </p>
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
      )}

      {tab === 'asentar' && (
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
      )}
    </Dialog>
  );
}

/**
 * Lista de transferencias de stock de las últimas 48hs. Agrupa salida+entrada
 * en una sola fila ("Producto · X unidades · Origen → Destino · Hora · Cajero").
 * Botón Anular crea el par inverso y revierte el stock. Las anuladas quedan
 * con un pill "Anulada" en lugar del botón.
 */
function MovimientosRecientes({ onClose: _onClose }: { onClose: () => void }) {
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);
  const desde = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - 48);
    return d.toISOString();
  }, []);

  const movsQ = useQuery({
    queryKey: ['stock-movs-recientes-pos', desde],
    queryFn: () => db.stock.movimientos({ desde }),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos-pos-recientes'],
    queryFn: () => db.depositos.list(),
  });
  const productosQ = useQuery({
    queryKey: ['productos-pos-recientes'],
    queryFn: () => db.productos.list(),
  });
  const empleadosQ = useQuery({
    queryKey: ['empleados-pos-recientes'],
    queryFn: () => db.empleados.list(),
  });

  type Par = {
    keyPar: string;
    salidaId: string;
    fecha: string;
    producto_id: string;
    cantidad: number;
    origen_id: string;
    destino_id: string;
    empleado_id: string;
    motivo?: string;
  };

  // Agrupamos por (producto + cantidad + fecha) — transferenciaInmediata
  // crea ambos movs con el MISMO timestamp. Cada par tiene 1 salida + 1 entrada.
  const { pares, anuladas } = useMemo(() => {
    const movs = movsQ.data ?? [];
    const grupos = new Map<string, { salida?: typeof movs[number]; entrada?: typeof movs[number] }>();
    for (const m of movs) {
      if (m.tipo !== 'transferencia_salida' && m.tipo !== 'transferencia_entrada') continue;
      const key = `${m.producto_id}|${m.cantidad}|${m.fecha}`;
      const g = grupos.get(key) ?? {};
      if (m.tipo === 'transferencia_salida') g.salida = m;
      else g.entrada = m;
      grupos.set(key, g);
    }
    const pares: Par[] = [];
    const anuladas = new Set<string>();
    for (const [, g] of grupos) {
      if (!g.salida || !g.entrada) continue;
      const motivo = g.salida.motivo ?? '';
      // Anulación: el motivo apunta a un id de movimiento previo.
      const matchAnul = /^Anulaci[óo]n de transferencia (\S+)/.exec(motivo);
      if (matchAnul) {
        anuladas.add(matchAnul[1]!);
        continue; // no listamos las anulaciones como filas propias
      }
      pares.push({
        keyPar: g.salida.id,
        salidaId: g.salida.id,
        fecha: g.salida.fecha,
        producto_id: g.salida.producto_id,
        cantidad: g.salida.cantidad,
        origen_id: g.salida.deposito_id,
        destino_id: g.entrada.deposito_id,
        empleado_id: g.salida.empleado_id,
        motivo: g.salida.motivo,
      });
    }
    pares.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { pares, anuladas };
  }, [movsQ.data]);

  const anularMut = useMutation({
    mutationFn: async (movimiento_id: string) => {
      if (!empleado) throw new Error('Sin sesión');
      if (!db.stock.anularTransferenciaInmediata) {
        throw new Error('Anulación no disponible en este modo');
      }
      return db.stock.anularTransferenciaInmediata({
        movimiento_id,
        empleado_id: empleado.id,
      });
    },
    onSuccess: () => {
      toast.success('Transferencia anulada — stock revertido');
      qc.invalidateQueries({ queryKey: ['stock-movs-recientes-pos'] });
      qc.invalidateQueries({ queryKey: ['stock-prod'] });
      qc.invalidateQueries({ queryKey: ['pos-stocks-buscar'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function nombreProd(id: string) {
    return productosQ.data?.find((p) => p.id === id)?.nombre ?? '—';
  }
  function codigoProd(id: string) {
    return productosQ.data?.find((p) => p.id === id)?.codigo_interno ?? '—';
  }
  function nombreDep(id: string) {
    return depositosQ.data?.find((d) => d.id === id)?.nombre ?? '—';
  }
  function nombreEmp(id: string) {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido ?? ''}`.trim() : '—';
  }
  function horaTxt(iso: string) {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (movsQ.isLoading) return <Skeleton className="h-40" />;
  if (pares.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No hay transferencias en las últimas 48 horas.
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
      {pares.map((p) => {
        const anulada = anuladas.has(p.salidaId);
        return (
          <div
            key={p.keyPar}
            className={`rounded-md border bg-card p-2 text-sm ${
              anulada ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {codigoProd(p.producto_id)}
                  </span>
                  <span className={`truncate font-medium ${anulada ? 'line-through' : ''}`}>
                    {nombreProd(p.producto_id)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {p.cantidad} unidades
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {nombreDep(p.origen_id)}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {nombreDep(p.destino_id)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {horaTxt(p.fecha)} · {nombreEmp(p.empleado_id)}
                </div>
              </div>
              {anulada ? (
                <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Anulada
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (
                      confirm(
                        `¿Anular esta transferencia? Se va a revertir el stock: ${p.cantidad} × ${nombreProd(p.producto_id)} vuelve de ${nombreDep(p.destino_id)} a ${nombreDep(p.origen_id)}.`,
                      )
                    ) {
                      anularMut.mutate(p.salidaId);
                    }
                  }}
                  disabled={anularMut.isPending}
                  title="Anular y revertir el stock"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Anular
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
