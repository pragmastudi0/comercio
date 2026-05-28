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
      <div className="container mx-auto py-8">
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!prodQ.data) {
    return (
      <div className="container mx-auto py-8">
        <p>Producto no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/productos">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver
        </Link>
      </Button>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{prodQ.data.nombre}</h1>
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

        <Card>
          <CardHeader>
            <CardTitle>Stock por depósito</CardTitle>
            <p className="text-sm text-muted-foreground">
              Para ajustar stock manualmente, ir a la sección Depósitos.
            </p>
          </CardHeader>
          <CardContent>
            {stockQ.isLoading ? (
              <Skeleton className="h-20" />
            ) : (stockQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin stock en ningún depósito.</p>
            ) : (
              <div className="space-y-1 text-sm">
                {(stockQ.data ?? []).map((s) => {
                  const dep = depositosQ.data?.find((d) => d.id === s.deposito_id);
                  return (
                    <div key={s.deposito_id} className="flex justify-between">
                      <span>{dep?.nombre ?? s.deposito_id}</span>
                      <span className="tabular-nums">{s.cantidad}</span>
                    </div>
                  );
                })}
                <div className="border-t pt-1 text-right text-xs text-muted-foreground">
                  Costo total estimado:{' '}
                  {formatCurrency(
                    (stockQ.data ?? []).reduce((acc, s) => acc + s.cantidad * prodQ.data!.costo, 0),
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
