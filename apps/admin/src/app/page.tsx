import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@comercio/ui/card';

const SECCIONES = [
  { href: '/productos', titulo: 'Productos', desc: 'Catálogo, precios, atributos' },
  { href: '/categorias', titulo: 'Categorías', desc: 'Árbol de categorías y atributos por tipo' },
  { href: '/clientes', titulo: 'Clientes', desc: 'ABM y cuenta corriente' },
  { href: '/proveedores', titulo: 'Proveedores', desc: 'ABM' },
  { href: '/empleados', titulo: 'Empleados', desc: 'Roles y permisos granulares' },
  { href: '/roles', titulo: 'Roles', desc: 'Configurar permisos por rol' },
  { href: '/depositos', titulo: 'Depósitos y locales', desc: 'Stock por depósito' },
  { href: '/listas-precio', titulo: 'Listas de precio', desc: 'Escalas y aumentos' },
  { href: '/ventas', titulo: 'Ventas', desc: 'Historial y anulaciones' },
  { href: '/caja', titulo: 'Caja', desc: 'Sesiones y movimientos' },
  { href: '/transferencias', titulo: 'Transferencias', desc: 'Movimientos entre depósitos' },
  { href: '/reportes', titulo: 'Reportes', desc: 'Ingresos, egresos, KPIs' },
  { href: '/configuracion', titulo: 'Configuración', desc: 'Empresa, recargos, descuentos' },
];

export default function HomePage() {
  return (
    <main className="container mx-auto py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Comercio · Admin</h1>
        <p className="text-muted-foreground">
          Panel de gestión — operando con datos mock (día 1-3). Día 4+ pasa a Supabase.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition hover:border-primary">
              <CardHeader>
                <CardTitle>{s.titulo}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Ir →</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
