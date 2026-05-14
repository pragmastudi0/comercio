'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircle, Layers, Tag } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Skeleton } from '@comercio/ui/skeleton';
import { SITE } from '@/lib/config';
import { visualDeCategoria } from '@/lib/imagenes';

export default function HomePage() {
  const db = getDb();
  const categoriasQ = useQuery({
    queryKey: ['categorias'],
    queryFn: () => db.categorias.list(),
  });
  const productosQ = useQuery({
    queryKey: ['productos-web'],
    queryFn: () => db.productos.list({ publicado_web: true, activo: true }),
  });

  const totalProductos = productosQ.data?.length ?? 0;
  // Conteo por categoría
  const conteoPorCat = new Map<string, number>();
  for (const p of productosQ.data ?? []) {
    conteoPorCat.set(p.categoria_id, (conteoPorCat.get(p.categoria_id) ?? 0) + 1);
  }
  const categoriasConProductos = (categoriasQ.data ?? []).filter(
    (c) => (conteoPorCat.get(c.id) ?? 0) > 0,
  );

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto grid items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <div className="mb-3 inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <Tag className="h-3 w-3" />
              Catálogo mayorista
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {SITE.nombre}
            </h1>
            <p className="mt-4 max-w-prose text-muted-foreground">
              Tecnología, bazar, belleza y artículos de viaje. Precios por cantidad,
              pedido directo por WhatsApp.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/catalogo">
                  Ver catálogo
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a
                  href={`https://wa.me/${SITE.whatsappNumero}?text=${encodeURIComponent(
                    `Hola ${SITE.nombre}, quería hacer una consulta.`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="mr-1 h-4 w-4" />
                  Consultar
                </a>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys({
                cat_tec: 1,
                cat_baz: 1,
                cat_bel: 1,
                cat_jug: 1,
                cat_pap: 1,
                cat_via: 1,
              }) as string[]).map((id) => {
                const v = visualDeCategoria(id);
                return (
                  <div
                    key={id}
                    className={`flex aspect-square items-center justify-center rounded-lg border text-5xl ${v.bg}`}
                  >
                    {v.emojiPrincipal}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Categorías */}
      <section className="container mx-auto px-4 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Categorías</h2>
            <p className="text-sm text-muted-foreground">
              {totalProductos} productos disponibles
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/catalogo">Ver todo →</Link>
          </Button>
        </div>

        {categoriasQ.isLoading || productosQ.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoriasConProductos.map((c) => {
              const v = visualDeCategoria(c.id);
              return (
                <Link key={c.id} href={`/catalogo?cat=${c.id}`}>
                  <Card className="h-full overflow-hidden transition hover:border-foreground">
                    <div className={`grid grid-cols-2 gap-1 p-3 ${v.bg}`}>
                      {v.emojis.slice(0, 4).map((e, i) => (
                        <div
                          key={i}
                          className="flex aspect-square items-center justify-center rounded text-3xl"
                        >
                          {e}
                        </div>
                      ))}
                    </div>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg">{c.nombre}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {conteoPorCat.get(c.id)} productos
                        </p>
                      </div>
                      <Layers className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Cómo comprar */}
      <section className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <h2 className="mb-6 text-2xl font-semibold">Cómo comprar</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                n: 1,
                t: 'Armás el carrito',
                d: 'Navegás el catálogo y agregás los productos en las cantidades que necesites.',
              },
              {
                n: 2,
                t: 'Completás tus datos',
                d: 'En el carrito completás razón social, contacto y forma de pago/entrega preferida.',
              },
              {
                n: 3,
                t: 'Enviás por WhatsApp',
                d: 'Un click y se abre WhatsApp con el pedido pre-armado. Confirmamos por ese mismo chat.',
              },
            ].map((s) => (
              <div key={s.n} className="rounded-lg border bg-background p-5">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border font-mono text-sm font-semibold">
                  {s.n}
                </div>
                <h3 className="font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
