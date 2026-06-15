'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import {
  PreciosFields,
  ProductoFormFields,
  productoToForm,
  type ProductoFormValues,
} from '@/components/producto-form';
import { ImagenesProducto } from '@/components/imagenes-producto';

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const db = getDb();
  const router = useRouter();
  const qc = useQueryClient();

  const prodQ = useQuery({ queryKey: ['producto', id], queryFn: () => db.productos.get(id) });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list({ activo: true }),
  });
  const listasQ = useQuery({ queryKey: ['listas-precio'], queryFn: () => db.listasPrecio.list() });
  const preciosActQ = useQuery({
    queryKey: ['precios-de', id],
    queryFn: () => db.productos.preciosDe(id),
  });
  const stockQ = useQuery({
    queryKey: ['stock-prod', id],
    queryFn: () => db.stock.porProducto(id),
  });
  const depositosQ = useQuery({ queryKey: ['depositos'], queryFn: () => db.depositos.list() });
  // Histórico de movimientos para mostrar estadísticas del producto.
  const movsQ = useQuery({
    queryKey: ['movs-prod', id],
    queryFn: () => db.stock.movimientos({ producto_id: id }),
  });

  const [values, setValues] = useState<ProductoFormValues | null>(null);
  const [precios, setPrecios] = useState<
    { listaId: string; escalas: { desde: number; precio: number }[] }[]
  >([]);

  useEffect(() => {
    if (prodQ.data && !values) {
      setValues(productoToForm(prodQ.data));
    }
  }, [prodQ.data, values]);

  useEffect(() => {
    if (listasQ.data && preciosActQ.data && precios.length === 0) {
      const arr = listasQ.data.map((l) => {
        const x = preciosActQ.data!.find((p) => p.lista_precio_id === l.id);
        return {
          listaId: l.id,
          escalas: x?.escalas.length ? x.escalas : [{ desde: 1, precio: 0 }],
        };
      });
      setPrecios(arr);
    }
  }, [listasQ.data, preciosActQ.data, precios.length]);

  const guardarMut = useMutation({
    mutationFn: async () => {
      if (!values) return;
      await db.productos.update(id, {
        codigo_interno: values.codigo_interno,
        nombre: values.nombre,
        descripcion: values.descripcion || undefined,
        descripcion_larga: values.descripcion_larga || undefined,
        categoria_id: values.categoria_id,
        proveedor_id: values.proveedor_id || undefined,
        costo: values.costo,
        publicado_web: values.publicado_web,
        activo: values.activo,
        solo_por_bulto: values.solo_por_bulto,
        cantidad_minima_web: values.cantidad_minima_web || undefined,
        incremento_web: values.incremento_web > 1 ? values.incremento_web : undefined,
        atributos: Object.keys(values.atributos).length > 0 ? values.atributos : undefined,
      });
      for (const x of precios) {
        await db.productos.setPrecio(id, x.listaId, x.escalas);
      }
    },
    onSuccess: async () => {
      toast.success('Cambios guardados');
      await qc.invalidateQueries({ queryKey: ['productos-admin'] });
      await qc.invalidateQueries({ queryKey: ['producto', id] });
      await qc.invalidateQueries({ queryKey: ['precios-cf'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarMut = useMutation({
    mutationFn: () => db.productos.delete(id),
    onSuccess: async () => {
      toast.success('Producto eliminado');
      await qc.invalidateQueries({ queryKey: ['productos-admin'] });
      router.push('/productos');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (prodQ.isLoading || !values) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!prodQ.data) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p>Producto no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/productos">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver
        </Link>
      </Button>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">{prodQ.data.nombre}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm(`¿Eliminar "${prodQ.data!.nombre}"? Esta acción no se puede deshacer.`))
                eliminarMut.mutate();
            }}
            className="text-destructive"
          >
            Eliminar
          </Button>
          <Button onClick={() => guardarMut.mutate()} disabled={guardarMut.isPending}>
            {guardarMut.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <ProductoFormFields
          values={values}
          onChange={setValues}
          categorias={categoriasQ.data ?? []}
          proveedores={proveedoresQ.data ?? []}
        />
        <PreciosFields precios={precios} onChange={setPrecios} listas={listasQ.data ?? []} />

        <ImagenesProducto productoId={id} />

        <EstadisticasProducto
          stocks={stockQ.data ?? []}
          movimientos={movsQ.data ?? []}
          depositos={depositosQ.data ?? []}
          costo={prodQ.data.costo}
          loading={stockQ.isLoading || movsQ.isLoading}
        />
      </div>
    </div>
  );
}

function EstadisticasProducto({
  stocks,
  movimientos,
  depositos,
  costo,
  loading,
}: {
  stocks: { deposito_id: string; cantidad: number }[];
  movimientos: { tipo: string; cantidad: number; fecha: string; deposito_id: string }[];
  depositos: { id: string; nombre: string }[];
  costo: number;
  loading: boolean;
}) {
  const stockTotal = stocks.reduce((acc, s) => acc + Number(s.cantidad), 0);
  // Movimientos por tipo
  const movsVenta = movimientos.filter((m) => m.tipo === 'venta');
  const movsIngreso = movimientos.filter(
    (m) => m.tipo === 'ingreso' || m.tipo === 'transferencia_entrada',
  );
  const movsMerma = movimientos.filter((m) => m.tipo === 'merma');
  const unidadesVendidas = movsVenta.reduce((acc, m) => acc + Number(m.cantidad), 0);
  const unidadesIngresadas = movsIngreso.reduce((acc, m) => acc + Number(m.cantidad), 0);
  const unidadesMerma = movsMerma.reduce((acc, m) => acc + Number(m.cantidad), 0);
  const ultimaVenta = movsVenta.length
    ? movsVenta.reduce((a, b) => (a.fecha > b.fecha ? a : b)).fecha
    : null;
  const ultimoIngreso = movsIngreso.length
    ? movsIngreso.reduce((a, b) => (a.fecha > b.fecha ? a : b)).fecha
    : null;

  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Stock por depósito</CardTitle>
          <p className="text-sm text-muted-foreground">
            Para ajustar stock manualmente, ir a la sección Depósitos.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="space-y-1 text-sm">
              {depositos.map((d) => {
                const item = stocks.find((s) => s.deposito_id === d.id);
                const cantidad = Number(item?.cantidad ?? 0);
                return (
                  <div key={d.id} className="flex justify-between">
                    <span>{d.nombre}</span>
                    <span
                      className={`tabular-nums ${
                        cantidad <= 0
                          ? 'font-semibold text-destructive'
                          : cantidad < 5
                            ? 'text-orange-600'
                            : ''
                      }`}
                    >
                      {cantidad}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span
                  className={`tabular-nums ${
                    stockTotal <= 0 ? 'text-destructive' : ''
                  }`}
                >
                  {stockTotal}
                </span>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Costo total estimado: {formatCurrency(stockTotal * costo)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estadísticas del producto</CardTitle>
          <p className="text-sm text-muted-foreground">
            Resumen histórico desde que se carga el producto en el sistema.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Unidades vendidas
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {unidadesVendidas}
                </div>
                <div className="text-xs text-muted-foreground">
                  {movsVenta.length} venta{movsVenta.length === 1 ? '' : 's'} registrada
                  {movsVenta.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Última venta
                </div>
                <div className="mt-1 text-base font-semibold">
                  {ultimaVenta ? fmtFecha(ultimaVenta) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ultimaVenta ? 'Última vez que se vendió' : 'Sin ventas todavía'}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Unidades ingresadas
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {unidadesIngresadas}
                </div>
                <div className="text-xs text-muted-foreground">
                  Incluye compras y transferencias entrantes
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Último ingreso
                </div>
                <div className="mt-1 text-base font-semibold">
                  {ultimoIngreso ? fmtFecha(ultimoIngreso) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ultimoIngreso ? 'Última recepción' : 'Sin ingresos registrados'}
                </div>
              </div>
              {unidadesMerma > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wider text-destructive">
                    Mermas / roturas
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-destructive">
                    {unidadesMerma} u
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
