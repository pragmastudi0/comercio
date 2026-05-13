import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { getDb } from '@/lib/db';
import { Button } from '@comercio/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { toast } from 'sonner';

export function Caja() {
  const db = getDb();
  const [busqueda, setBusqueda] = useState('');

  const productosQ = useQuery({
    queryKey: ['pos-productos-search', busqueda],
    queryFn: () => db.productos.buscarRapido(busqueda, 8),
    enabled: busqueda.trim().length > 0,
  });

  useHotkeys('f2', (e) => {
    e.preventDefault();
    toast.info('F2 — Nueva venta. (Flujo completo: día 11-12)');
  });

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Caja</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Buscar producto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                autoFocus
                placeholder="Código (ej: 1000) o nombre"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">F2 = nueva venta</p>
            </div>
            {busqueda.trim().length === 0 && (
              <p className="text-sm text-muted-foreground">
                Escribí el código interno o parte del nombre para empezar.
              </p>
            )}
            {productosQ.isLoading && <Skeleton className="h-32 w-full" />}
            {productosQ.data && productosQ.data.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin resultados.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {productosQ.data?.map((p) => (
                <button
                  key={p.id}
                  className="flex items-center justify-between rounded border bg-card p-3 text-left hover:bg-accent"
                  onClick={() => toast.success(`Agregado: ${p.nombre} (mock)`)}
                >
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {p.codigo_interno}
                    </div>
                    <div className="font-medium">{p.nombre}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Costo {formatCurrency(p.costo)}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Carrito</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Carrito vacío. Flujo completo de venta (pagos, cuotas, ticket) en día 11-13.
            </p>
            <Button disabled className="w-full">
              Cobrar
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
