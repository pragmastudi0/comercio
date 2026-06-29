'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import {
  evaluarPermisos,
  makePuede,
  PERMISOS_PRESET,
  type AccionPermiso,
  type ModuloPermiso,
  type RolPreset,
} from '@comercio/business';
import { PRESET_IDS } from '@comercio/db';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';

// Mapeo de IDs de rol preset a su key en PERMISOS_PRESET.
const ROL_PRESET_POR_ID: Record<string, RolPreset> = {
  [PRESET_IDS.roles.admin]: 'admin',
  [PRESET_IDS.roles.encargado]: 'encargado',
  [PRESET_IDS.roles.cajero]: 'cajero',
  [PRESET_IDS.roles.catalogo]: 'catalogo',
};

/**
 * Devuelve la matriz efectiva de permisos del empleado logueado:
 * rolPermisos + empleado.permisos_override (override gana).
 */
export function usePermisos() {
  const empleado = useSesion((s) => s.empleado);
  const db = getDb();

  const rolQ = useQuery({
    queryKey: ['rol-actual', empleado?.rol_id],
    queryFn: () => (empleado ? db.roles.get(empleado.rol_id) : Promise.resolve(null)),
    enabled: !!empleado,
  });

  // Base de permisos:
  // - Roles preset (admin/encargado/cajero/catalogo): SIEMPRE usamos el
  //   preset hardcodeado de @comercio/business, ignorando lo que diga la
  //   BD. Esto garantiza que los cambios al código se apliquen al
  //   instante en producción sin necesidad de re-grabar el rol. Si Agus
  //   quiere permisos custom, debe CREAR un rol nuevo en /roles, no
  //   editar los 4 preset.
  // - Roles custom: usamos los permisos guardados en BD. Mientras carga,
  //   undefined (que se interpreta como "todo en false" arriba).
  const presetKey = empleado?.rol_id ? ROL_PRESET_POR_ID[empleado.rol_id] : undefined;
  const base = presetKey
    ? PERMISOS_PRESET[presetKey]
    : rolQ.data?.permisos;

  const efectivos = base
    ? evaluarPermisos(base, empleado?.permisos_override ?? undefined)
    : undefined;

  const puede = efectivos ? makePuede(efectivos) : null;
  return {
    permisos: efectivos,
    /** Devuelve true si el empleado puede hacer la acción. Mientras carga: true para admin, false para otros. */
    puede: <M extends ModuloPermiso>(modulo: M, accion: AccionPermiso<M>): boolean => {
      if (!puede) {
        // Antes que cargue, default: false (más seguro).
        return false;
      }
      return puede(modulo, accion);
    },
    cargando: rolQ.isLoading,
  };
}

/** Atajo para chequear un solo permiso. */
export function usePermiso<M extends ModuloPermiso>(modulo: M, accion: AccionPermiso<M>): boolean {
  return usePermisos().puede(modulo, accion);
}

/**
 * Wrapper que solo renderiza children si el empleado tiene el permiso.
 * Si no, devuelve `fallback` (default: nada).
 */
export function RequierePermiso<M extends ModuloPermiso>({
  modulo,
  accion,
  fallback = null,
  children,
}: {
  modulo: M;
  accion: AccionPermiso<M>;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const ok = usePermiso(modulo, accion);
  return <>{ok ? children : fallback}</>;
}

/**
 * Guard a nivel de página completa. Si el usuario no tiene el permiso,
 * muestra una pantalla "Sin permiso" en lugar del contenido. Usar en
 * pages que tienen que estar protegidas si el menú las oculta (por si
 * el usuario entra vía URL directa).
 */
export function PaginaProtegida<M extends ModuloPermiso>({
  modulo,
  accion,
  redirectTo,
  children,
}: {
  modulo: M;
  accion: AccionPermiso<M>;
  /** Si se pasa, en vez de mostrar "Acceso restringido" redirige a esta URL. */
  redirectTo?: string;
  children: ReactNode;
}) {
  const { puede, cargando } = usePermisos();
  const router = useRouter();
  const ok = !cargando && puede(modulo, accion);
  // Cuando hay redirectTo y el usuario no tiene permiso, mandarlo a la
  // ruta indicada en vez de mostrar la pantalla de bloqueo. Útil para
  // la home: un encargado/catálogo va a /productos en vez de ver una
  // pantalla "Acceso restringido" en lo primero que abre.
  useEffect(() => {
    if (!cargando && !ok && redirectTo) {
      router.replace(redirectTo);
    }
  }, [cargando, ok, redirectTo, router]);
  if (cargando) return null;
  if (!ok) {
    if (redirectTo) return null; // mientras redirige
    return (
      <main className="container mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No tenés permiso para ver esta sección. Pedile al dueño que ajuste tu rol
          si necesitás acceso.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
