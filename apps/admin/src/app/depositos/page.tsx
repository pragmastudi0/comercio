'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, ArrowDownUp } from 'lucide-react';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@comercio/ui/tabs';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@comercio/ui/dialog';
import { AbmDialogFooter, AbmSimple } from '@/components/abm-simple';
import { formatCurrency } from '@comercio/ui/utils';
import type { Deposito, TipoDeposito } from '@comercio/db';

export default function DepositosPage() {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Depósitos y stock</h1>
        <p className="text-sm text-muted-foreground">
          Vista del stock consolidado por producto y depósito + administración de depósitos.
        </p>
      </div>
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock consolidado</TabsTrigger>
          <TabsTrigger value="depositos">Depósitos</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <StockConsolidado />
        </TabsContent>
        <TabsContent value="depositos">
          <AbmDepositos />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StockConsolidado() {
  const db = getDb();
  const qc = useQueryClient();
  const empleadoId = useSesion((s) => s.empleado?.id) ?? '';
  const productosQ = useQuery({
    queryKey: ['productos-stock'],
    queryFn: () => db.productos.list({ activo: true }),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
  });
  const stockQ = useQuery({
    queryKey: ['stock-consolidado'],
    queryFn: () => db.stock.consolidado(),
  });

  const [texto, setTexto] = useState('');
  const [ajustando, setAjustando] = useState<{
    productoId: string;
    depositoId: string;
    nombreProd: string;
    nombreDep: string;
    actual: number;
  } | null>(null);

  const ajustarMut = useMutation({
    mutationFn: ({
      productoId,
      depositoId,
      delta,
      motivo,
    }: {
      productoId: string;
      depositoId: string;
      delta: number;
      motivo: string;
    }) =>
      db.stock.ajustar({
        producto_id: productoId,
        deposito_id: depositoId,
        cantidad: delta,
        motivo,
        empleado_id: empleadoId,
      }),
    onSuccess: () => {
      toast.success('Stock ajustado');
      qc.invalidateQueries({ queryKey: ['stock-consolidado'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const productosFiltrados = (productosQ.data ?? []).filter((p) => {
    if (!texto) return true;
    const q = texto.toLowerCase();
    return p.nombre.toLowerCase().includes(q) || p.codigo_interno.includes(q);
  });

  const depositos = depositosQ.data ?? [];
  const stockMap = new Map<string, Map<string, number>>(); // prodId -> (depId -> cant)
  for (const s of stockQ.data ?? []) {
    if (!stockMap.has(s.producto_id)) stockMap.set(s.producto_id, new Map());
    stockMap.get(s.producto_id)!.set(s.deposito_id, s.cantidad);
  }

  function cantidad(prodId: string, depId: string): number {
    return stockMap.get(prodId)?.get(depId) ?? 0;
  }
  function total(prodId: string): number {
    let t = 0;
    for (const c of stockMap.get(prodId)?.values() ?? []) t += c;
    return t;
  }

  const loading = productosQ.isLoading || depositosQ.isLoading || stockQ.isLoading;

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          {productosFiltrados.length} productos
        </CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o nombre"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left">Código</th>
                  <th className="px-2 py-2 text-left">Producto</th>
                  {depositos.map((d) => (
                    <th key={d.id} className="px-2 py-2 text-right">
                      {d.nombre}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p) => {
                  const t = total(p.id);
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-2 py-2 font-mono text-xs">{p.codigo_interno}</td>
                      <td className="px-2 py-2 font-medium">{p.nombre}</td>
                      {depositos.map((d) => {
                        const c = cantidad(p.id, d.id);
                        return (
                          <td key={d.id} className="px-2 py-2 text-right">
                            <button
                              onClick={() =>
                                setAjustando({
                                  productoId: p.id,
                                  depositoId: d.id,
                                  nombreProd: p.nombre,
                                  nombreDep: d.nombre,
                                  actual: c,
                                })
                              }
                              className={`rounded px-2 py-0.5 text-sm tabular-nums hover:bg-accent ${
                                c === 0 ? 'text-muted-foreground' : ''
                              }`}
                              title="Click para ajustar"
                            >
                              {c}
                            </button>
                          </td>
                        );
                      })}
                      <td
                        className={`px-2 py-2 text-right font-bold tabular-nums ${
                          t === 0 ? 'text-destructive' : t < 5 ? 'text-orange-600' : ''
                        }`}
                      >
                        {t}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {ajustando && (
        <AjusteStockDialog
          item={ajustando}
          onClose={() => setAjustando(null)}
          onConfirm={(delta, motivo) =>
            ajustarMut.mutate({
              productoId: ajustando.productoId,
              depositoId: ajustando.depositoId,
              delta,
              motivo,
            })
          }
        />
      )}
    </Card>
  );
}

function AjusteStockDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: {
    productoId: string;
    depositoId: string;
    nombreProd: string;
    nombreDep: string;
    actual: number;
  };
  onClose: () => void;
  onConfirm: (delta: number, motivo: string) => void;
}) {
  const [modo, setModo] = useState<'absoluto' | 'delta'>('absoluto');
  const [valor, setValor] = useState(item.actual);
  const [motivo, setMotivo] = useState('');

  const delta = modo === 'absoluto' ? valor - item.actual : valor;
  const final = item.actual + delta;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Ajuste de stock</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="rounded bg-muted/30 p-3">
          <div>
            <strong>{item.nombreProd}</strong>
          </div>
          <div className="text-muted-foreground">{item.nombreDep}</div>
          <div className="mt-2">
            Stock actual: <strong>{item.actual}</strong>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={modo === 'absoluto' ? 'default' : 'outline'}
            onClick={() => {
              setModo('absoluto');
              setValor(item.actual);
            }}
            className="flex-1"
          >
            Setear cantidad absoluta
          </Button>
          <Button
            size="sm"
            variant={modo === 'delta' ? 'default' : 'outline'}
            onClick={() => {
              setModo('delta');
              setValor(0);
            }}
            className="flex-1"
          >
            Sumar/restar
          </Button>
        </div>
        <div>
          <Label className="mb-1 block">
            {modo === 'absoluto' ? 'Nueva cantidad' : 'Delta (+/-)'}
          </Label>
          <Input
            type="number"
            value={valor}
            onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
            autoFocus
          />
          {modo === 'delta' && delta !== 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Quedaría en {final}
            </p>
          )}
        </div>
        <div>
          <Label className="mb-1 block">Motivo</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Recuento, rotura, ingreso de mercadería, etc."
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!motivo.trim() || delta === 0}
          onClick={() => {
            onConfirm(delta, motivo.trim());
            onClose();
          }}
        >
          Aplicar ajuste
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function AbmDepositos() {
  const db = getDb();
  const qc = useQueryClient();
  const depositosQ = useQuery({ queryKey: ['depositos'], queryFn: () => db.depositos.list() });
  const localesQ = useQuery({ queryKey: ['locales'], queryFn: () => db.locales.list() });
  const stockQ = useQuery({ queryKey: ['stock-consolidado'], queryFn: () => db.stock.consolidado() });

  const crearMut = useMutation({
    mutationFn: (v: Omit<Deposito, 'id'>) => db.depositos.create(v),
    onSuccess: () => {
      toast.success('Depósito creado');
      qc.invalidateQueries({ queryKey: ['depositos'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editarMut = useMutation({
    mutationFn: ({ id, ...v }: { id: string } & Partial<Deposito>) => db.depositos.update(id, v),
    onSuccess: () => {
      toast.success('Depósito editado');
      qc.invalidateQueries({ queryKey: ['depositos'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.depositos.delete(id),
    onSuccess: () => {
      toast.success('Depósito eliminado');
      qc.invalidateQueries({ queryKey: ['depositos'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function stockEn(depositoId: string): number {
    return (stockQ.data ?? [])
      .filter((s) => s.deposito_id === depositoId)
      .reduce((acc, s) => acc + s.cantidad, 0);
  }

  return (
    <div className="mt-4">
      <AbmSimple<Deposito>
        titulo="Depósitos"
        rows={depositosQ.data ?? []}
        loading={depositosQ.isLoading}
        newButtonLabel="Nuevo depósito"
        columns={[
          { header: 'Nombre', cell: (r) => <span className="font-medium">{r.nombre}</span> },
          {
            header: 'Tipo',
            cell: (r) => <Badge variant="secondary">{r.tipo}</Badge>,
          },
          {
            header: 'Local',
            cell: (r) =>
              r.local_id ? (
                <span>{localesQ.data?.find((l) => l.id === r.local_id)?.nombre ?? '—'}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            header: 'Stock total',
            cell: (r) => <span className="tabular-nums">{stockEn(r.id)} u</span>,
          },
          {
            header: 'Estado',
            cell: (r) =>
              r.activo ? (
                <Badge variant="secondary">Activo</Badge>
              ) : (
                <Badge variant="destructive">Inactivo</Badge>
              ),
          },
        ]}
        buildCreate={(close) => (
          <DepositoForm
            locales={localesQ.data ?? []}
            onSubmit={(v) => {
              crearMut.mutate(v);
              close();
            }}
            onCancel={close}
          />
        )}
        buildEdit={(row, close) => (
          <DepositoForm
            initial={row}
            locales={localesQ.data ?? []}
            onSubmit={(v) => {
              editarMut.mutate({ id: row.id, ...v });
              close();
            }}
            onCancel={close}
          />
        )}
        canDelete={(r) => {
          const s = stockEn(r.id);
          if (s > 0) return `No se puede eliminar: tiene ${s} unidades. Hacé una transferencia primero.`;
          return true;
        }}
        onDelete={(r) => eliminarMut.mutateAsync(r.id)}
      />
    </div>
  );
}

function DepositoForm({
  initial,
  locales,
  onSubmit,
  onCancel,
}: {
  initial?: Deposito;
  locales: { id: string; nombre: string }[];
  onSubmit: (v: Omit<Deposito, 'id'>) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoDeposito>(initial?.tipo ?? 'central');
  const [localId, setLocalId] = useState(initial?.local_id ?? '');
  const [activo, setActivo] = useState(initial?.activo ?? true);

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1 block">Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block">Tipo</Label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeposito)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="central">Central</option>
            <option value="local">Local (asociado a un local físico)</option>
            <option value="web">Web (e-commerce)</option>
          </select>
        </div>
        {tipo === 'local' && (
          <div>
            <Label className="mb-1 block">Local asociado</Label>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Elegir —</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-4 w-4"
        />
        Activo
      </label>
      <AbmDialogFooter
        onCancel={onCancel}
        onSubmit={() =>
          nombre.trim() &&
          onSubmit({
            empresa_id: 'emp_demo',
            nombre: nombre.trim(),
            tipo,
            local_id: tipo === 'local' ? localId || undefined : undefined,
            activo,
          })
        }
        disabled={!nombre.trim() || (tipo === 'local' && !localId)}
      />
    </div>
  );
}
