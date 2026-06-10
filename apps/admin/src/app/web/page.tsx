'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Globe,
  Search,
  ExternalLink,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@comercio/ui/table';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { PRESET_IDS } from '@comercio/db';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://turisteando-web.vercel.app';
// Acepta tanto el UUID real como el id legacy del mock.
const LISTA_MAY_IDS = [PRESET_IDS.listas.mayorista, 'lp_may'];

export default function WebPage() {
  const db = getDb();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'publicados' | 'ocultos'>('todos');

  const productosQ = useQuery({
    queryKey: ['productos-web-admin'],
    queryFn: () => db.productos.list({ activo: true }),
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const preciosQ = useQuery({
    queryKey: ['precios-web-admin', productosQ.data?.length],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of productosQ.data ?? []) {
        const lp = await db.productos.preciosDe(p.id);
        const lista = lp.find((x) => LISTA_MAY_IDS.includes(x.lista_precio_id));
        map.set(p.id, lista?.escalas[0]?.precio ?? 0);
      }
      return map;
    },
    enabled: !!productosQ.data,
  });
  // Stock total por producto — para que el dueño vea si puede publicar.
  const stockQ = useQuery({
    queryKey: ['stock-web-admin', productosQ.data?.length],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of productosQ.data ?? []) {
        const items = await db.stock.porProducto(p.id);
        map.set(p.id, items.reduce((acc, s) => acc + Number(s.cantidad), 0));
      }
      return map;
    },
    enabled: !!productosQ.data,
  });

  const togglePublicarMut = useMutation({
    mutationFn: ({ id, publicar }: { id: string; publicar: boolean }) =>
      db.productos.update(id, { publicado_web: publicar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos-web-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publicarTodosMut = useMutation({
    mutationFn: async (publicar: boolean) => {
      const todos = productosQ.data ?? [];
      let cambios = 0;
      for (const p of todos) {
        if (p.publicado_web !== publicar) {
          await db.productos.update(p.id, { publicado_web: publicar });
          cambios += 1;
        }
      }
      return cambios;
    },
    onSuccess: (cambios) => {
      toast.success(`${cambios} producto(s) actualizado(s)`);
      qc.invalidateQueries({ queryKey: ['productos-web-admin'] });
    },
  });

  const productos = productosQ.data ?? [];
  const publicados = productos.filter((p) => p.publicado_web);
  const ocultos = productos.filter((p) => !p.publicado_web);

  let visibles = productos;
  if (filtro === 'publicados') visibles = publicados;
  if (filtro === 'ocultos') visibles = ocultos;
  if (texto) {
    const q = texto.toLowerCase();
    visibles = visibles.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo_interno.includes(q),
    );
  }

  const categoriaNombre = (id: string) =>
    categoriasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Online
          </div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">E-commerce</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná qué productos se muestran en la web mayorista.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={WEB_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Ver sitio público
            </a>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <KpiCard
          titulo="Productos publicados"
          valor={publicados.length}
          sub="visibles en la web"
          icon={Eye}
          accent
          loading={productosQ.isLoading}
        />
        <KpiCard
          titulo="Productos ocultos"
          valor={ocultos.length}
          sub="cargados pero no visibles"
          icon={EyeOff}
          loading={productosQ.isLoading}
        />
        <KpiCard
          titulo="Total catálogo"
          valor={productos.length}
          sub="productos activos en el sistema"
          icon={Globe}
          loading={productosQ.isLoading}
        />
      </div>

      {/* Acciones rápidas */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={publicarTodosMut.isPending || publicados.length === productos.length}
            onClick={() => {
              if (confirm(`¿Publicar los ${ocultos.length} productos ocultos en la web?`))
                publicarTodosMut.mutate(true);
            }}
          >
            <Eye className="mr-1 h-3 w-3" />
            Publicar todos
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={publicarTodosMut.isPending || ocultos.length === productos.length}
            onClick={() => {
              if (confirm(`¿Ocultar los ${publicados.length} productos publicados?`))
                publicarTodosMut.mutate(false);
            }}
          >
            <EyeOff className="mr-1 h-3 w-3" />
            Ocultar todos
          </Button>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              {visibles.length} de {productos.length}
            </CardTitle>
            <div className="flex gap-1 rounded-md border bg-background p-0.5 text-xs">
              <button
                onClick={() => setFiltro('todos')}
                className={`rounded px-2 py-1 ${filtro === 'todos' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltro('publicados')}
                className={`rounded px-2 py-1 ${filtro === 'publicados' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Publicados
              </button>
              <button
                onClick={() => setFiltro('ocultos')}
                className={`rounded px-2 py-1 ${filtro === 'ocultos' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Ocultos
              </button>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {productosQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay productos que coincidan.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Web</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio mayorista</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Desc. larga</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((p) => {
                  const stock = stockQ.data?.get(p.id) ?? 0;
                  const sinStock = stock <= 0;
                  return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <ToggleSwitch
                        checked={p.publicado_web}
                        onChange={(v) =>
                          togglePublicarMut.mutate({ id: p.id, publicar: v })
                        }
                        disabled={togglePublicarMut.isPending}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.codigo_interno}</TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>{categoriaNombre(p.categoria_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(preciosQ.data?.get(p.id) ?? 0)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        sinStock ? 'font-semibold text-destructive' : ''
                      }`}
                      title={sinStock ? 'Sin stock — conviene no publicar' : `${stock} unidades`}
                    >
                      {stockQ.isLoading ? '…' : stock}
                    </TableCell>
                    <TableCell>
                      {p.descripcion_larga ? (
                        <Badge variant="secondary">Sí</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" title="Editar producto">
                          <Link href={`/productos/${p.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        {p.publicado_web && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Ver en la web"
                          >
                            <a
                              href={`${WEB_URL}/catalogo/${p.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: la descripción larga, las imágenes y el precio mayorista (lista{' '}
        <code>lp_may</code>) se editan desde la pantalla del producto.
      </p>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function KpiCard({
  titulo,
  valor,
  sub,
  icon: Icon,
  accent,
  loading,
}: {
  titulo: string;
  valor: number;
  sub: string;
  icon: typeof Globe;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <Card className={accent ? 'border-primary/30 bg-primary/5' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold tabular-nums sm:text-3xl">{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
