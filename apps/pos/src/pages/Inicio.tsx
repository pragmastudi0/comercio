import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@comercio/ui/card';

export function Inicio() {
  return (
    <main className="container mx-auto px-4 py-10">
      <h1 className="mb-2 text-3xl font-semibold">PoS</h1>
      <p className="mb-8 text-muted-foreground">
        Punto de venta. La pantalla de caja se pule en el día 11-12 con atajos completos.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link to="/caja">
          <Card className="h-full transition hover:border-primary">
            <CardHeader>
              <CardTitle>Caja</CardTitle>
              <CardDescription>Apertura, ventas, cierre. F2 nueva venta.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Ir →</CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}
