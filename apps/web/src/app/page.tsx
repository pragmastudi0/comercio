'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  MessageCircle,
  ShoppingBag,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { SITE } from '@/lib/config';

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
  // Para mostrar 6 destacados con precio CF
  const destacadosQ = useQuery({
    queryKey: ['destacados-precios', productosQ.data?.length],
    queryFn: async () => {
      const tomar = (productosQ.data ?? []).slice(0, 6);
      const result: Array<{ id: string; nombre: string; codigo: string; precio: number }> = [];
      for (const p of tomar) {
        const lp = await db.productos.preciosDe(p.id);
        const lista = lp.find((x) => x.lista_precio_id === SITE.listaPrecioId);
        const precio = lista?.escalas[0]?.precio ?? 0;
        result.push({ id: p.id, nombre: p.nombre, codigo: p.codigo_interno, precio });
      }
      return result;
    },
    enabled: !!productosQ.data,
  });

  const totalProductos = productosQ.data?.length ?? 0;
  const conteoPorCat = new Map<string, number>();
  for (const p of productosQ.data ?? []) {
    conteoPorCat.set(p.categoria_id, (conteoPorCat.get(p.categoria_id) ?? 0) + 1);
  }
  const categorias = (categoriasQ.data ?? []).filter(
    (c) => (conteoPorCat.get(c.id) ?? 0) > 0,
  );

  return (
    <>
      {/* HERO con foto al frente + overlay oscuro */}
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/bg.png)' }}
          aria-hidden
        />
        {/* Overlay oscuro para legibilidad del texto blanco */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70"
          aria-hidden
        />
        <div className="relative container mx-auto px-4 py-24 md:py-32 lg:py-40">
          <div className="max-w-2xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider backdrop-blur">
              Mayorista · Pedidos por WhatsApp
            </div>
            <h1 className="text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
              {SITE.nombre}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/90">
              Catálogo mayorista con precios por cantidad. Tecnología, bazar, belleza,
              papelería y artículos de viaje para tu negocio.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 bg-white px-6 text-base text-black hover:bg-white/90"
              >
                <Link href="/catalogo">
                  Ver catálogo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
              >
                <a
                  href={`https://wa.me/${SITE.whatsappNumero}?text=${encodeURIComponent(
                    `Hola ${SITE.nombre}, quería hacer una consulta.`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Consultar por WhatsApp
                </a>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-white/80">
              <div>
                <div className="text-2xl font-bold text-white">{totalProductos || '·'}</div>
                <div>Productos</div>
              </div>
              <div className="h-8 w-px bg-white/30" />
              <div>
                <div className="text-2xl font-bold text-white">{categorias.length || '·'}</div>
                <div>Categorías</div>
              </div>
              <div className="h-8 w-px bg-white/30" />
              <div>
                <div className="text-2xl font-bold text-white">∞</div>
                <div>Pedidos por WhatsApp</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORÍAS (sin iconos) */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Categorías
            </div>
            <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              Explorá por rubro
            </h2>
          </div>
          <Button asChild variant="ghost">
            <Link href="/catalogo">Ver catálogo completo →</Link>
          </Button>
        </div>

        {categoriasQ.isLoading || productosQ.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={`/catalogo?cat=${c.id}`}
                className="group relative flex items-center justify-between rounded-xl border bg-background p-6 transition hover:border-foreground hover:shadow-sm"
              >
                <div>
                  <div className="text-lg font-semibold">{c.nombre}</div>
                  <div className="text-sm text-muted-foreground">
                    {conteoPorCat.get(c.id)} productos
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* DESTACADOS */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="mb-10">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catálogo
            </div>
            <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              Algunos productos
            </h2>
          </div>

          {destacadosQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {(destacadosQ.data ?? []).map((p) => (
                <Link
                  key={p.id}
                  href={`/catalogo/${p.id}`}
                  className="group flex items-center justify-between rounded-lg border bg-background p-4 transition hover:border-foreground"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] uppercase text-muted-foreground">
                      Cód {p.codigo}
                    </div>
                    <div className="truncate font-medium">{p.nombre}</div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {formatCurrency(p.precio)}
                    </div>
                  </div>
                  <ArrowRight className="ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Button asChild size="lg" variant="outline">
              <Link href="/catalogo">
                Ver todos los productos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CÓMO COMPRAR */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mb-10 text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pedido sin fricción
          </div>
          <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            Cómo comprar
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShoppingBag,
              t: 'Armás el carrito',
              d: 'Navegás el catálogo y agregás los productos en las cantidades que necesites. Vas viendo el precio mayorista que aplica según la cantidad.',
            },
            {
              icon: CheckCircle2,
              t: 'Completás tus datos',
              d: 'En el carrito ponés razón social, contacto, forma de pago y entrega preferida. Sin crear cuentas.',
            },
            {
              icon: Send,
              t: 'Enviás por WhatsApp',
              d: 'Un click y se abre WhatsApp con el pedido pre-armado. Confirmamos por ese mismo chat.',
            },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="rounded-xl border bg-background p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-foreground text-background">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t bg-foreground text-background">
        <div className="container mx-auto px-4 py-16 text-center md:py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            ¿Listo para tu pedido?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-background/80">
            Empezá a armar tu carrito ahora. Cuando termines, lo envías por WhatsApp y te
            contestamos al toque.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 bg-background px-6 text-base text-foreground hover:bg-background/90">
              <Link href="/catalogo">
                Ir al catálogo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-background/30 bg-transparent px-6 text-base text-background hover:bg-background/10 hover:text-background"
            >
              <a
                href={`https://wa.me/${SITE.whatsappNumero}?text=${encodeURIComponent(
                  `Hola ${SITE.nombre}, quería hacer una consulta.`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Hablar por WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
