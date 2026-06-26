'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSesion } from '@/stores/sesion';
import {
  Home,
  ShoppingCart,
  Wallet,
  Package,
  BarChart3,
  Settings,
  ChevronDown,
  LogOut,
  Menu,
  X,
  TrendingUp,
  PackagePlus,
  PlusCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_IDS } from '@comercio/db';
import { cn } from '@comercio/ui/utils';
import { Button } from '@comercio/ui/button';

import type { AccionPermiso, ModuloPermiso } from '@comercio/business';
import { usePermisos } from '@/lib/permisos';

import { ModalSaldosCajas } from './modal-saldos-cajas';
import { ModalGananciasHoy } from './modal-ganancias-hoy';
import { ModalCargarStock } from './modal-cargar-stock';

type SubItem = {
  href: string;
  label: string;
  requiere?: { modulo: ModuloPermiso; accion: string };
};

type MenuItem = {
  label: string;
  // Si tiene href, es un link directo. Si tiene subs, es un dropdown.
  href?: string;
  icon: typeof Home;
  subs?: SubItem[];
  requiere?: { modulo: ModuloPermiso; accion: string };
};

function req<M extends ModuloPermiso>(
  modulo: M,
  accion: AccionPermiso<M>,
): { modulo: ModuloPermiso; accion: string } {
  return { modulo, accion: accion as string };
}

// Estructura del menubar — reorganizado al estilo ERP de escritorio.
// Las acciones más usadas (saldos, ganancias, cargar stock, faltantes)
// viven en la toolbar de íconos grandes debajo, no acá.
const MENU: MenuItem[] = [
  { label: 'Inicio', href: '/', icon: Home },
  {
    label: 'Ventas',
    icon: ShoppingCart,
    subs: [
      { href: '/ventas', label: 'Historial de ventas', requiere: req('ventas', 'crear') },
      { href: '/notas-credito', label: 'Notas de crédito' },
    ],
  },
  { label: 'Caja', href: '/caja', icon: Wallet, requiere: req('caja', 'ver_propia') },
  {
    label: 'Productos',
    icon: Package,
    subs: [
      { href: '/productos', label: 'Catálogo', requiere: req('productos', 'ver') },
      { href: '/categorias', label: 'Categorías', requiere: req('categorias', 'ver') },
      { href: '/listas-precio', label: 'Listas de precio', requiere: req('listas_precio', 'ver') },
      { href: '/proveedores', label: 'Proveedores', requiere: req('proveedores', 'ver') },
    ],
  },
  {
    label: 'Reportes',
    href: '/reportes',
    icon: BarChart3,
    requiere: req('reportes', 'ver_local_propio'),
  },
  {
    label: 'Sistema',
    icon: Settings,
    subs: [
      { href: '/empleados', label: 'Empleados', requiere: req('empleados', 'ver') },
      { href: '/roles', label: 'Roles y permisos', requiere: req('roles', 'ver') },
      { href: '/configuracion', label: 'Configuración general', requiere: req('configuracion', 'ver') },
      { href: '/backup', label: 'Backup', requiere: req('configuracion', 'backup_restore') },
      { href: '/web', label: 'E-commerce', requiere: req('productos', 'publicar_ecommerce') },
    ],
  },
];

// Acciones de la toolbar de íconos grandes (lo que Agus toca todo el tiempo).
// Cada una abre un modal o navega a una ruta.
type ToolbarAction =
  | { type: 'modal'; key: 'saldos' | 'ganancias' | 'cargar-stock'; label: string; icon: typeof Home; color: string }
  | { type: 'link'; href: string; label: string; icon: typeof Home; color: string; external?: boolean };

const TOOLBAR: ToolbarAction[] = [
  { type: 'modal', key: 'saldos', label: 'Saldos de cajas', icon: Wallet, color: 'bg-emerald-100 text-emerald-700' },
  { type: 'modal', key: 'ganancias', label: 'Ganancias hoy', icon: TrendingUp, color: 'bg-blue-100 text-blue-700' },
  { type: 'modal', key: 'cargar-stock', label: 'Cargar stock', icon: PackagePlus, color: 'bg-amber-100 text-amber-700' },
  { type: 'link', href: '/productos/nuevo', label: 'Nuevo producto', icon: PlusCircle, color: 'bg-purple-100 text-purple-700' },
  { type: 'link', href: '/productos?stock=bajo', label: 'Faltantes', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  // Detectamos la URL del PoS por env var; fallback al subdomain habitual.
  { type: 'link', href: process.env.NEXT_PUBLIC_POS_URL ?? '/', label: 'Ver PoS', icon: ExternalLink, color: 'bg-slate-100 text-slate-700', external: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const empleado = useSesion((s) => s.empleado);
  const logout = useSesion((s) => s.logout);
  const { puede, cargando: permisosCargando } = usePermisos();
  const isLoginRoute = pathname === '/login';

  // Filtrar items del menú según permisos. Si todos los subs de un dropdown
  // quedan filtrados, ocultamos el dropdown entero.
  const menuVisible = MENU.map((item) => {
    if (item.subs) {
      const subs = item.subs.filter((s) => {
        if (!s.requiere) return true;
        if (permisosCargando) return false;
        return puede(s.requiere.modulo, s.requiere.accion as AccionPermiso<ModuloPermiso>);
      });
      return { ...item, subs };
    }
    return item;
  }).filter((item) => {
    if (item.subs) return item.subs.length > 0;
    if (!item.requiere) return true;
    if (permisosCargando) return false;
    return puede(item.requiere.modulo, item.requiere.accion as AccionPermiso<ModuloPermiso>);
  });

  // Estado del dropdown abierto en el menubar (solo 1 a la vez).
  const [dropdownAbierto, setDropdownAbierto] = useState<string | null>(null);
  const menubarRef = useRef<HTMLDivElement>(null);

  // Click fuera del menubar → cerrar dropdown.
  useEffect(() => {
    if (!dropdownAbierto) return;
    const handler = (e: MouseEvent) => {
      if (!menubarRef.current?.contains(e.target as Node)) {
        setDropdownAbierto(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownAbierto]);

  // Cerrar dropdown al navegar a una ruta.
  useEffect(() => {
    setDropdownAbierto(null);
  }, [pathname]);

  // Mobile menu (hamburger)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Modal activo (de la toolbar)
  const [modalActivo, setModalActivo] = useState<'saldos' | 'ganancias' | 'cargar-stock' | null>(null);

  // Guards de auth/rol (idénticos al shell anterior).
  useEffect(() => {
    if (!empleado && !isLoginRoute) {
      router.replace('/login');
    }
  }, [empleado, isLoginRoute, router]);

  const esCajeroPreset = empleado?.rol_id === PRESET_IDS.roles.cajero;
  useEffect(() => {
    if (esCajeroPreset && !isLoginRoute) {
      toast.error(
        'Como cajero tenés que usar el sistema de caja (PoS), no el panel admin.',
        { duration: 5000 },
      );
      logout();
      router.replace('/login');
    }
  }, [esCajeroPreset, isLoginRoute, router, logout]);

  if (isLoginRoute) return <>{children}</>;
  if (!empleado) return null;
  if (esCajeroPreset) return null;

  function cerrarSesion() {
    if (!confirm('¿Cerrar sesión?')) return;
    logout();
    router.push('/login');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      import('@comercio/db').then(({ createSupabaseRaw }) => {
        createSupabaseRaw(url, key).auth.signOut().catch(() => {});
      });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      {/* Top bar con título + menubar + user. Estilo ERP de escritorio. */}
      <header className="sticky top-0 z-40 border-b bg-background shadow-sm">
        {/* Banda 1: branding + user (h-10) */}
        <div className="flex h-10 items-center justify-between border-b bg-foreground/95 px-3 text-background">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="hidden sm:inline">Turisteando</span>
            <span className="opacity-60">·</span>
            <span>Admin</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-background/80 sm:inline">
              {empleado.nombre} {empleado.apellido}
            </span>
            <button
              type="button"
              onClick={cerrarSesion}
              className="flex items-center gap-1 rounded px-2 py-1 hover:bg-background/10"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>

        {/* Banda 2: menubar (h-10) */}
        <div ref={menubarRef} className="hidden h-10 items-center gap-0.5 px-2 lg:flex">
          {menuVisible.map((item) => {
            const Icon = item.icon;
            const activo =
              item.href === '/'
                ? pathname === '/'
                : item.href
                  ? pathname.startsWith(item.href)
                  : item.subs?.some((s) => pathname.startsWith(s.href));
            const tieneDropdown = !!item.subs;
            const dropdownOpen = dropdownAbierto === item.label;

            if (!tieneDropdown && item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    activo ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            }

            return (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownAbierto(dropdownOpen ? null : item.label)}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    activo || dropdownOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
                {dropdownOpen && item.subs && (
                  <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[200px] rounded-md border bg-background py-1 shadow-lg">
                    {item.subs.map((sub) => {
                      const subActivo = pathname.startsWith(sub.href);
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={cn(
                            'block px-3 py-1.5 text-sm transition-colors',
                            subActivo
                              ? 'bg-primary/10 font-semibold text-primary'
                              : 'hover:bg-accent',
                          )}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile: hamburger */}
        <div className="flex h-10 items-center justify-between px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:bg-accent"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span>Menú</span>
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t bg-background px-2 py-2 lg:hidden">
            {menuVisible.map((item) => (
              <div key={item.label} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                  {item.label}
                </div>
                {item.subs ? (
                  item.subs.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className="block rounded px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      {sub.label}
                    </Link>
                  ))
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="block rounded px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Ir
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Banda 3: toolbar de íconos grandes coloridos (las acciones más usadas).
            En mobile se muestra horizontal con scroll. */}
        <div className="flex h-[88px] items-center gap-2 overflow-x-auto border-t bg-muted/30 px-3 py-2">
          {TOOLBAR.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  if (action.type === 'modal') {
                    setModalActivo(action.key);
                  } else if (action.external) {
                    window.open(action.href, '_blank', 'noopener');
                  } else {
                    router.push(action.href);
                  }
                }}
                className={cn(
                  'group flex h-[72px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-background px-2 transition-all hover:border-primary/40 hover:shadow-sm',
                )}
                title={action.label}
              >
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-md', action.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-center text-[11px] font-medium leading-tight">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Contenido principal */}
      <main className="min-w-0 flex-1">{children}</main>

      {/* Modales globales de la toolbar */}
      <ModalSaldosCajas open={modalActivo === 'saldos'} onOpenChange={(v) => !v && setModalActivo(null)} />
      <ModalGananciasHoy open={modalActivo === 'ganancias'} onOpenChange={(v) => !v && setModalActivo(null)} />
      <ModalCargarStock open={modalActivo === 'cargar-stock'} onOpenChange={(v) => !v && setModalActivo(null)} />
    </div>
  );
}
