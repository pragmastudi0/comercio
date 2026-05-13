import type { Empleado, ID } from '../types';
import type { PermisosConfig } from '@comercio/business/permisos';

export type FiltroEmpleados = {
  texto?: string;
  rol_id?: ID;
  local_id?: ID;
  deposito_id?: ID;
  activo?: boolean;
};

export type EmpleadosRepo = {
  list(filtro?: FiltroEmpleados): Promise<Empleado[]>;
  get(id: ID): Promise<Empleado | null>;
  create(input: Omit<Empleado, 'id' | 'creado_en'>): Promise<Empleado>;
  update(id: ID, patch: Partial<Empleado>): Promise<Empleado>;
  delete(id: ID): Promise<void>;
  setOverridePermisos(id: ID, override?: PermisosConfig): Promise<Empleado>;
  cambiarRol(id: ID, rolId: ID): Promise<Empleado>;
  resetearPassword(id: ID): Promise<void>;
};
