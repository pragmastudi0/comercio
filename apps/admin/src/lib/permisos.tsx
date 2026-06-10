'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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

  // Base: si el rol existe en BD usamos sus permisos guardados. Si la BD
  // todavía no cargó pero el rol_id matchea un preset, usamos el preset
  // hardcodeado para no devolver "false a todo" mientras carga.
  const base =
    rolQ.data?.permisos ??
    (empleado?.rol_id && ROL_PRESET_POR_ID[empleado.rol_id]
      ? PERMISOS_PRESET[ROL_PRESET_POR_ID[empleado.rol_id]!]
      : undefined);

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
  children,
}: {
  modulo: M;
  accion: AccionPermiso<M>;
  children: ReactNode;
}) {
  const { puede, cargando } = usePermisos();
  if (cargando) return null;
  if (!puede(modulo, accion)) {
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
