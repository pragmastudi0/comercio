import { Navigate } from 'react-router-dom';
import { useSesion } from '@/stores/sesion';
import type { ReactNode } from 'react';

export function RequireEmpleado({ children }: { children: ReactNode }) {
  const empleado = useSesion((s) => s.empleado);
  if (!empleado) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireSesionAbierta({ children }: { children: ReactNode }) {
  const sesion = useSesion((s) => s.sesionCaja);
  const empleado = useSesion((s) => s.empleado);
  if (!empleado) return <Navigate to="/login" replace />;
  if (!sesion || sesion.estado !== 'abierta') return <Navigate to="/abrir-caja" replace />;
  return <>{children}</>;
}
