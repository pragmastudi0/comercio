'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Users,
  Shield,
  ShoppingCart,
  Warehouse,
  TagsIcon,
  ArrowLeftRight,
  ListTree,
  Truck,
  Wallet,
  BarChart3,
  Settings,
  FileText,
} from 'lucide-react';
import { BRAND } from '@comercio/business';
import { cn } from '@comercio/ui/utils';

type NavItem = { href: string; label: string; icon: typeof Package };

const NAV_GROUPS: { titulo: string; items: NavItem[] }[] = [
  {
    titulo: 'General',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/ventas', label: 'Ventas', icon: ShoppingCart },
      { href: '/caja', label: 'Cajas', icon: Wallet },
      { href: '/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { href: '/productos', label: 'Productos', icon: Package },
      { href: '/categorias', label: 'Categorías', icon: ListTree },
      { href: '/listas-precio', label: 'Listas de precio', icon: TagsIcon },
      { href: '/proveedores', label: 'Proveedores', icon: Truck },
    ],
  },
  {
    titulo: 'Stock',
    items: [
      { href: '/depositos', label: 'Depósitos', icon: Warehouse },
      { href: '/transferencias', label: 'Transferencias', icon: ArrowLeftRight },
    ],
  },
  {
    titulo: 'Personas',
    items: [
      { href: '/clientes', label: 'Clientes', icon: Users },
      { href: '/empleados', label: 'Empleados', icon: Users },
      { href: '/roles', label: 'Roles y permisos', icon: Shield },
    ],
  },
  {
    titulo: 'Sistema',
    items: [
      { href: '/configuracion', label: 'Configuración', icon: Settings },
      { href: '/auditoria', label: 'Auditoría', icon: FileText },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="sticky top-0 flex h-screen w-60 flex-col border-r bg-background">
        <div className="border-b px-4 py-4">
          <Link href="/" className="block">
            <div className="text-lg font-bold tracking-tight">{BRAND.nombreCorto}</div>
            <div className="text-xs text-muted-foreground">Panel de administración</div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((grupo) => (
            <div key={grupo.titulo} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {grupo.titulo}
              </div>
              <div className="space-y-0.5">
                {grupo.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {BRAND.tagline}
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
