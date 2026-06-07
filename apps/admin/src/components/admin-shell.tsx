'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSesion } from '@/stores/sesion';
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
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  Receipt,
  Database,
  LogOut,
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
      { href: '/notas-credito', label: 'Notas de crédito', icon: Receipt },
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
    titulo: 'Online',
    items: [{ href: '/web', label: 'E-commerce', icon: Globe }],
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
    items: [
      { href: '/configuracion', label: 'Configuración', icon: Settings },
      { href: '/backup', label: 'Backup', icon: Database },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const empleado = useSesion((s) => s.empleado);
  const logout = useSesion((s) => s.logout);
  const isLoginRoute = pathname === '/login';

  // Desktop: expandido vs rail colapsado con iconos. Mobile: overlay drawer.
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persistencia simple del estado expandido en localStorage.
  useEffect(() => {
    const v = localStorage.getItem('turisteando-admin-sidebar');
    if (v === 'collapsed') setExpanded(false);
  }, []);
  useEffect(() => {
    localStorage.setItem('turisteando-admin-sidebar', expanded ? 'expanded' : 'collapsed');
  }, [expanded]);

  // Cerrar drawer móvil al navegar.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Guard de auth: si no hay sesión y la ruta no es /login, redirigir.
  useEffect(() => {
    if (!empleado && !isLoginRoute) {
      router.replace('/login');
    }
  }, [empleado, isLoginRoute, router]);

  // En la ruta /login, no renderizamos el shell (login fullscreen).
  if (isLoginRoute) return <>{children}</>;
  // Mientras carga el redirect, no renderizamos nada (evita flash).
  if (!empleado) return null;

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Backdrop sólo cuando el drawer está abierto en móvil */}
      {mobileOpen && (
        <button
          aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-background',
          'transition-[width,transform] duration-300 ease-out',
          // Desktop: ancho variable según expanded. Cuando está colapsado
          // dejamos overflow visible para que el tooltip al hover pueda
          // salir por la derecha sin que lo recorte el ancho del sidebar.
          expanded ? 'lg:w-60' : 'lg:w-16 lg:overflow-visible',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          // Mobile: drawer
          mobileOpen ? 'w-60 translate-x-0' : 'w-60 -translate-x-full',
        )}
      >
        {/* Header del sidebar */}
        <div
          className={cn(
            'flex h-14 items-center border-b',
            expanded ? 'justify-between px-4' : 'justify-center px-2',
          )}
        >
          {expanded ? (
            <Link href="/" className="block min-w-0 flex-1 truncate">
              <div className="truncate text-lg font-bold tracking-tight">
                {BRAND.nombreCorto}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">Admin</div>
            </Link>
          ) : (
            <Link
              href="/"
              className="text-base font-bold tracking-tight"
              title={BRAND.nombreCorto}
            >
              #t
            </Link>
          )}
          {/* Toggle: en desktop pliega/despliega; en mobile cierra */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 lg:inline-flex"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Colapsar menú' : 'Expandir menú'}
            title={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav. Cuando está colapsado dejamos overflow visible para que el
            tooltip que sale por la derecha no quede recortado. Cuando está
            expandido, overflow-y-auto normal por si la lista crece. */}
        <nav
          className={cn(
            'flex-1 py-3',
            expanded ? 'overflow-y-auto px-2' : 'overflow-visible px-1.5',
          )}
        >
          {NAV_GROUPS.map((grupo) => (
            <div key={grupo.titulo} className="mb-4">
              {expanded ? (
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {grupo.titulo}
                </div>
              ) : (
                <div className="mx-2 mb-1 h-px bg-border first:hidden" />
              )}
              <div className="space-y-0.5">
                {grupo.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={!expanded ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-md text-sm transition-colors',
                        expanded ? 'gap-2 px-2 py-1.5' : 'h-10 w-10 justify-center',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {expanded && <span className="truncate">{item.label}</span>}
                      {/* Tooltip deslizante cuando está colapsado */}
                      {!expanded && (
                        <span
                          className={cn(
                            'pointer-events-none absolute left-full top-1/2 z-50 ml-1 flex h-9 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-md text-sm font-medium shadow-md',
                            // Estado base (oculto, escalado hacia la izquierda)
                            'max-w-0 origin-left scale-x-0 px-0 opacity-0',
                            // Hover: se despliega horizontalmente desde el icono
                            'group-hover:max-w-[220px] group-hover:scale-x-100 group-hover:px-3 group-hover:opacity-100',
                            'transition-all duration-300 ease-out group-hover:delay-75',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-foreground text-background',
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer del sidebar con el usuario logueado + logout */}
        <div className={cn('border-t', expanded ? 'px-3 py-3' : 'px-2 py-3')}>
          {expanded ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {empleado.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {empleado.nombre} {empleado.apellido}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {empleado.email}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={async () => {
                  if (!confirm('¿Cerrar sesión?')) return;
                  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
                  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                  if (url && key) {
                    const { createSupabaseRaw } = await import('@comercio/db');
                    await createSupabaseRaw(url, key).auth.signOut();
                  }
                  logout();
                  router.push('/login');
                }}
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={async () => {
                if (!confirm('¿Cerrar sesión?')) return;
                const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
                const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                if (url && key) {
                  const { createSupabaseRaw } = await import('@comercio/db');
                  await createSupabaseRaw(url, key).auth.signOut();
                }
                logout();
                router.push('/login');
              }}
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header principal: sólo botón hamburguesa en mobile (en desktop el toggle vive en el sidebar) */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8"
            aria-label="Abrir menú"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold tracking-tight">{BRAND.nombreCorto}</span>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
