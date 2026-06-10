import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSesion } from '@/stores/sesion';
import type { ReactNode } from 'react';

// Defensa contra sesiones residuales del modo mock (IDs como '1', 'emp_admin').
// Si algo de la sesión persistida no es UUID, hacemos logout y volvemos al login.
// Regex liberal "cualquier hex 8-4-4-4-12" — Postgres acepta UUIDs sin restricción
// de versión/variante (los preset IDs nuestros tipo 00000000-...-0301 no cumplirían
// el spec RFC 4122 estricto pero sí son UUID válidos en la DB).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUuid(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v);
}

function useLimpiarSesionMockResidual(): boolean {
  const empleado = useSesion((s) => s.empleado);
  const caja = useSesion((s) => s.caja);
  const sesionCaja = useSesion((s) => s.sesionCaja);
  const logout = useSesion((s) => s.logout);

  const empleadoInvalido = empleado && !esUuid(empleado.id);
  const cajaInvalida = caja && !esUuid(caja.id);
  const sesionInvalida = sesionCaja && !esUuid(sesionCaja.id);
  const hayResiduo = !!(empleadoInvalido || cajaInvalida || sesionInvalida);

  useEffect(() => {
    if (hayResiduo) {
      logout();
      toast.warning('Tu sesión anterior expiró. Volvé a iniciar sesión.');
    }
  }, [hayResiduo, logout]);

  return hayResiduo;
}

export function RequireEmpleado({ children }: { children: ReactNode }) {
  const residuo = useLimpiarSesionMockResidual();
  const empleado = useSesion((s) => s.empleado);
  if (residuo || !empleado) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireSesionAbierta({ children }: { children: ReactNode }) {
  const residuo = useLimpiarSesionMockResidual();
  const sesion = useSesion((s) => s.sesionCaja);
  const empleado = useSesion((s) => s.empleado);
  if (residuo || !empleado) return <Navigate to="/login" replace />;
  if (!sesion || sesion.estado !== 'abierta') return <Navigate to="/abrir-caja" replace />;
  return <>{children}</>;
}
