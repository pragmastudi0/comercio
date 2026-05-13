'use client';

import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';

export default function ProductosPage() {
  const db = getDb();
  const productosQ = useQuery({
    queryKey: ['productos'],
    queryFn: () => db.productos.list({ activo: true }),
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const preciosQ = useQuery({
    queryKey: ['precios'],
    queryFn: async () => {
      const productos = await db.productos.list({ activo: true });
      const map = new Map<string, number>();
      for (const p of productos) {
        const precios = await db.productos.preciosDe(p.id);
        const cf = precios.find((x) => x.lista_precio_id === 'lp_cf');
        const precio = cf?.escalas[0]?.precio ?? 0;
        map.set(p.id, precio);
      }
      return map;
    },
  });

  if (productosQ.isLoading || categoriasQ.isLoading || preciosQ.isLoading) {
    return (
      <main className="container mx-auto py-10">
        <Skeleton className="mb-4 h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }

  const productos = productosQ.data ?? [];
  const categorias = categoriasQ.data ?? [];
  const precios = preciosQ.data ?? new Map<string, number>();
  const catName = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <main className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>
          <p className="text-sm text-muted-foreground">{productos.length} productos activos</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Precio CF</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.codigo_interno}</TableCell>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell>{catName(p.categoria_id)}</TableCell>
                  <TableCell>{formatCurrency(p.costo)}</TableCell>
                  <TableCell>{formatCurrency(precios.get(p.id) ?? 0)}</TableCell>
                  <TableCell>
                    {p.activo ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="destructive">Inactivo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
