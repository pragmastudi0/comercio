'use client';

import { useState, useEffect } from 'react';
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
  Menu,
  X,
} from 'lucide-react';
import { BRAND } from '@comercio/business';
import { cn } from '@comercio/ui/utils';
import { Button } from '@comercio/ui/button';

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
      { href: '/empleados', label: 'Empleados', icon: Users },
      { href: '/roles', label: 'Roles y permisos', icon: Shield },
    ],
  },
  {
    titulo: 'Sistema',
    items: [{ href: '/configuracion', label: 'Configuración', icon: Settings }],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // En desktop por default abierto; en móvil por default cerrado.
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setOpen(typeof window !== 'undefined' && window.innerWidth >= 1024);
  }, []);

  // Cerrar el sidebar al navegar (sólo en móvil).
  useEffect(() => {
    if (hydrated && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Backdrop solo en móvil */}
      {open && (
        <button
          aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-background transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen',
          open ? 'translate-x-0' : '-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <Link href="/" className="block">
            <div className="text-lg font-bold tracking-tight">{BRAND.nombreCorto}</div>
            <div className="text-xs text-muted-foreground">Panel de administración</div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="h-8 w-8"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </Button>
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
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur lg:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            className="h-8 w-8"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold tracking-tight lg:hidden">
            {BRAND.nombreCorto}
          </span>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
