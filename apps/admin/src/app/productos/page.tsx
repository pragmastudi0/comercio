'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
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

export default function ProductosPage() {
  const db = getDb();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [sinStock, setSinStock] = useState(false);

  const productosQ = useQuery({
    queryKey: ['productos-admin', texto, categoriaId, sinStock],
    queryFn: () =>
      db.productos.list({
        texto: texto || undefined,
        categoria_id: categoriaId || undefined,
        sin_stock: sinStock || undefined,
        activo: true,
      }),
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });

  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.productos.delete(id),
    onSuccess: () => {
      toast.success('Producto eliminado');
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Precios CF cargados por separado para mostrar en la tabla.
  // Acepta tanto el ID real (UUID de Supabase) como el ID legacy del mock 'lp_cf'.
  const LISTA_CF_IDS = [PRESET_IDS.listas.consumidorFinal, 'lp_cf'];
  const preciosQ = useQuery({
    queryKey: ['precios-cf', productosQ.data?.map((p) => p.id).join(',')],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of productosQ.data ?? []) {
        const lp = await db.productos.preciosDe(p.id);
        const cf = lp.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
        map.set(p.id, cf?.escalas[0]?.precio ?? 0);
      }
      return map;
    },
    enabled: !!productosQ.data,
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
        <Button asChild>
          <Link href="/productos/nuevo">
            <Plus className="mr-1 h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
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
          <div className="flex items-end gap-2">
            <input
              id="sinstock"
              type="checkbox"
              checked={sinStock}
              onChange={(e) => setSinStock(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="sinstock" className="text-sm">
              Solo sin stock
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {productosQ.data?.length ?? 0} productos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productosQ.isLoading ? (
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
                  <TableHead>E-commerce</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(productosQ.data ?? []).map((p) => (
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
                    <TableCell>
                      {p.publicado_web ? (
                        <Badge variant="secondary">publicado</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/productos/${p.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
