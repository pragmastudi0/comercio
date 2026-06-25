'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import {
  PreciosFields,
  ProductoFormFields,
  useProductoForm,
} from '@/components/producto-form';

export default function NuevoProductoPage() {
  const db = getDb();
  const router = useRouter();
  const qc = useQueryClient();
  const [values, setValues] = useProductoForm();

  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list({ activo: true }),
  });
  const listasQ = useQuery({
    queryKey: ['listas-precio'],
    queryFn: () => db.listasPrecio.list(),
  });

  const [precios, setPrecios] = useState<
    { listaId: string; escalas: { desde: number; precio: number }[] }[]
  >([]);

  // Inicializar precios cuando llegan las listas (en useEffect para no
  // disparar setState durante el render — causaba "Application error" en prod).
  useEffect(() => {
    if (listasQ.data && precios.length === 0) {
      setPrecios(
        listasQ.data.map((l) => ({ listaId: l.id, escalas: [{ desde: 1, precio: 0 }] })),
      );
    }
  }, [listasQ.data, precios.length]);

  const crearMut = useMutation({
    mutationFn: async () => {
      if (!values.codigo_interno || !values.nombre || !values.categoria_id) {
        throw new Error('Código, nombre y categoría son obligatorios');
      }
      const existente = await db.productos.buscarPorCodigo(values.codigo_interno);
      if (existente) throw new Error(`El código ${values.codigo_interno} ya existe`);
      const p = await db.productos.create({
        codigo_interno: values.codigo_interno,
        nombre: values.nombre,
        descripcion: values.descripcion || undefined,
        descripcion_larga: values.descripcion_larga || undefined,
        categoria_id: values.categoria_id,
        proveedor_id: values.proveedor_id || undefined,
        costo: values.costo,
        publicado_web: values.publicado_web,
        activo: values.activo,
        solo_por_bulto: values.solo_por_bulto || undefined,
        cantidad_minima_web: values.cantidad_minima_web || undefined,
        incremento_web: values.incremento_web > 1 ? values.incremento_web : undefined,
        atributos: Object.keys(values.atributos).length > 0 ? values.atributos : undefined,
      });
      for (const x of precios) {
        if (x.escalas.some((e) => e.precio > 0)) {
          await db.productos.setPrecio(p.id, x.listaId, x.escalas);
        }
      }
      return p;
    },
    onSuccess: async () => {
      toast.success('Producto creado');
      await qc.invalidateQueries({ queryKey: ['productos-admin'] });
      router.push('/productos');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/productos">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver
        </Link>
      </Button>

      <h1 className="mb-4 text-2xl font-semibold">Nuevo producto</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          crearMut.mutate();
        }}
        className="space-y-4"
      >
        <ProductoFormFields
          values={values}
          onChange={setValues}
          categorias={categoriasQ.data ?? []}
          proveedores={proveedoresQ.data ?? []}
        />
        <PreciosFields
          precios={precios}
          onChange={setPrecios}
          listas={listasQ.data ?? []}
          costo={values.costo}
        />
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" type="button">
            <Link href="/productos">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={crearMut.isPending}>
            {crearMut.isPending ? 'Creando…' : 'Crear producto'}
          </Button>
        </div>
      </form>
    </div>
  );
}
