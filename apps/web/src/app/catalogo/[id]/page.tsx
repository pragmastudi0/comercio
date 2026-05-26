'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Minus, Plus, Package, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { SITE } from '@/lib/config';
import { useCarrito, precioPorCantidad } from '@/stores/carrito';
import { Card, CardContent } from '@comercio/ui/card';
import { Badge } from '@comercio/ui/badge';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { emojiProducto, visualDeCategoria } from '@/lib/imagenes';

export default function ProductoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const db = getDb();
  const agregar = useCarrito((s) => s.agregar);

  const productoQ = useQuery({ queryKey: ['producto-web', id], queryFn: () => db.productos.get(id) });
  const preciosQ = useQuery({
    queryKey: ['precios-web', SITE.listaPrecioId, id],
    queryFn: async () => {
      const lp = await db.productos.preciosDe(id);
      const lista = lp.find((x) => x.lista_precio_id === SITE.listaPrecioId);
      return lista?.escalas ?? [];
    },
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });

  const [cantidad, setCantidad] = useState(1);
  // Cuando carga el producto, ajustar la cantidad inicial al mínimo / incremento.
  useEffect(() => {
    if (productoQ.data) {
      const minimo = Math.max(
        1,
        productoQ.data.cantidad_minima_web ?? 0,
        productoQ.data.incremento_web ?? 1,
      );
      setCantidad((c) => (c < minimo ? minimo : c));
    }
  }, [productoQ.data]);

  if (productoQ.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!productoQ.data) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p>Producto no encontrado.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/catalogo">Volver al catálogo</Link>
        </Button>
      </div>
    );
  }

  const p = productoQ.data;
  const escalas = preciosQ.data ?? [];
  const cat = categoriasQ.data?.find((c) => c.id === p.categoria_id);
  const precioActual = precioPorCantidad(escalas, cantidad);
  const subtotal = cantidad * precioActual;

  function onAgregar() {
    agregar({ id: p.id, codigo_interno: p.codigo_interno, nombre: p.nombre }, escalas, cantidad);
    toast.success(`Agregado al carrito: ${cantidad}× ${p.nombre}`, {
      action: {
        label: 'Ver carrito',
        onClick: () => router.push('/carrito'),
      },
    });
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/catalogo">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver al catálogo
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* Imagen placeholder con emoji representativo */}
        <Card className="overflow-hidden">
          <div
            className={`flex aspect-square items-center justify-center text-[10rem] ${visualDeCategoria(p.categoria_id).bg}`}
          >
            <span aria-hidden>{emojiProducto(p.nombre, p.categoria_id)}</span>
          </div>
        </Card>

        <div>
          {cat && <Badge variant="secondary">{cat.nombre}</Badge>}
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{p.nombre}</h1>
          <div className="mt-1 font-mono text-sm text-muted-foreground">
            Código {p.codigo_interno}
          </div>
          {p.descripcion && <p className="mt-4 text-muted-foreground">{p.descripcion}</p>}
          {p.descripcion_larga && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {p.descripcion_larga}
            </p>
          )}

          {/* Reglas de venta (sólo bulto / mínimo) */}
          {(p.solo_por_bulto || (p.cantidad_minima_web ?? 0) > 0 || (p.incremento_web ?? 1) > 1) && (
            <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
              {p.solo_por_bulto && (
                <div>
                  <strong>Venta solo por bulto</strong> de {p.incremento_web ?? 1} unidades.
                </div>
              )}
              {!p.solo_por_bulto && (p.incremento_web ?? 1) > 1 && (
                <div>Se vende en múltiplos de {p.incremento_web} unidades.</div>
              )}
              {(p.cantidad_minima_web ?? 0) > 0 && (
                <div>Compra mínima: {p.cantidad_minima_web} unidades.</div>
              )}
            </div>
          )}

          {/* Escalas de precio */}
          <Card className="mt-6">
            <CardContent className="space-y-2 pt-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Precio mayorista
              </div>
              {escalas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin precio publicado. Consultá por WhatsApp.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left font-medium">Cantidad</th>
                      <th className="py-1 text-right font-medium">Precio por unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalas.map((e, i) => {
                      const hasta = escalas[i + 1]?.desde
                        ? escalas[i + 1]!.desde - 1
                        : null;
                      const rango = hasta ? `${e.desde} – ${hasta} u` : `${e.desde}+ u`;
                      const activo = cantidad >= e.desde && (hasta === null || cantidad <= hasta);
                      return (
                        <tr
                          key={i}
                          className={`border-t ${activo ? 'bg-muted/30 font-medium' : ''}`}
                        >
                          <td className="py-2">{rango}</td>
                          <td className="py-2 text-right tabular-nums">
                            {formatCurrency(e.precio)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Cantidad + agregar */}
          <div className="mt-6 rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cantidad</span>
              <span className="font-medium">{cantidad} unidades</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-center"
              />
              <Button variant="outline" size="icon" onClick={() => setCantidad((c) => c + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Subtotal</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(subtotal)}
                </div>
                {escalas.length > 1 && cantidad < escalas[1]!.desde && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    A partir de {escalas[1]!.desde}u el precio baja a{' '}
                    {formatCurrency(escalas[1]!.precio)} c/u
                  </div>
                )}
              </div>
              <Button size="lg" onClick={onAgregar} disabled={escalas.length === 0}>
                <ShoppingBag className="mr-2 h-4 w-4" />
                Agregar al carrito
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
