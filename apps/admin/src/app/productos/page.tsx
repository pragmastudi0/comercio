'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { RequierePermiso, usePermiso } from '@/lib/permisos';

const PAGE_SIZE = 100;
const UMBRAL_BAJO_STOCK = 5;

type FiltroStock = '' | 'sin' | 'bajo';

function ProductosPageInner() {
  const db = getDb();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [texto, setTexto] = useState('');
  // Lee filtros iniciales de la URL para que los deep-links funcionen:
  //   /productos?stock=sin            ← KPI del dashboard
  //   /productos?categoria=<uuid>     ← clickear "N productos" en categorías
  //   /productos?proveedor=<uuid>     ← clickear "N productos" en proveedores
  const stockInicial = (params.get('stock') ?? '') as FiltroStock;
  const [filtroStock, setFiltroStock] = useState<FiltroStock>(
    stockInicial === 'sin' || stockInicial === 'bajo' ? stockInicial : '',
  );
  const [categoriaId, setCategoriaId] = useState(params.get('categoria') ?? '');
  const [proveedorId, setProveedorId] = useState(params.get('proveedor') ?? '');
  const [page, setPage] = useState(0);

  // Cuando cambia filtro, volver a página 0.
  useEffect(() => {
    setPage(0);
  }, [texto, categoriaId, proveedorId, filtroStock]);

  const productosQ = useQuery({
    queryKey: ['productos-admin', texto, categoriaId, proveedorId, filtroStock, page],
    queryFn: () =>
      db.productos.listPaginado({
        page,
        pageSize: PAGE_SIZE,
        texto: texto || undefined,
        categoria_id: categoriaId || undefined,
        proveedor_id: proveedorId || undefined,
        sin_stock: filtroStock === 'sin' || undefined,
        bajo_stock: filtroStock === 'bajo' || undefined,
        umbral_bajo_stock: filtroStock === 'bajo' ? UMBRAL_BAJO_STOCK : undefined,
        activo: true,
      }),
    placeholderData: (prev) => prev,
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  // Para resolver el nombre del proveedor cuando se está filtrando por uno
  // (banner "Mostrando productos de X").
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list(),
    enabled: !!proveedorId,
  });
  const proveedorActual = proveedorId
    ? proveedoresQ.data?.find((p) => p.id === proveedorId)
    : undefined;

  const total = productosQ.data?.total ?? 0;
  const rows = productosQ.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const puedeEditar = usePermiso('productos', 'editar');
  const puedeEliminar = usePermiso('productos', 'eliminar');

  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.productos.delete(id),
    onSuccess: () => {
      toast.success('Producto eliminado');
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Precios CF y stock total para los productos visibles en la página actual.
  const LISTA_CF_IDS = useMemo(() => [PRESET_IDS.listas.consumidorFinal, 'lp_cf'], []);
  const idsVisibles = rows.map((p) => p.id).join(',');
  const preciosQ = useQuery({
    queryKey: ['precios-cf-page', idsVisibles],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of rows) {
        const lp = await db.productos.preciosDe(p.id);
        const cf = lp.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
        map.set(p.id, cf?.escalas[0]?.precio ?? 0);
      }
      return map;
    },
    enabled: rows.length > 0,
  });
  // Stock total por producto en UN solo query batch (totalesDeMuchos hace
  // .in() chunkeado de a 200). Antes se hacía N+1 — 100 round-trips por
  // página de 100 productos. staleTime corto para que reaccione a cambios.
  const stockQ = useQuery({
    queryKey: ['stock-totales-page', idsVisibles],
    queryFn: () => db.stock.totalesDeMuchos(rows.map((p) => p.id)),
    enabled: rows.length > 0,
    staleTime: 15_000,
  });

  const categoriaNombre = (id: string) =>
    categoriasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo del comercio. Click en un producto para editar precio, stock e info.
          </p>
        </div>
        <RequierePermiso modulo="productos" accion="crear">
          <Button asChild>
            <Link href="/productos/nuevo">
              <Plus className="mr-1 h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        </RequierePermiso>
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
          <div>
            <Label className="mb-1 block text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Código o nombre"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Categoría</Label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas</option>
              {(categoriasQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          {/* Banner discreto cuando se filtra por proveedor (deep-link desde
              /admin/proveedores). Le doy al usuario un botón "Limpiar" para
              salir del filtro sin tener que armar otra URL. */}
          {proveedorId && (
            <div className="md:col-span-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <span>
                Mostrando productos del proveedor{' '}
                <span className="font-semibold">
                  {proveedorActual?.nombre ?? '…'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setProveedorId('')}
                className="text-xs font-medium text-amber-800 hover:underline"
              >
                Limpiar filtro
              </button>
            </div>
          )}
          <div>
            <Label className="mb-1 block text-xs">Stock</Label>
            <select
              value={filtroStock}
              onChange={(e) => setFiltroStock(e.target.value as FiltroStock)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="sin">Sin stock</option>
              <option value="bajo">Bajo stock (≤ {UMBRAL_BAJO_STOCK})</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {productosQ.isLoading ? (
              <span className="text-muted-foreground">Cargando…</span>
            ) : total === 0 ? (
              <>0 productos</>
            ) : (
              <>
                {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} de{' '}
                <span className="tabular-nums">{total}</span> productos
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productosQ.isLoading && rows.length === 0 ? (
            <Skeleton className="h-40" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio CF</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>E-commerce</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const stock = stockQ.data?.get(p.id) ?? 0;
                  const sinStockProd = stock <= 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.codigo_interno}</TableCell>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>{categoriaNombre(p.categoria_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(p.costo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(preciosQ.data?.get(p.id) ?? 0)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          stockQ.data && sinStockProd ? 'font-semibold text-destructive' : ''
                        }`}
                      >
                        {/* Mientras carga la primera vez mostramos un
                            skeleton para que no parezca "0 / sin stock" */}
                        {!stockQ.data ? (
                          <span className="inline-flex justify-end">
                            <Skeleton className="h-4 w-10" />
                          </span>
                        ) : (
                          stock
                        )}
                      </TableCell>
                      <TableCell>
                        {p.publicado_web ? (
                          <Badge variant="secondary">publicado</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {puedeEditar && (
                            <Button asChild variant="ghost" size="icon">
                              <Link href={`/productos/${p.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {puedeEliminar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm(`¿Eliminar "${p.nombre}"?`)) eliminarMut.mutate(p.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
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

        {/* Paginación */}
        {total > PAGE_SIZE && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
            <span className="text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || productosQ.isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || productosQ.isFetching}
              >
                Siguiente <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={null}>
      <ProductosPageInner />
    </Suspense>
  );
}
